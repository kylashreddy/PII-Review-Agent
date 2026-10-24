# Auto-label agent — plan and prompts

Goal: the system labels the RIGHT document by itself (pre-annotation); a human annotator / QA evaluator only checks
and corrects. It reuses this extension — the same detection that already highlights PII — and adds one step:
**apply** the labels on the site, the way a person does it in the label popup.

```
 Original (left)  ──►  Detection (rules + GLiNER model + knowledge base)  ──►  confident findings
                                                                               │
 Reviewed (right) ◄──  Apply on the site: select text → Label selection → choose label → Apply
                                                                               │
 Human QA  ◄──  panel lists every auto-label ("Auto · 96%") with Undo; nothing is submitted automatically
```

## What the site does (from the screen recording, 2026-10-24)

1. Two panels: left `left.<ext>-<hash>` "Reference · read-only", right `right.<ext>-<hash>` "Annotate here".
2. Select text in the right panel → a **Label selection** popup: the quoted selection, a **Choose a label** dropdown
   (the 13 labels), a checkbox **Annotate matching entries (N more)**, **Cancel** / **Apply**.
3. Apply → toast "Added N annotations." → the footer counter ("16 annotations") goes up; labeled text is underlined in
   the label's colour. **Submit for Review** sends the task on.
4. ⚠ "Annotate matching entries" matches **inside other words**: in the recording "dukaan" was labeled inside
   "dukaanhelp" and "mydukaan.io". The agent never ticks it; it labels each occurrence it found itself.

## Three ways to build it

