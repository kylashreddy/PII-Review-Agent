// Agent mode (preview): the plan for the right document, the card order and the outcome of the answers.
const test = require('node:test');
const assert = require('node:assert/strict');
const { P } = require('./load');
const { runCase } = require('./fixture-pipeline');

const A = P.agentPlan;

function plan(left, right, labels) {
  right = right == null ? left : right;
  const detections = P.engine.run(left);
  const l1 = P.compare.compareDocuments({ leftText: left, rightText: right, detections, rightLabels: labels || [] });
  const l2 = P.redaction.validate({ leftText: left, rightText: right, detections, alignment: l1.alignment });
  return { plan: A.build({ leftText: left, rightText: right, detections, l1, l2, rightLabels: labels || [] }), detections };
}
const lab = (text, whole, label) => {
  const start = text.indexOf(whole);
  return { label, rawLabel: label, known: true, start, end: start + whole.length, text: whole, placeholder: false };
};
const KYC = 'Name: Ravi Kumar Sharma\nMobile: +91 98450 12345\nEmail: ravi.sharma@gmail.com\nPAN: ABCPS1234K\n' +
  'Date of Birth: 14/08/1989\nTeam: Customer Support\n';

test('identify task: every confident detection becomes a label to add, with exact spans', () => {
  const { plan: p, detections } = plan(KYC);
  assert.equal(p.mode, 'identify');
  const want = detections.filter((d) => d.confidence >= P.REVIEW_THRESHOLD && d.label !== 'Date').map((d) => [d.label, d.text]);
  assert.deepEqual(p.labels.map((l) => [l.label, l.text]), want);
  assert.ok(p.labels.every((l) => l.action === 'add' && KYC.slice(l.right.start, l.right.end) === l.text));
  assert.ok(!p.labels.some((l) => l.label === 'Date'), 'dates are out of scope');
  assert.deepEqual(p.labels.map((l) => l.id), p.labels.map((_, i) => `L${i + 1}`));
});

test('groups: fixed-shape values at >= 90% are high; names stay medium', () => {
  const { plan: p } = plan(KYC);
  const g = Object.fromEntries(p.labels.map((l) => [l.label, l.group]));
  assert.equal(g['Email Address'], 'high');
  assert.equal(g['Credentials'], 'high');
  assert.equal(g['Person Name'], 'medium');
});

test('labels already on the right are kept, changed or removed', () => {
  const labels = [lab(KYC, 'Ravi Kumar Sharma', 'Person Name'), lab(KYC, 'ravi.sharma@gmail.com', 'URL/Link'),
    lab(KYC, 'Customer Support', 'Business Name')];
  const { plan: p } = plan(KYC, KYC, labels);
  const by = Object.fromEntries(p.labels.map((l) => [l.text, l]));
  assert.equal(by['Ravi Kumar Sharma'].action, 'keep');
  assert.equal(by['ravi.sharma@gmail.com'].action, 'change');
  assert.equal(by['ravi.sharma@gmail.com'].existingLabel, 'URL/Link');
  assert.equal(by['ravi.sharma@gmail.com'].label, 'Email Address');
  assert.equal(by['Customer Support'].action, 'remove');
});

test('a label inside a longer word becomes a question, never a label', () => {
  const text = 'visit dukaanhelp today';
  const right = { start: 6, end: 12 };
  assert.equal(A.partOfWord(text, right), true);
  assert.equal(A.partOfWord('visit dukaan today', right), false);
  assert.deepEqual(A.exactSpan('Name: "Ravi Kumar", ok', { start: 6, end: 19 }), { start: 7, end: 17 });
  assert.deepEqual(A.exactSpan('Driver (080 4123 5678) on', { start: 7, end: 21 }), { start: 8, end: 21 });
});

test('verify task: replacements are labeled with the original\'s label and leaks raise a Leak card', () => {
  const r = runCase('bug6-git-logs');
  const p = A.build({ leftText: r.left, rightText: r.right, detections: r.detections,
    l1: P.compare.compareDocuments({ leftText: r.left, rightText: r.right, detections: r.detections, rightLabels: [] }),
    l2: r.l2, rightLabels: [] });
  assert.equal(p.mode, 'verify');
  const leaks = p.questions.filter((q) => q.kind === 'leak');
  assert.ok(leaks.length >= 1);
  const byId = Object.fromEntries(p.labels.map((l) => [l.id, l]));
  for (const q of leaks) assert.equal(byId[q.labelId].text, q.text);
  for (const q of leaks) assert.equal(byId[q.labelId].group, 'medium', 'a leaked value is never in Approve all');
  assert.ok(p.labels.some((l) => l.label === 'Email Address' && r.right.slice(l.right.start, l.right.end) === l.text));
});

test('cards: Unsure -> Leaks -> Medium -> High, then the two document questions', () => {
  const r = runCase('bug6-git-logs');
  const p = A.build({ leftText: r.left, rightText: r.right, detections: r.detections,
    l1: P.compare.compareDocuments({ leftText: r.left, rightText: r.right, detections: r.detections, rightLabels: [] }),
    l2: r.l2, rightLabels: [] });
  const cs = A.cards(p);
  const order = cs.map((c) => (c.tier === 'document' ? 9 : A.TIER_ORDER[c.tier]));
  assert.deepEqual(order, order.slice().sort((a, b) => a - b));
  assert.deepEqual(cs.slice(-2).map((c) => c.kind), ['document', 'document']);
  assert.equal(new Set(cs.map((c) => c.key)).size, cs.length, 'card keys are unique');
});

test('outcome: answers become operations and the submit summary', () => {
  const labels = [lab(KYC, 'Customer Support', 'Business Name')];
  const { plan: p } = plan(KYC, KYC, labels);
  const answers = new Map();
  const by = Object.fromEntries(p.labels.map((l) => [l.text, l]));
  let o = A.outcome(p, answers);
  assert.equal(o.summary.ready, false);
  assert.equal(o.summary.open, p.labels.length + p.questions.length + 2);
  for (const key of A.approveAllKeys(p, answers)) answers.set(key, { verdict: 'yes' });
  answers.set(by['Ravi Kumar Sharma'].key, { verdict: 'no', choice: 'fix_span', span: { start: 6, end: 10 } });
  answers.set(by['Customer Support'].key, { verdict: 'yes' });
  for (const l of p.labels) if (!answers.has(l.key)) answers.set(l.key, { verdict: 'no', choice: 'not_pii' });
  for (const q of p.questions) answers.set(q.key, { verdict: 'no' });
  for (const d of A.DOCUMENT_QUESTIONS) answers.set(d.key, { verdict: 'no' });
  o = A.outcome(p, answers);
  assert.equal(o.summary.ready, true);
  assert.equal(o.summary.open, 0);
  assert.ok(o.ops.some((x) => x.op === 'remove' && x.label === 'Business Name'));
  assert.ok(o.ops.some((x) => x.op === 'add' && x.label === 'Person Name' && x.span.end === 10));
  assert.ok(o.ops.filter((x) => x.op === 'add').every((x) => x.label !== 'Date' && x.label !== 'Overscrubbed'));
  assert.match(o.summary.text, /^\d+ labels · \d+ approved · \d+ changed · \d+ removed · 0 open$/);
});

test('the plan only reads the documents: same input, same plan', () => {
  assert.deepEqual(plan(KYC).plan, plan(KYC).plan);
});
