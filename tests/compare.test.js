// Tests for the LEFT/RIGHT comparison and classification.
const test = require('node:test');
const assert = require('node:assert/strict');
const { P } = require('./load');

const C = P.compare.CATEGORY;

/** Build right labels from marker syntax: "Hello {{Person Name|Ravi}}" */
function buildRight(marked) {
  let text = '';
  const labels = [];
  const re = /\{\{([^|}]+)\|([^}]*)\}\}/g;
  let last = 0;
  let m;
  while ((m = re.exec(marked)) !== null) {
    text += marked.slice(last, m.index);
    const start = text.length;
    text += m[2];
    const known = P.LABELS.some((l) => l.name === m[1]);
    labels.push({
      label: m[1], rawLabel: m[1], known, start, end: text.length, text: m[2],
      placeholder: /^\[.*\]$/.test(m[2]),
    });
    last = re.lastIndex;
  }
  text += marked.slice(last);
  return { text, labels };
}

function run(leftText, rightMarked) {
  const { text: rightText, labels: rightLabels } = buildRight(rightMarked);
  const detections = P.engine.run(leftText);
  return P.compare.compareDocuments({ leftText, rightText, detections, rightLabels });
}

const find = (res, category, text) => res.findings.find((f) => f.category === category && f.text === text);

test('span mode: correct, missed, wrong label and overscrub', () => {
  const left = 'Mr. Ravi Kumar lives here. Email ravi@gmail.com. Phone 9845012345. The premium plan is due.';
  const right = 'Mr. {{Person Name|Ravi Kumar}} lives here. Email {{URL/Link|ravi@gmail.com}}. Phone 9845012345. ' +
    'The {{Account Number|premium}} plan is due.';
  const res = run(left, right);
  assert.ok(find(res, C.CORRECT, 'Ravi Kumar'), 'name should be CORRECT');
  const wrong = find(res, C.WRONG_LABEL, 'ravi@gmail.com');
  assert.ok(wrong, 'email labeled as URL should be WRONG_LABEL');
  assert.equal(wrong.label, 'Email Address');
  assert.equal(wrong.rightLabel, 'URL/Link');
  const phone = find(res, C.MISSED, '9845012345');
  assert.ok(phone, 'phone should be MISSED');
  assert.equal(phone.type, 'Indian Mobile Number');
  assert.match(phone.note, /Contact Number \(Indian Mobile Number\)/);
  assert.ok(find(res, C.OVERSCRUB, 'premium'), '"premium" should be POSSIBLE OVERSCRUB');
  assert.equal(res.stats.byCategory.MISSED, 1);
});

test('placeholder mode: [PERSON_NAME] maps back to the left text', () => {
  const left = 'Hi Meera, your parcel ships on 05/11/2024 from Swift Logistics Pvt Ltd.';
  const right = 'Hi {{Person Name|[PERSON_NAME]}}, your parcel ships on 05/11/2024 from {{Business Name|[BUSINESS_NAME]}}.';
  const res = run(left, right);
  const name = find(res, C.CORRECT, 'Meera');
  assert.ok(name, 'placeholder should map to "Meera" and be CORRECT');
  assert.ok(name.right, 'right position known');
  assert.ok(find(res, C.CORRECT, 'Swift Logistics Pvt Ltd'));
  // A delivery date is not a date of birth, so it is not PII and not "missed".
  assert.ok(!res.findings.some((f) => f.text === '05/11/2024'));
});

test('placeholder mode: overscrubbed word replaced by a placeholder', () => {
  const left = 'Subject: Delivery reschedule for Mr. Arjun Mehta';
  const right = 'Subject: {{Person Name|[PERSON_NAME]}} reschedule for Mr. {{Person Name|[PERSON_NAME]}}';
  const res = run(left, right);
  assert.ok(find(res, C.OVERSCRUB, 'Delivery'));
  assert.ok(find(res, C.CORRECT, 'Arjun Mehta'));
});

test('dates are out of scope: not missed, and labeled dates are a possible overscrub', () => {
  const left = 'DOB: 14/08/1989. Last login on 2024-03-15. Callback on 22nd March 2024.';
  const right = 'DOB: {{Date|14/08/1989}}. Last login on {{Date|2024-03-15}}. Callback on 22nd March 2024.';
  const res = run(left, right);
  assert.ok(!res.findings.some((f) => f.category === C.MISSED), 'nothing is missed');
  const dob = find(res, C.OVERSCRUB, '14/08/1989');
  assert.ok(dob, 'a date of birth labeled Date is a possible overscrub');
  assert.match(dob.note, /Date of Birth, which is out of scope/);
  assert.match(find(res, C.OVERSCRUB, '2024-03-15').note, /a Date, which is out of scope/);
});

test('postal codes are out of scope: a labeled PIN code is a possible overscrub', () => {
  const left = 'Address: 12, MG Road, Bengaluru 560001';
  const right = 'Address: {{Address|12, MG Road, Bengaluru}} {{Address|560001}}';
  const res = run(left, right);
  assert.ok(find(res, C.CORRECT, '12, MG Road, Bengaluru'));
  assert.match(find(res, C.OVERSCRUB, '560001').note, /Postal Code, which is out of scope/);
});

