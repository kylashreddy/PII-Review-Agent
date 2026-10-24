// Tests for the rules + model merge (core/hybrid.js). Model entities are given by hand here;
// ml/eval.js scores the real model.
const test = require('node:test');
const assert = require('node:assert/strict');
const { P } = require('./load');

const ent = (text, doc, label, score) => {
  const start = doc.indexOf(text);
  return { label, start, end: start + text.length, text, score };
};
const merge = (doc, ents, settings) => P.hybrid.merge(P.engine.run(doc), ents, doc, { settings });
const find = (list, text) => list.find((d) => d.text === text);

test('hybrid: a name only the model finds is added; below "add" it is only possible', () => {
  const doc = 'notes: spoke with zorvak tenmar from zentrix analytics today.'; // a name not in the names list
  const out = merge(doc, [ent('zorvak tenmar', doc, 'Person Name', 0.8), ent('zentrix analytics', doc, 'Business Name', 0.17)]);
  const name = find(out, 'zorvak tenmar');
  assert.equal(name.label, 'Person Name');
  assert.equal(name.source, 'model');
  assert.ok(name.confidence >= P.REVIEW_THRESHOLD);
  assert.ok(find(out, 'zentrix analytics').confidence < P.REVIEW_THRESHOLD, 'weak model guess is only "possible"');
});

test('hybrid: agreement raises confidence; the rule span is kept', () => {
  const doc = 'Name: Priya Sharma joined.';
  const rule = find(P.engine.run(doc), 'Priya Sharma');
  const out = merge(doc, [ent('Priya Sharma', doc, 'Person Name', 0.9)]);
  const d = find(out, 'Priya Sharma');
  assert.ok(d.confidence > rule.confidence);
  assert.equal(d.model.agrees, true);
  assert.equal(out.filter((x) => x.label === 'Person Name').length, 1);
});

test('hybrid: rules own fixed-shape values; the model cannot relabel them', () => {
  const doc = 'Mobile: 9845012345, PAN BNZPM2501F';
  const out = merge(doc, [ent('9845012345', doc, 'Person Name', 0.95), ent('BNZPM2501F', doc, 'Business Name', 0.9)]);
  assert.equal(find(out, '9845012345').label, 'Contact Number');
  assert.equal(find(out, 'BNZPM2501F').label, 'Credentials');
});

test('hybrid: never-PII stays never PII (departments, headers, well-known names)', () => {
  const doc = 'record_id,department,owner\nR1,Field Services,Ravi Kumar\nR2,People Ops,Arjun Shah\n';
  const out = merge(doc, [ent('Field Services', doc, 'Business Name', 0.9), ent('department', doc, 'Person Name', 0.9),
    ent('People Ops', doc, 'Business Name', 0.9)]);
  assert.ok(!out.some((d) => /Field Services|People Ops|department/.test(d.text)), out.map((d) => d.text).join(', '));
  const doc2 = 'We use Infosys and Google for hosting.';
  assert.ok(!merge(doc2, [ent('Infosys', doc2, 'Business Name', 0.9)]).some((d) => d.text === 'Infosys'));
});

test('hybrid: a confident different label is attached as an alternative, the rule label stays', () => {
  const doc = 'Signed by: Kaveri Rao';
  const before = find(P.engine.run(doc), 'Kaveri Rao');
  assert.ok(before, 'the rules read it as a name');
  const d = find(merge(doc, [ent('Kaveri Rao', doc, 'Business Name', 0.8)]), 'Kaveri Rao');
  assert.equal(d.label, before.label);
  assert.deepEqual(d.model, { label: 'Business Name', score: 0.8, agrees: false });
});

test('hybrid: off unless enabled, and the defaults are sane', () => {
  assert.equal(P.SETTINGS.model.enabled, false);
  assert.ok(P.SETTINGS.model.min <= P.SETTINGS.model.add);
});

test('hybrid: model suggestions that are code, roles or panel headings are dropped', () => {
  const doc = '# user = os.getenv("POSTGRES_USER")\n#   user=user,\n#app/config/secret-token.txt @cto\n# only our CTO can review\nright.gitignore-3143dca5\nconn = connect(host=dbhost, name=Ravi)\nThanks, Meera Joshi signed the form.';
  const ent = (t, label, from) => { const s = doc.indexOf(t, from || 0); return { label, start: s, end: s + t.length, text: t, score: 0.9 }; };
  const out = merge(doc, [ent('os.getenv', 'Person Username'), ent('user', 'Person Username', doc.indexOf('user=')),
    ent('CTO', 'Person Name'), ent('right', 'Person Name', doc.indexOf('right.')), ent('dbhost', 'Person Username'),
    ent('Meera Joshi', 'Person Name')]);
  // None of the code-like suggestions is added; the real name is reported (the rules may find it first).
  assert.deepEqual(out.filter((d) => d.source === 'model').map((d) => d.text).filter((t) => t !== 'Meera Joshi'), []);
  assert.ok(out.some((d) => d.text === 'Meera Joshi' && d.label === 'Person Name' && d.confidence >= P.REVIEW_THRESHOLD));
});
