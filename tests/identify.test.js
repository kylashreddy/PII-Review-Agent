// L1 identification mode (identify.js) and project rules for identification.
const test = require('node:test');
const assert = require('node:assert/strict');
const { P, detectLabel } = require('./load');

const C = P.identify.CATEGORY;

function identify(left, labels) {
  const detections = P.engine.run(left);
  const cmp = P.compare.compareDocuments({ leftText: left, rightText: left, detections, rightLabels: labels || [] });
  return P.identify.fromCompare(cmp);
}
const lab = (text, whole, label) => {
  const start = text.indexOf(whole);
  return { label, rawLabel: label, known: true, start, end: start + whole.length, text: whole, placeholder: false };
};

test('the 13 site labels, grouped Personal, Business, Credentials', () => {
  assert.equal(P.LABELS.length, 13);
  assert.equal(P.labelGroup('Person Name'), 'PI');
  assert.equal(P.labelGroup('Email Address'), 'PI');
  assert.equal(P.labelGroup('Vehicle Number Plate'), 'PI');
  assert.equal(P.labelGroup('Business Name'), 'BI');
  assert.equal(P.labelGroup('Account Number'), 'CRED');
  assert.equal(P.labelGroup('Credentials'), 'CRED');
  assert.equal(P.labelGroup('IP Address'), 'CRED');
  assert.equal(P.labelGroup('Overscrubbed'), null);
  assert.equal(P.labelOfType('Indian GSTIN'), 'Credentials');
  assert.equal(P.labelOfType('Indian UPI ID'), 'Account Number');
  assert.equal(P.labelOfType('GPS Coordinates'), 'Address');
});

test('nothing labeled yet: every PI and BI item is "to identify"', () => {
  const text = 'Name: Ravi Kumar. Mobile: 9845012345. Employer: Nimbus Cloud Technologies Pvt Ltd. PAN: ABCPK1234L.';
  const res = identify(text);
  const of = (c) => res.findings.filter((f) => f.category === c).map((f) => f.text).sort();
  assert.deepEqual(of(C.PI_TODO), ['9845012345', 'Ravi Kumar']);
  assert.deepEqual(of(C.BI_TODO), ['Nimbus Cloud Technologies Pvt Ltd']);
  assert.deepEqual(of(C.CRED_TODO), ['ABCPK1234L']);
  assert.ok(res.findings.every((f) => f.status === 'unlabeled' && /label it as/.test(f.note)));
  assert.deepEqual(res.stats.byGroup, { PI: 2, BI: 1, CRED: 1 });
});

test('Unicode person and business names appear in the identification findings', () => {
  const res = identify('Name: José García. Contact: Dr. Олег Иванов. Employer: Société Générale Technologies.');
  const found = res.findings.map((f) => [f.text, f.label]);
  assert.ok(found.some(([text, label]) => text === 'José García' && label === 'Person Name'));
  assert.ok(found.some(([text, label]) => text === 'Олег Иванов' && label === 'Person Name'));
  assert.ok(found.some(([text, label]) => text === 'Société Générale Technologies' && label === 'Business Name'));
});

test('labeled items are identified, wrong labels and extra labels are flagged', () => {
  const text = 'Name: Ravi Kumar. Mobile: 9845012345. The premium plan is due.';
  const res = identify(text, [
    lab(text, 'Ravi Kumar', 'Person Name'),
    lab(text, '9845012345', 'Account Number'),
    lab(text, 'premium', 'Business Name'),
  ]);
  const get = (t) => res.findings.find((f) => f.text === t);
  assert.equal(get('Ravi Kumar').category, C.IDENTIFIED);
  assert.equal(get('9845012345').category, C.PI_TODO);
  assert.equal(get('9845012345').status, 'wrong');
  assert.equal(get('premium').category, C.NOT_PII);
});

test('URLs and vehicle plates are identified; dates are not (out of scope)', () => {
  const names = new Set(P.LABELS.map((l) => l.name));
  const res = identify('Name: Ravi Kumar, DOB: 12/05/1990, IP 10.0.0.1, card 4111 1111 1111 1111, www.acmeportal.org, car KA 01 AB 1234');
  const get = (t) => res.findings.find((f) => f.text === t);
  assert.equal(get('www.acmeportal.org').label, 'URL/Link');
  assert.equal(get('KA 01 AB 1234').label, 'Vehicle Number Plate');
  assert.equal(get('10.0.0.1').type, 'Private IP Address');
  assert.ok(!get('12/05/1990'), 'a date of birth is out of scope');
  for (const f of res.findings) assert.ok(names.has(f.label), f.label);
});

test('dummy domains (example.com and friends) are not identified', () => {
  for (const t of ['Mail ravi@example.com today', 'a.b@example.org', 'x@mail.example', 'ops@server.test', 'me@example.co.in', 'sales@example.com']) {
    assert.deepEqual(P.engine.run(t), [], t);
  }
  // Real-looking domains still are
  assert.equal(detectLabel('Email Address', 'Mail ravi.k@gmail.com today')[0].text, 'ravi.k@gmail.com');
});

test('L2: a placeholder email on a dummy domain is not leakage', () => {
  const left = 'Contact: support@example.com or Name: Ram Prasad.';
  const right = 'Contact: support@example.com or Name: Raj Mehta.';
  const detections = P.engine.run(left);
  const cmp = P.compare.compareDocuments({ leftText: left, rightText: right, detections, rightLabels: [] });
  const res = P.redaction.validate({ leftText: left, rightText: right, detections, alignment: cmp.alignment });
  assert.ok(!res.findings.some((f) => f.category === 'LEAKAGE'));
});