test('boundary mismatch is NEEDS_REVIEW', () => {
  const left = 'Address: Flat 302, Sunrise Apartments, 5th Cross, Indiranagar, Bengaluru 560038';
  const right = 'Address: {{Address|Flat 302, Sunrise Apartments}}, 5th Cross, Indiranagar, Bengaluru 560038';
  const res = run(left, right);
  const f = res.findings.find((x) => x.label === 'Address');
  assert.equal(f.category, C.NEEDS_REVIEW);
  assert.match(f.note, /Boundary mismatch/);
});

test('split label ("Ravi" + "Kumar") counts as one CORRECT name', () => {
  const left = 'Name: Ravi Kumar';
  const right = 'Name: {{Person Name|Ravi}} {{Person Name|Kumar}}';
  const res = run(left, right);
  assert.ok(find(res, C.CORRECT, 'Ravi Kumar'));
  assert.equal(res.findings.length, 1);
});

test('low-confidence detection without a label is NEEDS_REVIEW, not MISSED', () => {
  const left = 'Contact Zentrix Services for help.'; // generic business suffix, 0.65
  const res = run(left, left);
  const f = res.findings.find((x) => x.text === 'Zentrix Services');
  assert.ok(f);
  assert.equal(f.category, C.NEEDS_REVIEW);
});

test('Overscrubbed label on non-PII is CORRECT', () => {
  const left = 'The premium plan is due.';
  const right = 'The {{Overscrubbed|premium}} plan is due.';
  const res = run(left, right);
  assert.ok(find(res, C.CORRECT, 'premium'));
});

test('unknown label names are flagged for selectors.js', () => {
  const left = 'Name: Ravi Kumar';
  const right = 'Name: {{PER_X|Ravi Kumar}}';
  const res = run(left, right);
  assert.ok(res.findings.some((f) => f.category === C.NEEDS_REVIEW && /labelAliases/.test(f.note)));
});

test('finding ids are unique and stable across runs', () => {
  const left = 'Mr. Ravi Kumar, ravi@gmail.com, 9845012345';
  const a = run(left, left).findings.map((f) => f.id);
  const b = run(left, left).findings.map((f) => f.id);
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, a.length);
});

test('alignment survives large documents with edits', () => {
  const words = Array.from({ length: 4000 }, (_, i) => `w${i % 97}x${i}`);
  const left = words.join(' ');
  const rightWords = words.slice();
  for (let i = 0; i < rightWords.length; i += 50) rightWords[i] = 'CHANGED';
  const { aToB } = P.compare.alignTokens(P.compare.tokenize(left).map((t) => t.t),
    P.compare.tokenize(rightWords.join(' ')).map((t) => t.t));
  const matched = aToB.filter((x) => x >= 0).length;
  assert.ok(matched > 3800, `matched ${matched}`);
});

test('label resolver understands site aliases', () => {
  const resolve = P.compare.labelResolver(P.SELECTORS);
  assert.equal(resolve('PERSON_NAME'), 'Person Name');
  assert.equal(resolve('phone'), 'Contact Number');
  assert.equal(resolve('Contact Number'), 'Contact Number');
  assert.equal(resolve('URL/Link'), 'URL/Link');
  assert.equal(resolve('Vehicle Number Plate'), 'Vehicle Number Plate');
  assert.equal(resolve('Credentials'), 'Credentials');
  assert.equal(resolve('IFSC'), 'Account Number');
  assert.equal(resolve('Aadhaar'), 'Credentials');
  assert.equal(resolve('Person Email'), 'Email Address', 'older label names still resolve');
  assert.equal(resolve('nonsense'), null);
  for (const l of P.LABELS) assert.equal(resolve(l.name), l.name, `${l.name} resolves to itself`);
});

test('large document: step-by-step comparison gives the same result as one go', async () => {
  const { makeDoc } = require('./bench.js');
  const doc = makeDoc(400);
  const detections = P.engine.run(doc.leftText);
  const sync = P.compare.compareDocuments({ ...doc, detections });
  const asyncResult = await P.compare.compareDocumentsAsync({ ...doc, detections }, () => true);
  assert.deepEqual(asyncResult.stats, sync.stats);
  assert.deepEqual(asyncResult.findings.map((f) => f.id), sync.findings.map((f) => f.id));
});

test('large document: alignment cache gives the same result and is reused', () => {
  const { makeDoc } = require('./bench.js');
  const doc = makeDoc(300);
  const detections = P.engine.run(doc.leftText);
  const cache = {};
  const a = P.compare.compareDocuments({ ...doc, detections, cache });
  const key = cache.alignKey;
  const b = P.compare.compareDocuments({ ...doc, detections, cache });
  assert.equal(cache.alignKey, key);
  assert.deepEqual(b.stats, a.stats);
});

test('large document: 2,000 records analyse in well under 2 seconds', () => {
  const { makeDoc } = require('./bench.js');
  const doc = makeDoc(2000);
  const t0 = Date.now();
  const detections = P.engine.run(doc.leftText);
  const res = P.compare.compareDocuments({ ...doc, detections });
  const ms = Date.now() - t0;
  assert.ok(ms < 2000, `took ${ms} ms`);
  assert.ok(res.findings.length > 10000);
});
