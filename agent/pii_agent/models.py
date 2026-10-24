"""Data shapes shared by the tools, the plan and the cards. Offsets are code points, end exclusive."""

from __future__ import annotations

import hashlib
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

LABELS: tuple[str, ...] = (
    "Person Name",
    "Person Username",
    "Email Address",
    "Contact Number",
    "Address",
    "Date",
    "URL/Link",
    "Vehicle Number Plate",
    "Business Name",
    "Account Number",
    "Credentials",
    "IP Address",
    "Overscrubbed",
)
# Labels the agent may put on a value (rubric A2): never Date (out of scope) or Overscrubbed (review only).
PII_LABELS: tuple[str, ...] = tuple(label for label in LABELS if label not in ("Date", "Overscrubbed"))

Mode = Literal["identify", "verify"]
Group = Literal["high", "medium"]
Action = Literal["add", "keep", "change", "remove"]
QuestionKind = Literal[
    "possibly-pii",  # the agent is unsure whether a value is PII
    "leak",  # the original is unchanged on the right
    "wrong-replacement",  # replaced by a value of another kind
    "not-sensible",  # replaced by a placeholder ([NAME], XXXX)
    "inconsistent",  # the same value replaced differently
    "over-redaction",  # non-PII text changed, or a label on non-PII
    "unaligned",  # the right text could not be matched to the left
]
Tier = Literal["unsure", "leak", "medium", "high", "document"]


class Span(BaseModel):
    model_config = ConfigDict(frozen=True)
    start: int = Field(ge=0)
    end: int = Field(ge=0)

    @model_validator(mode="after")
    def _ordered(self) -> Span:
        if self.end < self.start:
            raise ValueError("end before start")
        return self

    def overlaps(self, other: Span) -> bool:
        return self.start < other.end and other.start < self.end

    def overlap(self, other: Span) -> int:
        return max(0, min(self.end, other.end) - max(self.start, other.start))

    @property
    def length(self) -> int:
        return self.end - self.start


class RightLabel(BaseModel):
    """A label already on the right document (read by the connector)."""

    model_config = ConfigDict(frozen=True)
    label: str
    start: int = Field(ge=0)
    end: int = Field(ge=0)

    @property
    def span(self) -> Span:
        return Span(start=self.start, end=self.end)


class Task(BaseModel):
    model_config = ConfigDict(frozen=True)
    id: str
    file_name: str = ""
    left: str
    right: str
    right_labels: tuple[RightLabel, ...] = ()

    @property
    def doc_hash(self) -> str:
        h = hashlib.sha256()
        for part in (self.file_name, self.left, self.right):
            h.update(part.encode("utf-8"))
            h.update(b"\x00")
        for rl in self.right_labels:
            h.update(f"{rl.label}:{rl.start}:{rl.end};".encode())
        return h.hexdigest()


class Detection(BaseModel):
    """A rule (or merged rule + model) detection on the LEFT document. Extra engine fields are kept as given."""

    model_config = ConfigDict(extra="allow")
    label: str
    type: str | None = None
    start: int
    end: int
    text: str
    confidence: float
    source: str | None = None
    rule: str | None = None

    @property
    def span(self) -> Span:
        return Span(start=self.start, end=self.end)


class Entity(BaseModel):
    """A GLiNER entity with its site label (offscreen/prompts.js toSiteLabels)."""

    model_config = ConfigDict(frozen=True)
    label: str
    prompt: str
    start: int
    end: int
    text: str
    score: float


class Finding(BaseModel):
    """A compare.js or redaction.js finding. `note` may quote the document: never log it."""

    model_config = ConfigDict(extra="allow", populate_by_name=True)
    id: str
    category: str
    label: str | None = None
    type: str | None = None
    right_label: str | None = Field(default=None, alias="rightLabel")
    left: Span | None = None
    right: Span | None = None
    text: str | None = None
    confidence: float | None = None
    source: str | None = None
    rule: str | None = None
    note: str | None = None
    suggest: str | None = None


class SpanFacts(BaseModel):
    model_config = ConfigDict(frozen=True)
    start: int
    end: int
    out_of_scope: str | None = None
    department: bool = False
    doc_phrase: bool = False
    known_name: dict[str, str] | None = None
    placeholder: bool = False
    in_key: bool = False
    non_pii_field: bool = False

    @property
    def not_pii_reason(self) -> str | None:
        if self.out_of_scope:
            return f"out-of-scope:{self.out_of_scope}"
        if self.placeholder:
            return "placeholder"
        if self.in_key:
            return "field-name"
        if self.non_pii_field:
            return "non-pii-field"
        if self.department or self.doc_phrase:
            return "department-or-phrase"
        if self.known_name:
            return "public-name"
        return None


class PlanLabel(BaseModel):
    id: str
    label: str
    text: str
    right: Span
    left: Span | None = None
    confidence: float
    group: Group
    action: Action
    existing_label: str | None = None
    source: str
    rule: str | None = None
    type: str | None = None
    why: str
    fixes: list[str] = Field(default_factory=list)  # rubric_check fixes applied (span, label, consistency)
    raw_confidence: float | None = None  # before calibration
    llm: str | None = None  # agree | disagree | unsure | llm-only, when the adjudicator was asked


class Question(BaseModel):
    id: str
    kind: QuestionKind
    text: str
    right: Span | None = None
    left: Span | None = None
    suggest: str | None = None
    confidence: float | None = None
    why: str
    label_id: str | None = None  # the label this question is about (a leak's label)
    replacement: str | None = None


class Violation(BaseModel):
    item_id: str
    check: Literal["forbidden_label", "span", "part_of_word", "one_label", "consistency", "not_pii", "missed"]
    detail: str  # a fixed code, never document text
    fixed: bool


class Checks(BaseModel):
    missed_pass: bool
    consistency: bool
    span_fixes: int = 0
    label_fixes: int = 0
    dropped: int = 0
    added_occurrences: int = 0
    violations: list[Violation] = Field(default_factory=list)


class Plan(BaseModel):
    """The rubric's agent output (docs/SINGLE-REVIEW-RUBRIC.md, "Agent output"), plus versions."""

    task: str
    mode: Mode
    labels: list[PlanLabel]
    questions: list[Question]
    checks: Checks
    versions: dict[str, Any]
    run_key: str


class Card(BaseModel):
    id: str
    kind: Literal["label", "question", "document"]
    tier: Tier
    ref: str | None = None
    prompt: str
    options: list[str]
    line: int | None = None
    in_approve_all: bool = False


class ApproveAll(BaseModel):
    ids: list[str]
    count: int
    by_label: dict[str, int]
    prompt: str


class CardDeck(BaseModel):
    task: str
    cards: list[Card]
    approve_all: ApproveAll
    counts: dict[str, int]
