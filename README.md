# PII Review Assistant

A Chrome extension that helps Peak Talent reviewers check PII in review tasks.
It runs only in your browser — no document text is sent or saved — and it never labels, clicks or submits anything.

| Mode | What it does |
|---|---|
| **L1 · Identify** | Finds the PII in the original (77 kinds, under the site's 13 labels) and shows what is still to label |
| **L2 · Verify** | Compares the redacted work with the original: leakage, inconsistent or wrong replacements, over-scrubbing, other language |

**Install (one computer):** open `chrome://extensions` → turn on **Developer mode** → **Load unpacked** → select this folder → open a task on peaktalent.ai.

**Install (whole company):** `npm run build` makes the release zip; IT force-installs it through the Chrome Web Store
(private) or the company's own server, with optional organisation settings. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
and, for security review, [SECURITY.md](SECURITY.md).

<details>
<summary><b>More details: using the panel</b></summary>

- The panel starts closed: a small **PII** button in the bottom corner shows the number of open
  issues (green **PII ✓** when nothing is left). Click it to open; **✕** closes it. Your choice is
  remembered. Nothing is shown on pages without a task.
- Each finding is one line: the entity, the text and a short status. Answer with the two buttons
  (L1: **Yes / Not PII**, L2: **Redact / Keep**); the dashed button is the assistant's suggestion.
- **Details ▸** opens the full explanation, confidence and where the text is.
- **◀ Prev / Next ▶** steps through open issues; click a finding to jump to it on both documents.
- A yellow card flags tasks in another language or unstructured text, with **Copy reason**.
- The first time on a task page, check **Page setup → Show panels**, then **Looks right — save**.

</details>

<details>
<summary><b>More details: business names list (over-scrubbing)</b></summary>

`data/business-names.json` lists well-known names (top MNCs, institutes, brands, banks). They are not PII:
they are never flagged as Business Name, they are underlined dotted green on the original, and labeling,
replacing or removing one on the right is flagged as over-scrubbing. Edit the JSON to change the list
(any nesting of categories; each list of strings is a group), then reload the extension.

Person and business-name detection also recognizes Unicode letters, including accented and Cyrillic
names, in the same contextual formats as before (for example, name fields, titles and company suffixes).
When a document contains CSV, tab-separated, or pipe/Markdown tables, column headings such as
“Full Name”, “Company Name”, “Email”, or “GSTIN” are also used as context for the values beneath them.
Recognized fields like “Company PAN: …” use their heading as context too. This helps with OCR and
unstructured invoice text; headings alone are not reported as PII.

</details>

<details>
<summary><b>More details: development</b></summary>

```bash
npm test                     # unit tests (Node 22+)
npm run build                # release checks + dist/*.zip
python3 -m http.server 8765  # then open http://localhost:8765/test.html
```

Test pages: `test.html?set=buckets` (one task per issue bucket), `?layout=unknown`, `?records=5000`, `?noisy=1`,
`?policy={"defaultStage":"L1"}` (organisation settings).
`manifest.json` is the only list of the extension's scripts. Full guide: [docs/GUIDE.md](docs/GUIDE.md).

</details>