| | A. Inside this extension (recommended) | B. Extension + LLM for hard cases | C. Browser agent (LLM drives Chrome) |
|---|---|---|---|
| Who decides labels | rules + model + KB (today's engine) | A, plus an LLM for "Possibly PII" items | an LLM reads the screen |
| Data leaves the computer | **No** | Yes, only unsure snippets | Yes, whole documents and screenshots |
| Speed | ~1 s per task + clicking | + a few seconds | minutes per task |
| Accuracy | unseen documents: 88% found, 90% correct before fixes (benchmark, 2026-10-23); real tasks: measure with `npm run score` | A, plus help on unclear names | unknown; must be measured |
| Needs approval | project lead OK to pre-label | + data-processing approval for the LLM | + data-processing approval |

Build **A** first. B is an add-on. C is the slowest and riskiest — do not start there.

**Before you start, ask your project lead:**
- Are pre-filled (machine) labels allowed on this project if a person checks every one?
- Is there an API for annotations? If yes, use it instead of clicking (more reliable than driving the popup).
- For B/C only: may document text be sent to an external AI service? This is client data full of PII; the
  extension today promises that no document text leaves the browser.

## How A works (step by step)

1. **Detect** — reuse `P.engine.run` + `P.hybrid.merge` (already running for the panel). In L1 the findings are the
   left-document PII that the right document has not labeled yet (`MISSED`).
2. **Pick what to auto-apply** — only findings that are very reliable:
   - confidence ≥ 0.90 (setting), and the label is in an "auto" list chosen from the benchmark: Email Address, Contact
     Number, URL/Link, IP Address, Account Number, Credentials, Vehicle Number Plate first; Person Name, Business
     Name, Address, Person Username once real tasks confirm them (`npm run score`);
   - never: Date (out of scope), Overscrubbed, model-only findings below 0.9, anything "Possibly PII".
3. **Map to the right document** — `compare.js` already aligns left and right (`f.right` / token mapping). Skip a
   finding if the right text differs from the left text (the agent labels the right document's own text).
4. **Apply on the site**, one finding at a time:
   select the exact right-document range → fire the events the site listens to (mouseup) → wait for the popup →
   choose the label in the dropdown → leave "Annotate matching entries" **unticked** → Apply → wait until the
   annotation counter goes up by one → next. Stop at the first failure and show it.
5. **Hand over to the human** — the panel shows "Auto-labeled 23 · Undo all", each item "Auto · Email Address · 98%" with
   Undo, and the usual checks (missed, wrong label, overscrub). The agent never presses Submit.
6. **Measure** — reviewers keep using **Save task for testing**; `npm run score` reports precision per label. Add a label
   to the auto list only when its precision on real tasks is ≥ 98%.

---

## Prompt 1 — build it (paste into Claude Code, in `~/PII-Review-Assistant-Extension`)

```text
Add an "Auto-label" feature to the PII Review Assistant extension in this repository. Read docs/AUTO-LABEL-AGENT.md
first, then content.js, compare.js, core/engine.js, core/hybrid.js, core/layout.js, core/autodetect.js, selectors.js,
panel/panel.js and test.html.

Goal: on a Peak Talent "Annotation Review" task (L1 · Identify), the extension labels the RIGHT document by itself
for findings it is very sure of, using the site's own label popup, so a human only reviews.

The site's flow (from a screen recording): select text in the right panel ("Annotate here") → popup "Label selection"
with the quoted text, a "Choose a label" dropdown listing the 13 labels, a checkbox "Annotate matching entries (N more)",
buttons Cancel / Apply → toast "Added N annotations." → footer counter "N annotations" increases.

Requirements:
1. Candidates: L1 findings of category MISSED with f.right mapped, confidence >= P.SETTINGS.autoLabel.min (default 0.9),
   label in P.SETTINGS.autoLabel.labels (default: Email Address, Contact Number, URL/Link, IP Address, Account Number,
   Credentials, Vehicle Number Plate). Never Date, Overscrubbed, model-only findings below the minimum, or anything
   whose right text differs from the left text.
2. Applying: for each candidate in document order, create a DOM Range over the right-document text (use
   P.textModel.toRange on the right model), select it, dispatch the mouse events the site listens for, wait (with a
   timeout) for the popup, open the label dropdown and choose the label by its visible text, make sure "Annotate
   matching entries" is NOT checked (it labels text inside other words), click Apply, then wait until the right
   document shows a new label span on that range (compare.readLabels) or the counter increases. Stop on the first
   failure and report it. Never click Submit.
3. Find the popup by its text ("Label selection", "Choose a label", "Apply") and roles, not by CSS class names; put the
   text patterns in selectors.js (autoLabel: {...}) so they can be changed without code changes.
4. If the site ignores synthetic events (no popup appears), stop and show "Auto-label can't drive this page" — do not
   add the "debugger" permission.
5. UI: a button "Auto-label N" in the panel (L1 only) with a preview list first ("These 23 labels will be added");
   after applying, each auto-label is listed as "Auto · <label> · <confidence>" with Undo (remove that label through the
   site's own UI) and "Undo all". Remember auto-applied ids per task so the panel can mark them for QA.
6. Options page: "Auto-label" section — on/off (default off), minimum confidence, which labels.
7. Privacy: everything stays in the browser; no network calls (scripts/build.js checks must keep passing).
8. Test page: make test.html's label buttons behave like the site's popup (popup with dropdown, matching-entries
   checkbox, Apply) so the feature can be tested on localhost:8769; verify in the browser that N labels are applied
   and Undo removes them.
9. Unit tests for candidate selection (thresholds, excluded labels, text mismatch) in tests/auto-label.test.js.
   Run npm test and node scripts/build.js --check. Update CHANGELOG.md and docs/GUIDE.md.
Do not push or publish; show me the result first.
```

## Prompt 2 — the labeler (only for option B/C: an LLM that decides labels)

Use it as the system prompt; send one document at a time (or only the unsure snippets). Ask for JSON only.

```text
You label personal data (PII) in documents for a review task. You receive the text of ONE document. Return every
span that must be labeled, using exactly these labels:

Person Name · Person Username · Email Address · Contact Number · Address · URL/Link · Vehicle Number Plate ·
Business Name · Account Number · Credentials · IP Address

What each label covers
- Person Name: a real person's name — full, first or last name alone when it refers to a person ("Thanks Rohan",
  "Gupta sent the invoice"), with initials ("K Rahul Sai", "B. Ashritha"). Leave out titles and honorifics
  (Mr., Smt., ji, Aunty) and roles ("Agent", "Senior Analyst"). Not: job titles, departments ("Field Services"),
  companies that contain a name ("Gupta Electricals" is a Business Name), places ("Gandhi Nagar"), weekdays/months.
- Person Username: login names and handles (ravi_k92, @nitin_ops, GitHub usernames). Not code annotations (@Override,
  @media), npm scopes (@babel/core), file names, role mailboxes.
- Email Address: personal or work e-mail. Not the user part of a URL (https://key@host) or git remotes (git@github.com:…).
- Contact Number: phone numbers (Indian mobiles, landlines, international). Not order IDs, amounts, dates.
- Address: street-level address (house/flat, street, building, locality, city). A city, state, country or PIN code on its
  own is NOT PII. In a multi-line address block the PIN code stays part of the address; in a one-line address it is left out.
- URL/Link: links of a person or organisation (profiles, documents, company sites, internal tools, s3://, file:///).
  Not: localhost / 127.0.0.1 / dev servers with a port, example.com, package registries, a popular website's bare homepage,
  container images (registry/app:1.2).
- Vehicle Number Plate: e.g. MH12AB1234, KA 05 MN 4321.
- Business Name: a company / shop / organisation that is not a well-known public company (the project whitelists those:
  Google, Infosys, HDFC Bank, State Bank of India…). Not departments, generic phrases ("Goods and Services").
- Account Number: bank account numbers, IBAN, IFSC, card numbers, UPI IDs (name@okicici), crypto wallets.
- Credentials: government IDs (Aadhaar, PAN, passport, voter ID, GSTIN, SSN, CPF, NIK…), passwords, API keys, tokens,
  private keys, connection URLs with a password (label the whole URL). Not variable references ($DB_PASSWORD,
  ${API_KEY}, process.env.X, %APP_SECRET%), placeholders, commit hashes, checksums.
- IP Address: IPv4 (public and private), IPv6, MAC addresses. Not version numbers, localhost.

Never label: dates or dates of birth (out of scope), postal codes alone, JSON/CSV keys and column headers, code
identifiers, the platform's own words ("Annotate Here").

Rules
1. Copy each span EXACTLY as it appears (same characters, same case); give start/end character offsets.
2. Label every occurrence separately; never label a part of a longer word.
3. If unsure, include it with "confidence" below 0.7 and a short "reason"; do not guess silently.
4. Output JSON only:
{"labels":[{"text":"...","start":0,"end":0,"label":"Person Name","confidence":0.0,"reason":"..."}]}
```

## Risks to keep in mind

- **Wrong labels at scale**: one wrong rule repeats on every task. Keep the auto list small, measure with real tasks,
  and keep the human check mandatory.
- **Site changes**: if the popup changes, clicking breaks. Text-based selectors in `selectors.js` and the stop-on-failure
  rule limit the damage; an annotation API would remove this risk.
- **Responsibility**: the person who submits owns the labels. The panel must make auto-labels visible so they are
  checked, not trusted blindly.
