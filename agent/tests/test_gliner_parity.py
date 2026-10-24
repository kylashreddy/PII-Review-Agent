"""The Python GLiNER port must give exactly what the extension's Node runner gives (ml/gliner-runner.js)."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest

from eval.gold import eval_data, label_bench
from pii_agent.config import AGENT_DIR, REPO_DIR, get_settings
from pii_agent.gliner import Gliner, plan_lines, split_words, to_site_labels

from .conftest import needs_model, needs_node

HAS_ORT_NODE = (REPO_DIR / "ml" / "node_modules" / "onnxruntime-node").is_dir()


def test_split_words_unicode_and_hyphens() -> None:
    ws = split_words("Ravi-Kumar, राहुल शर्मा João's 😀!")
    assert [w.w for w in ws] == ["Ravi-Kumar", ",", "राहुल", "शर्मा", "João", "'", "s", "😀", "!"]


def test_plan_lines_dedupes_and_maps_occurrences() -> None:
    text = "  Ravi Kumar\n1234\nRavi Kumar\nhello world"
    p = plan_lines(text, 200)
    assert p.occurrences["Ravi Kumar"] == [2, 18]
    assert p.skipped == 1
    assert p.windows[0].text == "Ravi Kumar\nhello world"


def test_to_site_labels_never_crosses_a_line() -> None:
    text = "Name\nRavi Kumar Sharma\n"
    out = to_site_labels([{"label": "person", "start": 0, "end": 22, "score": 0.235}], text)
    assert [(e.text, e.score) for e in out] == [("Ravi Kumar Sharma", 0.24)]
    assert to_site_labels([{"label": "department", "start": 0, "end": 4, "score": 0.9}], text) == []


@pytest.mark.model
@needs_model
@needs_node
@pytest.mark.skipif(not HAS_ORT_NODE, reason="ml/node_modules is not installed (cd ml && npm install)")
def test_same_entities_and_scores_as_the_node_runner() -> None:
    texts = [d.text for d in label_bench("docs") + label_bench("holdout")]
    texts += [d.text for d in eval_data("synthetic")[:20]]
    texts.append("Hi 😀 Ravi Kumar from Zentrix Analytics, 12 MG Road Bengaluru.\nThanks Rohan 👍 — राहुल शर्मा")
    ref = json.loads(
        subprocess.run(
            ["node", str(Path(AGENT_DIR) / "tests" / "js" / "gliner-ref.js")],
            input=json.dumps(texts),
            capture_output=True,
            text=True,
            check=True,
            timeout=600,
        ).stdout
    )
    s = get_settings()
    g = Gliner(s.model_dir, s.gliner_max_width, s.gliner_max_words)
    for i, text in enumerate(texts):
        got = [e.model_dump() for e in g.detect(text, 0.05)]
        assert [(e["label"], e["start"], e["end"], e["score"]) for e in got] == [
            (e["label"], e["start"], e["end"], e["score"]) for e in ref[i]
        ], i
