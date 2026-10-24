'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { call } = require('../server');
const { Offsets } = require('../src/offsets');
const { P, ROOT } = require('../src/engine');

const ok = (method, params) => {
  const r = call({ id: 1, method, params });
  assert.equal(r.error, undefined, JSON.stringify(r.error));
  return r.result;
};
const strip = (list) => list.map(({ label, type, start, end, confidence, rule }) => ({ label, type, start, end, confidence, rule }));

/** Label-bench document -> plain text (same parsing as ml/label-bench.js). */
function benchTexts() {
  const out = [];
  for (const set of ['docs', 'holdout']) {
    const { docs } = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'label-bench', `${set}.json`), 'utf8'));
    for (const d of docs) out.push({ file: d.file, text: d.marked.replace(/<SPLIT>/g, '').replace(/\{\{[^|}]+\|([^}]*)\}\}/g, '$1') });
  }
  return out;
}

test('offsets: code points <-> UTF-16 units round-trip around emoji', () => {
  const text = 'a😀b 🇮🇳 c';
  const o = new Offsets(text);
  const cps = [...text];
  for (let cp = 0; cp <= cps.length; cp++) {
    const u = o.toUnits(cp);
    assert.equal(text.slice(0, u), cps.slice(0, cp).join(''));
    assert.equal(o.toPoints(u), cp);
  }
  assert.equal(new Offsets('plain').toUnits(3), 3);
});

test('version names the engine and a rules hash', () => {
  const v = ok('version');
  assert.match(v.engine, /^\d+\.\d+\.\d+$/);
  assert.match(v.rules_sha, /^[0-9a-f]{16}$/);
});

test('analyze returns exactly what the extension engine returns (label-bench documents)', () => {
  for (const { file, text } of benchTexts()) {
    const expected = P.engine.run(text, { hint: P.fileHint.parse(file) });
    assert.deepEqual(strip(ok('analyze', { text, file_name: file }).rules), strip(expected), file);
  }
});

test('analyze converts offsets to code points', () => {
  const text = '🙂🙂 Contact: ravi.kumar@gmail.com';
  const email = ok('analyze', { text }).rules.find((d) => d.label === 'Email Address');
  assert.equal([...text].slice(email.start, email.end).join(''), 'ravi.kumar@gmail.com');
});

test('analyze with entities runs the hybrid merge', () => {
  const text = 'Meeting notes: Zentrix Analytics will ship the order on Monday.';
  const start = text.indexOf('Zentrix');
  const r = ok('analyze', { text, entities: [{ label: 'Business Name', prompt: 'organization', start, end: start + 17, score: 0.6 }] });
  const want = P.hybrid.merge(P.engine.run(text, {}), [{ label: 'Business Name', prompt: 'organization', start, end: start + 17,
    text: 'Zentrix Analytics', score: 0.6 }], text, { settings: P.SETTINGS.model });
  assert.deepEqual(strip(r.merged), strip(want));
  assert.ok(r.merged.some((d) => d.label === 'Business Name'));
});

test('compare and redaction_check match the extension on a left/right fixture', () => {
  const { runCase } = require(path.join(ROOT, 'tests', 'fixture-pipeline'));
  const want = runCase('bug6-git-logs');
  const red = ok('redaction_check', { left: want.left, right: want.right, detections: want.detections, file_name: want.hint ? 'by-pii-type~~aws_secret_key~~repo~~.git~~logs~~HEAD' : '' });
  assert.deepEqual(red.findings.map((f) => [f.category, f.label, f.left, f.right]), want.findings.map((f) => [f.category, f.label, f.left, f.right]));
  const cmp = ok('compare', { left: want.left, right: want.right, detections: want.detections, right_labels: [] });
  assert.equal(cmp.identical, false);
  assert.ok(cmp.findings.length > 0);
});

test('compare reads right labels: known names, placeholders, CORRECT and WRONG_LABEL', () => {
  const text = 'Name: Ravi Kumar Sharma\nEmail: ravi.sharma@gmail.com\n';
  const detections = ok('analyze', { text }).rules;
  const n = text.indexOf('Ravi');
  const e = text.indexOf('ravi.sharma');
  const r = ok('compare', { left: text, right: text, detections, right_labels: [
    { label: 'Person Name', start: n, end: n + 17 }, { label: 'Contact Number', start: e, end: e + 21 }] });
  assert.equal(r.identical, true);
  assert.equal(r.aligned, true);
  const cat = Object.fromEntries(r.findings.map((f) => [f.label, f.category]));
  assert.equal(cat['Person Name'], 'CORRECT');
  assert.equal(cat['Email Address'], 'WRONG_LABEL');
});

test('span_facts: out of scope, departments, public names, keys', () => {
  const text = 'Name,Department,DOB\nRavi Kumar,Field Services,12/07/1985\nSita Rao,Finance,01/01/1990\n';
  const at = (t, s) => ({ start: t.indexOf(s), end: t.indexOf(s) + s.length });
  const [hdr, dept, dob] = ok('span_facts', { text, spans: [at(text, 'Department'), at(text, 'Field Services'), at(text, '12/07/1985')] }).facts;
  const prose = 'Ravi works at Infosys.';
  const [inf] = ok('span_facts', { text: prose, spans: [at(prose, 'Infosys')] }).facts;
  assert.equal(hdr.in_key, true);
  assert.equal(dept.department, true);
  assert.ok(dob.out_of_scope);
  assert.ok(inf.known_name);
});

test('kb_lookup answers for companies and domains', () => {
  assert.equal(ok('kb_lookup', { kind: 'company', value: 'Infosys' }).well_known, true);
  const d = ok('kb_lookup', { kind: 'domain', value: 'zentrix-analytics-internal.in' });
  assert.equal(d.popular, false);
});

test('errors never quote the document', () => {
  const secret = 'hunter2-SECRET-VALUE';
  const r = call({ id: 9, method: 'compare', params: { left: secret, right: secret, detections: [{ start: 0, end: 999 }] } });
  assert.equal(r.error.code, 'bad_request');
  assert.ok(!JSON.stringify(r).includes(secret));
  assert.equal(call({ id: 1, method: '__proto__' }).error.code, 'unknown_method');
});
