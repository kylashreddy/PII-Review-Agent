# Single-review rubric — autonomous annotation, one human check

Today: **L1** creates the labels → **L2** checks L1 → the team sends the task to the client.
New: the **agent** does both L1 and L2 on its own; **one human** answers Yes / No on what the agent did and then submits.
Nothing is ever submitted automatically.

```
1. Read both documents          left = original (reference) · right = the document to label
2. Annotate (L1 work)           label every PII value on the right, by the label rubric (Part A)
3. Self-check (L2 work)         compare left ↔ right, re-check every label by the review rubric (Part B)
4. Ask the human                one Yes / No card per label + a few document questions (Part C)
5. Submit gate                  Submit unlocks only when every card is answered (Part D)
```

---

## Part A — Label rubric (what the agent marks)

The site's labels: 11 PII labels to mark, plus **Date** (out of scope: never marked) and **Overscrubbed** (review only).

### A1. Rules for every label

1. **Exact span**: the value only. No field name ("Name:"), no quotes, no trailing comma or full stop.
2. **Every occurrence** is labeled on its own. Never tick "Annotate matching entries" — it labels text inside other words
   ("dukaan" inside "dukaanhelp").
3. **Never a part of a word** and never across two values.
4. **One label per value**: when two could apply, the more specific wins (an e-mail inside a URL is the URL; a password
   inside a connection URL is the connection URL → Credentials).
5. **Field names, column headers, JSON keys, code identifiers and variable references are never PII**
   (`name`, `email`, `$DB_PASSWORD`, `${API_KEY}`, `process.env.X`, `user.name`).
6. **Placeholders and examples are not PII**: `[NAME]`, `XXXX`, `example.com`, `test@test.com`, `<password>`, `localhost`.
7. **Public names are not PII**: well-known companies on the project's list (Google, Infosys, HDFC Bank, State Bank of India…)
   and popular websites' homepages.
8. **Out of scope, never labeled**: dates and dates of birth, a postal / PIN code, city, state or country on its own.

### A2. The labels

| Label | Mark | Do not mark | Span |
|---|---|---|---|
| **Person Name** | a real person's full name, or a first / last name alone when it refers to a person ("Thanks Rohan", "Gupta sent it"); names with initials ("K Rahul Sai", "B. Ashritha"); chat speakers | titles and honorifics (Mr., Smt., ji, Aunty), roles and job titles (Agent, Senior Analyst), departments, places ("Gandhi Nagar"), shops named after a family ("Gupta Electricals" → Business Name), weekdays and months | the name only: "Mr. **Ravi Kumar**" |
| **Person Username** | login names, handles, GitHub usernames (ravi_k92, @nitin_ops, "my github is shrutiiyer-dev") | code annotations (@Override, @media), npm scopes (@babel/core), file names, role mailboxes, a capitalised plain name | as written, with "@" if written |
| **Email Address** | personal and work e-mail addresses | the user part of a link (`https://key@host`), git remotes (`git@github.com:…`), example / test domains | the whole address |
| **Contact Number** | mobile, landline, toll-free, international numbers | order / invoice / reference numbers, amounts, dates, IDs | with its "+91" / spaces as written |
| **Address** | a street-level address: house / flat, building, street, locality, city | a city, state, country or PIN on its own; headings ("Billing Address:") | full address; in a multi-line address block the PIN stays in, in a one-line address it is left out |
| **URL/Link** | links of a person or organisation: profiles, documents, company sites and pages, internal tools, short links, `s3://`, `file:///`, git remotes | localhost / 127.0.0.1, dev servers with a port, example.com, package registries, a popular site's bare homepage, container images (`registry/app:1.2`) | the whole link, query included |
| **Vehicle Number Plate** | registration plates (MH12AB1234, KA 05 MN 4321) | model names, chassis numbers in other fields | as written |
| **Business Name** | companies, shops, firms, organisations that are not on the public-names list ("Zentrix Analytics Pvt Ltd", "Gupta Electricals") | well-known companies on the list, departments, generic phrases ("Goods and Services", "Customer Support") | with its legal ending (Pvt Ltd, LLP) |
| **Account Number** | bank account numbers, IBAN, IFSC, card numbers, UPI IDs (name@okicici), crypto wallets | amounts, reference / transaction numbers, record IDs | the number only |
| **Credentials** | government IDs (Aadhaar, PAN, passport, voter ID, GSTIN, driving licence, SSN, CPF, NIK…), passwords, API keys, tokens, private keys, connection URLs with a password | variable references, placeholders, commit hashes, checksums, public IDs | the value only; a connection URL whole |
| **IP Address** | IPv4 (public and private), IPv6, MAC addresses | version numbers, localhost / 127.0.0.1 | the address only |
| **Date** | — (out of scope) | every date | — |
| **Overscrubbed** | review only: a label on the right that is not PII | — | — |

### A3. When the documents differ (left original, right reviewed)

