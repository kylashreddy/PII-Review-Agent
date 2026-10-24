"""Per-label precision, recall, boundary accuracy (exact start and end), with 95% Wilson intervals.

Matching is ml/label-bench.js's: a prediction matches the first unused gold value that overlaps it by at least half
of the shorter of the two. A match with another label is a miss for the gold label and a false alarm for the other.
"""

from __future__ import annotations

import math
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass, field

from .gold import GoldDoc, GoldSpan


@dataclass(frozen=True)
class Pred:
    label: str
    start: int
    end: int
    text: str
    group: str = "medium"
    confidence: float = 0.0  # raw, before calibration
    llm: str = "none"


@dataclass
class Counts:
    tp: int = 0
    fp: int = 0
    fn: int = 0
    exact: int = 0  # tp with the exact gold span
    surfaced: int = 0  # gold values covered by a label (any) or a question
    gold: int = 0

    def add(self, o: Counts) -> None:
        for k in ("tp", "fp", "fn", "exact", "surfaced", "gold"):
            setattr(self, k, getattr(self, k) + getattr(o, k))

    @property
    def recall(self) -> float | None:
        return self.tp / (self.tp + self.fn) if self.tp + self.fn else None

    @property
    def precision(self) -> float | None:
        return self.tp / (self.tp + self.fp) if self.tp + self.fp else None

    @property
    def boundary(self) -> float | None:
        return self.exact / self.tp if self.tp else None

    @property
    def surfaced_recall(self) -> float | None:
        return self.surfaced / self.gold if self.gold else None


@dataclass
class Error:
    kind: str  # missed | false alarm | wrong label | span
    label: str
    text: str
    doc: str
    other: str = ""


@dataclass
class Score:
    by_label: dict[str, Counts] = field(default_factory=lambda: defaultdict(Counts))
    approve_all: dict[str, Counts] = field(default_factory=lambda: defaultdict(Counts))
    errors: list[Error] = field(default_factory=list)

    def total(self, labels: Sequence[str] | None = None) -> Counts:
        t = Counts()
        for k, c in self.by_label.items():
            if labels is None or k in labels:
                t.add(c)
        return t


def _ov(a: GoldSpan | Pred, b: GoldSpan | Pred) -> int:
    return max(0, min(a.end, b.end) - max(a.start, b.start))


def _hit(p: GoldSpan | Pred, g: GoldSpan | Pred) -> bool:
    return _ov(p, g) > 0 and _ov(p, g) >= 0.5 * min(p.end - p.start, g.end - g.start)


def score_doc(
    doc: GoldDoc, preds: Sequence[Pred], questions: Sequence[tuple[int, int]], score: Score
) -> list[tuple[Pred, bool]]:
    """Adds the document to `score`; returns each scored prediction with whether it was right (label and value)."""
    preds = [p for p in preds if p.label in doc.labels]
    outcomes: list[tuple[Pred, bool]] = []
    gold = [g for g in doc.gold if g.label in doc.labels]
    name = f"{doc.set}/{doc.id}"
    used: set[int] = set()
    for p in preds:
        gi = next((i for i, g in enumerate(gold) if i not in used and _hit(p, g)), None)
        if gi is None:
            outcomes.append((p, False))
            score.by_label[p.label].fp += 1
            score.errors.append(Error("false alarm", p.label, p.text, name))
            if p.group == "high":
                score.approve_all[p.label].fp += 1
            continue
        used.add(gi)
        g = gold[gi]
        outcomes.append((p, g.label == p.label))
        if g.label == p.label:
            c = score.by_label[g.label]
            c.tp += 1
            if (p.start, p.end) == (g.start, g.end):
                c.exact += 1
            else:
                score.errors.append(Error("span", g.label, p.text, name, g.text))
            if p.group == "high":
                score.approve_all[p.label].tp += 1
        else:
            score.by_label[g.label].fn += 1
            score.by_label[p.label].fp += 1
            score.errors.append(Error("wrong label", g.label, g.text, name, p.label))
            if p.group == "high":
                score.approve_all[p.label].fp += 1
    for i, g in enumerate(gold):
        c = score.by_label[g.label]
        c.gold += 1
        covered = any(_hit(p, g) for p in preds) or any(_hit(GoldSpan("", s, e, ""), g) for s, e in questions)
        if covered:
            c.surfaced += 1
        if i not in used:
            c.fn += 1
            score.errors.append(Error("missed", g.label, g.text, name, "surfaced as a question" if covered else ""))
    return outcomes


def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float] | None:
    if n == 0:
        return None
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return max(0.0, c - h), min(1.0, c + h)
