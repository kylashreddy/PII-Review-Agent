from __future__ import annotations

import random
import re
from pathlib import Path

from eval import blind
from eval.gold import GoldDoc, GoldSpan, load, parse_marked
from eval.metrics import Pred, Score, score_doc, wilson


def luhn_ok(num: str) -> bool:
    total = 0
    for i, ch in enumerate(reversed(num)):
        d = int(ch) * (2 if i % 2 else 1)
        total += d - 9 if d > 9 else d
    return total % 10 == 0


def test_parse_marked_removes_split_and_keeps_offsets() -> None:
    text, gold = parse_marked("Key {{Credentials|AK<SPLIT>IA12}} for {{Person Name|Ravi}}.")
    assert text == "Key AKIA12 for Ravi."
    assert [(g.label, text[g.start : g.end]) for g in gold] == [("Credentials", "AKIA12"), ("Person Name", "Ravi")]


def test_scoring_like_label_bench() -> None:
    doc = GoldDoc(
        "t",
        "d",
        "",
        "Ravi Kumar ravi@x.in 98450",
        [
            GoldSpan("Person Name", 0, 10, "Ravi Kumar"),
            GoldSpan("Email Address", 11, 20, "ravi@x.in"),
            GoldSpan("Contact Number", 21, 26, "98450"),
        ],
    )
    s = Score()
    score_doc(doc, [Pred("Person Name", 0, 4, "Ravi"), Pred("Person Name", 11, 20, "ravi@x.in", "high")], [(21, 26)], s)
    # "Ravi" overlaps "Ravi Kumar" by all of the shorter one: a hit with the wrong boundary.
    pn = s.by_label["Person Name"]
    assert (pn.tp, pn.exact, pn.fp) == (1, 0, 1)
    assert s.by_label["Email Address"].fn == 1  # labeled Person Name instead
    assert s.by_label["Contact Number"].fn == 1  # only a question
    assert sorted(e.kind for e in s.errors) == ["missed", "span", "wrong label"]
    assert s.by_label["Contact Number"].surfaced == 1
    assert s.approve_all["Person Name"].fp == 1


def test_wilson_interval() -> None:
    lo, hi = wilson(300, 300) or (0, 0)
    assert 0.98 < lo < 0.99 and hi > 0.9999
    assert wilson(0, 0) is None


def test_blind_set_is_deterministic_valid_and_holds_no_secret_in_source() -> None:
    a = [d.marked for d in blind.generate()]
    assert a == [d.marked for d in blind.generate()]
    docs = load(["blind"])
    counts: dict[str, int] = {}
    for d in docs:
        for g in d.gold:
            counts[g.label] = counts.get(g.label, 0) + 1
    assert counts["Credentials"] >= 300 and counts["Account Number"] >= 300
    v = blind.Values(random.Random(1))
    for _ in range(200):
        card = re.sub(r"\D", "", v.card())
        assert luhn_ok(card), card
        aad = re.sub(r"\D", "", v.aadhaar())
        assert blind.verhoeff_digit(aad[:-1]) == aad[-1]
        iban = v.iban()
        assert int("".join(str(int(c, 36)) for c in iban[4:] + iban[:4])) % 97 == 1
    src = Path(blind.__file__).read_text(encoding="utf-8")
    assert not re.search(r"(sk_live_|AKIA|ghp_|xoxb-|AIza|sk-proj-|SG\.)[A-Za-z0-9]{8,}", src)