| Right side shows | Meaning | Agent action |
|---|---|---|
| same text as left | identify task | label the PII on the right |
| a realistic replacement (Ravi Kumar → Raj Mehta), same kind | redacted correctly | label the replacement with the original's label |
| the original unchanged where it should have been replaced | **leak** | label it and raise a **Leak** card (Part C) |
| a placeholder (`[NAME]`, `XXXX`) | not sensible | raise a card; do not label the placeholder as PII |
| a replacement of a different kind (phone → name) | wrong data type | raise a card |
| something that was not PII changed | over-redacted | raise an **Overscrubbed** card |

---

## Part B — Self-check rubric (the agent's own L2)

After annotating, the agent re-checks every label and the whole document. Each label gets a status:

| Check | Pass when | Else |
|---|---|---|
| **Is it PII?** | the value fits the label's definition (Part A2) and is not in a "do not mark" row | remove the label, or keep it as **Unsure** |
| **Right label?** | no other label fits better (A1 rule 4) | change the label |
| **Right span?** | exactly the value (A1 rule 1) | fix the span |
| **Consistent?** | the same value has the same label everywhere in the document | fix all occurrences |
| **Left ↔ right agree?** | the right-side text maps to the same value on the left (A3) | raise the matching card |
| **Nothing missed?** | a second pass over the left document finds no unlabeled PII | label it |

Confidence per label (shown to the human):
- **High (≥ 90%)**: fixed-shape values (e-mail, phone, IP, card, keys with vendor prefix, IDs that pass their checksum), or
  rules and model agree.
- **Medium (70–89%)**: names, companies and addresses found from context.
- **Unsure (< 70%)**: the agent does not label it; it asks the human (Part C, "Possibly PII").

---

## Part C — Human verification (Yes / No)

The human sees the document with every agent label and a queue of cards. Order: Unsure → Leaks → Medium → High.

### C1. Label cards (one per label)

```
"Ravi Kumar Sharma"            Person Name · 86% · line 3
Original: Name: Ravi Kumar Sharma        Right: Name: Ravi Kumar Sharma
Is this a Person Name, with this exact span?        [ Yes ]  [ No ▾ ]
                                                     No → Not PII · Other label… · Fix span
```

- **Yes**: keep. **No**: one more click — Not PII (removes it), another label (changes it), or fix the span.
- **High-confidence group**: "Approve all 18 high-confidence labels (e-mails, phones, IPs, keys)" — one click, but the list is
  shown and any row can be opened. The human still approves them; nothing is approved silently.

### C2. Question cards (things the agent could not decide)

| Card | Question |
|---|---|
| Possibly PII | "Is ‘Cloudnine’ PII? If yes, which label?" — Yes + label / No |
| Leak | "‘ravi@gmail.com’ is unchanged on the right. Is that a leak?" — Yes / No |
| Wrong replacement | "‘+91 98450 12345’ was replaced by ‘Raj Kumar’ (a name for a phone). Accept?" — Yes / No |
| Over-redaction | "‘Customer Support’ was changed on the right but is not PII. Mark Overscrubbed?" — Yes / No |

### C3. Document questions (always, last)

1. "Skim the highlighted document: is any PII left unlabeled?" — No / Yes → label it.
2. "Any label you did not expect (a heading, a code word, a well-known company)?" — No / Yes → open it.

---

## Part D — Submit gate

**Submit** stays locked until:
- every label card and question card has a Yes or No;
- the two document questions are answered;
- no label is left "Unsure".

The summary next to Submit: "42 labels · 39 approved · 2 changed · 1 removed · 0 open · checked by <reviewer>".
The agent never presses Submit; the reviewer does.

---

## Part E — Quality scoring (for audits and the client)

Each submitted task can be scored against a gold version (a second reviewer, or the client's feedback).

| Severity | Error | Examples |
|---|---|---|
| **Critical** | a missed or leaked secret / ID / account | password, API key, Aadhaar, PAN, bank account, card |
| **Major** | a missed or leaked personal value; a label in the wrong group | name, e-mail, phone, address missed; a name labeled Credentials |
| **Minor** | a span off by a few characters; a wrong label in the same group; an over-label | "Mr. Ravi" instead of "Ravi"; Contact Number vs Account Number on a phone; "Customer Support" labeled |

**Pass**: 0 critical, at most 1 major, at most 3 minor per task.

Track per label, from the human's answers: **acceptance rate** (Yes ÷ cards). A label whose acceptance rate stays ≥ 98% on
real tasks may move to the "Approve all" group; one below 90% goes back to individual cards and its rule is fixed.

---

## Agent output (what the UI needs)

```json
{
  "task": "rai_codebase~~DK1__TeamDukaan__bot9ai-v1~~playground~~dd.html-fdfbb819",
  "mode": "identify",
  "labels": [
    {"id": "L1", "label": "Person Name", "text": "Ravi Kumar Sharma", "right": {"start": 120, "end": 137},
     "left": {"start": 118, "end": 135}, "confidence": 0.86, "group": "medium", "why": "name after 'Name:'"}
  ],
  "questions": [
    {"id": "Q1", "kind": "possibly-pii", "text": "Cloudnine", "suggest": "Business Name", "confidence": 0.62}
  ],
  "checks": {"missedPass": true, "consistency": true}
}
```
