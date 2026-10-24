# Hybrid model: prototype and evaluation

Rules (the extension's detectors) + the GLiNER model for names, companies, addresses and usernames.
This folder is **not** part of the extension package; the merge logic it tests is `core/hybrid.js`.

```bash
cd ml
npm install
npm run fetch-model          # 349 MB, pinned revision, SHA-256 checked, into models/ at the extension root (git-ignored)
node make-synthetic.js 200   # synthetic tasks with exact gold labels
node eval.js                 # rules vs model vs hybrid -> eval-report.md
node eval.js --sweep         # try merge thresholds
node eval.js --settings '{"add":0.2,"min":0.15}' eval-data/real
```

## Exporting real tasks for evaluation

Put each task in its own folder under `ml/eval-data/real/` (git-ignored — **replace real PII with fake
values first**, or keep the folder only on your machine):

```
ml/eval-data/real/
  task-0001/
    left.txt     the original document, as plain text (copy from the LEFT panel)
    gold.json    the correct labels, on left.txt
    meta.json    {"fileName": "by-pii-type~~us_itin~~tax_ids_0003.csv"}   (optional)
```

`gold.json` lists every Person Name, Business Name, Address and Person Username in `left.txt`
(other labels may be listed too; they are ignored for now):

```json
[
  { "label": "Person Name", "text": "Kavita Kavita" },
  { "label": "Address", "text": "214/09 C-3 BLOCK, GOVIND NAGAR, NEAR MOTILAL\nNEHRU SCHOOL\nKanpur Nagar, Uttar Pradesh - 208011" }
]
```

`start` / `end` (character offsets in `left.txt`) are optional. Without them, each entry is matched to
its first unused occurrence in the text (run `node add-offsets.js eval-data/real` to fill them in and
check every text is found).

A prediction counts as correct when it has the same label and overlaps the gold span by at least half of
the shorter one; the report also counts exact-span matches.

## Findings so far

- GLiNER.js 0.0.19 corrupts results when several texts are batched in one call: the runner sends one
  window at a time. Its word splitter ignores line breaks: windows are whole lines and spans are cut at
  line breaks.
- The int8 model gives low scores (a clear name at ~0.3), so the merge uses `add: 0.2`.

## In the extension

`npm run setup-model` (repository root) copies ONNX Runtime Web into `vendor/ort/` and the model into
`models/multi_pii/`. The model runs in `offscreen/` (same `gliner-core.js` as `gliner-runner.js` here), opened by
`background.js`, called from `core/model-client.js`, merged by `core/hybrid.js`. `ml/browser-test.html` runs the
real offscreen scripts in a normal browser tab: serve the repository root (with COOP/COEP headers to test threads)
and open `/ml/browser-test.html`.

Measured in Chrome 152 on a 10-core Mac: load 2.1 s; 20 ms per word with one thread, 5.5 ms with four,
4.0 ms with eight.
