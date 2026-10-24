"""Claude through the official `anthropic` SDK. External: DISABLED unless the config flag AND a recorded
data-processing approval are set (see llm/__init__.py). It receives snippets only, with the other PII values in each
snippet's context masked as [Label].

Request shape (claude-opus-5-5): adaptive thinking (the model's default; `thinking` is omitted), explicit effort,
structured output through `output_config.format` (JSON schema), the system prompt cached, and the server-side
refusal fallback (`fallbacks: "default"`). A refusal or an unparseable answer leaves every item a human question.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from .base import DECISIONS_SCHEMA, AdjudicationItem, Decision, batches, parse_answers, user_message

FALLBACK_BETA = "server-side-fallback-2026-07-01"


class AnthropicProvider:
    name = "anthropic"
    external = True

    def __init__(
        self,
        model: str,
        system: str,
        effort: str = "medium",
        batch_size: int = 10,
        client: Any = None,
    ) -> None:
        if client is None:
            import anthropic

            client = anthropic.Anthropic(max_retries=3, timeout=120.0)
        self.client = client
        self.model = model
        self.system = system
        self.effort = effort
        self.batch_size = batch_size
        self.tokens = {"input": 0, "output": 0, "cache_read": 0, "calls": 0, "failed_calls": 0, "refusals": 0}

    def _ask(self, items: Sequence[AdjudicationItem]) -> list[Decision | None]:
        import anthropic

        self.tokens["calls"] += 1
        try:
            response = self.client.beta.messages.create(
                model=self.model,
                max_tokens=16000,
                betas=[FALLBACK_BETA],
                fallbacks="default",
                system=[{"type": "text", "text": self.system, "cache_control": {"type": "ephemeral"}}],
                output_config={"effort": self.effort, "format": {"type": "json_schema", "schema": DECISIONS_SCHEMA}},
                messages=[{"role": "user", "content": user_message(items)}],
            )
        except (anthropic.APIConnectionError, anthropic.APIStatusError):
            # The SDK has already retried 429 / 5xx / connection errors; the items stay human questions.
            self.tokens["failed_calls"] += 1
            return [None] * len(items)
        usage = response.usage
        self.tokens["input"] += int(getattr(usage, "input_tokens", 0) or 0)
        self.tokens["output"] += int(getattr(usage, "output_tokens", 0) or 0)
        self.tokens["cache_read"] += int(getattr(usage, "cache_read_input_tokens", 0) or 0)
        if response.stop_reason == "refusal":
            self.tokens["refusals"] += 1
            return [None] * len(items)
        if response.stop_reason != "end_turn":
            self.tokens["failed_calls"] += 1
            return [None] * len(items)
        text = next((b.text for b in response.content if b.type == "text"), "")
        return parse_answers(text, items)

    def decide(self, items: Sequence[AdjudicationItem]) -> list[Decision | None]:
        out: list[Decision | None] = []
        for chunk in batches(items, self.batch_size):
            out += self._ask(chunk)
        return out
