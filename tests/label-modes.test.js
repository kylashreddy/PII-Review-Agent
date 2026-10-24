// 'types' label mode: one label per PII type (the team's Complete PII Type List), for tasks whose label
// list names every type ("Indian Aadhaar Number", "Stripe Key"…). 'broad' mode (13 labels) is the default.
const test = require('node:test');
const assert = require('node:assert/strict');
const { P } = require('./load');

const C = P.compare.CATEGORY;
const withMode = (mode, fn) => { P.setLabelMode(mode); try { return fn(); } finally { P.setLabelMode('broad'); } };

const reported = (text) => P.engine.run(text).filter((d) => d.confidence >= P.REVIEW_THRESHOLD);
const DOC = 'Aadhaar: 2345 6789 0123\nPAN: ABCPS1234K\nMobile: +91 98450 12345\nOffice: 080-2345-6789\n' +
  'STRIPE_KEY=sk_' + 'live_51Hx9aaaabbbbccccddddeeee\nName: Ravi Kumar\nDOB: 14/08/1989\nAddress: 12 MG Road, Bengaluru\nPIN: 560038\n';

test('types mode: every finding carries its PII type as the label', () => withMode('types', () => {
  const got = Object.fromEntries(reported(DOC).map((d) => [d.text, d.label]));
  assert.equal(got['2345 6789 0123'], 'Indian Aadhaar Number');
  assert.equal(got.ABCPS1234K, 'Indian PAN (Individual)');
  assert.equal(got['+91 98450 12345'], 'Indian Mobile Number');
  assert.equal(got['080-2345-6789'], 'International Phone Number'); // "phone number other than an Indian mobile"
  assert.equal(got['Ravi Kumar'], 'Person Name');
  assert.ok(Object.values(got).includes('Stripe Key'));
  // out of scope in the list: date of birth, postal code
  assert.equal(got['14/08/1989'], undefined);
  assert.equal(got['560038'], undefined);
}));

test('broad mode is unchanged: types fold into the 13 labels', () => {
  const got = Object.fromEntries(reported(DOC).map((d) => [d.text, d.label]));
  assert.equal(got['2345 6789 0123'], 'Credentials');
  assert.equal(got['+91 98450 12345'], 'Contact Number');
  assert.equal(P.LABELS.length, 13);
});

test('labels on the right: type names are recognised in both modes', () => {
  const broad = P.compare.labelResolver({});
  assert.equal(broad('Indian Aadhaar Number'), 'Credentials');
  assert.equal(broad('Stripe Key'), 'Credentials');
  assert.equal(broad('Indonesian NIK'), 'Credentials');
  withMode('types', () => {
    const r = P.compare.labelResolver({});
    assert.equal(r('Indian Aadhaar Number'), 'Indian Aadhaar Number');
    assert.equal(r('Indonesian Driving Licence (SIM)'), 'Indonesian Driving Licence (SIM)');
    assert.equal(r('Credentials'), 'Credentials');
    assert.equal(r('Person Name'), 'Person Name');
    assert.equal(r('Overscrubbed'), 'Overscrubbed');
  });
});

test('types mode: a wrong type is reported; the general label and the exact type are accepted', () => withMode('types', () => {
  const left = 'Aadhaar: 2345 6789 0123\nPAN: ABCPS1234K\nMobile: +91 98450 12345\n';
  const detections = P.engine.run(left);
  const lab = (text, label) => ({ label, rawLabel: label, known: true, start: left.indexOf(text), end: left.indexOf(text) + text.length, text, placeholder: false });
  const rightLabels = [lab('2345 6789 0123', 'Indian Aadhaar Number'), lab('ABCPS1234K', 'Indian PAN (Business)'), lab('+91 98450 12345', 'Contact Number')];
  const res = P.compare.compareDocuments({ leftText: left, rightText: left, detections, rightLabels });
  const by = (t) => res.findings.find((f) => f.text === t);
  assert.equal(by('2345 6789 0123').category, C.CORRECT);
  assert.equal(by('ABCPS1234K').category, C.WRONG_LABEL);
  assert.match(by('ABCPS1234K').note, /same family, different type/);
  // The broad label of the type is accepted (team decision 2026-10-23).
  assert.equal(by('+91 98450 12345').category, C.CORRECT);
  assert.match(by('+91 98450 12345').note, /general label; the specific type is Indian Mobile Number/);
}));

test('types mode: labels are grouped and coloured like their broad label', () => withMode('types', () => {
  assert.ok(P.LABELS.length > 70);
  assert.equal(P.labelGroup('Stripe Key'), 'CRED');
  assert.equal(P.labelGroup('Indian Mobile Number'), 'PI');
  assert.equal(P.labelInfo('Indian GSTIN').color, P.labelInfo('Credentials').color);
  assert.equal(P.broadLabel('Indonesian NIK'), 'Credentials');
}));
