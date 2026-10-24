"""build_plan: the checked draft -> the rubric's JSON (labels[], questions[], checks), with ids and groups."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from .calibration import Calibrator
from .config import Settings
from .draft import Draft
from .models import Checks, Group, Plan, PlanLabel, Question, Violation


def group_of(label: str, confidence: float, source: str, s: Settings, calibrated: float | None = None) -> Group:
    """High (may join "Approve all"): a fixed-shape label found by the rules at >= high_confidence and, once a
    calibration is fitted, at a calibrated confidence >= approve_all_min; everything else is medium."""
    if (
        confidence >= s.high_confidence
        and label in s.approve_all_labels
        and source not in ("model", "right", "llm")
        and (calibrated is None or calibrated >= s.approve_all_min)
    ):
        return "high"
    return "medium"


def build_plan(
    task_id: str,
    draft: Draft,
    right: str,
    violations: Sequence[Violation],
    versions: dict[str, Any],
    run_key: str,
    s: Settings,
    calibrator: Calibrator | None = None,
) -> Plan:
    cal = calibrator if calibrator is not None and calibrator.curves else None
    kept = sorted((x for x in draft.labels if x.dropped is None), key=lambda x: (x.right.start, x.right.end, x.label))
    labels: list[PlanLabel] = []
    ids: dict[int, str] = {}
    for n, x in enumerate(kept, 1):
        ids[id(x)] = f"L{n}"
        calibrated = cal(x.label, x.llm, x.confidence) if cal else None
        labels.append(
            PlanLabel(
                id=f"L{n}",
                label=x.label,
                text=right[x.right.start : x.right.end],
                right=x.right,
                left=x.left,
                confidence=round(x.confidence if calibrated is None else calibrated, 3),
                raw_confidence=round(x.confidence, 3),
                llm=x.llm,
                group=group_of(x.label, x.confidence, x.source, s, calibrated),
                action=x.action,
                existing_label=x.existing_label,
                source=x.source,
                rule=x.rule,
                type=x.type,
                why=x.why,
                fixes=sorted(set(x.fixes)),
            )
        )
    pos = lambda q: (q.right.start if q.right else 1 << 60, q.left.start if q.left else 0, q.kind)  # noqa: E731
    questions: list[Question] = []
    for n, q in enumerate(sorted(draft.questions, key=pos), 1):
        label_id = ids.get(id(q.leak_of)) if q.leak_of is not None else None
        text = right[q.right.start : q.right.end] if q.right else ""
        questions.append(
            Question(
                id=f"Q{n}",
                kind=q.kind,
                text=text,
                right=q.right,
                left=q.left,
                suggest=q.suggest,
                confidence=None if q.confidence is None else round(q.confidence, 2),
                why=q.why,
                label_id=label_id,
                replacement=q.replacement,
            )
        )
    checks = Checks(
        missed_pass=draft.uncovered == 0,
        consistency=draft.consistent,
        span_fixes=sum(1 for v in violations if v.check == "span"),
        label_fixes=sum(1 for v in violations if v.check == "consistency" and v.detail == "label"),
        dropped=sum(1 for x in draft.labels if x.dropped is not None),
        added_occurrences=sum(1 for v in violations if v.detail == "occurrence"),
        violations=list(violations),
    )
    return Plan(
        task=task_id,
        mode=draft.mode,
        labels=labels,
        questions=questions,
        checks=checks,
        versions=versions,
        run_key=run_key,
    )
