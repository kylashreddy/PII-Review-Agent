# Changelog

## Unreleased

- **Agent mode (preview, off by default):** Options → Agent adds an **Agent ✦** tab. The agent proposes every label
  for the right document and draws it there as pending (dashed underline in the label's colour; solid once approved,
  struck through when it should be removed). The panel asks one Yes / No card per label and question, in the order
  Unsure → Leaks → Medium → High, then two document questions: **Y** yes, **N** no (then **1** Not PII · Other label ·
  **3** Fix span), **J / K** next / previous, **Enter** show it in the document. "Approve all" covers only fixed-shape
  values the agent is ≥ 90% sure of, with the list in view; a value left unchanged on the right never joins it. The
  summary ("27 labels · 14 approved · 1 changed · 0 removed · 12 open") says when every card is answered.
  Nothing is applied to the site and nothing is submitted yet: applying approved labels is the next step.
  Test it on `test.html?agent=1`.

- **The 13 labels first:** the normal version always uses the site's 13 labels (Options → Labels can still choose
  "Automatic" or one label per type). A new benchmark checks all 12 PII labels on realistic documents
  (`npm run label-bench`; Date is out of scope), and runs as part of `npm test`. Fixed on the way:
  - "Amount: Rs. 1,45,000. Transferred to … account 5020…" — a non-PII field no longer swallows the rest of the line,
    which hid account numbers, IFSC codes and names on lines that start with "Amount:", "Status:" and the like.
  - A connection URL in quotes (`DATABASE_URL: "mysql://user:pass@10.20.30.40/db"`) is found whole (its IP is part of it).
  - Bank statement narrations: "NEFT-SURESH BABU-SALARY", "IMPS/ANJALI MEHRA/60123456789" (name and account);
    "ATM WDL MG ROAD BANGALORE,ATM778812,5000.00" gives the address "MG ROAD BANGALORE".
  - Usernames given in a chat answer ("share your username?" … "sure, it is ravi_k92"); "my github is shrutiiyer-dev".
  - Companies named like their e-mail or web domain ("Sunrise Textiles" + sunrisetextiles.com), made-up names before
    Hospitals / Technologies…, State Bank of India and other big banks are public names.
  - Not PII any more: job titles ("Senior Analyst"), Kubernetes names (`name: payments-secrets`), container images
    (`registry.acme.com/app:1.4.2`), a model / product column read by the model ("Creta"), example Sentry addresses.
  - A password ending in "!" keeps it.

- **Person names, shown right:** chat speakers ("Kiran Kumar: …", "[12/03/23, 9:17 PM] Lalitha Aunty: …"), names after
  roles ("Agent Divya" → Divya; the model's span is trimmed too), "Divya ji", "Lalitha Aunty" (the honorific is left
  out). Not names any more: a city column read by the model ("Chennai"), git dates ("Tue Mar"), "Smt" alone,
  Hinglish words ("Mera"). Shops named after a family ("Gupta Electricals", "M/s Ravi Traders") are Business Names.
- **More links:** JSON with escaped slashes (`https:\/\/www.linkedin.com\/in\/…`), `file:///C:/Users/ravi.kumar/…`,
  subdomain hosts ("app.acme-corp.com", "shop.ravitraders.in"), git remotes (`git@github.com:acme/payments.git` — a link,
  not an e-mail), and links in JSON text stop at a written `\n`. Code such as `user.profile.id` is not a link.

- **Links found properly:** a domain alone where the text says it is a site ("Portfolio: priyasharma.dev",
  "Website:- www.…"), short links (bit.ly/…, forms.gle/…), links in capitals, `s3://` / `gs://` / `sftp://` links,
  links broken across two lines (joined into one), and internal company tools ("intranet.acme.local/hr/payslips") are
  URL/Link. A meeting link keeps its query ("zoom.us/j/…?pwd=…" is one link, not a link plus a password). A dev server
  (`api.local:8080`), localhost, and words like "done.in" or "node.js" are not links.
- **PII Types:** a broad label on the right ("Credentials" on an Aadhaar number) is accepted as correct; the finding
  notes the specific type. A different type of the same family is still reported. The pincode stays part of the address.

