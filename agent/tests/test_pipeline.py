"""End to end through the Node rules service (rules only; the model has its own parity test)."""

from __future__ import annotations

import io

import pytest

from eval.gold import label_bench
from pii_agent.config import REPO_DIR
from pii_agent.log import Logger
from pii_agent.models import RightLabel, Task
from pii_agent.pipeline import Pipeline
from pii_agent.task_source import FileTaskSource
from pii_agent.tools import Toolbox


@pytest.mark.skipif(
    not (REPO_DIR / "data" / "kb" / "meta.json").exists(),
    reason="the label bench is scored with the offline knowledge base (npm run build-kb)",
)
def test_agent_labels_equal_the_extension_on_the_label_bench(pipeline: Pipeline) -> None:
    """With nothing for the rubric to fix, the agent labels exactly what `npm run label-bench --rules` scores."""
    for doc in label_bench("docs") + label_bench("holdout"):
        r = pipeline.run(Task(id=doc.id, file_name=doc.file_name, left=doc.text, right=doc.text))
        want = sorted((d.label, d.start, d.end) for d in r.detections if d.confidence >= 0.7 and d.label != "Date")
        got = sorted((x.label, x.right.start, x.right.end) for x in r.plan.labels)
        assert got == want, doc.id
        assert r.plan.mode == "identify"
        assert {(g.label, g.start, g.end) for g in doc.gold} == set(got), doc.id


def test_same_input_same_plan_byte_for_byte(pipeline: Pipeline) -> None:
    doc = label_bench("docs")[0]
    task = Task(id="t", file_name=doc.file_name, left=doc.text, right=doc.text)
    a = pipeline.run(task)
    b = pipeline.run(task)
    assert a.plan.model_dump_json() == b.plan.model_dump_json()
    assert a.cards.model_dump_json() == b.cards.model_dump_json()


def test_logs_never_carry_document_text(tools: Toolbox) -> None:
    buf = io.StringIO()
    pipe = Pipeline(tools, Logger(stream=buf, level="debug"))
    for doc in label_bench("docs"):
        pipe.run(Task(id=doc.id, file_name=doc.file_name, left=doc.text, right=doc.text))
        logged = buf.getvalue()
        for g in doc.gold:
            if len(g.text) >= 6:
                assert g.text not in logged, (doc.id, g.label)
        words = [w for w in doc.text.split() if len(w) >= 8 and not w.isdigit()]
        assert not [w for w in words if w in logged and w not in doc.file_name], doc.id
    assert '"step": "rubric_check"' in buf.getvalue()


def test_verify_mode_raises_leak_cards(tools: Toolbox) -> None:
    src = FileTaskSource(REPO_DIR / "tests" / "fixtures")
    pipe = Pipeline(tools, Logger(level="error"))
    r = pipe.run(src.load_task("bug6-git-logs"))
    assert r.plan.mode == "verify"
    leaks = [q for q in r.plan.questions if q.kind == "leak"]
    assert leaks and all(q.label_id for q in leaks)
    leaked = {x.id: x for x in r.plan.labels}
    assert all(leaked[q.label_id or ""].text == q.text for q in leaks)
    tiers = [c.tier for c in r.cards.cards]
    assert tiers.index("leak") < tiers.index("medium") if "medium" in tiers else True
    assert tiers[-2:] == ["document", "document"]


def test_existing_labels_are_kept_changed_or_removed(pipeline: Pipeline) -> None:
    text = "Name: Ravi Kumar Sharma\nEmail: ravi.sharma@gmail.com\nTeam: Customer Support\n"
    n, e, c = text.index("Ravi"), text.index("ravi.sharma"), text.index("Customer Support")
    task = Task(
        id="x",
        left=text,
        right=text,
        right_labels=(
            RightLabel(label="Person Name", start=n, end=n + 17),
            RightLabel(label="Contact Number", start=e, end=e + 21),
            RightLabel(label="Business Name", start=c, end=c + 16),
        ),
    )
    r = pipeline.run(task)
    by_text = {x.text: x for x in r.plan.labels}
    assert by_text["Ravi Kumar Sharma"].action == "keep"
    assert by_text["ravi.sharma@gmail.com"].action == "change"
    assert by_text["ravi.sharma@gmail.com"].label == "Email Address"
    assert by_text["Customer Support"].action == "remove"
    remove = next(c for c in r.cards.cards if c.ref == by_text["Customer Support"].id)
    assert remove.options[0].startswith("Yes, remove")


def test_offsets_are_code_points_around_emoji(pipeline: Pipeline) -> None:
    text = "🙂🙂 Hi! Mail me at priya.raman@gmail.com 👍 or call +91 98450 12345."
    r = pipeline.run(Task(id="e", left=text, right=text))
    texts = {x.text for x in r.plan.labels}
    assert {"priya.raman@gmail.com", "+91 98450 12345"} <= texts
    for x in r.plan.labels:
        assert text[x.right.start : x.right.end] == x.text


def test_cards_order_and_approve_all(pipeline: Pipeline) -> None:
    doc = label_bench("docs")[0]
    r = pipeline.run(Task(id="t", file_name=doc.file_name, left=doc.text, right=doc.text))
    order = {"unsure": 0, "leak": 1, "medium": 2, "high": 3, "document": 4}
    tiers = [order[c.tier] for c in r.cards.cards]
    assert tiers == sorted(tiers)
    high = {x.id for x in r.plan.labels if x.group == "high"}
    assert set(r.cards.approve_all.ids) == high
    assert all(x.label not in ("Person Name", "Business Name", "Address") for x in r.plan.labels if x.id in high)
    assert r.cards.approve_all.prompt.startswith(f"Approve all {len(high)} ")
