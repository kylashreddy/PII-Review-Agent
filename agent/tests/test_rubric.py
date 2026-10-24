from __future__ import annotations

from collections.abc import Sequence

from pii_agent.draft import Draft, DraftLabel
from pii_agent.models import Detection, Span, SpanFacts
from pii_agent.rubric import RubricChecker, fix_span, part_of_word


def no_facts(text: str, spans: Sequence[tuple[int, int]]) -> list[SpanFacts]:
    return [SpanFacts(start=s, end=e) for s, e in spans]


def at(text: str, value: str, nth: int = 0) -> Span:
    i = -1
    for _ in range(nth + 1):
        i = text.index(value, i + 1)
    return Span(start=i, end=i + len(value))


def lab(text: str, label: str, value: str, conf: float = 0.95, nth: int = 0, **kw: object) -> DraftLabel:
    s = at(text, value, nth)
    return DraftLabel(label=label, right=s, left=s, confidence=conf, source="regex", **kw)  # type: ignore[arg-type]


def test_fix_span_trims_field_names_quotes_brackets_and_punctuation() -> None:
    t = 'Name: Ravi Kumar, Email: "ravi@x.in". Driver (080 4123 5678) on duty'
    s, codes = fix_span(t, Span(start=0, end=16), "Person Name")
    assert t[s.start : s.end] == "Ravi Kumar" and "field-name" in codes
    e = t.index('"ravi')
    s, _ = fix_span(t, Span(start=e, end=e + 11), "Email Address")
    assert t[s.start : s.end] == "ravi@x.in"
    p = t.index("(080")
    s, codes = fix_span(t, Span(start=p, end=p + 14), "Contact Number")
    assert t[s.start : s.end] == "080 4123 5678" and "bracket" in codes
    # A URL keeps its scheme; a company keeps "Pvt. Ltd."
    u = "see https://acme.in/a."
    s, _ = fix_span(u, Span(start=4, end=len(u)), "URL/Link")
    assert u[s.start : s.end] == "https://acme.in/a"
    c = "Zentrix Analytics Pvt. Ltd."
    assert fix_span(c, Span(start=0, end=len(c)), "Business Name")[0].end == len(c)


def test_part_of_word() -> None:
    t = "visit dukaanhelp and mydukaan.io or dukaan today"
    assert part_of_word(t, at(t, "dukaan"))
    assert part_of_word(t, at(t, "dukaan", 1))
    assert not part_of_word(t, at(t, "dukaan", 2))


def test_checker_drops_forbidden_and_overlaps_and_makes_labels_consistent() -> None:
    t = "Mail ravi.k@zentrix.io on 12/03/2024. Again: ravi.k@zentrix.io and ravi.k@zentrix.io"
    d = Draft(
        mode="identify",
        labels=[
            lab(t, "Email Address", "ravi.k@zentrix.io", 0.95),
            lab(t, "Person Username", "ravi.k@zentrix.io", 0.80, nth=1),
            lab(t, "Person Username", "ravi.k", 0.70),  # overlaps the e-mail
            lab(t, "Date", "12/03/2024", 0.99),
        ],
    )
    vs = RubricChecker(no_facts).check(d, t, [], identify=True)
    checks = sorted({(v.check, v.detail) for v in vs})
    assert ("forbidden_label", "Date") in checks
    assert ("one_label", "overlap") in checks
    assert ("consistency", "label") in checks
    assert ("consistency", "occurrence") in checks  # the third, unlabeled occurrence
    active = [x for x in d.labels if x.active]
    assert {x.label for x in active} == {"Email Address"}
    assert len(active) == 3
    assert not d.consistent


def test_checker_part_of_word_becomes_a_question_and_missed_detections_too() -> None:
    t = "call dukaanhelp or Ravi Kumar"
    s = at(t, "dukaan")
    d = Draft(mode="identify", labels=[DraftLabel("Business Name", s, s, 0.9, "model")])
    det = [Detection(label="Person Name", start=19, end=29, text="Ravi Kumar", confidence=0.9)]
    vs = RubricChecker(no_facts).check(d, t, det, identify=True)
    assert {v.check for v in vs} == {"part_of_word", "missed"}
    assert [q.kind for q in d.questions] == ["possibly-pii", "unaligned"]
    assert d.uncovered == 1


def test_not_pii_facts_drop_new_labels_and_remove_existing_ones() -> None:
    t = "Department: Field Services, employer Infosys"

    def facts(text: str, spans: Sequence[tuple[int, int]]) -> list[SpanFacts]:
        return [
            SpanFacts(
                start=s,
                end=e,
                department=text[s:e] == "Field Services",
                known_name={"name": "Infosys", "category": "x"} if text[s:e] == "Infosys" else None,
            )
            for s, e in spans
        ]

    d = Draft(
        mode="identify",
        labels=[
            lab(t, "Business Name", "Field Services", 0.8),
            lab(t, "Business Name", "Infosys", 0.8, action="keep", existing_label="Business Name"),
        ],
    )
    RubricChecker(facts).check(d, t, [], identify=True)
    assert d.labels[0].dropped == "department-or-phrase"
    assert d.labels[1].action == "remove"


def test_checker_is_idempotent() -> None:
    t = "Key AKIA1234 and AKIA1234 again, 'Ravi Kumar'"
    d = Draft(mode="identify", labels=[lab(t, "Credentials", "AKIA1234"), lab(t, "Person Name", "'Ravi Kumar'", 0.8)])
    c = RubricChecker(no_facts)
    first = c.check(d, t, [], identify=True)
    assert first
    assert c.check(d, t, [], identify=True) == []