- **PII Types version** (new package `pii-review-assistant-types-<version>-model.zip`): one label per PII type from the
  team's Complete PII Type List — Indian Aadhaar Number, Indian PAN (Individual), Stripe Key, Indonesian NIK, US Social
  Security Number… (72 types; DOB, postal code, kodepos and CEP stay out of scope). Findings, highlights, label tags and
  the panel use the type; labels on the right are checked type by type ("Labeled Credentials (the general label); this
  task's list has the specific label Indian Aadhaar Number"). The model and knowledge base work as before.
- **Standard version:** labels on the right named after a PII type ("Indian Aadhaar Number", "Stripe Key") are now
  recognised (they were "Unrecognised label name"), and a task whose label list names the types switches to one label per
  type by itself. Options → **Labels** can force 13 labels or one label per type.
- "PIN: 560038" next to an address is a postal PIN code, not a password.

- **Indian names, whole and in any case:** names with initials first or last ("K Rahul Sai", "B. Ashritha", "Juhi G",
  "K. Venkata Ramana Rao"), surname first ("Busireddy Kylash Reddy", "Kolli Sai Teja", "Gaddam Vamshi Krishna"), in
  lower case ("signed: ravi kumar") or capitals ("PRIYA RAMAN") are found with their full span; a full name under a
  JSON `user` key is a Person Name, not a username. The names list now also reads the full names of 90,000 people with
  Indian citizenship on Wikidata (18,000 first names, 24,000 surnames). Building and place names ("Manandi Plaza",
  "Madhya Pradesh"), address lines and Hinglish ("abhi tak") are not names. Synthetic eval, Person Name with the model:
  92% → 94% found, still no false alarms.

- **Select-to-check is quieter:** no card when nothing is found ("No PII found" is gone). On the right document, where
  reviewers select text to label it, only a one-line chip appears above the selection and fades after 3 seconds — the
  site's Cancel / Apply popup is never covered.
- **Spreadsheets shown as pipe tables** (`| R000003 | Support | A6286257 | escalated |`, with or without a header row)
  are read as tables: in an `id_passport` task the passport column is found, the record-id column (`R000003`…) is not PII.

- **Person names without "Mr." or "Name:"** — a names list (11,000 first names and 19,000 surnames from Wikidata,
  with good coverage of Indian names) lets the rules find "Suresh Patel", "Ami Babu T C", and single names where a
  person is meant: "Thanks Rohan", "Gupta sent the invoice", "ask Sneha to review", "Kavya and Arjun are on leave".
  A part of a found name ("Priya" after "Priya Raman") is now reported, not just "possible". Names that are also
  English words ("Will", "Grace", "Day") need a clear context; company and place names that contain a personal name
  ("PT Sinar Jaya Abadi", "Bharat Petroleum Corporation", "Gandhi Nagar", "Prepared by: Field Services") are not
  people; "Kind Regards" / "Good Morning" after a sign-off are not names. Synthetic eval, Person Name with the model:
  71% → 92% found, 98% → 100% correct.
- **Speed fix:** a long run of `*` or `x` (markdown rules, masked text) could freeze the page in the bank-account check.

- **E-mail names:** a display name before an address (`"Ami Babu T C" <ami.babu@valueleaf.com>`, `From: Ravi Kumar <…>`)
  is a Person Name, initials included, and its other appearances (the signature) too. Team mailboxes
  ("Support Team", "HR Desk") are not people.
- **Company names with a region:** "Valueleaf Services (India) Pvt. Ltd." is found whole.

- **L2 · Verify shows only what still needs work:** values already replaced correctly on the right are no longer
  coloured on the left; leaks, partial leaks and unsure values still are.
- **Mailbox label exports:** the `"name"` of a Gmail label or folder (`{"id":"INBOX","name":"INBOX"}`, `SPAM`,
  `CATEGORY_SOCIAL`, a user label such as "Receipts") is not a Person or Business Name — neither for the rules nor the model.

- **Fixes from the team's testing sheet** (all kept as tests in `tests/fixtures/tester-issues/`):
  `auth.json`, `report_final.pdf` and other file names are never usernames; Java/TypeScript annotations
  (`@Configuration`, `@Autowired`, `@Input()`) and form words (`name`, `street`, `zipcode`, `form.street`,
  `<input name="city">`) are not names or addresses; `%APP_SECRET%` (Windows variables) is not a credential;
  "Annotate Here" is not a person; "Our Premium Support Services" is a description, not a company.
- **Name handles:** once "Bharat Gangaiah" is in the document, `bharat.gangaiah`, `bharat_gangaiah`,
  `bharat-gangaiah` and `gangaiah.bharat` are Person Usernames (the e-mail stays an Email Address).
- **Hex keys:** a 32–128 digit hex value named as a key, secret, token, salt, HMAC or signature
  (`hmac_key = 9f86d0…`, `session token 5d4140…`) is Credentials. Commit ids and file checksums are not.

- **Version in the panel:** the panel footer and the options page show the version (v2.1.0 beta 6).
- **Report a problem:** in a finding's Details, and **Report** on the select-text card, save a small report file to
  send to the maintainer (`npm run reports` lists them all).
- **Save task for testing** (panel footer) saves the task and your answers; `npm run score` measures the rules, the
  model and the hybrid on these real tasks (partial answers are counted fairly: unchecked findings are "unverified").
- **One-command releases** for maintainers: `npm run release -- --next`.

- **Profile links:** a link whose personal part was replaced (`linkedin.com/in/priya-sharma-92` →
  `linkedin.com/in/meera-joshi-41`) is redacted correctly, no longer "partly redacted": the site of a profile platform
  (LinkedIn, GitHub, X, Instagram…, or a popular site from the knowledge base) is structure. Keeping the personal part,
  or a personal domain (`ravikumar.dev`), is still a leak.

- **Check selected text:** select any text in either document and a small card under it says whether it is PII
  (PII · Possibly PII · Not PII · No PII found) and why — the rules, the model and the knowledge base — e.g.
  “Not PII — public name: Tata Consultancy Services, well-known company”. A selection inside a word or a name is read
  as the whole word or name. Closes on click, Esc or scroll; never changes a label. Option: “Check selected text” (on).
- Knowledge base notes now show under **Details** in the panel (“Also the name of a public figure…”, “A known company…”).

- **Offline knowledge base (optional):** `npm run build-kb` downloads public lists once into `data/kb/` —
  45,000 companies and 52,000 public figures from Wikidata, the 100,000 most visited websites (Tranco). Nothing is
  looked up online while reviewing. Well-known companies (Wikipedia in 25+ languages, e.g. Tata Consultancy
  Services) are public names like the business names list; any company in the base confirms a Business Name (also
  the model's); a public figure only adds "[also a public figure]" to a Person Name; a popular website's homepage is
  not a URL/Link (other paths still are). No new options — one status line on the options page.

- **CSV exports:** "Shipping Company" / "Billing Company" column headings are no longer Business Names (the words in
  front of "Company", "Services"… are checked against the heading vocabulary). CSV files whose quoted cells hold line
  breaks (a multi-line Notes column) are now read as tables, so their header row is never PII.

- **Code and config files:** `password = os.getenv(…)`, `user=user`, `token: ${API_TOKEN}`, `$DB_PASSWORD`, `<password>`,
  `config.token` and file names such as `secret-token.txt` are not credentials or usernames; role handles (`@cto`,
  `@devops`) are not usernames. Secrets under prefixed names are now found: `DB_PASSWORD=…`, `STRIPE_SECRET_KEY=…`.
- **Localhost is not PII:** `localhost`, `127.x`, `0.0.0.0`, `::1`, `*.local`, `*.internal` are neither URL/Link nor
  IP Address (other private IPs still are).
- **The review site's panel headings are not document text:** `right.gitignore-3143dca5`, "Annotate here",
  "Reference · read-only", "20 annotations" are skipped, so they are no longer marked as changed.
- **Model suggestions in code** (identifiers, values next to `=` / `(` / `.`, roles, panel headings) are dropped.
- Names in capitals after "MR." / "Ship To:" / "NAME:" stop at ordinary words ("RAVI KUMAR WILL ATTEND" → "RAVI KUMAR").

- **"@" in code is not a username:** CSS / Tailwind at-rules (`@tailwind`, `@apply`, `@media`, `@font-face`), Sass
  (`@include`, `@mixin`), doc-comment tags (`@param`, `@returns`, `@ts-ignore`), decorators and annotations
  (`@Component(…)`, `@staticmethod`, `@Override`), `/*@__PURE__*/`, quoted `"@word"` strings in code, and escaped
  package scopes. The "username:" rule also ignores code (`const username = url.username`, `user: null`). Real projects:
  50 false usernames in 428 code files → 0; handles in prose ("Follow @ravi_k92") and data fields are still found.

- **Funding links are not PII:** open-source funding pages in package files (`github.com/sponsors/…`, Open Collective,
  Tidelift, Patreon, Ko-fi, `?sponsor=1`, `…/funding`) are never URL/Link, also under a JSON `"url"` key (the field rule
  now uses the same public-URL exceptions as the URL detector). Real package-lock.json files: 133 and 74 findings → 2 and 0.

- **Lock files and package manifests:** no more over-scrubbing in `yarn.lock` / `package-lock.json` (a yarn.lock went
  from 199 findings to 0). Package-registry URLs (npm, yarn, PyPI, Maven, NuGet, Go, crates.io…) are never URL/Link PII;
  npm scopes (`@adobe/…`, `@vite-pwa/…`) are not usernames; a package such as `user-home` is not a "user" field; and an
  all-capitals banner ("THIS IS AN AUTOGENERATED FILE") is not a Person Name — capitals count as a name only after a
  field such as "NAME:".

- **Invoice and form headings are not PII:** "Goods and Services", "Delivery Note", "Mode/Terms of Payment",
  "Godown", "Reference" no longer become Business Names or part of an Address (`P.DOC_WORDS` in `core/labels.js`,
  used by the rules and the model merge). "Address:R/at No. 33/1, Adur Village" (label stuck to its value) is found,
  and an address with several street words ("St. Marks Rd, Shanthala Nagar, Ashok Nagar") is reported.

- **Label names on highlights:** every value found in the original document shows a small tag with its
  label above it (“Person Name”, “Address · model”), in the label's colour. Drawn over the page, never in it;
  follows scrolling; hides with the highlights or a hidden label. Switch: extension options → Highlights.
- Model suggestions now use the tuned cut-offs (0.15 / 0.2): with the old ones almost nothing from the
  model reached the panel.

- **Model suggestions (beta, off by default):** an on-device model (GLiNER, `gliner_multi_pii-v1`) adds
  person names, company names, addresses and usernames the rules miss, merged with the rules
  (`core/hybrid.js`). It runs in a hidden offscreen page with ONNX Runtime Web and never sends text anywhere.
  Switch it on in the extension options (or by policy: `model` = `user` / `on` / `off`); **Test the model** there
  shows its status. Every problem (not installed, failed to load, too slow, too large, extension reloaded) leaves
  the rules' result and says why in the panel. Install with `npm run setup-model`; build with `npm run build:model`.
  New permission `offscreen`, a background worker, WebAssembly and cross-origin isolation for extension pages only.

- **Address and name detection:** table headings no longer override a detected address with a
  person or business name. Consignee address cells keep their Address finding, postal codes remain
  out of scope, and department names such as Finance Department or Product Engineering are not
  mistaken for people.
- **Tables, JSON and the task's file name:** values are typed by their column header, JSON key or field label
  (`nomor_kk`, `us_bank_number`, `पासपोर्ट`), and the file name (`by-pii-type~~us_itin~~…`) is used as a strong hint for
  the label. Fixes correct replacements in CSV/JSON being reported as Overscrubbed, unchanged wallets/ITINs/KK numbers
  not reported as leaks, and US passport / KK labels not suggested.
- **Never flagged:** department names ("Field Services", "People Ops"…), Department / Status / record id values,
  column headers and field labels ("Support Us Bank" is no longer a Business Name), commit hashes, UUIDs and git
  timestamps. CSV/JSON files are no longer reported as unstructured text.
- **Whole spans:** a key that keeps its vendor prefix is checked as one span (no more "SG" only); keys wrapped onto the
  next line are found; "DL 49 KL 4247" is a number plate, not "DL" + a licence; a value stops before the next field
  label ("… Status:"); a multi-line address block is one Address span with its landmark and PIN lines.
- New: ITIN (labeled US Social Security Number), author names in git logs (`Name <email>`), names under "Ship To:".
- A value replaced by another value of the same format is a correct redaction, not over-scrubbing. Leak findings now
  show the kind of PII too.
- Tests: regression fixtures for each reported bug in `tests/fixtures/`, and an edge-case sweep over every PII type,
  format and scenario (`npm run sweep`, report in `tests/fixtures/sweep-report.md`).

- **Movable PII button:** drag the PII button anywhere on the screen so it never covers the site's
  own buttons (or move it with Alt + arrow keys). Its spot is remembered; a short press still opens
  the panel, and it always stays on screen.
- **Overview first:** before the decisions, the panel shows a brief about the two documents (words and
  lines, PII found by group and the kinds found most often, labels or replacements on the right,
  language and structure) and every issue bucket with its open count. Click a bucket to filter to it.
- The panel no longer opens by itself. It starts closed as a small **PII** button in the bottom
  corner (red dot and issue count, green ✓ when nothing is left, grey before a task opens).
  Open or closed is remembered; nothing at all is shown on pages without a task.
- New look: the panel is a floating card with quieter header buttons, a segmented L1 / L2 switch,
  rounded section cards with count pills, and pill-shaped answer buttons (light and dark mode).
- Evaratus / scaler ai labs look, matching the Evaratus Review desktop app: black and white,
  the company wordmark with a "PII Review" badge, black filled controls (white in dark mode), and
  the Evaratus app icon. Label colours stay, since they match the highlights on the page.
- **New label set:** the review site's 13 labels (Account Number, Address, Business Name, Contact
  Number, Credentials, Date, Email Address, IP Address, Overscrubbed, Person Name, URL/Link, Person
  Username, Vehicle Number Plate) replace the 28 entities of the older annotation guide. Every
  finding also shows the kind of PII found, from the team's list of 78 types (for example
  "Credentials (Indian GSTIN)"). Older label names on the site are still recognised.
