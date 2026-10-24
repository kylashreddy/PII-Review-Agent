// Scores rules, the GLiNER model and the hybrid on labelled tasks.
//   node eval.js [data-dir …] [--settings '{"add":0.5}'] [--sweep]
// Data format (one folder per task, see ml/README.md): left.txt, gold.json, meta.json (optional fileName).
// Model output is cached in ml/eval-data/.cache, so re-running with other merge settings is instant.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { P } = require('../tests/load');

// The offline knowledge base, when built (npm run build-kb), as in the extension.
(() => {
  const dir = path.join(__dirname, '..', 'data', 'kb');
  if (!fs.existsSync(path.join(dir, 'meta.json'))) return;
  const rd = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  P.kb.setData({ meta: rd('meta.json'), companies: rd('companies.json'), people: rd('people.json'), domains: rd('domains.json') });
})();
const runner = require('./gliner-runner');

// The model's labels (synthetic data); real tasks saved from the extension are scored on every site label.
const MODEL_LABELS = ['Person Name', 'Business Name', 'Address', 'Person Username'];
const ALL_LABELS = P.LABELS.map((l) => l.name).filter((n) => n !== 'Overscrubbed');
let LABELS = MODEL_LABELS;
// Without the model files (a teammate's machine), score the rules only.
const HAS_MODEL = fs.existsSync(path.join(__dirname, '..', 'models', 'multi_pii', 'onnx', 'model_int8.onnx'));
const CACHE = path.join(__dirname, 'eval-data', '.cache');

function loadTasks(dirs) {
  const tasks = [];
  for (const dir of dirs) {
    for (const id of fs.readdirSync(dir).filter((f) => !f.startsWith('.')).sort()) {
      const t = path.join(dir, id);
      if (!fs.existsSync(path.join(t, 'left.txt'))) continue;
      const meta = fs.existsSync(path.join(t, 'meta.json')) ? JSON.parse(fs.readFileSync(path.join(t, 'meta.json'), 'utf8')) : {};
      tasks.push({ id: `${path.basename(dir)}/${id}`, left: fs.readFileSync(path.join(t, 'left.txt'), 'utf8'),
        gold: JSON.parse(fs.readFileSync(path.join(t, 'gold.json'), 'utf8')), meta });
    }
  }
  return tasks;
}

async function modelEntities(text) {
  const key = crypto.createHash('sha1').update('multi_pii-int8|lines-v1|' + text).digest('hex');
  const file = path.join(CACHE, key + '.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const ents = await runner.detect(text, { threshold: 0.05 });
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(ents));
  return ents;
}

// A prediction matches a gold span of the same label when they overlap by at least half of the shorter one.
const ov = (a, b) => Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
const matches = (p, g) => p.label === g.label && ov(p, g) >= 0.5 * Math.min(p.end - p.start, g.end - g.start);

function score(preds, gold, counts, examples, id, system, negatives) {
  // The model alone is only asked about names, companies, addresses and usernames.
  for (const label of system === 'model' ? LABELS.filter((l) => MODEL_LABELS.includes(l)) : LABELS) {
    const ps = preds.filter((p) => p.label === label);
    const gs = gold.filter((g) => g.label === label);
    const used = new Set();
    let tp = 0;
    let exact = 0;
    let fp = 0;
    let unverified = 0;
    for (const p of ps) {
      const gi = gs.findIndex((g, i) => !used.has(i) && matches(p, g));
      if (gi >= 0) { used.add(gi); tp++; if (p.start === gs[gi].start && p.end === gs[gi].end) exact++; continue; }
      // Partial answers (saved from the extension): only text the reviewer called "Not PII" is a false alarm;
      // anything else nobody decided on is "unverified", neither right nor wrong.
      if (negatives && !negatives.some((n) => ov(p, n) > 0)) { unverified++; continue; }
      fp++;
      if (examples) examples.push({ system, id, kind: 'false alarm', label, text: p.text, score: p.confidence ?? p.score });
    }
    gs.forEach((g, i) => { if (!used.has(i) && examples) examples.push({ system, id, kind: 'missed', label, text: g.text }); });
    const c = counts[label] || (counts[label] = { tp: 0, fp: 0, fn: 0, exact: 0, unverified: 0 });
    c.tp += tp; c.fp += fp; c.fn += gs.length - tp; c.exact += exact; c.unverified += unverified;
  }
}

const reported = (list) => list.filter((d) => d.confidence >= P.REVIEW_THRESHOLD);

async function evaluate(tasks, settings, collectExamples) {
  const systems = HAS_MODEL ? { rules: {}, model: {}, hybrid: {} } : { rules: {} };
  const examples = collectExamples ? [] : null;
  let modelMs = 0;
  for (const t of tasks) {
    const hint = P.fileHint.parse(t.meta.fileName || '');
    const rules = P.engine.run(t.left, { hint });
    const neg = t.meta.partial ? t.meta.negatives || [] : null;
    score(reported(rules), t.gold, systems.rules, examples, t.id, 'rules', neg);
    if (!HAS_MODEL) continue;
    const t0 = Date.now();
    const ents = await modelEntities(t.left);
    modelMs += Date.now() - t0;
    const S = Object.assign({}, P.SETTINGS.model, settings);
    const hybrid = P.hybrid.merge(rules, ents, t.left, { settings: S });
    score(ents.filter((e) => e.score >= S.add), t.gold, systems.model, examples, t.id, 'model', neg);
    score(reported(hybrid), t.gold, systems.hybrid, examples, t.id, 'hybrid', neg);
  }
  return { systems, examples, modelMs };
}

