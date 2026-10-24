"""From rule / model detections and the left↔right findings to a draft: the labels the right document should carry
and the questions only a human can answer (rubric Parts A3 and B). Structure only — every PII decision here was
made by the rules service (detections, compare.js, redaction.js)."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

from .config import Settings
from .models import Action, Detection, Finding, QuestionKind, RightLabel, Span


@dataclass
class DraftLabel:
    label: str
    right: Span
    left: Span | None
    confidence: float
    source: str
    rule: str | None = None
    type: str | None = None
    action: Action = "add"
    existing_label: str | None = None
    why: str = ""
    fixes: list[str] = field(default_factory=list)
    model_agrees: bool = False
    dropped: str | None = None  # why rubric_check dropped it (a code)
    llm: str | None = None  # the adjudicator's view: agree | disagree | unsure | llm-only

    @property
    def active(self) -> bool:
        return self.dropped is None and self.action != "remove"


@dataclass
class DraftQuestion:
    kind: QuestionKind
    right: Span | None
    left: Span | None
    suggest: str | None
    confidence: float | None
    why: str
    replacement: str | None = None
    leak_of: DraftLabel | None = None


@dataclass
class Draft:
    mode: str
    labels: list[DraftLabel] = field(default_factory=list)
    questions: list[DraftQuestion] = field(default_factory=list)
    uncovered: int = 0  # detections that ended up in no label and no question before the missed pass
    consistent: bool = True  # the same value had one label everywhere before rubric_check fixed it


def _model(d: Detection | Finding) -> dict[str, Any]:
    extra = d.model_extra or {}
    m = extra.get("model")
    return m if isinstance(m, dict) else {}


def why_of(d: Detection | Finding) -> str:
    m = _model(d)
    if d.source == "model":
        return f"model only ({m.get('score', 0):.2f})"
    base = f"rule {d.rule}" if d.rule else (d.source or "rules")
    if m.get("agrees"):
        return f"{base}; model agrees"
    if m and not m.get("agrees"):
        return f"{base}; model suggests {m.get('label')}"
    return base


def _label_from_detection(d: Detection, right: Span) -> DraftLabel:
    return DraftLabel(
        label=d.label,
        right=right,
        left=d.span,
        confidence=d.confidence,
        source=d.source or "rules",
        rule=d.rule,
        type=d.type,
        why=why_of(d),
        model_agrees=bool(_model(d).get("agrees")) and d.source != "model",
    )


def _possibly(d: Detection | Finding, right: Span | None, left: Span | None) -> DraftQuestion:
    return DraftQuestion(
        kind="possibly-pii",
        right=right,
        left=left,
        suggest=d.label,
        confidence=d.confidence,
        why=f"low confidence: {why_of(d)}",
    )


def identify_draft(detections: Sequence[Detection], s: Settings) -> Draft:
    """Left == right: label the PII on the right where the rules found it on the left."""
    draft = Draft(mode="identify")
    for d in detections:
        if d.confidence >= s.review_threshold:
            draft.labels.append(_label_from_detection(d, d.span))
        elif d.confidence >= s.question_min_confidence:
            draft.questions.append(_possibly(d, d.span, d.span))
    return draft


# redaction.js category -> what the agent does on the right document (rubric A3)
def verify_draft(detections: Sequence[Detection], red: Sequence[Finding], s: Settings) -> Draft:
    """Left = original, right = redacted: label the replacements, raise cards for leaks and bad replacements."""
    draft = Draft(mode="verify")
    by_left = {(d.start, d.end): d for d in detections}
    for f in red:
        conf = f.confidence if f.confidence is not None else 0.0
        label = f.label or ""
        right = f.right
        d = by_left.get((f.left.start, f.left.end)) if f.left else None
        if f.category in ("REDACTED_OK", "LEAKAGE", "INCOHERENT") and right is not None and label:
            if conf < s.review_threshold:
                if conf >= s.question_min_confidence:
                    draft.questions.append(_possibly(d or f, right, f.left))
                continue
            dl = DraftLabel(
                label=label,
                right=right,
                left=f.left,
                confidence=conf,
                source=f.source or "rules",
                rule=d.rule if d else f.rule,
                type=f.type,
                why=why_of(d or f),
                model_agrees=bool(d and _model(d).get("agrees")) and f.source != "model",
            )
            draft.labels.append(dl)
            if f.category == "LEAKAGE":
                draft.questions.append(
                    DraftQuestion("leak", right, f.left, label, conf, f.note or "unchanged", leak_of=dl)
                )
            elif f.category == "INCOHERENT":
                draft.questions.append(DraftQuestion("inconsistent", right, f.left, label, conf, f.note or ""))
        elif f.category == "DATATYPE":
            draft.questions.append(
                DraftQuestion("wrong-replacement", right, f.left, label or None, f.confidence, f.note or "")
            )
        elif f.category == "NOT_SENSIBLE":
            draft.questions.append(
                DraftQuestion("not-sensible", right, f.left, label or None, f.confidence, f.note or "")
            )
        elif f.category == "OVER_REDACTED":
            draft.questions.append(
                DraftQuestion("over-redaction", right, f.left, "Overscrubbed", f.confidence, f.note or "")
            )
        elif f.category == "UNSURE":
            if f.confidence is None or f.confidence >= s.question_min_confidence:
                draft.questions.append(
                    DraftQuestion("possibly-pii", right, f.left, label or None, f.confidence, f.note or "")
                )
        elif f.category == "UNKNOWN_TEXT":
            draft.questions.append(DraftQuestion("unaligned", right, f.left, None, None, f.note or ""))
        # TASK (language / structure flags) is not about a value: reported by the UI, not as a card.
    # Low-confidence detections redaction.js does not report: still worth a question.
    covered = [q.left for q in draft.questions if q.left] + [x.left for x in draft.labels if x.left]
    for d in detections:
        if s.question_min_confidence <= d.confidence < s.review_threshold and not any(
            c.overlaps(d.span) for c in covered
        ):
            draft.questions.append(_possibly(d, None, d.span))
    return draft


def reconcile_existing(draft: Draft, existing: Sequence[RightLabel], compare_findings: Sequence[Finding]) -> None:
    """Labels already on the right: keep the ones the agent agrees with, change or remove the others."""
    overscrub = {(f.right.start, f.right.end) for f in compare_findings if f.category == "OVERSCRUB" and f.right}
    notes = {(f.right.start, f.right.end): f for f in compare_findings if f.right and f.right_label}
    for rl in existing:
        span = rl.span
        hits = [x for x in draft.labels if x.action == "add" and x.right.overlaps(span)]
        if hits:
            best = max(hits, key=lambda x: x.right.overlap(span))
            best.existing_label = rl.label
            if best.label == rl.label and best.right == span:
                best.action = "keep"
            else:
                best.action = "change"
                if best.label == rl.label:
                    best.fixes.append("span")
                else:
                    best.fixes.append("label")
            continue
        f = notes.get((span.start, span.end))
        if (span.start, span.end) in overscrub:
            draft.labels.append(
                DraftLabel(
                    label=rl.label,
                    right=span,
                    left=f.left if f else None,
                    confidence=0.0,
                    source="right",
                    action="remove",
                    existing_label=rl.label,
                    why="no PII detected under this label",
                )
            )
        else:
            # A label the agent has no opinion on (unaligned, low confidence, Overscrubbed agreed): keep, check by hand.
            draft.labels.append(
                DraftLabel(
                    label=rl.label,
                    right=span,
                    left=f.left if f else None,
                    confidence=f.confidence if f and f.confidence is not None else 0.0,
                    source="right",
                    action="keep",
                    existing_label=rl.label,
                    why="already labeled on the right; the rules neither confirm nor reject it",
                )
            )