- **New detectors:** URL/Link (with a domain whitelist in `data/whitelisted-domains.js`), vehicle
  plates, GPS coordinates, crypto wallets, IMEI, passports, Indian GSTIN / TAN / CIN / UAN, US SSN /
  EIN / driver licence / bank routing, Brazilian CPF / CNPJ / RG / CNH / PIS / voter registration,
  Indonesian NIK / KK / NPWP / BPJS / NIP / SIM, and typed keys (Anthropic, GitLab, SendGrid, npm,
  PyPI, Sentry, AWS secret, `ASIA`, `xoxe-`, `github_pat_`), connection URLs with a password.
  Same-shape numbers are told apart by their field name or check digits, never guessed.
- **Out of scope:** dates (including dates of birth) and postal codes are no longer reported, and
  addresses no longer include the PIN code. A date or postal code labeled on the right is a possible
  overscrub that says why. `reportOutOfScope: true` in `core/labels.js` turns them back on.
- Removed: Transaction ID, Invocation ID, VPC ID, Card ID, Account ID and SHA/Hash Key detectors
  (not in the team's list).

## 2.0.0 — enterprise release

- Organisation settings through Chrome policy (`managed_schema.json`): switch the assistant
  off, default stage, a company-wide page setup, extra known names and a support contact.
- Release build (`npm run build`) with release checks: only the `storage` permission,
  only Peak Talent sites, no code that can reach the network.
- Icons, minimum Chrome version (105), deployment templates in `deploy/`.
- Automatic tests on every push; tagged versions are built and attached to a GitHub release.
- Fixed: labels added after a task opened with none were never read (auto-detected or saved setup).
- Resumes: a name alone on the first line is a Person Name; the handle in a profile link
  (`github.com/ravi-k`) is the username; "Information Technology" and similar fields of work are not a
  Business Name; a phone or account number that keeps most of its digits is a partial leak.

## 1.11.0

- Labels are read from the right document only; the left document is the raw original.
- Compact panel: one line per finding, full explanation under Details.
- Business names list (`data/business-names.json`) for Business Name and over-scrubbing checks.
