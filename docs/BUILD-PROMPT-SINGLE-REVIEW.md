# Build prompt — single-review auto-annotation

Paste everything inside the box into a new Claude Code chat opened in `~/PII-Review-Assistant-Extension`.

````text
You are working in my Chrome extension repo ~/PII-Review-Assistant-Extension (branch main; GitHub repos
kylashreddy/PII-Review-Assistant-Extension and kylashreddy/PII-extension-Testing). It is the "PII Review Assistant":
it runs on dashboard.peaktalent.ai "Annotation Review" tasks, compares the LEFT document (original, read-only) with the
RIGHT document (where labels are added), and finds PII with rules + an on-device GLiNER model + an offline knowledge base.

GOAL
Turn it into an autonomous annotator with ONE human check, replacing our two review levels (L1 creates labels, L2 checks
them). The agent must: read both documents → label every PII value on the RIGHT document by the rubric → re-check its own
work (left ↔ right) → show the human a Yes / No card for every label and question → unlock Submit only when everything is
answered. It must NEVER submit by itself.

READ FIRST (in this order)
1. docs/SINGLE-REVIEW-RUBRIC.md — THE rubric: label rules (Part A), self-check (B), Yes/No cards (C), submit gate (D),
   scoring (E), and the agent's JSON output. Follow it exactly; where code and rubric disagree, ask me.
2. docs/AUTO-LABEL-AGENT.md — how the site's label popup works and the risks.
3. docs/GUIDE.md (maintainer part), CHANGELOG.md (top entries).
4. Code: content.js (orchestrates analysis, state, callbacks), core/engine.js (P.engine.run), core/hybrid.js (rules + model
   merge), core/model-client.js, compare.js (L1: left/right alignment, readLabels, categories), redaction.js (L2: leak /
   over-redaction / wrong type checks), identify.js, panel/panel.js + panel/decisions.js (the existing Yes / Not PII
   verdicts — reuse them for the cards), panel/panel-styles.js, core/report.js (Save task for testing), core/labels.js
   (13 labels; normal version stays in 'broad' mode), selectors.js, core/layout.js, core/autodetect.js, test.html.

THE SITE'S LABELING UI (from a screen recording)
- Right panel header "Annotate here"; left panel "Reference · read-only"; footer "N annotations", buttons Close and
  "Submit for Review".
- Select text in the right panel → popup "Label selection" showing the quoted text, a dropdown "Choose a label" (the 13
  labels), a checkbox "Annotate matching entries (N more)", buttons Cancel / Apply.
- Apply → toast "Added N annotations." → the counter increases → the value is underlined in the label's colour.
- "Annotate matching entries" labels text INSIDE other words ("dukaan" inside "dukaanhelp"): never tick it.

WHAT TO BUILD (in phases; show me the result of each phase before the next)
Phase 1 — Agent plan (no clicking yet)
- New core/agent.js: from the existing analysis (detections, compare/redaction findings, left/right models) build the plan
  in the rubric's JSON format: labels[] (label, text, right/left ranges, confidence, group high/medium, why) and
  questions[] (possibly-pii, leak, wrong replacement, over-redaction), plus checks (missed pass, consistency).
- Apply the rubric's self-check (Part B): exact spans, one label per value, same label for the same value everywhere,
  unsure (< 0.70) becomes a question, Date / Overscrubbed never labeled, out-of-scope rules from core/labels.js.
- Unit tests in tests/agent.test.js; use tests/fixtures/label-bench/*.json ({{Label|value}} markers, "<SPLIT>" removed)
  to assert the plan's labels match the marked values.

Phase 2 — Applying labels on the site
- core/apply.js: for each plan label (document order), select the exact RIGHT range (P.textModel.toRange on the right
  model), dispatch the mouse events the site listens to, wait for the "Label selection" popup (found by its TEXT and roles,
  patterns in selectors.js → autoLabel: {...}, not CSS classes), choose the label in the dropdown by visible text, make sure
  "Annotate matching entries" is unchecked, click Apply, wait until compare.readLabels shows the new label on that range
  (or the counter increases); timeouts; stop at the first failure and report it.
- If the site ignores synthetic events (no popup), stop with "Auto-annotate can't drive this page". Do NOT add the
  "debugger" permission or any new permission.
- Make test.html behave like the site: its label buttons become a popup with the dropdown, the matching-entries checkbox,
  Cancel / Apply, a toast and the counter, so everything can be tested locally.

Phase 3 — Human verification (Part C) and submit gate (Part D)
- Panel mode "Single review": button "Auto-annotate" → preview ("23 labels will be added, 4 questions") → apply → a card
  queue ordered Unsure → Leaks → Medium → High:
  label card: value, label, confidence, left/right line, [Yes] [No ▾ → Not PII / other label / fix span];
  question cards as in the rubric; "Approve all N high-confidence" with the list visible; two final document questions.
  No → change or remove the label through the site's own UI.
- Submit gate: while any card is open, cover/disable the site's "Submit for Review" button with a notice
  ("12 checks left") — never click it ourselves; when all are answered, show the summary
  ("42 labels · 39 approved · 2 changed · 1 removed · 0 open") and let the human submit.
- Keep answers per task (chrome.storage.local, keyed by the task hash) so a reload does not lose them; "Save task for
  testing" must include the human's answers (core/report.js) so npm run score can measure acceptance per label.
- Options page: "Single review" on/off (default off), auto-apply minimum confidence (default 0.90), which labels may be
  auto-applied (default: Email Address, Contact Number, URL/Link, IP Address, Account Number, Credentials,
  Vehicle Number Plate; the others go in as cards for confirmation first).

Phase 4 — Measure
- Acceptance rate per label from saved tasks (extend ml/score.js / ml/reports.js): Yes ÷ cards, changed, removed.
- The rubric's Part E severity scoring for a task against a gold version.

RULES (must follow)
- Document text never leaves the browser: no network calls, no external AI APIs (node scripts/build.js --check must pass).
- Never submit automatically. Never tick "Annotate matching entries".
- Keep the normal extension working exactly as now when "Single review" is off; all existing tests must pass
  (npm test), plus node scripts/build.js --check and npm run label-bench.
- Verify UI changes in the browser on the local test page (launch config "pii-extension-local", http://localhost:8769/test.html)
  and show me screenshots.
- Match the existing code style (plain JS, IIFE modules hanging off globalThis.PIIRA, closed shadow-root UI, comments that
  explain why). Small focused commits.
- Never put whole secret-shaped values (API keys, tokens) in the repo; split them in fixtures with "<SPLIT>".
- Never add Claude as co-author in commits or PRs.
- Ask me before deleting any file. Do not push or publish a release until I say so; release with
  `npm run release -- --next` when I do.
- Update CHANGELOG.md and docs/GUIDE.md (a "Single review" section) at the end.

Start with Phase 1: read the files above, then tell me your plan for core/agent.js (data flow, where it hooks into
content.js, and the tests) before writing code.
````
