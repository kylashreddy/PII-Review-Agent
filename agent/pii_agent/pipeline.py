"""The orchestrator: a fixed pipeline over the tools. Same input + same versions -> the same plan, byte for byte.

load -> rules + GLiNER + KB -> merge -> compare left/right -> redaction checks -> rubric_check -> adjudicate unsure
-> rubric_check again -> build_plan -> create_cards. Every step is logged with its timing, never with text.
"""

from __future__ import annotations

import hashlib
import json
from collections import Counter
from dataclasses import dataclass, field

from .draft import Draft, identify_draft, reconcile_existing, verify_draft
from .log import Logger
from .models import CardDeck, Detection, Plan, Task
from .tools import Toolbox


@dataclass
class RunResult:
    plan: Plan
    cards: CardDeck
    timings_ms: dict[str, float] = field(default_factory=dict)
    counts: dict[str, int] = field(default_factory=dict)
    detections: list[Detection] = field(default_factory=list)  # in memory only (eval); never persisted or logged
    adjudication: Counter[str] = field(default_factory=Counter)


def run_key(task: Task, versions: dict[str, object]) -> str:
    h = hashlib.sha256(task.doc_hash.encode())
    h.update(json.dumps(versions, sort_keys=True).encode())
    return h.hexdigest()[:32]


class Pipeline:
    def __init__(self, tools: Toolbox, log: Logger | None = None) -> None:
        self.tools = tools
        self.log = log or Logger(level=tools.settings.log_level)

    def run_id(self, task_id: str) -> RunResult:
        return self.run(self.tools.load_task(task_id))

    def run(self, task: Task) -> RunResult:
        t = self.tools
        timings: dict[str, float] = {}
        versions = t.versions
        key = run_key(task, versions)
        ctx = {"task": task.id, "run_key": key}
        self.log.info(
            "run_start",
            **ctx,
            left_chars=len(task.left),
            right_chars=len(task.right),
            right_labels=len(task.right_labels),
        )

        with self.log.step("gliner", timings, **ctx) as c:
            ents = t.gliner_detect([task.left])
            entities = None if ents is None else ents[0]
            c["entities"] = -1 if entities is None else len(entities)
        with self.log.step("rules_merge", timings, **ctx) as c:
            rules, merged = t.rules_analyze(task.left, task.file_name, entities)
            detections = merged if merged is not None else rules
            c.update(rules=len(rules), detections=len(detections))
        with self.log.step("compare", timings, **ctx) as c:
            cmp = t.rules_compare(task.left, task.right, detections, task.right_labels)
            identify = bool(cmp["identical"])
            c.update(findings=len(cmp["findings"]), mode="identify" if identify else "verify")
        settings = t.settings
        if identify:
            draft: Draft = identify_draft(detections, settings)
        else:
            with self.log.step("redaction_check", timings, **ctx) as c:
                red = t.redaction_check(task.left, task.right, detections, task.file_name)
                c["findings"] = len(red)
            draft = verify_draft(detections, red, settings)
        reconcile_existing(draft, task.right_labels, cmp["findings"])

        with self.log.step("rubric_check", timings, **ctx) as c:
            violations = t.rubric_check(draft, task.right, detections)
            c["violations"] = len(violations)
        with self.log.step("adjudicate", timings, **ctx, provider=t.provider.name) as c:
            st = t.adjudicate(draft, task.right, task.file_name)
            adjudication = st
            c.update({k: v for k, v in st.items()})
        with self.log.step("rubric_check_2", timings, **ctx) as c:
            again = t.rubric_check(draft, task.right, detections)
            violations += again
            c["violations"] = len(again)
        with self.log.step("build_plan", timings, **ctx) as c:
            plan = t.build_plan(task, draft, violations, versions, key)
            c.update(labels=len(plan.labels), questions=len(plan.questions))
        with self.log.step("create_cards", timings, **ctx) as c:
            deck = t.create_cards(plan, task.right)
            c.update(cards=len(deck.cards), approve_all=deck.approve_all.count)
        counts = {
            "labels": len(plan.labels),
            "questions": len(plan.questions),
            "cards": len(deck.cards),
            "approve_all": deck.approve_all.count,
        }
        self.log.info("run_done", **ctx, mode=plan.mode, total_ms=round(sum(timings.values()), 1), **counts)
        return RunResult(
            plan=plan, cards=deck, timings_ms=timings, counts=counts, detections=detections, adjudication=adjudication
        )
