"""The agent's tools, one method each. The pipeline (pipeline.py) calls them in a fixed order; P2's LLM adjudicator
sees only `adjudicate`'s snippets, never these tools or whole documents."""

from __future__ import annotations

import hashlib
from collections import Counter
from collections.abc import Sequence
from functools import cached_property
from pathlib import Path
from typing import Any

from . import __version__
from .adjudicate import adjudicate
from .calibration import Calibrator
from .cards import create_cards
from .config import Settings, get_settings
from .draft import Draft
from .gliner import Gliner, model_sha
from .llm import PROMPT_VERSION, LLMProvider, make_provider
from .models import CardDeck, Detection, Entity, Finding, Plan, RightLabel, SpanFacts, Task, Violation
from .plan import build_plan
from .rubric import RubricChecker
from .rules_client import RulesClient
from .task_source import TaskSource


class ApplyUnavailableError(RuntimeError):
    pass


class Toolbox:
    def __init__(
        self,
        source: TaskSource | None = None,
        settings: Settings | None = None,
        rules: RulesClient | None = None,
        provider: LLMProvider | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        self.source = source
        self.rules = rules or RulesClient(self.settings)
        self.provider: LLMProvider = provider or make_provider(self.settings)
        self.calibrator = Calibrator.load(self.settings.calibration_file)
        self.checker = RubricChecker(self.span_facts, self.settings.review_threshold)

    def close(self) -> None:
        self.rules.close()

    # ---------------------------------------------------------------- tools

    def load_task(self, task_id: str) -> Task:
        if self.source is None:
            raise RuntimeError("no task source configured")
        return self.source.load_task(task_id)

    def rules_analyze(
        self, text: str, file_name: str = "", entities: Sequence[Entity] | None = None
    ) -> tuple[list[Detection], list[Detection] | None]:
        return self.rules.analyze(text, file_name, entities)

    def rules_compare(
        self, left: str, right: str, detections: Sequence[Detection], right_labels: Sequence[RightLabel]
    ) -> dict[str, Any]:
        return self.rules.compare(left, right, detections, right_labels)

    def redaction_check(
        self, left: str, right: str, detections: Sequence[Detection], file_name: str = ""
    ) -> list[Finding]:
        return self.rules.redaction_check(left, right, detections, file_name)

    def span_facts(self, text: str, spans: Sequence[tuple[int, int]]) -> list[SpanFacts]:
        return self.rules.span_facts(text, spans)

    def kb_lookup(self, kind: str, value: str) -> dict[str, Any]:
        return self.rules.kb_lookup(kind, value)

    @cached_property
    def gliner_model(self) -> Gliner | None:
        s = self.settings
        if s.gliner == "off" or (s.gliner == "auto" and not (s.model_dir / "onnx" / "model_int8.onnx").exists()):
            return None
        return Gliner(s.model_dir, s.gliner_max_width, s.gliner_max_words, s.onnx_providers, s.onnx_threads)

    def gliner_detect(self, texts: Sequence[str]) -> list[list[Entity]] | None:
        g = self.gliner_model
        return None if g is None else g.detect_many(texts, self.settings.gliner_threshold)

    def rubric_check(self, draft: Draft, right: str, detections: Sequence[Detection]) -> list[Violation]:
        return self.checker.check(draft, right, detections, identify=draft.mode == "identify")

    def adjudicate(self, draft: Draft, right: str, file_name: str = "") -> Counter[str]:
        return adjudicate(draft, right, file_name, self.provider, self.settings)

    def build_plan(
        self, task: Task, draft: Draft, violations: Sequence[Violation], versions: dict[str, Any], run_key: str
    ) -> Plan:
        return build_plan(task.id, draft, task.right, violations, versions, run_key, self.settings, self.calibrator)

    def create_cards(self, plan: Plan, right: str) -> CardDeck:
        return create_cards(plan, right)

    def apply_labels(self, plan: Plan, approved_ids: Sequence[str]) -> None:
        """Connector (P5). Only ever called with labels a human approved; never submits."""
        raise ApplyUnavailableError("apply_labels needs the connector (P5); nothing was applied")

    # ---------------------------------------------------------------- versions

    @cached_property
    def versions(self) -> dict[str, Any]:
        s = self.settings
        rubric = Path(s.rubric_file)
        import onnxruntime

        return {
            "agent": __version__,
            "rules": self.rules.version(),
            "model_sha": model_sha(s.model_dir) if self.gliner_model is not None else None,
            "onnxruntime": onnxruntime.__version__ if self.gliner_model is not None else None,
            "rubric_sha": hashlib.sha256(rubric.read_bytes()).hexdigest()[:12] if rubric.exists() else None,
            "llm": {
                "provider": self.provider.name,
                "model": self.provider.model,
                "prompt": PROMPT_VERSION if self.provider.name != "none" else None,
                "external": self.provider.external,
            },
            "calibration": self.calibrator.version,
            "thresholds": {
                "review": s.review_threshold,
                "high": s.high_confidence,
                "question_min": s.question_min_confidence,
                "gliner": s.gliner_threshold,
                "approve_all": list(s.approve_all_labels),
            },
        }
