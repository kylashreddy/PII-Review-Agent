// Select-to-check verdicts (core/select-check.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { P } = require('./load');

/** Verdict for `sel` selected inside `doc` (first occurrence), with the engine's detections on `doc`. */
function check(doc, sel) {
  const s = doc.indexOf(sel);
  return P.selectCheck.verdict({ text: sel, context: doc, selStart: s, selEnd: s + sel.length, detections: P.engine.run(doc) });
}

test.before(() => P.kb.setData({ meta: { built: 't' }, companies: [['Tata Consultancy Services', 31, 'Q1'], ['Kaveri Textiles', 3, 'Q2']],
  people: [['Amit Shah', 39, 'Q3']], domains: ['infosys.com'] }));
test.after(() => P.kb.setData({}));

test('select-check: PII with the type and the rule behind it', () => {
  const v = check('Mobile: 9845012345 call me', '9845012345');
  assert.equal(v.kind, 'pii');
  assert.equal(v.title, 'PII — Contact Number');
  assert.ok(v.reasons.some((r) => /Indian Mobile Number/.test(r)));
});

test('select-check: part of a value says what the full value is', () => {
  const v = check('Name: Priya Sharma joined', 'Sharma');
  assert.equal(v.title, 'PII — Person Name');
  assert.ok(v.reasons.some((r) => /full value is “Priya Sharma”/.test(r)), v.reasons.join(' | '));
});

test('select-check: never-PII answers (public name, department, heading, public website)', () => {
  assert.equal(check('Employer: Tata Consultancy Services', 'Tata Consultancy Services').title, 'Not PII — public name');
  assert.equal(check('Team: Field Services', 'Field Services').title, 'Not PII — department name');
  assert.equal(check('| Goods and Services |', 'Goods and Services').title, 'Not PII — a heading');
  const w = check('site https://www.infosys.com/', 'https://www.infosys.com/');
  assert.equal(w.title, 'Not PII — public website');
  assert.match(w.reasons[0], /rank 1/);
});

test('select-check: knowledge base notes; a public figure stays PII', () => {
  const v = check('Referred by: Mr. Amit Shah', 'Amit Shah');
  assert.equal(v.kind, 'pii');
  assert.ok(v.reasons.some((r) => /public figure/.test(r)));
  const c = check('Supplier: Kaveri Textiles', 'Kaveri Textiles');
  assert.ok(c.reasons.some((r) => /Known company/.test(r)));
});

test('select-check: model-only findings and nothing found', () => {
  const doc = 'notes: spoke with ravi kumar today';
  const s = doc.indexOf('ravi kumar');
  const v = P.selectCheck.verdict({ text: 'ravi kumar', context: doc, selStart: s, selEnd: s + 10,
    detections: [{ label: 'Person Name', type: 'Person Name', start: s, end: s + 10, confidence: 0.75, source: 'model', model: { score: 0.31, agrees: true } }] });
  assert.equal(v.title, 'PII — Person Name');
  assert.ok(v.reasons.includes('Model: 31% sure'));
  assert.equal(check('the weather is nice today', 'weather').kind, 'none');
});

test('select-check: part of a public name is still a public name', () => {
  assert.equal(check('Employer: Tata Consultancy Services', 'Consultancy').title, 'Not PII — public name');
});

test('select-check: nothing found gives kind "none" (the extension then shows no card at all)', () => {
  const text = 'Customer Onboarding Form';
  const v = P.selectCheck.verdict({ text, context: text, selStart: 0, selEnd: text.length, detections: P.engine.run(text) });
  assert.equal(v.kind, 'none');
});
