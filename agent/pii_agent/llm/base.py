"""What every LLM provider shares: the item and decision shapes, the system prompt (rubric Part A) and strict parsing.

The model sees one snippet per item — the value and at most ±context_chars around it — never a whole document.
Its answer must be JSON matching DECISIONS_SCHEMA; anything else (bad JSON, unknown label, a missing id, a refusal)
becomes `None` for that item, and the item stays a human question.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Sequence
from functools import lru_cache
from pathlib import Path
from typing import Any, Protocol

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from ..models import PII_LABELS

PROMPT_VERSION = "adjudicate-v1"
NOT_PII = "not_pii"
ALLOWED = (*PII_LABELS, NOT_PII)


class AdjudicationItem(BaseModel):
    model_config = ConfigDict(frozen=True)
    id: str
    value: str
    label_guess: str | None
    context_before: str
    context_after: str
    file_kind: str = ""  # the file's extension only ("csv", "env"), never its name

    @property
    def key(self) -> str:
        """Cache key: what the model is shown, nothing else."""
        raw = json.dumps([self.value, self.label_guess, self.context_before, self.context_after, self.file_kind])
        return hashlib.sha256(raw.encode()).hexdigest()


class Decision(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    label: str
    confidence: float = Field(ge=0, le=1)
    reason: str = Field(max_length=300)


class _Answer(Decision):
    id: str


class _Answers(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decisions: list[_Answer]


DECISIONS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "decisions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "label": {"type": "string", "enum": list(ALLOWED)},
                    "confidence": {"type": "number"},
                    "reason": {"type": "string"},
                },
                "required": ["id", "label", "confidence", "reason"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["decisions"],
    "additionalProperties": False,
}


class LLMProvider(Protocol):
    name: str
    model: str
    external: bool  # True when snippets leave our servers

    def decide(self, items: Sequence[AdjudicationItem]) -> list[Decision | None]: ...


@lru_cache(maxsize=4)
def system_prompt(rubric_file: Path) -> str:
    rubric = rubric_file.read_text(encoding="utf-8") if rubric_file.exists() else ""
    m = re.search(r"^## Part A.*?(?=^## Part B)", rubric, flags=re.S | re.M)
    part_a = m.group(0).strip() if m else ""
    return (
        "You check personal-data (PII) labels for a document-review team. You receive short snippets: a VALUE and "
        "the text around it. For each item decide which ONE label the value must carry under the rubric below, or "
        f'"{NOT_PII}" if it must not be labeled at all. Judge only the exact value given; the context is there to '
        "tell you what the value is. Labels: " + ", ".join(PII_LABELS) + ".\n\n"
        "Return JSON only, with one decision per item id: label, confidence (0-1, how sure you are), and a short "
        "reason (under 20 words, do not repeat the value).\n\n"
        f"{part_a}\n"
    )


def user_message(items: Sequence[AdjudicationItem]) -> str:
    payload = [
        {
            "id": it.id,
            "value": it.value,
            "suggested_label": it.label_guess,
            "before": it.context_before,
            "after": it.context_after,
            "file_type": it.file_kind,
        }
        for it in items
    ]
    return "Items:\n" + json.dumps(payload, ensure_ascii=False, indent=0)


def parse_answers(text: str, items: Sequence[AdjudicationItem]) -> list[Decision | None]:
    """Strict: valid JSON, the schema, a known label; per item, so one bad answer does not sink the others."""
    try:
        data = json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return [None] * len(items)
    raw = data.get("decisions") if isinstance(data, dict) else None
    if not isinstance(raw, list):
        return [None] * len(items)
    by_id: dict[str, Decision] = {}
    for entry in raw:
        try:
            a = _Answer.model_validate(entry)
        except ValidationError:
            continue
        if a.label in ALLOWED and a.id not in by_id:
            by_id[a.id] = Decision(label=a.label, confidence=a.confidence, reason=a.reason)
    return [by_id.get(it.id) for it in items]


def batches(items: Sequence[AdjudicationItem], size: int) -> list[list[AdjudicationItem]]:
    return [list(items[i : i + size]) for i in range(0, len(items), max(1, size))]
