// The 13-label benchmark (tests/fixtures/label-bench): every marked value is found with its label, nothing else is
// reported (rules only; `npm run label-bench` also scores the model). Needs the offline knowledge base for the
// well-known-company and popular-homepage decisions, so it is skipped without it (npm run build-kb).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { P } = require('./load');

const KB = path.join(__dirname, '..', 'data', 'kb');
const hasKb = fs.existsSync(path.join(KB, 'meta.json'));
if (hasKb) {
  const rd = (f) => JSON.parse(fs.readFileSync(path.join(KB, f), 'utf8'));
  P.kb.setData({ meta: rd('meta.json'), companies: rd('companies.json'), people: rd('people.json'), domains: rd('domains.json') });
}

function parse(marked) {
  const src = marked.replace(/<SPLIT>/g, '');
  const gold = [];
  let text = '';
  let last = 0;
  for (const m of src.matchAll(/\{\{([^|}]+)\|([^}]*)\}\}/g)) {
    text += src.slice(last, m.index);
    gold.push({ label: m[1], start: text.length, end: text.length + m[2].length, text: m[2] });
    text += m[2];
    last = m.index + m[0].length;
  }
  return { text: text + src.slice(last), gold };
}

for (const set of ['docs', 'holdout']) {
  const { docs } = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'label-bench', `${set}.json`), 'utf8'));
  for (const doc of docs) {
    test(`13-label benchmark (${set}): ${doc.file}`, { skip: !hasKb && 'no knowledge base (npm run build-kb)' }, () => {
      const { text, gold } = parse(doc.marked);
      const got = P.engine.run(text, { hint: P.fileHint.parse(doc.file) })
        .filter((d) => d.confidence >= P.REVIEW_THRESHOLD && d.label !== 'Date');
      const key = (x) => `${x.label}: ${x.text}`;
      assert.deepEqual(got.map(key).sort(), gold.map(key).sort());
    });
  }
}
