const test = require('node:test');
const assert = require('node:assert/strict');
const { P } = require('./load');

test('CSV headings provide context for name and company cells', () => {
  const text = 'Full Name,Company Name\njane doe,Acme Radian';
  const found = P.engine.run(text).map((d) => [d.type, d.text]);
  assert.ok(found.some(([type, value]) => type === 'Person Name' && value === 'jane doe'));
  assert.ok(found.some(([type, value]) => type === 'Business Name' && value === 'Acme Radian'));
});

test('Markdown table headings identify lowercase names and arbitrary company names', () => {
  const text = [
    '| Full Name | Company Name |',
    '| --- | --- |',
    '| sanchit | Acme Radian |',
  ].join('\n');
  const found = P.engine.run(text).map((d) => [d.type, d.text]);
  assert.ok(found.some(([type, value]) => type === 'Person Name' && value === 'sanchit'));
  assert.ok(found.some(([type, value]) => type === 'Business Name' && value === 'Acme Radian'));
});

test('tab-separated headings provide the same context as CSV', () => {
  const text = 'Full Name\tCompany Name\nsanchit\tAcme Radian';
  const found = P.engine.run(text).map((d) => [d.type, d.text]);
  assert.ok(found.some(([type, value]) => type === 'Person Name' && value === 'sanchit'));
  assert.ok(found.some(([type, value]) => type === 'Business Name' && value === 'Acme Radian'));
});

test('OCR artifacts in a full-name table cell are removed without losing the name', () => {
  const text = [
    '| Full Name | Company Name |',
    '| --- | --- |',
    '| Sanchit(cid:13)(cid:10) | Acme Radian |',
  ].join('\n');
  const found = P.engine.run(text).map((d) => [d.type, d.text]);
  assert.ok(found.some(([type, value]) => type === 'Person Name' && value === 'Sanchit'));
  assert.ok(found.some(([type, value]) => type === 'Business Name' && value === 'Acme Radian'));
});

test('consignee address cells are not misclassified as person names; postal code remains out of scope', () => {
  const text = [
    '| Consignee (Ship to) | Terms of Delivery |',
    '| --- | --- |',
    '| H-25 Galaxy City Amrawat Khurd Phase 1 Near Malhotra College Awadhpuri Huzur, Madhya Pradesh-462022 | |',
  ].join('\n');
  const found = P.engine.run(text);
  const address = found.find((d) => d.type === 'Address');
  assert.ok(address, 'the delivery address should be detected');
  assert.match(address.text, /Madhya Pradesh/);
  assert.doesNotMatch(address.text, /462022/, 'postal codes are out of scope');
  assert.ok(!found.some((d) => d.type === 'Person Name'), 'the consignee address is not a person name');
});

test('buyer table context preserves separate company and postal address detections', () => {
  const text = [
    '| Buyer (Bill to) | GSTIN/UIN |',
    '| --- | --- |',
    '| Splashstar Technologies Private Limited, 4th Floor, Flat Number 414 Mahaveer Cedar, Chikkasandra Village Bangalore-560090 | 29ABDCS1125R1ZW |',
  ].join('\n');
  const found = P.engine.run(text);
  const business = found.find((d) => d.type === 'Business Name');
  const address = found.find((d) => d.type === 'Address');
  assert.ok(business);
  assert.equal(business.text, 'Splashstar Technologies Private Limited');
  assert.ok(address);
  assert.match(address.text, /Mahaveer Cedar/);
  assert.doesNotMatch(address.text, /560090/);
  assert.ok(found.some((d) => d.type === 'Indian GSTIN' && d.text === '29ABDCS1125R1ZW'));
});

test('department labels in person-name fields are not detected as people', () => {
  const text = [
    'Name: Finance Department',
    'Approved by Sales Team',
    'Applicant: Product Engineering',
    'Prepared by Information Technology',
    'Customer Name: Jane Doe',
  ].join('\n');
  assert.deepEqual(P.engine.run(text)
    .filter((d) => d.type === 'Person Name')
    .map((d) => d.text), ['Jane Doe']);
});

test('inline field labels provide context and retain the specific PII type', () => {
  const text = 'Full Name: jane doe\nCompany PAN: AAAFZ1234Q';
  const found = P.engine.run(text).map((d) => [d.type, d.text]);
  assert.ok(found.some(([type, value]) => type === 'Person Name' && value === 'jane doe'));
  assert.ok(found.some(([type, value]) => type === 'Indian PAN (Business)' && value === 'AAAFZ1234Q'));
});

test('Bearer Token column identifies a well-shaped bearer token', () => {
  const value = 'abcdefghijklmnopQRST';
  const text = `Bearer Token,Notes\n---,---\n${value},synthetic`;
  const found = P.engine.run(text);
  const bearerType = P.detectors.flatMap((detector) =>
    detector.detect('Authorization: Bearer xxxxx.yyyyy.zzzzz')).find((d) => d.rule === 'key-bearer').label;
  assert.ok(found.some((d) => d.type === bearerType && d.text === value));
});

test('headings alone and well-known public business names are not flagged as PII', () => {
  const text = '| Full Name | Company Name |\n| --- | --- |\n| | Infosys |';
  assert.ok(!P.engine.run(text).some((d) => d.type === 'Person Name'));
  assert.ok(!P.engine.run(text).some((d) => d.type === 'Business Name'));
});

test('contextual detection returns valid source spans', () => {
  const text = 'Full Name,Company Name\njane doe,Acme Radian';
  for (const d of P.engine.run(text)) {
    assert.equal(text.slice(d.start, d.end), d.text);
    assert.ok(d.confidence > 0 && d.confidence < 1);
    assert.ok(d.source === 'regex' || d.source === 'heuristic');
  }
});
