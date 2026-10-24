// The business names list (data/business-names.json) and over-scrubbing of those names.
const test = require('node:test');
const assert = require('node:assert/strict');
const { P, detectLabel } = require('./load');

const K = P.knownNames;

test('the list is loaded from data/business-names.json with its categories', () => {
  assert.ok(K.size > 250);
  assert.deepEqual(K.lookup('Infosys'), { name: 'Infosys', category: 'Top MNCs · Indian IT' });
  assert.equal(K.lookup('HDFC Bank Ltd').category, 'Banks · Private');
  assert.equal(K.lookup('IIT Bombay').category, 'Institutes · Indian');
  assert.equal(K.lookup('Amul').category, 'Business Names');
  assert.equal(K.lookup('Larsen and Toubro Limited').name, 'Larsen & Toubro');
  assert.equal(K.lookup('Nimbus Cloud Technologies Pvt Ltd'), null);
});

test('names are found in running text, but not ordinary words or surnames', () => {
  const found = K.findIn('Ravi worked at Infosys and banks with SBI. The shell was empty. Harrison Ford drives a Ford.').map((x) => x.text);
  assert.deepEqual(found, ['Infosys', 'SBI', 'Ford']);
});

test('listed names are never flagged as Business Name; unlisted companies still are', () => {
  assert.deepEqual(detectLabel('Business Name', 'Employer: Infosys Technologies Pvt Ltd'), []);
  assert.deepEqual(detectLabel('Business Name', 'Loan from Bank of Baroda'), []);
  assert.deepEqual(detectLabel('Business Name', 'Partner: Reliance Retail Ltd'), []);
  assert.equal(detectLabel('Business Name', 'Vendor: Nimbus Cloud Technologies Pvt Ltd')[0].text, 'Nimbus Cloud Technologies Pvt Ltd');
});

test('L1: a listed name labeled on the right is over-scrubbing, with its category', () => {
  const text = 'Employee of Infosys and customer of HDFC Bank.';
  const at = (w) => ({ start: text.indexOf(w), end: text.indexOf(w) + w.length });
  const labels = [
    { label: 'Business Name', rawLabel: 'Business Name', known: true, ...at('Infosys'), text: 'Infosys', placeholder: false },
    { label: 'Business Name', rawLabel: 'Business Name', known: true, ...at('HDFC Bank'), text: 'HDFC Bank', placeholder: false },
  ];
  const res = P.compare.compareDocuments({ leftText: text, rightText: text, detections: P.engine.run(text), rightLabels: labels });
  const over = res.findings.filter((f) => f.category === 'OVERSCRUB');
  assert.equal(over.length, 2);
  assert.match(over[0].note, /business names list \(Top MNCs · Indian IT\).*over-scrubbing/);
  assert.equal(over[1].knownName.category, 'Banks · Private');
});

test('L2: a listed name replaced or removed on the right is over-scrubbing', () => {
  const check = (left, right) => {
    const detections = P.engine.run(left);
    const cmp = P.compare.compareDocuments({ leftText: left, rightText: right, detections, rightLabels: [] });
    return P.redaction.validate({ leftText: left, rightText: right, detections, alignment: cmp.alignment });
  };
  const replaced = check('Name: Ram Prasad works at Infosys in Pune.', 'Name: Raj Mehta works at Orbit Systems in Pune.');
  const f = replaced.findings.find((x) => x.category === 'OVER_REDACTED');
  assert.ok(f && /Over-scrubbing: “Infosys”/.test(f.note));
  assert.equal(f.suggest, 'keep');
  const removed = check('She banks with HDFC Bank today.', 'She banks with today.');
  assert.ok(removed.findings.some((x) => x.category === 'OVER_REDACTED' && /removed/.test(x.note)));
  // Kept as is: no finding at all.
  assert.ok(!check('Name: Ram Prasad works at Infosys.', 'Name: Raj Mehta works at Infosys.').findings.some((x) => x.text === 'Infosys'));
});
