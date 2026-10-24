# Build prompt — team-scale PII annotation agent (Python)

Paste everything inside the box into a new Claude Code chat opened in `~/PII-Review-Assistant-Extension`.

````text
You are a senior engineer building a TEAM-SCALE PII annotation AGENT in PYTHON for my team. Reuse my Chrome extension in
~/PII-Review-Assistant-Extension (branch main; repos kylashreddy/PII-Review-Assistant-Extension and
kylashreddy/PII-extension-Testing) as the rules engine and as the reference for the user interface.

CONTEXT
- My team reviews PII "Annotation Review" tasks on dashboard.peaktalent.ai for a client. Each task has a LEFT document
  (original, read-only) and a RIGHT document (where labels go), and 13 labels: Account Number, Address, Business Name,
  Contact Number, Credentials, Date, Email Address, IP Address, Overscrubbed, Person Name, URL/Link, Person Username,
  Vehicle Number Plate.
- Today two people touch every task: L1 creates labels, L2 checks them, then the team sends it to the client.
- New process: the AGENT annotates every task (L1 work) and checks itself (L2 work); ONE human answers Yes / No on every
  label and question; only then can the human submit. The agent never submits.
- The extension already detects PII well (it runs in Node too, see tests/load.js, ml/eval.js): rules (detectors/,
  core/engine.js), GLiNER model "urchade/gliner_multi_pii-v1" (int8 ONNX in models/), merge logic (core/hybrid.js),
  offline knowledge base (data/kb, scripts/build-kb.js), names list (data/names.js), left↔right comparison (compare.js),
  redaction checks (redaction.js), a 13-label benchmark (tests/fixtures/label-bench, ml/label-bench.js).

READ FIRST
1. docs/SINGLE-REVIEW-RUBRIC.md — THE rubric (label rules, self-check, Yes/No cards, submit gate, scoring, JSON output).
2. docs/AUTO-LABEL-AGENT.md — the site's label popup ("Label selection" → "Choose a label" → Apply; never tick
   "Annotate matching entries": it labels text inside other words) and the risks.
3. docs/GUIDE.md, CHANGELOG.md, then the code listed above, panel/panel.js and test.html (the reviewer UI to mirror).

ARCHITECTURE — a Python agent with tools (folder `agent/` in this repo; keep the extension and its tests working)
1. Rules service (agent/rules-service, small Node process): wraps the extension's engine WITHOUT copying code (load the
   scripts like tests/load.js) and exposes JSON over HTTP/stdio: analyze(text, file_name) → detections,
   compare(left, right, right_labels) → findings, redaction_check(left, right) → findings, version. One source of truth
   for the rules; the Python side never re-implements them.
2. Agent (agent/pii_agent, Python 3.11+, typed, Pydantic models): an orchestrator that runs a fixed pipeline and calls
   tools; the LLM is used only where judgement is needed. Tools:
   - load_task(task_id) → left, right, file name, existing right labels
   - rules_analyze(text) / rules_compare(...) / redaction_check(...)  → the rules service
   - gliner_detect(text) → the GLiNER model in Python (gliner package or onnxruntime with the same int8 model), batched,
     GPU optional; same label prompts and merge thresholds as core/hybrid.js (min 0.15, add 0.2, strong 0.4)
   - kb_lookup(name | domain) → well-known company / public figure / popular website (data/kb)
   - rubric_check(plan) → deterministic Part B self-check (exact spans, one label per value, consistency, out of scope,
     never Date / Overscrubbed, never "matching entries")
   - adjudicate(items) → LLM decision ONLY for medium / unsure items, with the rubric (Part A) as its system prompt,
     input = the value plus ±200 characters of context (never the whole document), output = strict JSON validated by
     Pydantic {label | "not_pii", confidence, reason}; invalid output → the item stays a human question
   - build_plan() → the rubric's JSON (labels[], questions[], checks) with calibrated confidence and groups
   - create_cards(plan) → Yes / No cards for the human; apply_labels(approved) → connector (only after approval)
   Pipeline: load → rules + GLiNER + KB → merge → compare left/right → redaction checks → rubric_check →
   adjudicate unsure → rubric_check again → build_plan → create_cards. Deterministic and repeatable for the same input
   and versions; every step logged (without document text) with timings.
3. LLM providers (agent/pii_agent/llm): one interface, three implementations:
   (a) self-hosted open model served with vLLM or Ollama — DEFAULT, nothing leaves our servers;
   (b) Anthropic Claude through the official `anthropic` Python SDK (model claude-opus-5-5, adaptive thinking,
       structured output / tool use; check the SDK docs for exact calls — do not guess APIs);
   (c) "none" — no LLM: unsure items become human questions.
   (b) is DISABLED unless a config flag AND a recorded data-processing approval are set; it receives snippets only.
