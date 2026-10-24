"""Client for the rules service (agent/rules-service): one Node process, JSON lines over stdin/stdout.

The Python side never re-implements a rule; every rules question goes through here.
"""

from __future__ import annotations

import json
import queue
import subprocess
import threading
from collections.abc import Sequence
from pathlib import Path
from types import TracebackType
from typing import Any

from .config import Settings, get_settings
from .models import Detection, Entity, Finding, RightLabel, SpanFacts


class RulesError(RuntimeError):
    """The rules service answered with an error, timed out or died. Messages never contain document text."""


class RulesClient:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self._proc: subprocess.Popen[str] | None = None
        self._lines: queue.Queue[str | None] = queue.Queue()
        self._lock = threading.Lock()
        self._next_id = 0
        self._version: dict[str, Any] | None = None

    # ------------------------------------------------------------------ process

    def _start(self) -> subprocess.Popen[str]:
        script = Path(self.settings.rules_service)
        proc = subprocess.Popen(
            [self.settings.node_bin, str(script)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            encoding="utf-8",
            cwd=str(script.parent),
        )
        self._lines = queue.Queue()
        out = proc.stdout
        if out is None:
            raise RulesError("rules service has no stdout")
        lines = self._lines

        def pump() -> None:
            for line in out:
                lines.put(line)
            lines.put(None)

        threading.Thread(target=pump, daemon=True).start()
        return proc

    def close(self) -> None:
        if self._proc is not None:
            if self._proc.stdin:
                self._proc.stdin.close()
            try:
                self._proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._proc.kill()
            self._proc = None

    def __enter__(self) -> RulesClient:
        return self

    def __exit__(
        self, exc_type: type[BaseException] | None, exc: BaseException | None, tb: TracebackType | None
    ) -> None:
        self.close()

    def call(self, method: str, params: dict[str, Any] | None = None) -> Any:
        with self._lock:
            if self._proc is None or self._proc.poll() is not None:
                self._proc = self._start()
            self._next_id += 1
            rid = self._next_id
            stdin = self._proc.stdin
            if stdin is None:
                raise RulesError("rules service has no stdin")
            try:
                stdin.write(
                    json.dumps({"id": rid, "method": method, "params": params or {}}, ensure_ascii=False) + "\n"
                )
                stdin.flush()
                line = self._lines.get(timeout=self.settings.rules_timeout_s)
            except (queue.Empty, BrokenPipeError) as err:
                self._proc.kill()
                self._proc = None
                raise RulesError(f"rules service did not answer {method}") from err
            if line is None:
                self._proc = None
                raise RulesError(f"rules service exited during {method}")
            msg = json.loads(line)
            if msg.get("id") != rid:
                raise RulesError(f"rules service answered out of order for {method}")
            if "error" in msg:
                e = msg["error"]
                raise RulesError(f"{method}: {e.get('code')}: {e.get('message')}")
            return msg["result"]

    # ------------------------------------------------------------------ methods

    def version(self) -> dict[str, Any]:
        if self._version is None:
            self._version = dict(self.call("version"))
        return self._version

    def labels(self) -> dict[str, Any]:
        return dict(self.call("labels"))

    def analyze(
        self, text: str, file_name: str = "", entities: Sequence[Entity] | None = None
    ) -> tuple[list[Detection], list[Detection] | None]:
        params: dict[str, Any] = {"text": text, "file_name": file_name}
        if entities is not None:
            params["entities"] = [e.model_dump() for e in entities]
        r = self.call("analyze", params)
        rules = [Detection.model_validate(d) for d in r["rules"]]
        merged = None if r["merged"] is None else [Detection.model_validate(d) for d in r["merged"]]
        return rules, merged

    def compare(
        self, left: str, right: str, detections: Sequence[Detection], right_labels: Sequence[RightLabel]
    ) -> dict[str, Any]:
        r = self.call(
            "compare",
            {
                "left": left,
                "right": right,
                "detections": [d.model_dump() for d in detections],
                "right_labels": [rl.model_dump() for rl in right_labels],
            },
        )
        r["findings"] = [Finding.model_validate(f) for f in r["findings"]]
        return dict(r)

    def redaction_check(
        self, left: str, right: str, detections: Sequence[Detection], file_name: str = ""
    ) -> list[Finding]:
        r = self.call(
            "redaction_check",
            {"left": left, "right": right, "detections": [d.model_dump() for d in detections], "file_name": file_name},
        )
        return [Finding.model_validate(f) for f in r["findings"]]

    def span_facts(self, text: str, spans: Sequence[tuple[int, int]]) -> list[SpanFacts]:
        if not spans:
            return []
        r = self.call("span_facts", {"text": text, "spans": [{"start": s, "end": e} for s, e in spans]})
        return [SpanFacts.model_validate(f) for f in r["facts"]]

    def kb_lookup(self, kind: str, value: str) -> dict[str, Any]:
        return dict(self.call("kb_lookup", {"kind": kind, "value": value}))
