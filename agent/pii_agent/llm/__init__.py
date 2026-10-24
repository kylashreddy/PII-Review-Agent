"""LLM providers for the adjudicator: "local" (self-hosted, vLLM / Ollama), "anthropic" (Claude, gated) and "none".

The gate for external providers is in `make_provider`: Claude is constructed only when BOTH the config flag
(PII_AGENT_ANTHROPIC_ENABLED=true) AND a recorded, unexpired data-processing approval for provider "anthropic"
(PII_AGENT_LLM_APPROVAL_FILE, P3 moves it to the approvals table) are present. Otherwise it refuses to start —
it never silently falls back to sending data elsewhere, and never silently turns the LLM off either.
"""

from __future__ import annotations

import datetime as dt
import json
from collections.abc import Sequence
from pathlib import Path

from pydantic import BaseModel, ConfigDict, ValidationError

from ..config import Settings
from .base import PROMPT_VERSION, AdjudicationItem, Decision, LLMProvider, system_prompt

__all__ = [
    "PROMPT_VERSION",
    "AdjudicationItem",
    "ApprovalError",
    "CachedProvider",
    "Decision",
    "LLMApproval",
    "LLMProvider",
    "NoneProvider",
    "make_provider",
]


class ApprovalError(RuntimeError):
    """An external LLM was configured without the flag or without a valid recorded approval."""


class LLMApproval(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    provider: str
    approved_by: str
    reference: str  # the data-processing agreement / ticket
    approved_on: dt.date
    valid_until: dt.date
    scope: str = "snippets"  # what may be sent: only "snippets" is supported

    def check(self, provider: str, today: dt.date | None = None) -> None:
        today = today or dt.date.today()
        if self.provider != provider:
            raise ApprovalError(f"the recorded approval is for {self.provider}, not {provider}")
        if self.scope != "snippets":
            raise ApprovalError("only snippet-level approvals are supported")
        if not self.approved_on <= today <= self.valid_until:
            raise ApprovalError("the recorded approval is not valid today")


def load_approval(path: Path | None) -> LLMApproval:
    if path is None or not Path(path).exists():
        raise ApprovalError("no recorded data-processing approval (PII_AGENT_LLM_APPROVAL_FILE)")
    try:
        return LLMApproval.model_validate(json.loads(Path(path).read_text(encoding="utf-8")))
    except (ValidationError, json.JSONDecodeError) as err:
        raise ApprovalError("the approval record is not valid") from err


class NoneProvider:
    """No LLM: every unsure item stays a question for the human."""

    name = "none"
    model = "none"
    external = False

    def decide(self, items: Sequence[AdjudicationItem]) -> list[Decision | None]:
        return [None] * len(items)


class CachedProvider:
    """Same snippet -> same decision (repeatable runs, no paid call twice). Only successful answers are kept.

    `path` (eval only, PII_AGENT_LLM_CACHE_FILE) keeps decisions across runs in a JSON-lines file keyed by a hash of
    the snippet, the model and the prompt version; it holds labels and reasons, never the snippets themselves.
    """

    def __init__(self, inner: LLMProvider, path: Path | None = None) -> None:
        self.inner = inner
        self.name = inner.name
        self.model = inner.model
        self.external = inner.external
        self.cache: dict[str, Decision] = {}
        self.hits = 0
        self.path = path
        self._salt = f"{inner.name}|{inner.model}|{PROMPT_VERSION}|"
        if path is not None and Path(path).exists():
            for line in Path(path).read_text(encoding="utf-8").splitlines():
                rec = json.loads(line)
                if rec.get("salt") == self._salt:
                    self.cache[rec["key"]] = Decision.model_validate(rec["decision"])

    def decide(self, items: Sequence[AdjudicationItem]) -> list[Decision | None]:
        todo = [it for it in items if it.key not in self.cache]
        self.hits += len(items) - len(todo)
        # Unique snippets only; ids are re-numbered so the model never sees two items with one id.
        unique = list({it.key: it for it in todo}.values())
        if unique:
            asked = [it.model_copy(update={"id": f"i{n}"}) for n, it in enumerate(unique, 1)]
            new: list[tuple[str, Decision]] = []
            for it, d in zip(unique, self.inner.decide(asked), strict=True):
                if d is not None:
                    self.cache[it.key] = d
                    new.append((it.key, d))
            if self.path is not None and new:
                Path(self.path).parent.mkdir(parents=True, exist_ok=True)
                with Path(self.path).open("a", encoding="utf-8") as f:
                    for key, d in new:
                        f.write(json.dumps({"salt": self._salt, "key": key, "decision": d.model_dump()}) + "\n")
        return [self.cache.get(it.key) for it in items]


def make_provider(s: Settings) -> LLMProvider:
    if s.llm_provider == "none":
        return NoneProvider()
    system = system_prompt(s.rubric_file)
    if s.llm_provider == "local":
        from .local import LocalProvider

        local = LocalProvider(s.llm_base_url, s.llm_model, system, s.llm_batch_size, s.llm_timeout_s)
        local.check()
        return CachedProvider(local, s.llm_cache_file)
    if s.llm_provider == "anthropic":
        if not s.anthropic_enabled:
            raise ApprovalError("Claude is disabled: set PII_AGENT_ANTHROPIC_ENABLED=true after approval")
        load_approval(s.llm_approval_file).check("anthropic")
        from .anthropic_provider import AnthropicProvider

        claude = AnthropicProvider(s.anthropic_model, system, s.anthropic_effort, s.llm_batch_size)
        return CachedProvider(claude, s.llm_cache_file)
    raise ValueError(f"unknown llm_provider {s.llm_provider}")
