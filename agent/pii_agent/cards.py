"""create_cards: the plan -> Yes / No cards for the one human (rubric Part C), in the order Unsure -> Leaks ->
Medium -> High, then the two document questions."""

from __future__ import annotations

from collections import Counter

from .models import ApproveAll, Card, CardDeck, Plan, PlanLabel, Question, Tier

TIER_ORDER: dict[Tier, int] = {"unsure": 0, "leak": 1, "medium": 2, "high": 3, "document": 4}
NO_OPTIONS = ["Not PII", "Other label…", "Fix span"]
DOCUMENT_QUESTIONS = (
    ("D1", "Skim the highlighted document: is any PII left unlabeled?", ["No", "Yes → label it"]),
    ("D2", "Any label you did not expect (a heading, a code word, a well-known company)?", ["No", "Yes → open it"]),
)


def _line(text: str, at: int | None) -> int | None:
    return None if at is None else text.count("\n", 0, at) + 1


def _article(label: str) -> str:
    return "an" if label[:1] in "AEIOU" else "a"


def _label_card(x: PlanLabel, right: str) -> Card:
    q = f"“{x.text}”"
    if x.action == "remove":
        prompt, options = f"Remove the {x.existing_label} label on {q}? {x.why}.", ["Yes, remove", "No, keep it"]
    elif x.action == "change" and x.existing_label and x.existing_label != x.label:
        prompt, options = f"Change {q} from {x.existing_label} to {x.label}?", ["Yes", *NO_OPTIONS]
    elif x.action == "change":
        prompt, options = f"Fix the span of this {x.label} to {q}?", ["Yes", *NO_OPTIONS]
    else:
        prompt, options = (
            f"Is {q} {_article(x.label)} {x.label}, with this exact span? ({round(x.confidence * 100)}%)",
            ["Yes", *NO_OPTIONS],
        )
    return Card(
        id=f"C-{x.id}",
        kind="label",
        tier=x.group,
        ref=x.id,
        prompt=prompt,
        options=options,
        line=_line(right, x.right.start),
    )


_QUESTION_PROMPTS = {
    "possibly-pii": "Is “{t}” PII? If yes, which label?{s}",
    "leak": "“{t}” is unchanged on the right. Is that a leak?",
    "wrong-replacement": "“{t}” replaces a value of another kind. Accept?",
    "not-sensible": "“{t}” is a placeholder, not a realistic replacement. Accept?",
    "inconsistent": "“{t}” was replaced differently elsewhere. Accept?",
    "over-redaction": "“{t}” was changed on the right but does not look like PII. Mark Overscrubbed?",
    "unaligned": "The agent could not place “{t}” on the right document. Check it by hand.{s}",
}


def _question_card(q: Question, right: str) -> Card:
    text = q.text or "(this value)"
    s = f" (suggested: {q.suggest})" if q.suggest else ""
    prompt = _QUESTION_PROMPTS[q.kind].format(t=text, s=s)
    options = ["Yes + label", "No"] if q.kind in ("possibly-pii", "unaligned") else ["Yes", "No"]
    tier: Tier = "leak" if q.kind == "leak" else "unsure"
    return Card(
        id=f"C-{q.id}",
        kind="question",
        tier=tier,
        ref=q.id,
        prompt=prompt,
        options=options,
        line=_line(right, q.right.start if q.right else None),
    )


def create_cards(plan: Plan, right: str) -> CardDeck:
    cards = [_label_card(x, right) for x in plan.labels] + [_question_card(q, right) for q in plan.questions]
    approve = [x for x in plan.labels if x.group == "high" and x.action in ("add", "keep")]
    approve_ids = {x.id for x in approve}
    for c in cards:
        c.in_approve_all = c.ref in approve_ids
    cards.sort(key=lambda c: (TIER_ORDER[c.tier], c.line or 0, c.id))
    cards += [Card(id=i, kind="document", tier="document", prompt=p, options=o) for i, p, o in DOCUMENT_QUESTIONS]
    by_label = dict(sorted(Counter(x.label for x in approve).items()))
    kinds = ", ".join(k.lower() for k in by_label) or "none"
    counts = Counter(c.tier for c in cards)
    return CardDeck(
        task=plan.task,
        cards=cards,
        approve_all=ApproveAll(
            ids=sorted(approve_ids, key=lambda i: int(i[1:])),
            count=len(approve),
            by_label=by_label,
            prompt=f"Approve all {len(approve)} high-confidence labels ({kinds})",
        ),
        counts={"cards": len(cards), **{t: counts.get(t, 0) for t in TIER_ORDER}},
    )
