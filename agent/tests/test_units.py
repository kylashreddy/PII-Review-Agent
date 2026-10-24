from __future__ import annotations

import io
import json

import pytest
from pydantic import ValidationError

from pii_agent.adjudicate import adjudicate
from pii_agent.cards import create_cards
from pii_agent.config import get_settings
from pii_agent.draft import Draft, DraftQuestion, identify_draft
from pii_agent.llm import AdjudicationItem, Decision, NoneProvider
from pii_agent.log import Logger
from pii_agent.models import Checks, Detection, Plan, PlanLabel, Question, RightLabel, Span, Task
from pii_agent.plan import group_of


def test_span_validation() -> None:
    with pytest.raises(ValidationError):
        Span(start=5, end=2)
    assert Span(start=1, end=4).overlap(Span(start=3, end=9)) == 1


def test_doc_hash_depends_on_text_and_labels() -> None:
    a = Task(id="a", left="x", right="x")
    assert a.doc_hash == Task(id="b", left="x", right="x").doc_hash
    assert (
        a.doc_hash
        != Task(id="a", left="x", right="x", right_labels=(RightLabel(label="Date", start=0, end=1),)).doc_hash
    )


def test_logger_drops_strings_under_unknown_keys() -> None:
    buf = io.StringIO()
    Logger(stream=buf).info(
        "step",
        step="rules",
        value="Ravi Kumar",
        note="secret",
        n=3,
        label="Person Name",
        nested={"text": "AKIA..."},
        task="t1",
    )
    rec = json.loads(buf.getvalue())
    assert rec["value"] == rec["note"] == "<dropped>"
    assert rec["nested"] == {"text": "<dropped>"}
    assert (rec["n"], rec["label"], rec["task"]) == (3, "Person Name", "t1")


def test_groups() -> None:
    s = get_settings()
    assert group_of("Email Address", 0.95, "regex", s) == "high"
    assert group_of("Person Name", 0.97, "heuristic", s) == "medium"
    assert group_of("Credentials", 0.95, "model", s) == "medium"
    assert group_of("Credentials", 0.85, "regex", s) == "medium"


def test_identify_draft_thresholds() -> None:
    s = get_settings()
    ds = [Detection(label="Person Name", start=0, end=4, text="Ravi", confidence=c) for c in (0.9, 0.6, 0.45)]
    d = identify_draft(ds, s)
    assert len(d.labels) == 1 and len(d.questions) == 1


def test_none_provider_decides_nothing_and_decision_is_strict() -> None:
    q = DraftQuestion("possibly-pii", Span(start=0, end=4), None, "Business Name", 0.6, "")
    d = Draft(mode="identify", questions=[q])
    assert adjudicate(d, "Acme corp", "", NoneProvider(), get_settings()) == {}
    assert d.questions == [q]
    with pytest.raises(ValidationError):
        Decision.model_validate({"label": "x", "confidence": 2, "reason": "r"})
    with pytest.raises(ValidationError):
        Decision.model_validate({"label": "x", "confidence": 0.5, "reason": "r", "extra": 1})
    assert AdjudicationItem(id="i1", value="a", label_guess=None, context_before="", context_after="").value == "a"


def test_cards_from_a_plan() -> None:
    right = "Ravi ravi@x.in\nCloudnine"
    plan = Plan(
        task="t",
        mode="identify",
        versions={},
        run_key="k",
        checks=Checks(missed_pass=True, consistency=True),
        labels=[
            PlanLabel(
                id="L1",
                label="Person Name",
                text="Ravi",
                right=Span(start=0, end=4),
                confidence=0.8,
                group="medium",
                action="add",
                source="heuristic",
                why="",
            ),
            PlanLabel(
                id="L2",
                label="Email Address",
                text="ravi@x.in",
                right=Span(start=5, end=14),
                confidence=0.95,
                group="high",
                action="add",
                source="regex",
                why="",
            ),
        ],
        questions=[
            Question(
                id="Q1",
                kind="possibly-pii",
                text="Cloudnine",
                right=Span(start=15, end=24),
                suggest="Business Name",
                confidence=0.62,
                why="",
            )
        ],
    )
    deck = create_cards(plan, right)
    assert [c.id for c in deck.cards] == ["C-Q1", "C-L1", "C-L2", "D1", "D2"]
    assert deck.approve_all.ids == ["L2"] and deck.approve_all.by_label == {"Email Address": 1}
    assert deck.cards[0].line == 2
    assert "Cloudnine" in deck.cards[0].prompt and "Business Name" in deck.cards[0].prompt
