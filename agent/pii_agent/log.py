"""Structured logs that cannot carry document text.

Only numbers, booleans and short strings under known keys are written; any other string is replaced by
"<dropped>". Document text, finding notes and values therefore never reach a log line, by construction.
"""

from __future__ import annotations

import json
import sys
import time
from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from typing import IO, Any

# Keys whose string values are identifiers or enums, never document content.
SAFE_STRING_KEYS = frozenset(
    {
        "event",
        "step",
        "task",
        "run_key",
        "mode",
        "status",
        "error",
        "provider",
        "label",
        "category",
        "kind",
        "check",
        "detail",
        "engine",
        "engine_name",
        "rules_sha",
        "model_sha",
        "rubric_sha",
        "agent",
        "method",
        "level",
    }
)
MAX_SAFE_STRING = 200
_LEVELS = {"debug": 10, "info": 20, "warning": 30, "error": 40}


def _clean(key: str, value: Any) -> Any:
    if value is None or isinstance(value, bool | int | float):
        return value
    if isinstance(value, str):
        return value if key in SAFE_STRING_KEYS and len(value) <= MAX_SAFE_STRING else "<dropped>"
    if isinstance(value, Mapping):
        return {str(k): _clean(str(k), v) for k, v in value.items()}
    if isinstance(value, list | tuple):
        return [_clean(key, v) for v in value]
    return "<dropped>"


class Logger:
    def __init__(self, stream: IO[str] | None = None, level: str = "info") -> None:
        self.stream = stream
        self.level = _LEVELS.get(level, 20)

    def log(self, level: str, event: str, **fields: Any) -> None:
        if _LEVELS.get(level, 20) < self.level:
            return
        rec = {"ts": round(time.time(), 3), "level": level, "event": event}
        rec.update({k: _clean(k, v) for k, v in fields.items()})
        out = self.stream or sys.stderr
        out.write(json.dumps(rec, ensure_ascii=False, sort_keys=True) + "\n")

    def info(self, event: str, **fields: Any) -> None:
        self.log("info", event, **fields)

    def warning(self, event: str, **fields: Any) -> None:
        self.log("warning", event, **fields)

    def error(self, event: str, **fields: Any) -> None:
        self.log("error", event, **fields)

    @contextmanager
    def step(self, name: str, timings: dict[str, float], **fields: Any) -> Iterator[dict[str, Any]]:
        """Times a pipeline step; the caller may add counts to the yielded dict."""
        extra: dict[str, Any] = {}
        t0 = time.perf_counter()
        try:
            yield extra
        except Exception as err:
            ms = round((time.perf_counter() - t0) * 1000, 1)
            self.error("step_failed", step=name, ms=ms, error=type(err).__name__, **fields)
            raise
        ms = round((time.perf_counter() - t0) * 1000, 1)
        timings[name] = ms
        self.info("step", step=name, ms=ms, **fields, **extra)
