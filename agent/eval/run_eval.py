"""Scores the agent on the gold sets and writes a report.

  python -m eval.run_eval                                   all sets; rules and rules + model; no LLM
  python -m eval.run_eval --llm none local                  the same, without and with the self-hosted LLM
  python -m eval.run_eval --systems model --llm local --fit-calibration pii_agent/data/calibration.json

Systems: "rules" (GLiNER off) and "model" (rules + GLiNER), each with every --llm provider. Views:
  extension = the engine's detections at >= 0.7, exactly what `npm run label-bench` scores (sanity check)
  agent     = the plan's labels after rubric_check and adjudication (what the human is asked to approve)
  surfaced  = gold values covered by a label or a question (nothing silently lost)
Calibration is measured out of fold: documents are split in two by a hash of their id, the isotonic curves are
fitted on one half and scored on the other, so no document grades a curve it helped fit.
"""

from __future__ import annotations

import argparse
import json
import statistics
import time
import zlib
from collections import Counter, defaultdict
from collections.abc import Sequence
from dataclasses import dataclass, field
from pathlib import Path

from pii_agent.calibration import Calibrator, Sample, reliability
from pii_agent.config import get_settings
from pii_agent.llm import CachedProvider
from pii_agent.log import Logger
from pii_agent.models import PII_LABELS, Task
from pii_agent.pipeline import Pipeline
from pii_agent.rules_client import RulesClient
from pii_agent.tools import Toolbox

from .gold import GoldDoc, available_sets, load
from .metrics import Counts, Pred, Score, score_doc, wilson

CRITICAL = ("Credentials", "Account Number")
TARGETS = {"recall_all": 0.97, "recall_critical": 0.99, "approve_all_precision": 0.98, "boundary": 0.95}


@dataclass
class SystemRun:
    name: str
    gliner: bool
    llm: str
    by_set: dict[str, dict[str, Score]] = field(default_factory=dict)  # set -> view -> score
    ms: list[float] = field(default_factory=list)
    cards: list[int] = field(default_factory=list)
    approve_all: list[int] = field(default_factory=list)
    questions: list[int] = field(default_factory=list)
    labels: list[int] = field(default_factory=list)
    outcomes: list[tuple[str, Pred, bool]] = field(default_factory=list)  # (doc, prediction, correct)
    adjudication: Counter[str] = field(default_factory=Counter)
    tokens: dict[str, int] = field(default_factory=dict)


def run_system(gliner: bool, llm: str, docs: Sequence[GoldDoc], rules: RulesClient) -> SystemRun:
    s = get_settings().model_copy(
        update={
            "gliner": "on" if gliner else "off",
            "llm_provider": llm,
            "calibration_file": None,  # raw confidences; calibration is measured out of fold below
            "log_level": "warning",
        }
    )
    tools = Toolbox(settings=s, rules=rules)
    pipe = Pipeline(tools, Logger(level="warning"))
    out = SystemRun(f"{'rules + GLiNER' if gliner else 'rules only'} · LLM: {tools.provider.model}", gliner, llm)
    for doc in docs:
        views = out.by_set.setdefault(doc.set, {"extension": Score(), "agent": Score()})
        t0 = time.perf_counter()
        r = pipe.run(Task(id=f"{doc.set}/{doc.id}", file_name=doc.file_name, left=doc.text, right=doc.text))
        out.ms.append((time.perf_counter() - t0) * 1000)
        ext = [
            Pred(d.label, d.start, d.end, d.text)
            for d in r.detections
            if d.confidence >= s.review_threshold and d.label in PII_LABELS
        ]
        score_doc(doc, ext, [], views["extension"])
        preds = [
            Pred(
                x.label, x.right.start, x.right.end, x.text, x.group, x.raw_confidence or x.confidence, x.llm or "none"
            )
            for x in r.plan.labels
            if x.action != "remove"
        ]
        qs = [(q.right.start, q.right.end) for q in r.plan.questions if q.right]
        for p, ok in score_doc(doc, preds, qs, views["agent"]):
            out.outcomes.append((f"{doc.set}/{doc.id}", p, ok))
        out.cards.append(len(r.cards.cards))
        out.approve_all.append(r.cards.approve_all.count)
        out.questions.append(len(r.plan.questions))
        out.labels.append(len(r.plan.labels))
        out.adjudication.update(r.adjudication)
    inner = tools.provider.inner if isinstance(tools.provider, CachedProvider) else tools.provider
    out.tokens = dict(getattr(inner, "tokens", {}))
    return out


