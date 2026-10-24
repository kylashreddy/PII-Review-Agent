// Tests for the L2 redaction check (redaction.js) and its rules.
const test = require('node:test');
const assert = require('node:assert/strict');
const { P } = require('./load');

const C = P.redaction.CATEGORY;

function check(left, right) {
  const detections = P.engine.run(left);
  const cmp = P.compare.compareDocuments({ leftText: left, rightText: right, detections, rightLabels: [] });
  return P.redaction.validate({ leftText: left, rightText: right, detections, alignment: cmp.alignment });
}
const has = (res, cat, text) => res.findings.some((f) => f.category === cat && (text == null || f.text === text));

test('correct, consistent redaction has no issues', () => {
  const left = 'Name: Ram Prasad. Email: ram.prasad@gmail.com. Later Mr. Ram Prasad called again.';
  const right = 'Name: Raj Mehta. Email: raj.mehta@gmail.com. Later Mr. Raj Mehta called again.';
  const res = check(left, right);
  const issues = res.findings.filter((f) => f.category !== C.REDACTED_OK);
  assert.deepEqual(issues, []);
  assert.ok(has(res, C.REDACTED_OK, 'Ram Prasad'));
  assert.ok(has(res, C.REDACTED_OK, 'ram.prasad@gmail.com'));
});

test('PI leakage: value left unchanged', () => {
  const res = check('Account No: 50100234567890. Name: Ram Prasad.', 'Account No: 50100234567890. Name: Raj Mehta.');
  assert.ok(has(res, C.LEAKAGE, '50100234567890'));
});

test('PI leakage: redacted in one place, leaked in another', () => {
  const left = 'Name: Ram Prasad. Mobile: 9845012345. Call 9845012345 after 5.';
  const right = 'Name: Raj Mehta. Mobile: 9123456780. Call 9845012345 after 5.';
  const res = check(left, right);
  assert.ok(res.findings.some((f) => f.category === C.LEAKAGE && /appears|not redacted/.test(f.note)));
});

test('PI leakage: only part of a name replaced', () => {
  const res = check('Name: Ram Prasad joined.', 'Name: Ram Mehta joined.');
  assert.ok(res.findings.some((f) => f.category === C.LEAKAGE && /partly/.test(f.note)));
});

test('incoherent: same value replaced in two different ways (Ram -> Raj and Sam)', () => {
  const left = 'Name: Ram Prasad. Notes: Mr. Ram Prasad agreed. Signed by: Ram Prasad';
  const right = 'Name: Raj Mehta. Notes: Mr. Sam Mehta agreed. Signed by: Raj Mehta';
  const res = check(left, right);
  const f = res.findings.find((x) => x.category === C.INCOHERENT);
  assert.ok(f, 'incoherent replacement found');
  assert.match(f.note, /Sam Mehta/);
});

test('incoherent: two different people given the same replacement', () => {
  const left = 'Name: Ram Prasad. Nominee: Shyam Verma.';
  const right = 'Name: Raj Mehta. Nominee: Raj Mehta.';
  assert.ok(has(check(left, right), C.INCOHERENT));
});

test('wrong data type: phone number replaced with a name', () => {
  const res = check('Mobile: +91 98450 12345 today', 'Mobile: Raj Kumar today');
  assert.ok(has(res, C.DATATYPE, '+91 98450 12345'));
});

test('not sensible: masked, placeholder and deleted replacements', () => {
  assert.ok(has(check('Aadhaar: 2345 6789 0123 ok', 'Aadhaar: XXXX ok'), C.NOT_SENSIBLE));
  assert.ok(has(check('Name: Ram Prasad joined', 'Name: [PERSON_NAME] joined'), C.NOT_SENSIBLE));
  assert.ok(has(check('Email: ram@gmail.com today', 'Email: today'), C.NOT_SENSIBLE));
});

test('over-redacted: non-PII words changed on the right are a decision for the employee (suggest keep)', () => {
  const res = check('Ram agreed to call back tomorrow.', 'Ram agreed to phone back tomorrow.');
  const f = res.findings.find((x) => x.category === C.OVER_REDACTED);
  assert.ok(f && /call/.test(f.note) && /phone/.test(f.note));
  assert.equal(f.suggest, 'keep');
});

