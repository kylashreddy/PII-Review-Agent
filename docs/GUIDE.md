# PII Review Assistant (Chrome extension)

Helps reviewers on **Peak Talent** compare the original document (left) with the reviewed
document (right) and spot PII labels that are **missed**, **wrong**, or **over-scrubbed**.

- Runs entirely inside your browser. **No document text is sent anywhere or saved.**
- It **never** applies labels, clicks buttons, or submits anything. You do all labeling and
  submitting yourself, with the site's own controls.

---

## 1. Install (for reviewers, about 2 minutes)

1. Get the **`pii-review-assistant`** folder (for example, unzip the file you were sent).
   Keep it somewhere permanent, such as your Documents folder. Chrome loads it from there.
2. Open **Google Chrome** and type `chrome://extensions` in the address bar, then press Enter.
3. Turn on **Developer mode** (the switch at the top-right).
4. Click **Load unpacked**.
5. Select the **`pii-review-assistant`** folder (the one containing `manifest.json`) and click **Select**.
6. "PII Review Assistant" now appears in the list. Make sure its switch is **on**.
7. Open (or reload) a task on **peaktalent.ai**. A **PII Review Assistant** panel appears on the right.

### First time on a task page: check the setup (once per browser)
The extension finds the two documents by itself. The first time, it shows
*"Document panels were found automatically."*
1. Scroll to **Page setup** at the bottom of the panel and click **Show panels**. Green boxes
   outline what it found as LEFT (original) and RIGHT (reviewed).
2. If both boxes are right, click **Looks right — save**. You're done.
3. If they are wrong, click **Set up manually** and follow the three steps:
   - click the **original** document,
   - click the **reviewed** document,
   - click **one PII label** on the reviewed document (or **Skip** if this task has no labels yet).

   Use **Wider ↑ / Narrower ↓** if the blue box doesn't cover the whole document.
   While you are setting up, your clicks are **not** passed to the site, so nothing on the task changes.

The setup is saved in this browser for peaktalent.ai. It contains only page-structure
selectors, never any document text. To redo it: **Page setup → Set up manually**, or
**Forget saved setup**.

**To update:** replace the folder with the new version, go to `chrome://extensions`, and
click the ↻ (reload) icon on the PII Review Assistant card. Then reload the Peak Talent tab.

**To remove:** `chrome://extensions` → PII Review Assistant → **Remove**.

---

## 2. Using it

### Two modes: L1 · Identify and L2 · Verify
Switch at the top of the panel. Your choice is remembered; the panel opens on L2 by default.

**L1 · Identify:** the L1 employee finds the original PII in the raw document and labels it with the review
site's **13 labels**. The assistant knows each kind of PII (an Indian GSTIN, a Stripe key, a Brazilian CPF…)
and tells you which label it goes under; the kind is shown next to the label in the panel (open **Details**).

| Label | Kinds of PII under it |
|---|---|
| **Person Name** | a person's full, first or last name |
| **Person Username** | login IDs, handles, social usernames; GitHub usernames |
| **Email Address** | personal and work email addresses (not example.com and other dummy domains) |
| **Contact Number** | Indian mobile numbers, international numbers, landlines, toll-free numbers |
| **Address** | street, building and locality; GPS coordinates. *Not* the PIN code, city, state or country of an inline address — but a multi-line address block (shipping label, letter) is one span, landmark line and closing PIN line included |
| **URL/Link** | profile, document and company links (not whitelisted domains — `data/whitelisted-domains.js`) |
| **Vehicle Number Plate** | Indian plates (MH12AB1234, 22BH1234AA) and plates after a plate / registration word |
| **Business Name** | company names (not the well-known names in `data/business-names.json`) |
| **Account Number** | bank account numbers, IBAN, US account / routing numbers, payment cards (with CVV and expiry), UPI IDs, IFSC codes, crypto wallets |
| **Credentials** | passports, driver licences, IMEI; Indian Aadhaar, PAN (individual and business), GSTIN, TAN, CIN, UAN, Voter ID; US SSN, EIN, passport, driver licence; Brazilian CPF, CNPJ, RG, CNH, PIS/PASEP, voter registration; Indonesian NIK, KK, NPWP, BPJS, NIP, passport, SIM; API keys and tokens (Anthropic, OpenAI, Stripe, AWS, Google, Slack, GitHub, GitLab, SendGrid, npm, PyPI, Sentry, JWT, Bearer, private keys, generic keys), connection URLs with a password, passwords, PINs and OTPs |
| **IP Address** | public IPv4, private IP, IPv6 and MAC addresses |
| **Date** | out of scope (see below) |
| **Overscrubbed** | review label for text that was labeled but is not PII |

