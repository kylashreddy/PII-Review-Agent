"""rubric_check: the agent's own L2 (docs/SINGLE-REVIEW-RUBRIC.md, Part B), deterministic.

Structural checks run here (exact span, part of a word, one label per value, consistency, forbidden labels, every
occurrence, nothing missed); "is this text PII at all" questions go to the rules service (span_facts), so no rule is
re-implemented. Violations carry fixed codes, never document text.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable, Sequence

import regex

from .draft import Draft, DraftLabel, DraftQuestion
from .models import PII_LABELS, Detection, Span, SpanFacts, Violation

FactsFn = Callable[[str, Sequence[tuple[int, int]]], list[SpanFacts]]

_FIELD_PREFIX = regex.compile(r"^[\p{L}][\p{L} ._/'-]{0,30}:\s+(?=\S)")
_QUOTES = {'"': '"', "'": "'", "“": "”", "‘": "’", "«": "»", "(": ")", "[": "]", "<": ">", "`": "`"}
_CLOSE = {"(": ")", "[": "]", "{": "}"}
_OPEN = {v: k for k, v in _CLOSE.items()}
_TRAILING_DOT_LABELS = {"Email Address", "URL/Link", "IP Address", "Contact Number"}
_NO_OUT_OF_SCOPE_CHECK = {"URL/Link", "Email Address", "Credentials"}
_NAME_LIKE = {"Person Name", "Business Name", "Address"}
# A labeled value is looked for again elsewhere only when it cannot be an ordinary word.
_DISTINCTIVE = regex.compile(r"[\d@./_:-]|\s")


def _alnum(ch: str) -> bool:
    return ch.isalnum()


def fix_span(text: str, span: Span, label: str) -> tuple[Span, list[str]]:
    """Exact span (A1 rule 1): no surrounding spaces, quotes, field name or trailing punctuation."""
    s, e = span.start, span.end
    codes: list[str] = []
    for _ in range(4):
        before = (s, e)
        while s < e and text[s].isspace():
            s += 1
        while e > s and text[e - 1].isspace():
            e -= 1
        if e - s >= 2 and text[s] in _QUOTES and text[e - 1] == _QUOTES[text[s]]:
            s, e = s + 1, e - 1
            codes.append("quotes")
        # An unmatched bracket at either end ("(080 4123 5678" in "driver Ravi (080 4123 5678)").
        if e > s and text[s] in "([{" and _CLOSE[text[s]] not in text[s:e]:
            s += 1
            codes.append("bracket")
        if e > s and text[e - 1] in ")]}" and _OPEN[text[e - 1]] not in text[s:e]:
            e -= 1
            codes.append("bracket")
        while e > s and text[e - 1] in ",;":
            e -= 1
            codes.append("trailing-punct")
        if label in _TRAILING_DOT_LABELS and e - s > 1 and text[e - 1] == "." and _alnum(text[e - 2]):
            e -= 1
            codes.append("trailing-dot")
        if label not in ("URL/Link", "Credentials", "IP Address"):
            m = _FIELD_PREFIX.match(text, s, e)
            if m and m.end() < e:
                s = m.end()
                codes.append("field-name")
        if (s, e) == before:
            break
    return Span(start=s, end=max(s, e)), codes


def part_of_word(text: str, span: Span) -> bool:
    """Never a part of a word (A1 rule 3): the value continues into letters or digits on either side."""
    if span.length == 0:
        return True
    left = span.start > 0 and _alnum(text[span.start - 1]) and _alnum(text[span.start])
    right = span.end < len(text) and _alnum(text[span.end]) and _alnum(text[span.end - 1])
    return left or right


class RubricChecker:
    def __init__(self, facts: FactsFn, review_threshold: float = 0.7) -> None:
        self.facts = facts
        self.review_threshold = review_threshold

    def check(self, draft: Draft, right: str, detections: Sequence[Detection], *, identify: bool) -> list[Violation]:
        """Fixes `draft` in place and returns what it found. Running it twice changes nothing the second time."""
        out: list[Violation] = []
        labels = [x for x in draft.labels if x.dropped is None]

        def v(item: DraftLabel | DraftQuestion, check: str, detail: str, fixed: bool = True) -> None:
            ref = f"{item.right.start}-{item.right.end}" if item.right else "?"
            out.append(Violation(item_id=ref, check=check, detail=detail, fixed=fixed))

        # 1. Never Date or Overscrubbed; only the 13 site labels. An existing label is only kept or removed.
        for x in labels:
            if x.label not in PII_LABELS and x.action not in ("keep", "remove"):
                x.dropped = "forbidden-label"
                v(x, "forbidden_label", x.label if x.label in ("Date", "Overscrubbed") else "unknown-label")

        # 2. Exact span.
        for x in labels:
            if not x.active:
                continue
            span, codes = fix_span(right, x.right, x.label)
            if span != x.right:
                x.right = span
                if x.left is not None and identify:
                    x.left = span
                x.fixes.append("span")
                if x.existing_label and x.action == "keep":
                    x.action = "change"
                v(x, "span", "+".join(sorted(set(codes))) or "trim")
            if span.length == 0:
                x.dropped = "empty"

        # 3. Not a part of a word: too risky to label; ask instead.
        for x in labels:
            if x.active and part_of_word(right, x.right):
                x.dropped = "part-of-word"
                draft.questions.append(
                    DraftQuestion(
                        "possibly-pii", x.right, x.left, x.label, x.confidence, "the value continues into a longer word"
                    )
                )
                v(x, "part_of_word", "to-question")

        # 4. Is it PII at all (rules service facts on the right text)?
        active = [x for x in labels if x.active]
        for x, f in zip(active, self.facts(right, [(x.right.start, x.right.end) for x in active]), strict=True):
            reason = self._not_pii(x, f)
            if reason:
                if x.existing_label:
                    x.action = "remove"
                    x.why = f"not PII ({reason})"
                else:
                    x.dropped = reason
                v(x, "not_pii", reason)

        # 5. One label per value: overlapping labels keep the surer (then longer) one.
        active = sorted((x for x in labels if x.active), key=lambda x: (-x.confidence, -x.right.length, x.right.start))
        kept: list[DraftLabel] = []
        for x in active:
            if any(k.right.overlaps(x.right) for k in kept):
                x.dropped = "overlap"
                v(x, "one_label", "overlap")
            else:
                kept.append(x)

        # 6. Consistency: the same value carries the same label everywhere.
        by_text: dict[str, list[DraftLabel]] = defaultdict(list)
        for x in kept:
            by_text[right[x.right.start : x.right.end]].append(x)
        consistent = True
        for group in by_text.values():
            if len({x.label for x in group}) > 1:
                consistent = False
                best = max(group, key=lambda x: (x.confidence, x.right.length))
                for x in group:
                    if x.label != best.label:
                        x.label = best.label
                        x.fixes.append("label")
                        v(x, "consistency", "label")

        # 7. Every occurrence of a labeled value is labeled on its own (whole words only, A1 rule 2).
        added = self._other_occurrences(draft, by_text, right, kept)
        for x in added:
            v(x, "consistency", "occurrence")

        draft.consistent = draft.consistent and consistent
        # 8. Nothing missed: every confident detection ended up in a label or a question.
        self._missed(draft, detections, identify, self.review_threshold, v)
        return out

    @staticmethod
    def _not_pii(x: DraftLabel, f: SpanFacts) -> str | None:
        if f.placeholder:
            return "placeholder"
        if f.in_key:
            return "field-name"
        if f.non_pii_field:
            return "non-pii-field"
        if f.out_of_scope and x.label not in _NO_OUT_OF_SCOPE_CHECK:
            return "out-of-scope"
        if x.label in _NAME_LIKE and (f.department or f.doc_phrase):
            return "department-or-phrase"
        if x.label == "Business Name" and f.known_name:
            return "public-name"
        return None

    def _other_occurrences(
        self, draft: Draft, by_text: dict[str, list[DraftLabel]], right: str, kept: list[DraftLabel]
    ) -> list[DraftLabel]:
        taken = [x.right for x in kept] + [q.right for q in draft.questions if q.right]
        candidates: list[DraftLabel] = []
        for value, group in sorted(by_text.items()):
            if len(value) < 4 or not _DISTINCTIVE.search(value):
                continue
            src = max(group, key=lambda x: x.confidence)
            for m in regex.finditer(regex.escape(value), right):
                span = Span(start=m.start(), end=m.end())
                if part_of_word(right, span) or any(t.overlaps(span) for t in taken):
                    continue
                candidates.append(
                    DraftLabel(
                        label=src.label,
                        right=span,
                        left=span if draft.mode == "identify" else None,
                        confidence=min(src.confidence, 0.89),
                        source="consistency",
                        rule=src.rule,
                        type=src.type,
                        why="same value as another label",
                        fixes=["occurrence"],
                    )
                )
                taken.append(span)
        if not candidates:
            return []
        facts = self.facts(right, [(c.right.start, c.right.end) for c in candidates])
        added = [c for c, f in zip(candidates, facts, strict=True) if not self._not_pii(c, f)]
        draft.labels.extend(added)
        return added

    @staticmethod
    def _missed(
        draft: Draft, detections: Sequence[Detection], identify: bool, threshold: float, v: Callable[..., None]
    ) -> None:
        seen: list[Span] = []
        for x in draft.labels:
            if x.left is not None:
                seen.append(x.left)
            elif identify:
                seen.append(x.right)
        seen += [q.left for q in draft.questions if q.left is not None]
        missed = 0
        for d in detections:
            if d.confidence < threshold or any(s.overlaps(d.span) for s in seen):
                continue
            missed += 1
            q = DraftQuestion(
                "unaligned",
                d.span if identify else None,
                d.span,
                d.label,
                d.confidence,
                "found on the left, but no label or card covers it",
            )
            draft.questions.append(q)
            seen.append(d.span)
            v(q, "missed", "to-question")
        draft.uncovered = missed