test('unknown text: text added or removed on the right', () => {
  const added = check('The meeting is at noon.', 'The meeting is at noon. Extra sentence here.');
  assert.ok(added.findings.some((f) => f.category === C.UNKNOWN_TEXT && /not in the original/.test(f.note)));
});

test('top MNCs are not PII, so keeping them is not leakage', () => {
  const res = check('She works at Google and Infosys. Name: Ram Prasad.', 'She works at Google and Infosys. Name: Raj Mehta.');
  assert.ok(!has(res, C.LEAKAGE));
  assert.ok(P.knownNames.lookup('Infosys Technologies Pvt Ltd'));
  assert.ok(P.knownNames.lookup('HDFC Bank'));
  assert.ok(!P.knownNames.lookup('Nimbus Cloud Technologies Pvt Ltd'));
});

test('data type rules: by type when the shape is fixed, else by label', () => {
  const R = P.redactionRules;
  assert.ok(R.sameType('Contact Number', '+91 91234 56780', 'Indian Mobile Number'));
  assert.ok(!R.sameType('Contact Number', 'Raj Kumar'));
  assert.ok(R.sameType('Email Address', 'raj@gmail.com'));
  assert.ok(!R.sameType('Email Address', 'raj at example'));
  assert.ok(R.sameType('Date', '21/03/1990', 'Date of Birth'));
  assert.ok(R.sameType('Date', '3rd March 1990'));
  assert.ok(!R.sameType('Date', 'yesterday'));
  assert.ok(R.sameType('Person Name', 'Raj Mehta'));
  assert.ok(!R.sameType('Person Name', '9845012345'));
  assert.ok(R.sameType('Credentials', 'BNZPM2501F', 'Indian PAN (Individual)'));
  assert.ok(!R.sameType('Credentials', 'Raj', 'Indian PAN (Individual)'));
  assert.ok(R.sameType('Credentials', '4567 8912 3456', 'Indian Aadhaar Number'));
  assert.ok(!R.sameType('Credentials', '4567 8912', 'Indian Aadhaar Number'));
  assert.ok(R.sameType('Credentials', '987.654.321-00', 'Brazilian CPF'));
  assert.ok(R.sameType('Credentials', 'sk_live_abcdef', 'Stripe Key'), 'keys without a fixed shape fall back to the label');
  assert.ok(R.sameType('Account Number', 'HDFC0001234', 'Indian IFSC Code'));
  assert.ok(!R.sameType('Account Number', '1234', 'Indian IFSC Code'));
  assert.ok(R.sameType('Account Number', 'raj@ybl', 'Indian UPI ID'));
  assert.ok(R.sameType('IP Address', '00:11:22:33:44:55', 'MAC Address'));
  assert.ok(R.sameType('Vehicle Number Plate', 'KA05MN4321', 'Indian Vehicle Number Plate'));
  assert.ok(!R.sameType('URL/Link', 'Ravi Kumar'));
});

test('other language: Hindi (Devanagari) and Hinglish are flagged, English is not', () => {
  const R = P.redactionRules;
  const hindi = 'नमस्ते, मेरा नाम राम है और मैं बेंगलुरु में रहता हूँ। कृपया मुझे कल फोन करें। '.repeat(8);
  assert.equal(R.languageReport(hindi).verdict, 'other');
  assert.match(R.languageReport(hindi).languages[0].language, /Devanagari|Hindi/);
  const hinglish = 'Aap kal office aa rahe ho kya? Main bhi wahi hoon, aur mujhe report bhejna hai. Woh kaam abhi nahi hua hai. '.repeat(6);
  assert.equal(R.languageReport(hinglish).languages[0].language, 'Hinglish');
  const english = 'Please call the customer tomorrow and confirm the address for the delivery of the order. '.repeat(6);
  assert.equal(R.languageReport(english).verdict, 'english');
});

test('unstructured text is flagged, a normal letter is not', () => {
  const R = P.redactionRules;
  const log = Array.from({ length: 60 }, (_, i) => `{"ts":${1700000000 + i},"lvl":"INFO","k":"a8#kL2${i}","v":[${i},${i * 3}]}`).join(' ');
  assert.ok(R.structure(log));
  const letter = 'Dear Sir, I am writing to confirm the delivery of my order. The parcel arrived on time and in good condition. '.repeat(6);
  assert.equal(R.structure(letter), null);
});

