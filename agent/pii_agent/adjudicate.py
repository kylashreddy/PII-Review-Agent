"""adjudicate: the LLM's opinion on medium and unsure items only, applied conservatively.

- An unsure question ("possibly PII") becomes a medium label when the LLM names a label with >= llm_accept; it is
  dropped only when llm_may_dismiss is on and the LLM says "not PII" with >= llm_dismiss. Otherwise the question
  stays, annotated with the LLM's view.
- A medium label the LLM agrees with is marked (calibration uses it). One it rejects becomes a question — never
  silently removed — when llm_demote is on.
- No answer (provider "none", a refusal, invalid JSON) changes nothing: the item stays for the human.
Snippets only: the value and ±context_chars around it. For an external provider the other labeled values inside the
snippet are replaced by "[Label]" (mask_context="auto").
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Sequence

from .config import Settings
from .draft import Draft, DraftLabel, DraftQuestion
from .llm import AdjudicationItem, Decision, LLMProvider
from .llm.base import NOT_PII
from .models import PII_LABELS, Span

Item = DraftLabel | DraftQuestion


def _masked(text: str, start: int, end: int, masks: Sequence[tuple[Span, str]]) -> str:
    """text[start:end] with every masked span inside it replaced by [Label] (spans clipped to the window)."""
    out: list[str] = []
    at = start
    for span, label in sorted(masks, key=lambda m: m[0].start):
        s, e = max(span.start, start), min(span.end, end)
        if s >= e or s < at:
            continue
        out.append(text[at:s])
        out.append(f"[{label}]")
        at = e
    out.append(text[at:end])
    return "".join(out)


def build_items(
    items: Sequence[Item], right: str, context_chars: int, file_kind: str, masks: Sequence[tuple[Span, str]] | None
) -> list[AdjudicationItem]:
    out = []
    for n, it in enumerate(items, 1):
        if it.right is None:
            raise ValueError("adjudication items need a right span")
        s, e = it.right.start, it.right.end
        a, b = max(0, s - context_chars), min(len(right), e + context_chars)
        others = [m for m in masks or [] if not m[0].overlaps(it.right)]
        guess = it.label if isinstance(it, DraftLabel) else it.suggest
        out.append(
            AdjudicationItem(
                id=f"i{n}",
                value=right[s:e],
                label_guess=guess,
                context_before=_masked(right, a, s, others) if masks is not None else right[a:s],
                context_after=_masked(right, e, b, others) if masks is not None else right[e:b],
                file_kind=file_kind,
            )
        )
    return out


def _is_medium(x: DraftLabel, s: Settings) -> bool:
    return x.label not in s.approve_all_labels or x.confidence < s.high_confidence


def adjudicate(draft: Draft, right: str, file_name: str, provider: LLMProvider, s: Settings) -> Counter[str]:
    stats: Counter[str] = Counter()
    questions = [q for q in draft.questions if q.kind == "possibly-pii" and q.right is not None]
    medium = (
        [x for x in draft.labels if x.active and x.action == "add" and x.llm is None and _is_medium(x, s)]
        if s.llm_review_medium
        else []
    )
    todo: list[Item] = [*questions, *medium]
    if not todo or provider.name == "none":
        return stats
    mask = s.mask_context == "always" or (s.mask_context == "auto" and provider.external)
    masks = [(x.right, x.label) for x in draft.labels if x.active] if mask else None
    kind = file_name.rsplit(".", 1)[-1].lower()[:8] if "." in file_name else ""
    decisions = provider.decide(build_items(todo, right, s.context_chars, kind, masks))
    stats["asked"] = len(todo)
    for item, d in zip(todo, decisions, strict=True):
        if d is None:
            stats["no_answer"] += 1
        elif isinstance(item, DraftQuestion):
            _apply_question(draft, item, d, s, stats)
        else:
            _apply_label(draft, item, d, s, stats)
    return stats


def _apply_question(draft: Draft, q: DraftQuestion, d: Decision, s: Settings, stats: Counter[str]) -> None:
    if q.right is None:
        return
    if d.label in PII_LABELS and d.confidence >= s.llm_accept:
        draft.questions.remove(q)
        draft.labels.append(
            DraftLabel(
                label=d.label,
                right=q.right,
                left=q.left,
                confidence=min(d.confidence, 0.89),
                source="llm",
                why=f"LLM: {d.reason}",
                llm="agree" if d.label == q.suggest else "llm-only",
            )
        )
        stats["question_to_label"] += 1
    elif d.label == NOT_PII and d.confidence >= s.llm_dismiss and s.llm_may_dismiss:
        draft.questions.remove(q)
        stats["question_dismissed"] += 1
    else:
        q.why = f"{q.why}; LLM: {d.label} ({d.confidence:.2f}) — {d.reason}"
        if d.label in PII_LABELS:
            q.suggest = d.label
        stats["question_kept"] += 1


def _apply_label(draft: Draft, x: DraftLabel, d: Decision, s: Settings, stats: Counter[str]) -> None:
    if d.label == x.label:
        x.llm = "agree"
        x.why = f"{x.why}; LLM agrees"
        stats["label_agreed"] += 1
        return
    if d.confidence < s.llm_accept:
        x.llm = "unsure"
        stats["label_llm_unsure"] += 1
        return
    x.llm = "disagree"
    if not s.llm_demote:
        x.why = f"{x.why}; LLM says {d.label}"
        stats["label_disputed"] += 1
        return
    x.dropped = "llm-disagrees"
    draft.questions.append(
        DraftQuestion(
            "possibly-pii",
            x.right,
            x.left,
            d.label if d.label in PII_LABELS else x.label,
            x.confidence,
            f"rules: {x.label} ({x.why}); LLM: {d.label} — {d.reason}",
        )
    )
    stats["label_to_question"] += 1
