// Per-label benchmark for the site's 13 labels: tests/fixtures/label-bench/docs.json, realistic documents with every
// expected value marked {{Label|value}}. Reports, for the rules and (when installed) rules + model:
// found (recall), correct when flagged (precision), and every miss, false alarm and wrong label.
//   npm run label-bench            rules + model
//   npm run label-bench -- --rules rules only
const fs = require('fs');
const path = require('path');
const { P } = require('../tests/load');

// The offline knowledge base, when built (npm run build-kb), as in the extension.
(() => {
  const dir = path.join(__dirname, '..', 'data', 'kb');
  if (!fs.existsSync(path.join(dir, 'meta.json'))) return;
  const rd = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  P.kb.setData({ meta: rd('meta.json'), companies: rd('companies.json'), people: rd('people.json'), domains: rd('domains.json') });
})();

const LABELS = P.LABELS.map((l) => l.name).filter((n) => n !== 'Overscrubbed' && n !== 'Date');
const HAS_MODEL = !process.argv.includes('--rules') &&
  fs.existsSync(path.join(__dirname, '..', 'models', 'multi_pii', 'onnx', 'model_int8.onnx'));

function parse(marked) {
  const src = marked.replace(/<SPLIT>/g, '');
  const gold = [];
  let text = '';
  let last = 0;
  const re = /\{\{([^|}]+)\|([^}]*)\}\}/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    text += src.slice(last, m.index);
    gold.push({ label: m[1], start: text.length, end: text.length + m[2].length, text: m[2] });
    text += m[2];
    last = re.lastIndex;
  }
  return { text: text + src.slice(last), gold };
}

const ov = (a, b) => Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
const hit = (p, g) => ov(p, g) >= 0.5 * Math.min(p.end - p.start, g.end - g.start);

function score(preds, gold, file, counts, errors) {
  const used = new Set();
  for (const p of preds) {
    const gi = gold.findIndex((g, i) => !used.has(i) && hit(p, g));
    if (gi < 0) { counts(p.label).fp++; errors.push(['false alarm', p.label, p.text, file]); continue; }
    used.add(gi);
    const g = gold[gi];
    if (g.label === p.label) {
      counts(g.label).tp++;
      if (p.start !== g.start || p.end !== g.end) errors.push(['span', g.label, `${JSON.stringify(p.text)} ≠ ${JSON.stringify(g.text)}`, file]);
    } else { counts(g.label).fn++; counts(p.label).fp++; errors.push(['wrong label', `${g.label} → ${p.label}`, g.text, file]); }
  }
  gold.forEach((g, i) => { if (!used.has(i)) { counts(g.label).fn++; errors.push(['missed', g.label, g.text, file]); } });
}

async function main() {
  // npm run label-bench -- holdout   uses tests/fixtures/label-bench/holdout.json
  const set = process.argv.slice(2).find((a) => !a.startsWith('--')) || 'docs';
  const { docs } = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tests', 'fixtures', 'label-bench', `${set}.json`), 'utf8'));
  const runner = HAS_MODEL ? require('./gliner-runner') : null;
  const systems = HAS_MODEL ? ['rules', 'rules + model'] : ['rules'];
  const table = {};
  const errs = {};
  for (const sys of systems) { table[sys] = {}; errs[sys] = []; }
  for (const doc of docs) {
    const { text, gold } = parse(doc.marked);
    const rules = P.engine.run(text, { hint: P.fileHint.parse(doc.file) });
    const outputs = { rules };
    if (runner) outputs['rules + model'] = P.hybrid.merge(rules, await runner.detect(text, { threshold: 0.05 }), text, { settings: P.SETTINGS.model });
    for (const sys of systems) {
      const preds = outputs[sys].filter((d) => d.confidence >= P.REVIEW_THRESHOLD && LABELS.includes(d.label));
      const counts = (l) => table[sys][l] || (table[sys][l] = { tp: 0, fp: 0, fn: 0 });
      score(preds, gold, doc.file, counts, errs[sys]);
    }
  }
  const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '–');
  const sys = systems[systems.length - 1];
  console.log(`| Label | Found | Correct when flagged | Missed | False alarms |${systems.length > 1 ? ' Found (rules only) |' : ''}`);
  console.log(`|---|---|---|---|---|${systems.length > 1 ? '---|' : ''}`);
  let T = { tp: 0, fp: 0, fn: 0 };
  for (const l of LABELS) {
    const c = table[sys][l] || { tp: 0, fp: 0, fn: 0 };
    const r = table.rules[l] || { tp: 0, fp: 0, fn: 0 };
    T = { tp: T.tp + c.tp, fp: T.fp + c.fp, fn: T.fn + c.fn };
    console.log(`| ${l} | ${pct(c.tp, c.tp + c.fn)} | ${pct(c.tp, c.tp + c.fp)} | ${c.fn} | ${c.fp} |${systems.length > 1 ? ` ${pct(r.tp, r.tp + r.fn)} |` : ''}`);
  }
  console.log(`| **All** | ${pct(T.tp, T.tp + T.fn)} | ${pct(T.tp, T.tp + T.fp)} | ${T.fn} | ${T.fp} |${systems.length > 1 ? ' |' : ''}`);
  console.log(`\n${sys}: problems`);
  for (const e of errs[sys]) console.log(`  ${e[0].padEnd(11)} ${e[1].padEnd(32)} ${String(e[2]).slice(0, 70)}  (${e[3]})`);
}

main().catch((err) => { console.error(err); process.exit(1); });