test('task issues are reported for other-language documents', () => {
  const hindi = 'नमस्ते, मेरा नाम राम है और मैं बेंगलुरु में रहता हूँ। कृपया मुझे कल फोन करें। '.repeat(8);
  assert.ok(has(check(hindi, hindi), C.TASK));
});

test('shared replacement flags only the extra person, not every mention of the first', () => {
  const left = 'Name: Ram Prasad. Notes: Mr. Ram Prasad agreed. Nominee: Shyam Verma. Signed by: Ram Prasad';
  const right = 'Name: Raj Mehta. Notes: Mr. Raj Mehta agreed. Nominee: Raj Mehta. Signed by: Raj Mehta';
  const res = check(left, right);
  const inc = res.findings.filter((f) => f.category === C.INCOHERENT);
  assert.equal(inc.length, 1);
  assert.equal(inc[0].text, 'Shyam Verma');
});

test('a value replaced in several pieces counts as one replacement', () => {
  const res = check('Login ID: ravi_s89 for portal', 'Login ID: user_77 for portal');
  assert.ok(has(res, C.REDACTED_OK, 'ravi_s89'));
  assert.ok(!has(res, C.INCOHERENT));
});

test('every decision finding carries a suggestion: redact, keep or unsure', () => {
  // "Zorvak" (not a listed first name) repeated alone is only a possible name: unsure.
  const left = 'Name: Zorvak Prasad. Account No: 50100234567890. Customer Services will call. Zorvak agreed to call back.';
  const right = 'Name: Raj Mehta. Account No: 50100234567890. Customer Services will call. Zorvak agreed to phone back.';
  const res = check(left, right);
  const by = (c) => res.findings.find((f) => f.category === c);
  assert.equal(by(C.REDACTED_OK).suggest, 'redact');
  assert.equal(by(C.LEAKAGE).suggest, 'redact');
  assert.equal(by(C.OVER_REDACTED).suggest, 'keep');
  assert.equal(by(C.UNSURE).suggest, 'unsure');
});

test('language report: a mostly English task with some Hindi and Hinglish lines is flagged, with lines', () => {
  const text = [
    'Customer Support Ticket',
    'Name: Ravi Kumar',
    'Issue: The order has not arrived yet.',
    'नमस्ते, मेरा ऑर्डर अभी तक नहीं आया है। कृपया जल्दी भेजिए।',
    'Agent: We will check and update you today.',
    'Customer: Theek hai, par mujhe yeh kal tak chahiye kyunki gift hai.',
    'Agent: Noted, thank you for your patience.',
  ].join('\n');
  const r = P.redactionRules.languageReport(text);
  assert.equal(r.verdict, 'mixed');
  assert.deepEqual(r.segments.map((s) => [s.line, s.language]), [[4, 'Hindi/Marathi (Devanagari)'], [6, 'Hinglish']]);
  assert.match(r.reason, /lines 4, 6/);
  assert.match(r.reason, /sampling imperfection/);
});

test('language report: plain English with "main road", "do", "par" stays English', () => {
  const r = P.redactionRules.languageReport('Please do call the customer about the main road closure.\nThe course is par for the course.\nRegards, Ravi');
  assert.equal(r.verdict, 'english');
  assert.equal(r.reason, '');
});

test('language report: a Tamil document is "other"', () => {
  const r = P.redactionRules.languageReport('வணக்கம், என் பெயர் ராம். நான் சென்னையில் வசிக்கிறேன்.\nதயவுசெய்து நாளை அழைக்கவும்.');
  assert.equal(r.verdict, 'other');
  assert.equal(r.languages[0].language, 'Tamil');
});

test('phone number with most digits kept is a partial leak', () => {
  const left = 'Phone: +91 9876012345 for queries.';
  const res = check(left, 'Phone: +91 9876010000 for queries.');
  const f = res.findings.find((x) => x.category === C.LEAKAGE && x.label === 'Contact Number');
  assert.ok(f, 'kept the first six digits');
  assert.match(f.note, /partly redacted/);
  assert.ok(!check(left, 'Phone: +91 8123456789 for queries.').findings.some((x) => x.category === C.LEAKAGE), 'a new number is fine');
  assert.ok(check(left, 'Phone: +91 7012392345 for queries.').findings.some((x) => x.category === C.LEAKAGE), 'kept the last five digits');
});