How the assistant decides between look-alikes:
- **The most specific kind wins:** `sk-ant-…` is an Anthropic key, not an OpenAI key; a PAN whose 4th letter is
  C, H, F, A, T, B, L, J or G is a business PAN, P an individual's.
- **Same-shape numbers need their field name:** a 12-digit UAN and an Aadhaar number, a 16-digit NIK and a family
  card (KK), or an 11-digit CPF, CNH and PIS look alike. The word in front ("UAN:", "No. KK", "CNH") decides;
  without one, a number is only reported when its check digits prove the kind (Aadhaar, card, IBAN, CPF, CNPJ…).
- **Columns, JSON keys and field labels count as the field name:** in a CSV, TSV or JSON file the header
  (`us_bank_number`, `nomor_kk`, `पासपोर्ट`, `número_cpf`) gives each value its kind, even rows away from it. The
  names are in `core/pii-keys.js`.
- **The task's file name is a strong hint:** `by-pii-type~~kartu_keluarga~~…` makes a value that has the KK shape a
  KK, and turns a look-alike of the same family into it (a bank account number in a `us_bank_number` file is a US
  bank number). The file name alone never makes free text PII: a git log in an `aws_secret_key` file is full of
  40-character commit hashes that are not secrets.
- **Never PII:** column headers, JSON keys and field labels (`Us Bank Number:`), the values of Department / Status /
  record id fields, and department names anywhere ("Field Services", "People Ops", "Logistics" — `P.DEPARTMENTS` in
  `core/labels.js`). Commit hashes, UUIDs and git timestamps are not PII, and new ones after history was rewritten
  are not over-scrubbing. In a git log, the author name in `Name <email>` is a Person Name.
- **Mapping decisions:** an **ITIN** (`us_itin`, 9XX-7X-XXXX) is labeled **US Social Security Number** — the site
  has no ITIN type, and an ITIN has the SSN shape and identifies a person the same way. A **`passport_number`**
  file is a **US Passport Number** file; a passport column or field without that file name is the generic
  Passport Number.

