// Reports and saved tasks (core/report.js): what becomes test data, and what stays out.
const test = require('node:test');
const assert = require('node:assert/strict');
const { P } = require('./load');

const left = 'Name: Priya Sharma. Team: Field Services. Mobile: 9845012345. Ref: Ravi.';
const at = (t) => ({ start: left.indexOf(t), end: left.indexOf(t) + t.length });
const F = (id, category, label, text, extra) => ({ id, category, label, text, left: at(text), ...(extra || {}) });

test('saved task: decisions and agreed labels become answers; undecided items stay out', () => {
  const findings = [
    F('a', 'IDENTIFIED', 'Person Name', 'Priya Sharma'),                              // labeled and agreed
    F('b', 'PI_TODO', 'Contact Number', '9845012345'),                                // answered Yes
    F('c', 'NOT_PII', 'Overscrubbed', 'Field Services', { rightLabel: 'Business Name' }), // answered Not PII
    F('d', 'PI_TODO', 'Person Name', 'Ravi'),                                         // undecided
    { id: 'e', category: 'TASK', text: 'Language: Hindi' },                           // whole-task item
  ];
  const t = P.report.taskExport({ stage: 'L1', fileName: 'by-pii-type~~x~~a.csv', leftText: left, findings, verdicts: new Map([['b', 'yes'], ['c', 'no']]) });
  assert.equal(t.format, 'pii-review-task');
  assert.equal(t.partial, true);
  assert.deepEqual(t.gold.map((g) => [g.label, g.text, g.source]), [['Person Name', 'Priya Sharma', 'agreed'], ['Contact Number', '9845012345', 'decision']]);
  assert.deepEqual(t.negatives.map((n) => n.text), ['Field Services']);
  assert.equal(t.undecided, 1);
  assert.equal(t.leftText, left);
});

test('saved task (L2): Redact / Keep and "redacted correctly" become answers', () => {
  const findings = [F('a', 'REDACTED_OK', 'Person Name', 'Priya Sharma'), F('b', 'OVER_REDACTED', null, 'Field Services'),
    F('c', 'LEAKAGE', 'Contact Number', '9845012345')];
  const t = P.report.taskExport({ stage: 'L2', leftText: left, findings, verdicts: new Map([['b', 'keep'], ['c', 'redact']]) });
  assert.deepEqual(t.gold.map((g) => g.text), ['Priya Sharma', '9845012345']);
  assert.deepEqual(t.negatives.map((n) => n.text), ['Field Services']);
});

test('reports: a finding report carries the finding and a little context; a selection report its verdict', () => {
  const f = F('b', 'PI_TODO', 'Contact Number', '9845012345', { note: 'n', rule: 'phone-mobile', source: 'regex', confidence: 0.95 });
  const r = P.report.findingReport({ finding: f, stage: 'L1', fileName: 'x.csv', leftText: left, rightText: '' });
  assert.equal(r.kind, 'finding');
  assert.equal(r.finding.label, 'Contact Number');
  assert.ok(r.context.left.includes('9845012345') && r.context.left.length <= left.length);
  const s = P.report.selectionReport({ text: 'Ravi', verdict: { kind: 'none', title: 'No PII found' }, side: 'left', fileName: 'x.csv' });
  assert.equal(s.kind, 'selection');
  assert.equal(s.verdict.title, 'No PII found');
  assert.ok(P.report.version());
});

test('file names: safe and short', () => {
  assert.equal(P.report.slug('golden_dataset~~by-format~~csv~~orders_export_1 (2).csv-262738d9'), 'orders_export_1-2-.csv-262738d9');
  assert.equal(P.report.slug(''), 'task');
});
