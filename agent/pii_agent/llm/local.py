"""Self-hosted open model behind an OpenAI-compatible chat endpoint: vLLM (`vllm serve …`) or Ollama
(`/v1/chat/completions`). The default provider: nothing leaves our servers. JSON is constrained with the server's
`response_format: json_schema` (guided decoding), temperature 0 and a fixed seed for repeatable answers."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from collections.abc import Sequence
from typing import Any
from urllib.parse import urlparse

from .base import DECISIONS_SCHEMA, AdjudicationItem, Decision, batches, parse_answers, user_message


class LocalLLMError(RuntimeError):
    pass


class LocalProvider:
    name = "local"
    external = False

    def __init__(
        self,
        base_url: str,
        model: str,
        system: str,
        batch_size: int = 8,
        timeout_s: float = 120.0,
        api_key: str | None = None,
    ) -> None:
        if urlparse(base_url).scheme not in ("http", "https"):
            raise ValueError("llm_base_url must be http(s)")
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.system = system
        self.batch_size = batch_size
        self.timeout_s = timeout_s
        self.api_key = api_key
        self.tokens = {"input": 0, "output": 0, "calls": 0, "failed_calls": 0}

    def check(self) -> None:
        """Fails fast when the server is down or does not serve the model (rather than every item failing later)."""
        req = urllib.request.Request(f"{self.base_url}/models", method="GET")  # noqa: S310
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:  # noqa: S310
                data = json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as err:
            raise LocalLLMError(
                f"no LLM server at {self.base_url}; start vLLM / Ollama or set PII_AGENT_LLM_PROVIDER=none"
            ) from err
        names = {m.get("id") for m in data.get("data") or []}
        if self.model not in names:
            raise LocalLLMError(f"the LLM server does not serve {self.model}")

    def _post(self, body: dict[str, Any]) -> dict[str, Any]:
        req = urllib.request.Request(  # noqa: S310 - scheme checked in __init__
            f"{self.base_url}/chat/completions",
            data=json.dumps(body).encode(),
            headers={
                "content-type": "application/json",
                **({"authorization": f"Bearer {self.api_key}"} if self.api_key else {}),
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=self.timeout_s) as resp:  # noqa: S310
            data: dict[str, Any] = json.loads(resp.read().decode("utf-8"))
            return data

    def _ask(self, items: Sequence[AdjudicationItem]) -> list[Decision | None]:
        body = {
            "model": self.model,
            "temperature": 0,
            "seed": 7,
            "max_tokens": 200 + 120 * len(items),
            "messages": [
                {"role": "system", "content": self.system},
                {"role": "user", "content": user_message(items)},
            ],
            "response_format": {
                "type": "json_schema",
                "json_schema": {"name": "decisions", "schema": DECISIONS_SCHEMA, "strict": True},
            },
        }
        self.tokens["calls"] += 1
        try:
            data = self._post(body)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
            self.tokens["failed_calls"] += 1
            return [None] * len(items)
        usage = data.get("usage") or {}
        self.tokens["input"] += int(usage.get("prompt_tokens") or 0)
        self.tokens["output"] += int(usage.get("completion_tokens") or 0)
        choices = data.get("choices") or []
        if not choices or (choices[0].get("finish_reason") not in (None, "stop")):
            self.tokens["failed_calls"] += 1
            return [None] * len(items)
        return parse_answers((choices[0].get("message") or {}).get("content") or "", items)

    def decide(self, items: Sequence[AdjudicationItem]) -> list[Decision | None]:
        out: list[Decision | None] = []
        for chunk in batches(items, self.batch_size):
            out += self._ask(chunk)
        return out