4. API (agent/api, FastAPI): tasks, plans, cards, answers, users, audit log; SQLAlchemy 2 + Alembic + PostgreSQL;
   jobs on Redis with Celery (or arq) workers that scale horizontally; idempotent jobs keyed by task id + document hash +
   engine/model versions.
5. Reviewer web app (agent/web, React + TypeScript + Vite) with THE SAME INTERFACE as the Peak Talent "Annotation Review"
   screen plus the extension panel: task title bar, the label chips row (same 13 labels and colours as core/labels.js /
   highlight.css), LEFT "Reference · read-only" and RIGHT "Annotate here" panels, labels underlined in their colours,
   the "Label selection" popup, footer "N annotations" with Close / "Submit for Review"; on the right the card queue
   (Unsure → Leaks → Medium → High), Yes / No ▾ (Not PII · other label · fix span), "Approve all N high-confidence"
   with the list visible, the two final document questions, and the submit gate with the summary
   ("42 labels · 39 approved · 2 changed · 1 removed · 0 open"). Keyboard: Y / N / J / K / Enter.
6. Connector (agent/connector): (a) the platform's annotation API — adapter interface + stub, do not guess endpoints;
   (b) fallback: the Chrome extension as connector — opt-in mode that sends the task to OUR API over HTTPS with the
   reviewer's token and, after approval, applies the approved labels on the site through the label popup (never ticks
   "Annotate matching entries", never clicks Submit), with a host permission for our API domain only.
7. Team features: Google Workspace SSO restricted to our domain; roles reviewer / lead / admin; task assignment and
   claiming; lead dashboard (throughput, time per task, acceptance rate per label and per reviewer, open tasks,
   Part E quality scores); full audit trail (who answered what, agent/rules/model versions); export of answered tasks.
8. Accuracy loop (agent/eval, pytest): gold sets = tests/fixtures/label-bench (remove "<SPLIT>") + answered tasks;
   per-label precision / recall / boundary accuracy; per-label confidence calibration (isotonic) from human answers;
   CI release gate: a new version ships only if no label drops more than 1 point and Credentials / Account Number recall
   stays ≥ 99%; weekly GLiNER fine-tuning on approved labels (agent/ml/finetune), promoted only through the gate;
   compare LLM providers on the same gold set before enabling one.
9. Operations: docker-compose (postgres, redis, rules-service, api, worker, llm, web); a Dockerfile per service; config
   by env (pydantic-settings); health checks; structured logs WITHOUT document text; metrics (jobs, latency, errors,
   LLM tokens and cost).

SECURITY AND PRIVACY (non-negotiable)
- Documents are client PII. Self-host everything; encrypt at rest and in transit (TLS); retention setting (default
  30 days, then delete document text and keep only spans + answers); no document text in logs, traces, analytics or
  error reports; least-privilege access by role; secrets only in env / vault.
- External LLMs OFF by default and snippet-only when approved. Nothing is sent to the client automatically.
- Never put whole secret-shaped values in the repo (split test values with "<SPLIT>").

ACCURACY TARGETS (measure, don't assume)
- On the gold sets: recall ≥ 97% overall and ≥ 99% for Credentials and Account Number; precision ≥ 98% for any label in
  the "Approve all" group; boundary exact-match ≥ 95%. Report numbers per phase with and without the LLM; if a target
  is missed, say so and list the misses.

HOW TO WORK
- Phases, each ending with a demo and test results; stop and ask me before the next:
  P1 rules service + Python agent pipeline (no LLM) + plan JSON + eval on the gold sets ·
  P2 LLM adjudicator (self-hosted + "none"; Claude provider behind the approval flag) + calibration, with eval ·
  P3 API + workers + database + queue with docker-compose ·
  P4 reviewer web app with the same interface, card queue and submit gate (screenshots) ·
  P5 connector (API adapter stub + extension connector mode) ·
  P6 team features (SSO, roles, assignment, dashboard, audit) ·
  P7 accuracy loop in CI + fine-tuning pipeline · P8 hardening (load test: 50 reviewers, 10,000 tasks/day; backups;
  retention job; runbook).
- Python: ruff + mypy (strict) + pytest; type hints everywhere; small modules. Keep the extension working and all
  existing checks green: npm test, node scripts/build.js --check, npm run label-bench.
- Never add Claude as co-author in commits or PRs. Ask me before deleting any file. Do not push, deploy or publish
  until I say so.

Start with P1: read the files above, then give me the architecture (one diagram), the folder layout, the agent's tool
list with input/output schemas, the data model (tables), and the P1 plan with how you will measure accuracy —
before writing code.
````

## Decide before building
1. **Where it runs** — a company server / cloud account the team controls (client PII will be stored there).
2. **Approval** — the client and your lead must allow storing documents on your server, machine pre-labels, and (only
   if you want it) sending snippets to an external LLM.
3. **Platform API** — ask Peak Talent for an annotation API; without it, the extension connector clicks the site's popup.
4. **Self-hosted LLM** — needs a GPU server (or run the agent with no LLM: unsure items simply become human questions).