def pct(x: float | None) -> str:
    return "–" if x is None else f"{100 * x:.1f}%"


def ci(k: int, n: int) -> str:
    w = wilson(k, n)
    return "" if w is None else f" [{100 * w[0]:.1f}–{100 * w[1]:.1f}]"


def table(score: Score, labels: Sequence[str]) -> list[str]:
    rows = [
        "| Label | Gold | Recall [95% CI] | Precision [95% CI] | Boundary exact | Surfaced | Missed | False alarms |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for lab in labels:
        c = score.by_label.get(lab) or Counts()
        if not (c.gold or c.fp):
            continue
        rows.append(
            f"| {lab} | {c.gold} | {pct(c.recall)}{ci(c.tp, c.tp + c.fn)} | {pct(c.precision)}{ci(c.tp, c.tp + c.fp)}"
            f" | {pct(c.boundary)} | {pct(c.surfaced_recall)} | {c.fn} | {c.fp} |"
        )
    t = score.total(labels)
    rows.append(
        f"| **All** | {t.gold} | {pct(t.recall)}{ci(t.tp, t.tp + t.fn)} | {pct(t.precision)}{ci(t.tp, t.tp + t.fp)}"
        f" | {pct(t.boundary)} | {pct(t.surfaced_recall)} | {t.fn} | {t.fp} |"
    )
    return rows


def merged(run: SystemRun, view: str, sets: Sequence[str]) -> Score:
    m = Score()
    for s in sets:
        sc = run.by_set[s][view]
        for k, c in sc.by_label.items():
            m.by_label[k].add(c)
        for k, c in sc.approve_all.items():
            m.approve_all[k].add(c)
        m.errors += sc.errors
    return m


def targets(score: Score, labels: Sequence[str]) -> list[str]:
    t = score.total(labels)
    rows = ["| Target | Goal | Measured | Met? |", "|---|---|---|---|"]

    def row(name: str, goal: float, val: float | None, note: str = "") -> None:
        met = "–" if val is None else ("yes" if val >= goal else "**NO**")
        rows.append(f"| {name} | ≥ {100 * goal:.0f}% | {pct(val)}{note} | {met} |")

    row("Recall, all labels", TARGETS["recall_all"], t.recall, ci(t.tp, t.tp + t.fn))
    for lab in CRITICAL:
        c = score.by_label.get(lab) or Counts()
        row(f"Recall, {lab}", TARGETS["recall_critical"], c.recall, ci(c.tp, c.tp + c.fn))
    for lab, c in sorted(score.approve_all.items()):
        row(
            f"Precision in Approve-all, {lab}",
            TARGETS["approve_all_precision"],
            c.precision,
            ci(c.tp, c.tp + c.fp) + f" (n={c.tp + c.fp})",
        )
    row("Boundary exact-match", TARGETS["boundary"], t.boundary)
    return rows


def _fold(doc: str) -> int:
    return zlib.crc32(doc.encode()) % 2


def samples_of(run: SystemRun, docs: set[str] | None = None) -> list[Sample]:
    return [Sample(p.label, p.llm, p.confidence, ok) for d, p, ok in run.outcomes if docs is None or d in docs]


def calibration_section(run: SystemRun, sets: Sequence[str]) -> list[str]:
    """Out-of-fold reliability and the Approve-all group with and without the calibrated gate."""
    s = get_settings()
    raw: list[tuple[float, bool]] = []
    cal: list[tuple[float, bool]] = []
    gate_raw: dict[str, Counts] = defaultdict(Counts)
    gate_cal: dict[str, Counts] = defaultdict(Counts)
    scored = [o for o in run.outcomes if o[0].split("/")[0] in sets]
    for fold in (0, 1):
        train = Calibrator.fit(Sample(p.label, p.llm, p.confidence, ok) for d, p, ok in scored if _fold(d) != fold)
        for d, p, ok in scored:
            if _fold(d) != fold:
                continue
            c = train(p.label, p.llm, p.confidence)
            raw.append((p.confidence, ok))
            cal.append((c, ok))
            if p.group == "high":
                gates = [gate_raw[p.label]] + ([gate_cal[p.label]] if c >= s.approve_all_min else [])
                for g in gates:
                    if ok:
                        g.tp += 1
                    else:
                        g.fp += 1
    r0, r1 = reliability(raw), reliability(cal)
    out = [
        f"### Calibration (out of fold, {' + '.join(sets)})",
        "",
        "| | ECE | Brier | Labels |",
        "|---|---|---|---|",
        f"| Raw confidence | {r0['ece']:.3f} | {r0['brier']:.3f} | {r0['n']} |",
        f"| Calibrated (isotonic, per label) | {r1['ece']:.3f} | {r1['brier']:.3f} | {r1['n']} |",
        "",
        f"Approve-all with the calibrated gate (calibrated ≥ {s.approve_all_min:.2f} as well):",
        "",
        "| Label | Raw gate: precision (n) | Calibrated gate: precision (n) | Kept |",
        "|---|---|---|---|",
    ]
    for lab in sorted(gate_raw):
        a, b = gate_raw[lab], gate_cal.get(lab, Counts())
        kept = (b.tp + b.fp) / (a.tp + a.fp) if a.tp + a.fp else 0
        out.append(f"| {lab} | {pct(a.precision)} ({a.tp + a.fp}) | {pct(b.precision)} ({b.tp + b.fp}) | {pct(kept)} |")
    return [*out, ""]


def report(runs: Sequence[SystemRun], sets: Sequence[str], docs: Sequence[GoldDoc], show_text: bool) -> str:
    out: list[str] = ["# Agent accuracy report", ""]
    n_by_set: dict[str, int] = defaultdict(int)
    for d in docs:
        n_by_set[d.set] += 1
    labels = list(PII_LABELS)
    out.append(
        "Sets: "
        + ", ".join(f"{s} ({n_by_set[s]} docs, {sum(len(d.gold) for d in docs if d.set == s)} values)" for s in sets)
    )
    out += [
        "",
        "## Summary",
        "",
        "| System | Set | Recall | Precision | Surfaced | Questions / doc | Cards / doc |",
        "|---|---|---|---|---|---|---|",
    ]
    for run in runs:
        for s in sets:
            labs = next(d.labels for d in docs if d.set == s)
            t = run.by_set[s]["agent"].total(labs)
            n = [i for i, d in enumerate(docs) if d.set == s]
            q = statistics.mean(run.questions[i] for i in n)
            c = statistics.mean(run.cards[i] for i in n)
            out.append(
                f"| {run.name} | {s} | {pct(t.recall)} | {pct(t.precision)} | {pct(t.surfaced_recall)} | "
                f"{q:.2f} | {c:.1f} |"
            )
    out.append("")
    for run in runs:
        out += [f"## {run.name}", ""]
        out += [
            f"Per document: {statistics.mean(run.labels):.1f} labels · "
            f"{statistics.mean(run.questions):.1f} questions · "
            f"{statistics.mean(run.cards):.1f} cards · {statistics.mean(run.approve_all):.1f} in Approve-all · "
            f"time p50 {statistics.median(run.ms):.0f} ms, p95 {sorted(run.ms)[int(0.95 * (len(run.ms) - 1))]:.0f} ms",
            "",
        ]
        if run.llm != "none":
            adj = ", ".join(f"{k} {v}" for k, v in sorted(run.adjudication.items()))
            tok = ", ".join(f"{k} {v}" for k, v in sorted(run.tokens.items()))
            out += [f"Adjudication: {adj or 'nothing asked'}.", "", f"LLM usage: {tok}.", ""]
        for s in sets:
            labs = next(d.labels for d in docs if d.set == s)
            ext = run.by_set[s]["extension"].total(labs)
            out += [
                f"### {s}",
                "",
                f"Extension engine alone (label-bench view): recall {pct(ext.recall)}, precision {pct(ext.precision)}.",
                "",
            ]
            out += [*table(run.by_set[s]["agent"], [lab for lab in labels if lab in labs]), ""]
        scored = [s for s in sets if s != "synthetic"]
        if scored:
            m = merged(run, "agent", scored)
            out += [f"### Targets ({' + '.join(scored)}, all 11 labels)", "", *targets(m, labels), ""]
            out += calibration_section(run, scored)
        if "synthetic" in sets:
            m = merged(run, "agent", ["synthetic"])
            syn_labels = next(d.labels for d in docs if d.set == "synthetic")
            out += [
                "### Targets (synthetic, 4 model labels)",
                "",
                *targets(m, [x for x in labels if x in syn_labels]),
                "",
            ]
        errs = merged(run, "agent", sets).errors
        out += [f"### Problems ({len(errs)})", ""]
        kinds = defaultdict(list)
        for e in errs:
            kinds[e.kind].append(e)
        for kind in ("missed", "wrong label", "false alarm", "span"):
            es = kinds.get(kind, [])
            if not es:
                continue
            out += [f"**{kind}** ({len(es)})", ""]
            for e in es[:60]:
                txt = json.dumps(e.text, ensure_ascii=False)[:80] if show_text else "…"
                extra = (
                    f" ≠ {json.dumps(e.other, ensure_ascii=False)[:60]}"
                    if kind == "span" and show_text
                    else (f" → {e.other}" if e.other and kind != "span" else "")
                )
                out.append(f"- {e.label} · {txt}{extra} · {e.doc}")
            if len(es) > 60:
                out.append(f"- … {len(es) - 60} more")
            out.append("")
    return "\n".join(out) + "\n"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="pii-agent-eval")
    ap.add_argument("--sets", nargs="*", default=None, help="bench-docs bench-holdout synthetic blind")
    ap.add_argument("--systems", nargs="*", default=["rules", "model"], choices=["rules", "model"])
    ap.add_argument("--llm", nargs="*", default=["none"], choices=["none", "local", "anthropic"])
    ap.add_argument("--out", type=Path, default=None, help="markdown report path")
    ap.add_argument("--json", type=Path, default=None, help="machine-readable summary")
    ap.add_argument("--no-text", action="store_true", help="leave document text out of the report")
    ap.add_argument(
        "--fit-calibration",
        type=Path,
        default=None,
        help="fit per-label curves on every scored label of the last run and write them here",
    )
    args = ap.parse_args(argv)
    sets = args.sets or available_sets()
    docs = load(sets)
    rules = RulesClient()
    try:
        has_model = (get_settings().model_dir / "onnx" / "model_int8.onnx").exists()
        systems = [s for s in args.systems if s == "rules" or has_model]
        runs = [run_system(s == "model", llm, docs, rules) for s in systems for llm in args.llm]
    finally:
        rules.close()
    text = report(runs, sets, docs, show_text=not args.no_text)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(text, encoding="utf-8")
    else:
        print(text)
    if args.fit_calibration:
        last = runs[-1]
        cal = Calibrator.fit(
            samples_of(last),
            meta={"fitted_on": sorted(sets), "system": last.name, "labels": len(last.outcomes)},
        )
        cal.save(args.fit_calibration)
        print(f"calibration {cal.version} written to {args.fit_calibration} ({len(last.outcomes)} labels)")
    if args.json:
        summary = {}
        for run in runs:
            for s in sets:
                labs = next(d.labels for d in docs if d.set == s)
                sc = run.by_set[s]["agent"]
                summary[f"{run.name}/{s}"] = {
                    lab: {"tp": c.tp, "fp": c.fp, "fn": c.fn, "exact": c.exact, "surfaced": c.surfaced, "gold": c.gold}
                    for lab, c in sc.by_label.items()
                    if lab in labs
                }
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(summary, indent=1, sort_keys=True), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
