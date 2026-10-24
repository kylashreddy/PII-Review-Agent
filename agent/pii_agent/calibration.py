"""Per-label confidence calibration: isotonic regression (pool-adjacent-violators) from raw confidence to the
observed share of correct labels. Fitted on the gold sets now (eval/calibrate.py) and on human answers later
("Yes" = correct), so "95%" on a card means 95 of 100 such labels were right.

Models are kept per (label, adjudicator view) when there are enough samples, else per label, else one global model;
without a calibration file every confidence passes through unchanged.
"""

from __future__ import annotations

import bisect
import hashlib
import json
from collections import defaultdict
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from pathlib import Path

MIN_SAMPLES = 30


@dataclass(frozen=True)
class Sample:
    label: str
    llm: str  # agree | disagree | unsure | llm-only | none
    confidence: float
    correct: bool


def isotonic(xs: Sequence[float], ys: Sequence[float]) -> list[tuple[float, float]]:
    """Pool-adjacent-violators: a non-decreasing step function, as [(x_upper, y)] blocks."""
    # Equal confidences form one block first (ties must not be split by their outcome).
    tied: dict[float, list[float]] = defaultdict(lambda: [0.0, 0.0])
    for x, y in zip(xs, ys, strict=True):
        tied[x][0] += y
        tied[x][1] += 1
    blocks: list[list[float]] = []  # [sum_y, count, x_max]
    for x in sorted(tied):
        blocks.append([tied[x][0], tied[x][1], x])
        while len(blocks) > 1 and blocks[-2][0] / blocks[-2][1] >= blocks[-1][0] / blocks[-1][1]:
            s, c, xm = blocks.pop()
            blocks[-1][0] += s
            blocks[-1][1] += c
            blocks[-1][2] = xm
    return [(b[2], b[0] / b[1]) for b in blocks]


@dataclass(frozen=True)
class Curve:
    points: tuple[tuple[float, float], ...]
    n: int

    def __call__(self, x: float) -> float:
        xs = [p[0] for p in self.points]
        i = bisect.bisect_left(xs, x)
        return self.points[min(i, len(self.points) - 1)][1]


def _key(label: str, llm: str) -> str:
    return f"{label}|{'agree' if llm in ('agree', 'llm-only') else 'other'}"


class Calibrator:
    def __init__(self, curves: dict[str, Curve], meta: dict[str, object] | None = None) -> None:
        self.curves = curves
        self.meta = meta or {}

    @classmethod
    def identity(cls) -> Calibrator:
        return cls({})

    @classmethod
    def fit(
        cls, samples: Iterable[Sample], min_samples: int = MIN_SAMPLES, meta: dict[str, object] | None = None
    ) -> Calibrator:
        by: dict[str, list[Sample]] = defaultdict(list)
        all_: list[Sample] = []
        for s in samples:
            all_.append(s)
            by[_key(s.label, s.llm)].append(s)
            by[s.label].append(s)
        curves: dict[str, Curve] = {}
        for key, group in by.items():
            if len(group) >= min_samples:
                curves[key] = Curve(
                    tuple(isotonic([g.confidence for g in group], [float(g.correct) for g in group])), len(group)
                )
        if len(all_) >= min_samples:
            curves["*"] = Curve(
                tuple(isotonic([g.confidence for g in all_], [float(g.correct) for g in all_])), len(all_)
            )
        return cls(curves, meta)

    def __call__(self, label: str, llm: str | None, confidence: float) -> float:
        for key in (_key(label, llm or "none"), label, "*"):
            c = self.curves.get(key)
            if c is not None:
                return round(c(confidence), 3)
        return confidence

    @property
    def version(self) -> str | None:
        if not self.curves:
            return None
        return hashlib.sha256(self.dumps().encode()).hexdigest()[:12]

    def dumps(self) -> str:
        return json.dumps(
            {
                "meta": self.meta,
                "curves": {
                    k: {"n": c.n, "points": [list(p) for p in c.points]} for k, c in sorted(self.curves.items())
                },
            },
            sort_keys=True,
            indent=1,
        )

    def save(self, path: Path) -> None:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        Path(path).write_text(self.dumps() + "\n", encoding="utf-8")

    @classmethod
    def load(cls, path: Path | None) -> Calibrator:
        if path is None or not Path(path).exists():
            return cls.identity()
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        curves = {
            k: Curve(tuple((float(x), float(y)) for x, y in v["points"]), int(v["n"]))
            for k, v in data.get("curves", {}).items()
        }
        return cls(curves, data.get("meta") or {})


def reliability(pairs: Sequence[tuple[float, bool]], bins: int = 10) -> dict[str, float]:
    """Expected calibration error and Brier score of (confidence, correct) pairs."""
    if not pairs:
        return {"ece": 0.0, "brier": 0.0, "n": 0}
    buckets: dict[int, list[tuple[float, bool]]] = defaultdict(list)
    for p, y in pairs:
        buckets[min(bins - 1, int(p * bins))].append((p, y))
    n = len(pairs)
    ece = sum(len(b) / n * abs(sum(p for p, _ in b) / len(b) - sum(y for _, y in b) / len(b)) for b in buckets.values())
    brier = sum((p - y) ** 2 for p, y in pairs) / n
    return {"ece": round(ece, 4), "brier": round(brier, 4), "n": n}