const f1 = (c) => {
  const p = c.tp / ((c.tp + c.fp) || 1);
  const r = c.tp / ((c.tp + c.fn) || 1);
  return { p, r, f: p + r ? (2 * p * r) / (p + r) : 0 };
};
const pct = (x) => `${Math.round(x * 100)}%`;
// "–" when there is nothing to measure (no confirmed PII / nothing confirmed flagged), not a misleading 0%.
const pctOf = (x, n) => (n ? pct(x) : '–');
const total = (counts) => Object.values(counts).reduce((a, c) => ({ tp: a.tp + c.tp, fp: a.fp + c.fp, fn: a.fn + c.fn,
  exact: a.exact + c.exact, unverified: a.unverified + (c.unverified || 0) }), { tp: 0, fp: 0, fn: 0, exact: 0, unverified: 0 });

function table(systems, partial) {
  const head = '| Label | System | Caught (recall) | Correct when flagged (precision) | F1 | Missed | False alarms |' + (partial ? ' Unverified |' : '');
  const rows = [head, '|---|---|---|---|---|---|---|' + (partial ? '---|' : '')];
  const used = LABELS.filter((l) => Object.values(systems).some((c) => c[l] && (c[l].tp + c[l].fp + c[l].fn + (c[l].unverified || 0))));
  for (const label of used.concat([LABELS === MODEL_LABELS ? 'All four' : 'All labels'])) {
    for (const [name, counts] of Object.entries(systems)) {
      if (name === 'model' && !/^All /.test(label) && !MODEL_LABELS.includes(label)) continue; // not the model's job
      const c = /^All /.test(label) ? total(counts) : counts[label] || { tp: 0, fp: 0, fn: 0, unverified: 0 };
      const { p, r, f } = f1(c);
      rows.push(`| ${label} | ${name} | ${pctOf(r, c.tp + c.fn)} | ${pctOf(p, c.tp + c.fp)} | ${c.tp + c.fn && c.tp + c.fp ? f.toFixed(2) : '–'} | ${c.fn} | ${c.fp} |` + (partial ? ` ${c.unverified || 0} |` : ''));
    }
  }
  return rows.join('\n');
}

/** Count misses and false alarms by system, label and document kind (the part after the task number). */
function breakdown(examples) {
  const m = new Map();
  for (const e of examples) {
    const kind = e.id.split('/').pop().replace(/^\d+-/, '');
    const k = `| ${e.system} | ${e.kind} | ${e.label} | ${kind} |`;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return ['| System | Error | Label | Document kind | Count |', '|---|---|---|---|---|']
    .concat([...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n} |`)).join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const settingsArg = args.indexOf('--settings');
  const settings = settingsArg >= 0 ? JSON.parse(args[settingsArg + 1]) : {};
  const dirs = args.filter((a, i) => !a.startsWith('--') && !(settingsArg >= 0 && i === settingsArg + 1));
  const tasks = loadTasks(dirs.length ? dirs : [path.join(__dirname, 'eval-data', 'synthetic')]);
  const partial = tasks.some((t) => t.meta.partial);
  if (partial || args.includes('--all-labels')) LABELS = ALL_LABELS;
  console.log(`${tasks.length} tasks${partial ? ' (saved from the extension: answers are partial)' : ''}${HAS_MODEL ? '' : ' — model not installed: rules only'}`);

  if (args.includes('--sweep')) {
    await evaluate(tasks, settings, false); // fill the cache
    for (const add of [0.3, 0.4, 0.5, 0.6, 0.7]) {
      for (const min of [0.2, 0.3]) {
        const { systems } = await evaluate(tasks, { ...settings, add, min }, false);
        const { p, r, f } = f1(total(systems.hybrid));
        console.log(`add=${add} min=${min}  hybrid recall ${pct(r)} precision ${pct(p)} F1 ${f.toFixed(3)}`);
      }
    }
    return;
  }

  const { systems, examples, modelMs } = await evaluate(tasks, settings, true);
  const note = partial ? ['', 'Answers are partial: only what reviewers decided counts. "False alarms" are findings a reviewer called',
    'Not PII; "Unverified" are findings nobody decided on (neither right nor wrong).'] : [];
  const out = [`# Rules vs model vs hybrid`, '', `${tasks.length} tasks (${dirs.join(', ') || 'synthetic'}), settings ${JSON.stringify({ ...P.SETTINGS.model, ...settings })}.`,
    `Model time ${Math.round(modelMs / 1000)} s in total (cached runs count as 0).`, ...note, '', table(systems, partial), '',
    '## Errors by document kind', '', breakdown(examples), '',
    '## Examples (first 40 per system)', ''];
  for (const sys of Object.keys(systems)) {
    out.push(`### ${sys}`, '');
    for (const e of examples.filter((x) => x.system === sys).slice(0, 40)) {
      out.push(`- ${e.kind} · ${e.label} · “${e.text.replace(/\n/g, '⏎')}”${e.score != null ? ` (${e.score})` : ''} · ${e.id}`);
    }
    out.push('');
  }
  const file = path.join(__dirname, 'eval-report.md');
  fs.writeFileSync(file, out.join('\n'));
  console.log(table(systems, partial));
  if (partial) console.log(note.slice(1).join(' '));
  console.log(`\nreport: ${path.relative(process.cwd(), file)}`);
}

module.exports = { loadTasks };

if (require.main === module) main().catch((err) => { console.error(err); process.exit(1); });