In the L2 check, a value replaced by a **different value of the same format** ("724878356" → "9475937994") is a
correct redaction, never over-scrubbing: it is reported with the kind its field or file name gives, or as
*possible PII — decide* when nothing says which kind it is. Over-scrubbing is only reported when text that is not
PII (a department, a status, a header, a label word) was changed. A key that keeps its vendor prefix (`SG.`,
`sk-ant-api03-`, `ghp_`, a JWT's header) and a CNPJ/NPWP that keeps its `0001` / `000` branch part are not leaks.

**Out of scope:** dates (including dates of birth) and postal codes (Indian PIN, US ZIP, Brazilian CEP, Indonesian
kode pos) are **not PII** under the team's scope sheet. They are not reported; if one is labeled on the right it
shows as a **possible overscrub** that says why. To report them again, set `reportOutOfScope: true` in
`core/labels.js`.

At the top, the **Overview** gives a brief about the two documents (size, PII found by group and the kinds
found most often, the labels or replacements on the right, language and structure) and the number of open
issues in each bucket. Click a bucket to show only those findings; click it again to show all.

The panel lists what is still **to identify** in the three groups (not labeled yet, wrong label, or needs a check),
plus **labeled, but not PII?** (extra labels) and **identified ✓**. For each item, click **Yes, &lt;entity&gt;** or
**Not PII**. It then tells you what to do on the site: *label it as …*, *change the label from … to …*, or
*remove this label*. **Your identification** totals the personal, business and credential items and the label
changes still to make. Labels are read from the right document only; the left
document is the raw original and is never labeled. Old label names such as "Contact Number" or "Email Address" are read as their guide
equivalents (see `labelAliases` in `selectors.js`).

**Not in the guide, so not flagged:** URLs/links, vehicle number plates, dates other than a date of birth, and
top MNC names (Google, Infosys, HDFC Bank …).

**Task check: other language and unstructured text.** In both modes, the panel checks the original
document line by line. If any part is not in English (Hindi, Tamil, other Indian scripts, Hinglish, Spanish …)
or the text is unstructured (logs, code, data dumps), a yellow **Flag this task** card appears at the top. It
shows each language with its share of the text and line count, where it appears (line numbers), and a ready
reason such as *"Task contains non-English text — Tamil 22% of the text (1 line); Hindi 15% of the text
(1 line); lines 3, 5. Flagged as other language (sampling imperfection)."* **Copy reason** puts that text on the
clipboard to paste into the site's own flag or skip field. **Show the non-English parts** jumps to each one.

**Dummy data is not PII.** Emails and links on placeholder domains (example.com, example.org, example.net,
anything.example, *.test, *.invalid, *.localhost) are never identified or flagged.

**Tables and OCR text.** CSV, tab-separated, and pipe/Markdown table headings provide context for their
column values (for example, “Full Name” or “Company Name”). Inline fields such as “GSTIN: …” are also
understood when separated by common table delimiters. This contextual signal supplements format checks;
headings themselves are never treated as PII.

**L2 · Verify:** is the right document a correct redaction of the raw left document? The right side
must keep the **exact words** of the left side, with **only the PII replaced**, by **sensible** values of
the **same data type**, done **consistently**:

| L2 bucket | What it means | Example |
|---|---|---|
| **Task issues** | Whole task out of scope: **other language** (sampling imperfection) or **unstructured** text (logs, code, data dumps) | Hindi document, JSON log |
| **PI leakage** | PII still visible on the right: not redacted, only partly redacted, or redacted in one place but leaked in another | account number unchanged; "Ravi Kumar" → "Ravi Shah" |
| **Incoherent** | Same value replaced differently, or two different values given the same replacement | Ram → Raj here but Ram → Sam there; Ram and Shyam both → Raj |
| **Wrong data type** | The replacement is a different kind of data | phone number → "Raj Kumar" |
| **Not sensible** | Replacement isn't realistic text | "XXXX", "[NAME]", deleted |
| **Unknown / changed text** | Non-PII words that differ between left and right (added, removed or changed) | "call back" → "phone back" |
| **Redacted correctly** | Replaced with a realistic value of the same type, consistently | Ram Prasad → Raj Mehta everywhere |

In L2, problems are underlined **red** on the right document.

#### Deciding "should it be redacted?" (L2)
The left side is the raw document. The right side is someone's redacted work. For each item, you
decide whether that text **should be redacted or not**:

1. Read the assistant's suggestion, for example *"Assistant: PII — should be redacted"* or
   *"Assistant: not PII — keep the original"*. Click the item to see it on both documents.
2. Click **Redact (PII)** or **Keep (not PII)**. Click the same button again to undo.
3. The item then shows what that means for the redacted work:
   - **Missed redaction:** you said Redact, but the right side left it as is.
   - **Over-redaction:** you said Keep, but the right side changed it.
   - **Correct to redact, but the replacement must be fixed:** incoherent, wrong data type or not sensible.
   - **Correctly redacted / correctly kept.**
4. **Your decisions** at the top counts how many items need fixing on the right (missed redactions,
   over-redactions, bad replacements), how many are OK, and how many are undecided.

The items to decide are:
- **PI leakage:** PII not redacted.
- **Redacted, but is it PII?:** the right side changed text where no PII was found.
- **Possible PII, not redacted:** the assistant isn't sure.
- **Redacted correctly:** confirm it.
- **Incoherent / wrong data type / not sensible.**

Decisions are kept only while the tab is open; nothing is saved or sent.

**Well-known names are not PII.** Names on the business names list (`data/business-names.json`: top MNCs,
institutes, popular brands, banks) are never flagged as Business Name, are marked dotted green on the original,
and leaving them unchanged is not leakage. Labeling, replacing or removing one on the right is reported as
over-scrubbing, with the list category it comes from. The list is `data/business-names.json` (top MNCs, institutes, brands, banks); edit it to change which names count.

| In the panel | What it means |
|---|---|
| **Missed** (red) | PII found on the left that has no label on the right. |
| **Wrong label** (orange) | Labeled on the right, but with a different label than expected. Shows *"right says X"*. |
| **Possible overscrub** (purple) | Labeled on the right, but no PII found. It is marked **on the right document** with a purple wavy underline. If it really isn't PII, label it **Overscrubbed**. |
| **Needs review** (blue) | Low confidence (below 70%), only part of the text labeled, or couldn't be lined up. |
| **Correct** (green) | Same text, same label on both sides. |

- **◀ Prev / Next ▶** at the top steps through the open issues in document order. These are
  findings that aren't Correct and aren't ticked. Each step scrolls to and blinks the item.
  It follows the current filters, so "Next" with the **Date** filter goes only through Date issues.
- **Filter** by text with the search box, or pick one label from the **All labels** list.
- Long lists show **100 at a time**; use **Show 100 more** to see more. Closed sections (e.g.
  **Correct**) aren't drawn at all until you open them.
- **Each finding is one line:** entity, text and a short status, with the decision buttons. The dashed button is
  the assistant's suggestion; **Details ▸** opens the full explanation. Section descriptions are in the tooltip
  of each section title.
- **Click a finding** to scroll to it and make it blink (yellow) on **both** documents.
- **Tick the checkbox** next to a finding once you've dealt with it. The progress bar tracks how
  many you've checked. Ticks reset when a new task loads or the tab is closed.
- **Colours on the left document** show what the assistant detected. Each label has its own
  colour (see *Labels & colours*). Click a label there to hide or show its colour.
- **Aa** turns all colour highlights off or on. **⇆** moves the panel to the other side.
  **✕** closes it to the small **PII** button in the bottom corner. **↻** re-checks the page.
- **The panel starts closed.** The **PII** button shows a red dot and the number of open issues,
  or a green **PII ✓** when nothing is left. Click it to open the panel. If you leave the panel
  open, it opens again on your next task; if you close it, it stays closed.
- **Move the PII button** if it covers something on the site: drag it anywhere (or focus it and use
  Alt + arrow keys; add Shift for bigger steps). It stays where you leave it, on every task.
- The panel updates by itself when you add or change labels, or when the next task loads.

The assistant is a helper, not a decision-maker. Always use your own judgment before labeling.

### If you see "Couldn't find the document panels"
On pages that aren't tasks (dashboard, lists) nothing is shown at all. On a review page with no
task open yet, only a grey **PII** button sits in the bottom corner. Once a task is open, if the
documents still can't be found, click that button and then **Set up manually**. If that doesn't help, tell the person who maintains the extension.

### Label names on highlights
Each value found in the original document has a small tag above it with its label (**Person Name**,
**Address**, **Credentials**…; **· model** when the model found it), in the same colour as its highlight.
The tags hide with the highlights and with a label you switch off in the panel. To turn them off: extension
options → **Show label names on highlighted text**.

### Check selected text
Select any text in the **original (left)** document — a name, a number, a link, a heading. A small card appears under it:

```
“Tata Consultancy Services”
● Not PII — public name
  • Tata Consultancy Services: well-known company (Wikipedia in 31 languages)
  • Keep it as it is; labeling it is over-scrubbing
```

The verdict is **PII**, **Possibly PII** or **Not PII**, with the reasons from the rules, the model and the knowledge
base. When nothing is found, no card appears. It is a suggestion only and never changes a label. Click anywhere, press
**Esc** or scroll to close it.

In the **reviewed (right)** document, where you select text to label it, only a one-line chip appears *above* the
selection ("● PII — Person Name") and fades after a few seconds, so the site's own label popup stays free. To switch
both off, untick **Check selected text** in the extension options.

### Labels: 13 labels or one per PII type
Most tasks use the site's 13 labels (Person Name, Credentials…). Some tasks list every PII type instead
(Indian Aadhaar Number, Stripe Key, Indonesian NIK… — the team's *Complete PII Type List*). On those the
assistant uses one label per type: the highlights, tags and findings name the type, and a label on the right is
checked against it. The general label is accepted ("Credentials" on an Aadhaar number — the finding names the
specific type); a different type of the same family ("Indian PAN (Business)" on an individual's PAN) is a wrong label.

- **Standard version:** switches by itself when the task's label list names the types. Options → **Labels** can
  force either way.
- **PII Types version** (`pii-review-assistant-types-…-model.zip`): always one label per type. Install **only one**
  of the two versions; if both are installed, the first one to load runs and the other stays quiet.

Out of scope, as in the list: date of birth, postal code, Indonesian kode pos, Brazilian CEP; a pincode, state, city or
country on its own is not PII. Inside a full address the pincode stays part of the Address.

### Names list
`data/names.js` (committed) holds common first names and surnames from Wikidata (including the words of the full names of
people with Indian citizenship), so names are found with no title or
field in front. To refresh it: `npm run build-names` (about a minute, needs internet). Words that are also ordinary
English ("Will", "Grace") are kept in a separate list and count only in a clear context; edit `AMBIGUOUS` in
`scripts/build-names.js` to add more.

### Knowledge base (offline)
When the extension was built with `npm run build-kb`, it knows about 45,000 companies and 52,000 public figures
(Wikidata) and the 100,000 most visited websites. Nothing is looked up online while you review.
- A **well-known company** (for example Tata Consultancy Services) counts as a public name, like the business names
  list: not PII, and labeling it shows the over-scrubbing note. A smaller company it knows makes a Business Name surer.
- A **public figure's** name stays a Person Name; the finding just says **[also a public figure]** — many people
  share famous names.
- A popular website's **homepage** (`https://www.infosys.com/`) is not a URL/Link; any other path still is
  (`linkedin.com/in/…`).

The options page shows what the knowledge base holds and when it was built.

### Model suggestions (beta)
An optional on-device model adds suggestions for **person names, company names, addresses and usernames** —
the labels the rules miss most (lowercase names, names with no "Mr." or "Name:" in front, other languages).
It runs inside your browser; the document never leaves your computer.

- **Install:** the model is not in the code on GitHub (it is 349 MB). Use the release package — see
  [INSTALL-MODEL.md](INSTALL-MODEL.md) — or run `npm run setup-model` in a clone.
- **Switch it on:** right-click the extension icon → **Options** → **Use model suggestions**. **Test the model**
  there loads it and shows what it finds in a sample. Your organisation may switch it on or off for everyone.
- **What changes:** the rules' result appears at once, as before. A few seconds later the model's suggestions are
  merged in and the panel updates. Findings from the model say so: `Person Name [model, 82%]`. When the model
  disagrees with a rule, the rule's label stays and the finding says `[model suggests Business Name, 70%]`.
- **What the model never does:** change an ID, key, account, phone, email or plate (the rules' format checks win),
  or flag a header, a field label, a Department / Status value, a department name or a well-known company.

The panel's notices show what the model is doing, and the review always carries on with the rules alone if it can't help:

| Notice | Meaning | What to do |
|---|---|---|
| Model: loading… | first use: the model loads (2–4 s) | wait |
| Model: checking names, companies and addresses… | running on this document | wait; the panel updates by itself |
| Model: done — 3 new findings, 2 possible, 5 confirmed | merged into the findings | review them like any other finding |
| Model: checked part of a large document… | stopped after 60 s; the rest is rules only | review the rest by hand as before |
| Model not installed in this build | the extension was built without the model files | ask your admin (`npm run setup-model`, or a `--with-model` build) |
| This browser cannot run the model | no WebAssembly | use an up-to-date Chrome |
| Model failed / took too long | it could not load or answer | open the extension options → **Test the model**; the message there says why |
| Model unavailable — reload the page | the extension was updated or reloaded under the open page | reload the page |
| Document too large for the model | over 2 million characters | rules only |

Speed (Chrome on a 10-core Mac): loading 2 s; about 4 ms per word with 8 threads, about 20 ms with one. Repeated
lines (logs, tables) are checked once. Memory: about 400 MB while the model is loaded; it is freed after 15
minutes without use.

### Agent mode (preview)

Off by default: switch it on in the extension **Options → Agent**, then reload the task page. An **Agent ✦** tab
appears next to L1 and L2.

- The agent labels the **right** document by itself and draws each proposed label on it: **dashed** = waiting for you,
  **solid** = you approved it, **struck through** = to remove (e.g. a Date or a well-known company labeled on the right).
  The value on the current card is yellow.
- Answer one card at a time: **Y** Yes · **N** No, then **1** Not PII, *Other label…* or **3** Fix span (select the
  right text in the document and press **Enter**) · **J / K** next / previous card · **Enter** show it in the document.
- **Approve all** approves the high-confidence e-mails, phones, IDs, keys and accounts in one click — read the list
  above the button first. Names, companies and addresses always get their own card.
- The two last cards ask whether anything is still unlabeled, and whether any label looks unexpected.
- The summary shows how many labels are approved, changed, removed and still open.

**Preview:** nothing is applied on the site and nothing is submitted. Label on the site yourself as usual; a later
version applies the labels you approved, through the site's own label popup (never with "Annotate matching entries").

### Your version, reporting problems, saving tasks
- The panel footer shows your version (**v2.1.0 beta 6**). When asked "are you updated?", look there.
- **Report a problem:** open a finding's **Details** → **Report a problem**, or press **Report** on the
  select-text card (for PII the assistant missed). A small `pii-report-….json` file is saved to your Downloads —
  send it to the maintainer. It holds the finding and a few lines around it.
- **Save task for testing** (panel footer): after deciding a task, saves the original document and your answers
  (labels, Yes / Not PII) as `….pii-task.json`. These become test data that measure the assistant on real work.

Nothing is sent anywhere by the extension: these are files on your computer. They contain document text, so share
them only inside the team and delete them when done.

---

## 3. For maintainers

### How the page layout is found
In this order:
1. A **saved setup** for this site (`chrome.storage.local`, key `piira.setup.<host>`, selectors only).
2. The selectors in **`selectors.js`**.
3. **Auto-detect** (`core/autodetect.js`). It looks for two side-by-side, non-nested elements whose
   words mostly match (at least 35% word overlap; it prefers the pair covering the most text,
   then the closest match, then the tightest box). In the right panel, it then finds the most
   common way labels are marked:
   - an attribute whose value is a label name (`data-x="PERSON_NAME"`),
   - a class with a label-name suffix (`ann--person-name`),
   - or a small child element with the label text.

If a saved setup stops matching after a site update, the extension falls back to auto-detect by itself.

### Shipping a fixed setup: `selectors.js`
You only need this to give everyone the same setup without clicking.
All page-specific defaults live in **`selectors.js`**:

| Setting | What to put there |
|---|---|
| `leftDocument` / `rightDocument` | CSS selectors for the two document containers. |
| `rightLabelSpan` | Selector for labeled PII spans on the right. |
| `labelNameAttributes` / `labelClassPrefixes` | Where the label name is stored on a span (an attribute or a class prefix). |
| `labelAliases` | Map the site's label names (e.g. `PERSON_NAME`) to the extension's names. |
| `ignoreInText` | Elements inside the documents whose text isn't document text (badges, × buttons). |
| `placeholderPattern` | Regex for placeholder text like `[PERSON_NAME]` on the right. |
| `taskRoot`, `watchAttributes`, `waitForTaskMs`, `debounceMs` | Watching and timing. |

> The default selectors match `test.html`. On peaktalent.ai, auto-detect and click setup are used.
> The domain is set in `manifest.json` (`https://*.peaktalent.ai/*` in both `host_permissions`
> and `content_scripts.matches`).

Each selector entry is a list. Entries are tried in order, so an old selector can stay as a fallback.

Both styles of reviewed document are supported:
- **Span mode:** the original text is kept and wrapped in a labeled element.
- **Placeholder mode:** the text is replaced by `[LABEL]`, with or without a wrapping element.

### Test without real data
`test.html` imitates the task page with dummy data. It has two tasks (span style and
placeholder style), a fake label toolbar, a **Next task** button, and a Submit button that the
extension never touches. It loads the extension's scripts directly, so no installation is needed:

```bash
cd pii-review-assistant && python3 -m http.server 8765
```

Then open <http://localhost:8765/test.html>.

**Issue-bucket test set:** open <http://localhost:8765/test.html?set=buckets>. It has six tasks, one per
L2 issue bucket: PI leakage, unstructured, other language, unknown text, incoherent, and data type /
sensible replacement. Each shows an **Expected** box above the documents to compare with the panel.
The same tasks are checked automatically by `tests/buckets.test.js`. Add new cases in `tests/bucket-tasks.js`.

To test stability on a busy page, add `?noisy=1`. This adds a ticking clock, constant class changes,
and a **Simulate re-render glitch** button. The panel should not redraw or flicker.

To test auto-detect and click setup on markup the extension has never seen, open
<http://localhost:8765/test.html?layout=unknown>. That version has no ids, generated class names,
and labels stored as classes.

### Large documents
The extension is built for long tasks with thousands of labels:
- **Speed:** detection and comparison use sorted lookups, not every-item-against-every-item
  checks. In Node, a 1.65-million-character document with about 35,000 labels takes about
  0.4 s to detect and 0.3 s to compare. Run `node tests/bench.js 5000` to measure.
- **Reuse:** when only the right side changes (e.g. you add a label), the left detections,
  the word split and the left/right word alignment are reused. Only the document that changed
  is re-read.
- **No freezing:** detection and comparison run in small steps (about 25 ms each), so the page
  keeps responding. An older run stops as soon as a newer change arrives. "Updating…" appears in
  the panel header if it takes longer than 0.3 s.
- **Colours:** Chrome slows to seconds per update when many thousands of text highlights exist.
  So for documents with more than 1,500 highlighted items, only the part on screen plus two
  screens above and below is coloured, and the colours follow your scrolling.
- **Panel:** findings are shown 100 at a time, closed sections aren't drawn, and search waits
  until you stop typing.

To try it in the browser, open `test.html?records=5000`. That's 5,000 dummy records, about
1.4 million characters and 35,000 labels.

### Unit tests
These need Node 22 or newer and have no dependencies.

```bash
npm test
```

There are at least 3 positive and 3 negative examples for every detector, plus tests for overlap
resolution, alignment and classification.

### Releases (one command)
Needs `gh auth login`, `npm run setup-model` and `npm run build-kb` once.

```bash
npm run release -- --next --dry-run   # shows the next version and the "what's new" lines
npm run release -- --next             # bump beta, test, build with the model, publish to both repos
```

It refuses to run with uncommitted changes or off `main`, runs the tests and release checks, pushes `main` to every
repo in `package.json` → `piira.releaseRepos`, creates the `ml-beta-N` pre-release with the zip and checksum, and
prints a message to paste to the team. "What's new" comes from the CHANGELOG lines added since the previous beta, so
write the CHANGELOG as you go. For automatic updates (no unzipping), see [DEPLOYMENT.md](DEPLOYMENT.md).

### 13-label benchmark
`npm run label-bench` scores the rules and the model on realistic documents in `tests/fixtures/label-bench/`
(`docs.json`, and `holdout.json` written separately to check that fixes generalise): found, correct when flagged,
and every miss, false alarm and wrong label. Mark values as `{{Person Name|Ravi Kumar}}`; split secret-shaped test values
with `<SPLIT>` so GitHub never sees them whole. The rules' part also runs in `npm test`.

### Scoring on real tasks
Collect the files reviewers saved, then:

```bash
npm run score     # imports *.pii-task.json from ~/Downloads (or: npm run score -- <folder>) and scores
npm run reports   # summarises pii-report-*.json into ml/reports.md
```

Saved tasks are imported once into `ml/eval-data/real/` (git-ignored). Answers are partial — a reviewer decides only
some findings — so a hit counts only against confirmed PII, a false alarm only when it overlaps text marked
Not PII, and everything else is reported as **Unverified**. The full table is in `ml/eval-report.md`.

### How it works

```
Finding the documents
  selectors.js, core/config.js       page setup: selectors.js defaults, saved setup (selectors only)
  core/layout.js                     saved setup → selectors.js → auto-detect (core/autodetect.js)
  core/dom.js, core/text-model.js    the two panels; DOM → plain text + offset map (no DOM changes)
  core/page-watcher.js               re-check when a document changes (debounced)

Analysing
  core/labels.js                     the guide's 28 entities, groups, colours, project rules
  detectors/*.js                     one detector per entity family (regex + heuristics)
  core/known-names.js                names from data/business-names.json (not PII)
  core/engine.js                     run detectors, resolve overlaps (longer > more specific > confidence)
  compare.js                         read labels, word-level diff (Myers), label comparison
  identify.js                        L1 · Identify checklist (Personal / Business / Credentials)
  redaction.js, core/redaction-rules.js
                                     L2 · Verify: leakage, coherence, data type, sensible text,
                                     unknown text, other language, unstructured text

Showing
  highlight.js, highlight.css        colour overlays (CSS Custom Highlight API; text never modified)
  panel/panel.js, panel-styles.js    Shadow-DOM side panel
  panel/decisions.js                 the L1 / L2 questions and what each answer means
  panel/picker.js                    three-click manual setup
  content.js                         wires everything together
```

`manifest.json` is the only list of these files and their order; `test.html` and the unit tests load them from it.

Each detection has the form `{text, label, start, end, confidence, source: "regex"|"heuristic", rule}`.
Anything with confidence below 0.7 is reported as **Needs review**.

### Privacy and safety
- Permissions: `host_permissions` for peaktalent.ai, plus `storage` (page setup, stage, model option) and
  `offscreen` (the optional on-device model's hidden page). No `tabs`, network or other permissions.
- `fetch` only loads the extension's own files. Findings, ticks and document text live in memory only.
- During click setup, the reviewer's clicks are intercepted so the site doesn't react to them.
  Clicks and typing inside the panel don't reach the site's own listeners.
- Document text is handled purely as data (regex input, `textContent`). Instructions written
  inside a document are ignored.
- The extension doesn't call `click()`, `submit()` or `dispatchEvent()` on the site's elements.
