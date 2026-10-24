"""Gold sets. Every document becomes an identify task (left == right) with the values that must be labeled.

- bench-docs / bench-holdout: tests/fixtures/label-bench ({{Label|value}} marks, "<SPLIT>" removed), all 11 labels.
- synthetic: ml/eval-data/synthetic (left.txt + gold.json, local only), the 4 model labels.
- blind: eval/blind (generated at run time from a seed; no secret-shaped value is stored), all 11 labels.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

from pii_agent.config import REPO_DIR
from pii_agent.models import PII_LABELS

MARK = re.compile(r"\{\{([^|}]+)\|([^}]*)\}\}")


@dataclass(frozen=True)
class GoldSpan:
    label: str
    start: int
    end: int
    text: str


@dataclass
class GoldDoc:
    set: str
    id: str
    file_name: str
    text: str
    gold: list[GoldSpan]
    labels: tuple[str, ...] = PII_LABELS  # labels this set is scored on
    meta: dict[str, str] = field(default_factory=dict)


def parse_marked(marked: str) -> tuple[str, list[GoldSpan]]:
    """'{{Label|value}}' marks -> plain text and gold spans (as ml/label-bench.js parse)."""
    src = marked.replace("<SPLIT>", "")
    out: list[str] = []
    gold: list[GoldSpan] = []
    last = 0
    n = 0
    for m in MARK.finditer(src):
        chunk = src[last : m.start()]
        out.append(chunk)
        n += len(chunk)
        gold.append(GoldSpan(m.group(1), n, n + len(m.group(2)), m.group(2)))
        out.append(m.group(2))
        n += len(m.group(2))
        last = m.end()
    out.append(src[last:])
    return "".join(out), gold


def label_bench(name: str) -> list[GoldDoc]:
    data = json.loads((REPO_DIR / "tests" / "fixtures" / "label-bench" / f"{name}.json").read_text(encoding="utf-8"))
    docs = []
    for d in data["docs"]:
        text, gold = parse_marked(d["marked"])
        docs.append(GoldDoc(f"bench-{name}", d["file"], d["file"], text, gold))
    return docs


def _utf16_to_cp(text: str) -> list[int]:
    """index map UTF-16 unit -> code point (gold.json files were written by JavaScript)."""
    m: list[int] = []
    for cp, ch in enumerate(text):
        m.extend([cp] * (2 if ord(ch) > 0xFFFF else 1))
    m.append(len(text))
    return m


MODEL_LABELS = ("Person Name", "Business Name", "Address", "Person Username")


def eval_data(kind: str = "synthetic") -> list[GoldDoc]:
    root = REPO_DIR / "ml" / "eval-data" / kind
    if not root.is_dir():
        return []
    docs = []
    for d in sorted(p for p in root.iterdir() if p.is_dir()):
        text = (d / "left.txt").read_text(encoding="utf-8")
        meta = json.loads((d / "meta.json").read_text(encoding="utf-8")) if (d / "meta.json").exists() else {}
        m = _utf16_to_cp(text)
        gold = [
            GoldSpan(g["label"], m[g["start"]], m[g["end"]], g["text"])
            for g in json.loads((d / "gold.json").read_text(encoding="utf-8"))
        ]
        labels = MODEL_LABELS if meta.get("synthetic") else PII_LABELS
        docs.append(GoldDoc(kind, d.name, meta.get("fileName", ""), text, gold, labels))
    return docs


def blind() -> list[GoldDoc]:
    from .blind import generate

    return [
        GoldDoc("blind", f"{i:03d}-{d.kind}", d.file_name, *parse_marked(d.marked)) for i, d in enumerate(generate())
    ]


SETS = {
    "bench-docs": lambda: label_bench("docs"),
    "bench-holdout": lambda: label_bench("holdout"),
    "synthetic": lambda: eval_data("synthetic"),
    "blind": blind,
}


def load(names: list[str]) -> list[GoldDoc]:
    docs: list[GoldDoc] = []
    for n in names:
        docs += SETS[n]()
    for d in docs:
        for g in d.gold:
            if d.text[g.start : g.end] != g.text:
                raise ValueError(f"gold span does not match its text in {d.set}/{d.id}")
    return docs


def available_sets() -> list[str]:
    return [n for n in SETS if n != "synthetic" or Path(REPO_DIR / "ml" / "eval-data" / "synthetic").is_dir()]
