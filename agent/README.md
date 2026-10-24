# PII annotation agent

The agent annotates a Peak Talent "Annotation Review" task (L1), checks itself (L2) and prepares one Yes / No card per
label and question for **one human**, who submits. It never submits. The rules, the knowledge base and the GLiNER
model are the PII Review Assistant extension's own, used without copying: one source of truth for the rules.

Rubric: [docs/SINGLE-REVIEW-RUBRIC.md](../docs/SINGLE-REVIEW-RUBRIC.md). Phases done: **P1** (rules service +
pipeline + plan JSON + eval) and **P2** (LLM adjudicator + calibration). No API or UI yet.

```
                 ┌──────────────────────────── pii_agent (Python 3.12) ────────────────────────────┐
 TaskSource ───► │ load_task → gliner_detect → rules_analyze (+ hybrid merge) → rules_compare      │
 (files; P5:     │ → redaction_check (verify mode) → rubric_check → adjudicate ("none" in P1)      │
  connector)     │ → rubric_check → build_plan → create_cards      logs: steps, counts, timings only │
                 └──────────────┬──────────────────────────────────────────┬──────────────────────┘
                                │ JSON lines (stdio)                       │ onnxruntime 1.19.2
                 ┌──────────────▼───────────────────┐        ┌─────────────▼──────────────────────┐
                 │ rules-service (Node 22)          │        │ models/multi_pii/onnx/model_int8   │
                 │ loads the extension's scripts in │        │ (pii_agent/gliner.py = a port of   │
                 │ manifest order + data/kb         │        │ offscreen/gliner-core.js)          │
                 └──────────────────────────────────┘        └────────────────────────────────────┘
```

## Setup

```bash
cd agent && python3.12 -m venv .venv && .venv/bin/pip install -e ".[dev]"
```

Node 22 is needed for the rules service (no npm install: it loads the extension from this repository). The GLiNER
model is optional (`npm run setup-model` in the repository root); without it the agent runs rules only.

## Use

```bash
.venv/bin/pii-agent run --left left.txt --right right.txt --file-name "by-pii-type~~…" --out out/
.venv/bin/pii-agent run --task-dir ../tests/fixtures --task bug6-git-logs --out out/
.venv/bin/pii-agent version
```

`out/plan.json` is the rubric's agent output (labels with `action` add / keep / change / remove, `group` high / medium,
questions, checks, versions, `run_key`); `out/cards.json` is the card queue (Unsure → Leaks → Medium → High → the two
document questions) and the "Approve all" group.

Settings come from the environment (`PII_AGENT_*`, see `pii_agent/config.py`): thresholds, model on / off, ONNX
providers, rules-service timeout.

## The LLM adjudicator (P2)

The LLM is asked only about **medium** labels (names, companies, addresses, usernames) and **unsure** items, one
snippet each: the value and at most ±200 characters around it, never the whole document.

| `PII_AGENT_LLM_PROVIDER` | What | Data |
|---|---|---|
| `local` (default) | a self-hosted open model behind an OpenAI-compatible endpoint: vLLM (`vllm serve …`) or Ollama; `PII_AGENT_LLM_BASE_URL`, `PII_AGENT_LLM_MODEL` | stays on our servers |
| `anthropic` | Claude (`claude-opus-5-5`) through the `anthropic` SDK; structured JSON output, adaptive thinking, server-side refusal fallback | snippets leave our servers, with the other PII in each snippet masked as `[Label]` |
| `none` | no LLM: unsure items stay human questions | — |

Claude is refused at start-up unless **both** `PII_AGENT_ANTHROPIC_ENABLED=true` **and** a recorded, unexpired
approval exist (`PII_AGENT_LLM_APPROVAL_FILE`, a JSON record: `provider`, `approved_by`, `reference`, `approved_on`,
`valid_until`, `scope: "snippets"`). The local provider fails fast when its server is down (set
`PII_AGENT_LLM_PROVIDER=none` to run without it).

How answers are used (`pii_agent/adjudicate.py`): an unsure question becomes a medium label when the LLM names a
label with ≥ 0.8; a medium label the LLM rejects becomes a question (never silently removed); "not PII" never drops
a question unless `PII_AGENT_LLM_MAY_DISMISS=true`; invalid JSON, a refusal or no answer change nothing. Every
decision is cached by a hash of the snippet, the model and the prompt version, so a run is repeatable.

**Calibration** (`pii_agent/calibration.py`): per-label isotonic curves from raw confidence to the observed share of
correct labels, fitted on the gold sets (`python -m eval.run_eval --fit-calibration pii_agent/data/calibration.json`)
and, from P3, refitted on human answers. A label joins "Approve all" only when its calibrated confidence is also
≥ `PII_AGENT_APPROVE_ALL_MIN` (0.98). The eval measures calibration out of fold (fit on half the documents, score
on the other half).

## Check and measure

```bash
scripts/check.sh                                   # extension tests, build check, label-bench, rules service, ruff, mypy, pytest
.venv/bin/python -m eval.run_eval --out eval/reports/P1-eval.md
```

Gold sets (`eval/gold.py`): `bench-docs` and `bench-holdout` (tests/fixtures/label-bench), `synthetic` (ml/eval-data,
4 model labels, local only) and `blind` (`eval/blind.py`: 56 documents, 1,328 values, generated from a seed at run
time so no secret-shaped value is stored; check digits are valid).

## Layout

| Path | What |
|---|---|
| `rules-service/` | Node: `version`, `labels`, `analyze` (rules + hybrid merge), `compare`, `redaction_check`, `span_facts`, `kb_lookup`; code-point offsets at the edge |
| `pii_agent/models.py` | Pydantic shapes: Task, Detection, Finding, PlanLabel, Question, Plan, Card, CardDeck |
| `pii_agent/tools.py` | the tools, one method each; `pipeline.py` runs them in a fixed order |
| `pii_agent/gliner.py` | GLiNER port; `tests/test_gliner_parity.py` checks it against `ml/gliner-runner.js` |
| `pii_agent/draft.py`, `rubric.py`, `plan.py`, `cards.py` | findings → draft → Part B self-check → plan → cards |
| `pii_agent/adjudicate.py` | the LLM provider interface (P2); P1 ships `none` |
| `pii_agent/log.py` | JSON logs that drop any string not under a known key |
| `eval/` | gold sets, metrics (label-bench's matching + exact boundaries + Wilson intervals), report |

## Decisions worth knowing

- **onnxruntime is pinned to 1.19.2.** The int8 model's scores depend heavily on the runtime: for the same name,
  1.19.2 (Node and Python) gives 0.23, onnxruntime-web 1.22 (the extension in Chrome) 0.37, Python 1.31 0.997 — and
  1.31 with graph optimisations off 0.61. core/hybrid.js's thresholds were tuned on 1.19.2, so the agent uses exactly
  that and its output equals the Node runner's, entity for entity and score for score. Moving to another runtime (or
  an fp32 model) means re-tuning the thresholds through the eval gate.
- **One model call per window**, as in the extension (batching padded windows corrupted GLiNER's output there).
- **Offsets are code points** everywhere in Python; the rules service converts to and from JavaScript's UTF-16.
- **Verify mode** (left ≠ right) labels the replacement on the right with the original's label and raises a Leak card
  for unchanged values; identify mode (left = right) labels the values themselves.
- **Existing right labels** are reconciled: keep, change (label or span) or remove (no PII under it, or not PII by
  span_facts).
