// Regression tests for the known bugs (fixtures in tests/fixtures, file names in cases.json).
// Each test states the expected behaviour; see docs/GUIDE.md for the rules behind them.
const test = require('node:test');
const assert = require('node:assert/strict');
const { P, runCase, runTask } = require('./fixture-pipeline');

const DEPARTMENTS = ['Support', 'Logistics', 'Procurement', 'Finance', 'People Ops', 'Field Services', 'Compliance', 'Operations'];

const of = (r, cat) => r.findings.filter((f) => f.category === cat);
const det = (r, text) => r.detections.find((d) => d.text === text);
const show = (fs, r) => fs.map((f) => `${f.category} ${f.label || '-'}/${f.type || '-'} L“${r.at(f, 'left')}” R“${r.at(f, 'right')}”`).join('\n');

/** No finding and no detection may sit on a department value, a column header or a field label. */
function assertNothingOn(r, words) {
  for (const f of r.findings) {
    if (f.category === 'TASK') continue;
    for (const side of ['left', 'right']) {
      const t = r.at(f, side);
      if (!t) continue;
      for (const w of words) {
        assert.ok(!new RegExp(`(^|[^A-Za-z])${w}([^A-Za-z]|$)`).test(t), `finding on “${w}”: ${show([f], r)}`);
      }
    }
  }
  for (const d of r.detections) {
    for (const w of words) assert.ok(!d.text.includes(w), `detection ${d.label}/${d.type} “${d.text}” covers “${w}”`);
  }
}

// ---------------------------------------------------------------- BUG 1

test('bug 1 (csv): a bank number replaced by another valid one is redacted correctly, not overscrubbed', () => {
  const r = runCase('bug1-us-bank-csv');
  assert.deepEqual(of(r, 'OVER_REDACTED'), [], show(of(r, 'OVER_REDACTED'), r));
  for (const v of ['724878356', '4012888812', '55667788990', '310245678', '99887766554', '612093847']) {
    const ok = of(r, 'REDACTED_OK').find((f) => f.text === v);
    assert.ok(ok, `${v} redacted correctly\n${show(r.findings, r)}`);
    assert.equal(ok.type, 'US Bank Account/Routing Number');
  }
  assertNothingOn(r, DEPARTMENTS.concat(['record_id', 'department', 'status', 'us_bank_number']));
});

test('bug 1 (txt): department + "Us Bank Number" field label are never flagged', () => {
  const r = runCase('bug1-us-bank-txt');
  assert.deepEqual(of(r, 'OVER_REDACTED'), [], show(of(r, 'OVER_REDACTED'), r));
  assert.ok(!r.detections.some((d) => /Us Bank/.test(d.text)), 'no detection on "… Us Bank"');
  assertNothingOn(r, ['Support', 'Logistics', 'Compliance', 'Us Bank', 'Status']);
  for (const v of ['310245678', '724878356', '55667788990']) {
    assert.ok(of(r, 'REDACTED_OK').some((f) => f.text === v), `${v} redacted correctly\n${show(r.findings, r)}`);
  }
});

// ---------------------------------------------------------------- BUG 2

test('bug 2 (crypto csv): a wallet left unchanged is leakage labelled Crypto Wallet Address', () => {
  const r = runCase('bug2-crypto-csv');
  for (const v of ['0xab0432d43654a1ead1505a6a6dc40e0d9efdd83d', 'LTLU2kS3V7FExURsjAAUhvetrGLHbxREHt']) {
    const f = of(r, 'LEAKAGE').find((x) => x.text === v);
    assert.ok(f, `${v} leaked\n${show(r.findings, r)}`);
    assert.equal(f.type, 'Crypto Wallet Address');
    assert.equal(f.label, 'Account Number');
  }
  for (const v of ['0x15d44e2229060e03d152d339885570bf0bbc649c', '162V9PpF1ky8eEsX62TzccxFUQ7kCSQCP3']) {
    assert.ok(of(r, 'REDACTED_OK').some((f) => f.text === v), `${v} redacted correctly\n${show(r.findings, r)}`);
  }
  assertNothingOn(r, DEPARTMENTS);
});

test('bug 2 (ITIN + SSN csv): unchanged ITIN and SSN values are leakage with the documented label', () => {
  const r = runCase('bug2-itin-csv');
  for (const v of ['912-70-1234', '987-91-4321', '123-45-6789']) {
    const f = of(r, 'LEAKAGE').find((x) => x.text === v);
    assert.ok(f, `${v} leaked\n${show(r.findings, r)}`);
    assert.equal(f.type, 'US Social Security Number'); // ITIN → US SSN, see docs/GUIDE.md
  }
  for (const v of ['900-85-6789', '234-56-7890', '345-67-8901']) {
    assert.ok(of(r, 'REDACTED_OK').some((f) => f.text === v), `${v} redacted correctly\n${show(r.findings, r)}`);
  }
  assert.deepEqual(of(r, 'OVER_REDACTED'), [], show(of(r, 'OVER_REDACTED'), r));
  assertNothingOn(r, DEPARTMENTS);
});

// ---------------------------------------------------------------- BUG 3

test('bug 3 (pdf label): the whole multi-line address is one span; name and phone get their labels', () => {
  const r = runCase('bug3-address-pdf');
  const addr = r.detections.filter((d) => d.label === 'Address');
  const from = r.left.indexOf('214/09');
  const to = r.left.indexOf('208011') + 6;
  const covered = addr.filter((d) => d.start < to && d.end > from);
  assert.ok(covered.length >= 1, 'address detected');
  // Contiguous: the union of the address spans covers every line, landmark and PIN included.
  const s = Math.min(...covered.map((d) => d.start));
  const e = Math.max(...covered.map((d) => d.end));
  assert.equal(s, from, `address starts at the house number: ${covered.map((d) => d.text).join(' | ')}`);
  assert.equal(e, to, `address ends with the PIN code: ${covered.map((d) => d.text).join(' | ')}`);
  assert.equal(covered.length, 1, `one Address span: ${covered.map((d) => d.text).join(' | ')}`);
  assert.equal((det(r, 'Kavita Kavita') || {}).label, 'Person Name');
  assert.equal((det(r, '9839054321') || {}).type, 'Indian Mobile Number');
  assert.deepEqual(of(r, 'OVER_REDACTED'), [], show(of(r, 'OVER_REDACTED'), r));
});

// ---------------------------------------------------------------- BUG 4

test('bug 4 (kk json): departments are never Business Names; KK values get their label', () => {
  const r = runCase('bug4-kk-json');
  assert.ok(!r.detections.some((d) => d.label === 'Business Name'), r.detections.map((d) => d.text).join(', '));
  assertNothingOn(r, DEPARTMENTS);
  for (const v of ['9451533181049204', '3174091203880007', '3273012507910003']) {
    assert.equal((det(r, v) || {}).type, 'Indonesian Family Card (KK)', v);
  }
  assert.ok(of(r, 'LEAKAGE').some((f) => f.text === '3174091203880007'));
  assert.ok(!of(r, 'TASK').some((f) => /Unstructured/.test(f.text)), 'a JSON record file is structured');
});

test('bug 4: department values in a Department column are never PII, any format', () => {
  for (const dep of DEPARTMENTS) {
    for (const [left, right] of [
      [`Department: ${dep}\nOwner: Mr. Ravi Kumar`, `Department: ${dep}\nOwner: Mr. Arun Shah`],
      [`id,department,name\nR1,${dep},Ravi Kumar\n`, `id,department,name\nR1,${dep},Arun Shah\n`],
      [`{"department": "${dep}", "status": "open"}`, `{"department": "${dep}", "status": "open"}`],
    ]) {
      const r = runTask({ left, right, fileName: '' });
      assertNothingOn(r, [dep]);
    }
  }
});

// ---------------------------------------------------------------- BUG 5

test('bug 5 (sendgrid): the whole key is one span on both sides', () => {
  const r = runCase('bug5-sendgrid-txt');
  const key = 'S' + 'G.pdR5AS552xp4j7B4TNIXuh.Z4R43SYM9fwPo2W4ueete7Z6Fk6mjmkrHXs2NgV6dGS';
  assert.equal((det(r, key) || {}).type, 'SendGrid Key');
  const ok = of(r, 'REDACTED_OK').find((f) => f.text === key);
  assert.ok(ok, show(r.findings, r));
  assert.equal(r.at(ok, 'right'), 'S' + 'G.NJFSVO9Z6F8POXQXWT1QN5.URGAX3UQCVI1B87HPHYXDSV0S59KASVZP57KL648WFO');
  assert.ok(!r.findings.some((f) => r.at(f, 'right') === 'SG'), show(r.findings, r));
});

// Every multi-part secret (written in two parts, like detectors.test.js, so GitHub secret scanning accepts the push): replacing the secret but keeping the vendor prefix is a correct redaction.
const MULTIPART = [
  ['SendGrid Key', 'S' + 'G.pdR5AS552xp4j7B4TNIXuh.Z4R43SYM9fwPo2W4ueete7Z6Fk6mjmkrHXs2NgV6dGS', 'S' + 'G.NJFSVO9Z6F8POXQXWT1QN5.URGAX3UQCVI1B87HPHYXDSV0S59KASVZP57KL648WFO'],
  ['JWT Token', 'eyJhbGciOiJIUzI1NiJ9.' + 'eyJzdWIiOiJyYXZpLmt1bWFyIn0.Qm9sZEtleVNpZ25hdHVyZTEyMzQ1', 'eyJhbGciOiJIUzI1NiJ9.' + 'eyJzdWIiOiJ1c2VyXzAwMSJ9.WmFrZVNpZ25hdHVyZTk4NzY1NDMyMQ'],
  ['AWS Access Key ID', 'AK' + 'IAIOSFODNN7EXAMPLQ', 'AK' + 'IAJ5Q7R2T9W3X6Z8B4'],
  ['GitHub Token', 'ghp' + '_1a2B3c4D5e6F7g8H9i0J1k2L3m4N5o6P7q8R', 'ghp' + '_Z9y8X7w6V5u4T3s2R1q0P9o8N7m6L5k4J3i2'],
  ['GitHub Token', 'github' + '_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOP', 'github' + '_pat_11ZYXWVUT9876543210_zyxwvutsrqponmlkjihgfedcba9876543210ZYXWVUTSRQPONML'],
  ['Slack Token', 'xo' + 'xb-123456789012-1234567890123-AbCdEfGhIjKlMnOpQrStUvWx', 'xo' + 'xb-987654321098-9876543210987-ZyXwVuTsRqPoNmLkJiHgFeDc'],
  ['Stripe Key', 'sk_' + 'live_4eC39HqLyjWDarjtT1zdp7dc', 'sk_' + 'live_9xZ81JmNbvCQwerT5yui2opA'],
  ['npm Token', 'npm' + '_a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8', 'npm' + '_Z9y8X7w6V5u4T3s2R1q0P9o8N7m6L5k4J3i2'],
  ['OpenAI API Key', 'sk-' + 'proj-a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6', 'sk-' + 'proj-Z9y8X7w6V5u4T3s2R1q0P9o8N7m6L5k4'],
  ['Anthropic API Key', 'sk-' + 'ant-api03-a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8', 'sk-' + 'ant-api03-Z9y8X7w6V5u4T3s2R1q0P9o8N7m6L5k4J3i2'],
  ['GitLab Token', 'gl' + 'pat-a1B2c3D4e5F6g7H8i9J0', 'gl' + 'pat-Z9y8X7w6V5u4T3s2R1q0'],
];
for (const [type, before, after] of MULTIPART) {
  test(`bug 5 sweep: ${type} replaced keeping its prefix is one correct span`, () => {
    const r = runTask({ left: `token used: ${before} (rotated)\n`, right: `token used: ${after} (rotated)\n` });
    assert.equal((det(r, before) || {}).type, type, r.detections.map((d) => `${d.type} “${d.text}”`).join(', '));
    const issues = r.findings.filter((f) => f.category !== 'REDACTED_OK');
    assert.deepEqual(issues.map((f) => show([f], r)), []);
    const ok = of(r, 'REDACTED_OK').find((f) => f.text === before);
    assert.equal(r.at(ok, 'right'), after);
  });
  test(`bug 5 sweep: ${type} left unchanged is leakage over the whole token`, () => {
    const r = runTask({ left: `token used: ${before} (rotated)\n`, right: `token used: ${before} (rotated)\n` });
    const f = of(r, 'LEAKAGE').find((x) => x.text === before);
    assert.ok(f, show(r.findings, r));
    assert.equal(r.at(f, 'right'), before);
    assert.equal(f.type, type);
  });
}

test('bug 5: a key wrapped across two visual lines is still one span', () => {
  const key = 'S' + 'G.pdR5AS552xp4j7B4TNIXuh.Z4R43SYM9fwPo2W4ueete7Z6Fk6mjmkrHXs2NgV6dGS';
  const left = `SENDGRID_API_KEY=${key.slice(0, 30)}\n${key.slice(30)}\nNEXT=1`;
  const r = runTask({ left, right: left });
  const d = r.detections.find((x) => x.type === 'SendGrid Key');
  assert.ok(d, r.detections.map((x) => `${x.type} “${x.text}”`).join(', '));
  assert.equal(d.text.replace(/\s/g, ''), key);
});

// ---------------------------------------------------------------- BUG 6

test('bug 6 (git logs HEAD): author name is Person Name leakage; SHAs, timestamps and messages are never flagged', () => {
  const r = runCase('bug6-git-logs');
  assert.equal((det(r, 'Hrithvik Basak') || {}).label, 'Person Name', r.detections.map((d) => `${d.type} “${d.text}”`).join(', '));
  assert.ok(of(r, 'LEAKAGE').some((f) => f.text === 'Hrithvik Basak'), show(r.findings, r));
  assert.ok(of(r, 'REDACTED_OK').some((f) => f.text === 'Sneha Kulkarni'), show(r.findings, r));
  assert.ok(of(r, 'REDACTED_OK').some((f) => f.text === 'hrithvik.basak@gmail.com'), show(r.findings, r));
  for (const f of r.findings) {
    for (const side of ['left', 'right']) {
      const t = r.at(f, side) || '';
      assert.ok(!/[0-9a-f]{40}|\b17724\d{5}\b|\+0530|commit|merge|README|Fast-forward/.test(t), `not PII flagged: ${show([f], r)}`);
    }
    assert.ok(f.label, `every highlighted finding has a label: ${show([f], r)}`);
  }
});

// ---------------------------------------------------------------- BUG 7

test('bug 7 (vehicle): exact plate span, Indian Vehicle Number Plate label, every format', () => {
  const r = runCase('bug7-vehicle-txt');
  for (const v of ['DL 49 KL 4247', 'DL20E3136', 'JK 44 NQ 3504', 'MH-12-AB-1234']) {
    const d = det(r, v);
    assert.ok(d, `${v} detected exactly: ${r.detections.map((x) => `${x.type} “${x.text}”`).join(', ')}`);
    assert.equal(d.type, 'Indian Vehicle Number Plate');
    assert.ok(of(r, 'REDACTED_OK').some((f) => f.text === v), `${v} redacted correctly\n${show(r.findings, r)}`);
  }
  assert.ok(!r.detections.some((d) => d.label === 'Credentials'), r.detections.map((x) => `${x.type} “${x.text}”`).join(', '));
  assertNothingOn(r, ['Status', 'Ticket']);
});

// ---------------------------------------------------------------- BUG 8

test('bug 8 (passport csv): values get US Passport Number; the Hindi header is never flagged', () => {
  const r = runCase('bug8-passport-csv');
  for (const v of ['QC3660189', 'ICS204924', '378282371']) assert.equal((det(r, v) || {}).type, 'US Passport Number', v);
  assert.ok(of(r, 'LEAKAGE').some((f) => f.text === '378282371' && f.type === 'US Passport Number'), show(r.findings, r));
  const header = r.left.indexOf('\n');
  assert.ok(!r.findings.some((f) => f.left && f.left.start < header && f.category !== 'TASK'), show(r.findings, r));
  assertNothingOn(r, DEPARTMENTS);
});

test('bug 8 (kk csv): 16-digit values get Indonesian Family Card (KK); not "unstructured text"', () => {
  const r = runCase('bug8-kk-csv');
  for (const v of ['9451533181049204', '3174091203880007', '3273012507910003']) {
    assert.equal((det(r, v) || {}).type, 'Indonesian Family Card (KK)', v);
  }
  assert.ok(of(r, 'LEAKAGE').some((f) => f.text === '3174091203880007' && f.type === 'Indonesian Family Card (KK)'));
  assert.ok(!of(r, 'TASK').some((f) => /Unstructured/.test(f.text)));
  assertNothingOn(r, DEPARTMENTS);
});

test('bug 8: the task file name is parsed into a PII type hint', () => {
  assert.ok(P.fileHint, 'P.fileHint exists');
  const cases = {
    'by-pii-type~~us_bank_number~~records_0006.csv': 'US Bank Account/Routing Number',
    'by-pii-type~~sendgrid_key~~x.env': 'SendGrid Key',
    'by-pii-type~~kartu_keluarga~~x.json': 'Indonesian Family Card (KK)',
    'by-pii-type~~in_vehicle_registration~~x.txt': 'Indian Vehicle Number Plate',
    'by-pii-type~~us_itin~~x.csv': 'US Social Security Number',
    'by-pii-type~~passport_number~~x.csv': 'US Passport Number',
    'by-pii-type~~crypto_wallet~~x.csv': 'Crypto Wallet Address',
    'by-pii-type~~aws_secret_key~~repo~~.git~~logs~~HEAD': 'AWS Secret Access Key',
  };
  for (const [name, type] of Object.entries(cases)) assert.equal((P.fileHint.parse(name) || {}).type, type, name);
  assert.equal((P.fileHint.parse('by-pii-type~~aws_secret_key~~repo~~.git~~logs~~HEAD') || {}).format, 'git-log');
  assert.equal(P.fileHint.parse('notes.txt'), null);
});

test('bug 6 (git logs, history rewritten): new SHAs and timestamps are not flagged; every flag has a label', () => {
  const r = runCase('bug6-git-logs-rewritten');
  assert.ok(of(r, 'LEAKAGE').some((f) => f.text === 'Hrithvik Basak'), 'unchanged author name leaks');
  for (const n of ['Sneha Kulkarni', 'Arjun Nair']) assert.ok(of(r, 'REDACTED_OK').some((f) => f.text === n), `${n} redacted`);
  for (const f of r.findings.filter((x) => x.category !== 'TASK')) {
    assert.ok(f.label, `unlabelled finding: ${show([f], r)}`);
    for (const side of ['left', 'right']) {
      const t = r.at(f, side) || '';
      assert.ok(!/[0-9a-f]{40}|\b17724\d{5}\b|commit|checkout|rebase/.test(t), `not PII flagged: ${show([f], r)}`);
    }
  }
});

// ---------------------------------------------------------------- real invoice (PDF table text)

test('invoice (pdf table): headings are not names or addresses; the real addresses are found', () => {
  const left = require('fs').readFileSync(require('path').join(__dirname, 'fixtures/invoice-pdf-table/left.txt'), 'utf8');
  const dets = P.engine.run(left);
  const texts = dets.map((d) => `${d.label}: ${d.text}`);
  assert.ok(!dets.some((d) => /Goods and Services/.test(d.text)), texts.join(' | '));
  assert.ok(!dets.some((d) => d.label === 'Address' && /Delivery|Payment|Godown|Reference/.test(d.text)), texts.join(' | '));
  for (const a of ['No. 2, 3rd Floor, Manandi Plaza', 'St. Marks Rd, Shanthala Nagar, Ashok Nagar', 'R/at No. 33/1, Adur Village', 'Bidharahalli Hobli, Virgo Nagar Post']) {
    const d = dets.find((x) => x.label === 'Address' && x.text.includes(a));
    assert.ok(d, `address ${a}: ${texts.join(' | ')}`);
    assert.ok(d.confidence >= P.REVIEW_THRESHOLD, `${a} is reported (${d.confidence})`);
  }
  assert.ok(dets.some((d) => d.label === 'Business Name' && d.text === 'Kadence Private Limited'));
  // The model may call a heading an organisation; the merge drops it.
  const at = left.indexOf('Goods and Services');
  const merged = P.hybrid.merge(dets, [{ label: 'Business Name', start: at, end: at + 18, text: 'Goods and Services', score: 0.9 }], left);
  assert.ok(!merged.some((d) => d.text === 'Goods and Services'));
});

test('heading vocabulary: phrases of invoice/form words only', () => {
  for (const t of ['Goods and Services', 'Terms and Conditions', 'Mode/Terms of Payment', 'Delivery Note', 'Other References']) assert.ok(P.isDocPhrase(t), t);
  for (const t of ['Sunrise Traders', 'Kadence Private Limited', 'Ravi Kumar', 'Bluepeak Logistics Services']) assert.ok(!P.isDocPhrase(t), t);
});

// ---------------------------------------------------------------- lock files (yarn.lock, package-lock.json)

test('lock files: banner, package scopes and registry URLs are not PII', () => {
  const fs = require('fs');
  const path = require('path');
  for (const f of ['yarn.lock', 'package-lock.json']) {
    const left = fs.readFileSync(path.join(__dirname, 'fixtures/lockfiles', f), 'utf8');
    const dets = P.engine.run(left).filter((d) => d.confidence >= P.REVIEW_THRESHOLD);
    const texts = dets.map((d) => `${d.type}: ${d.text}`);
    assert.ok(!dets.some((d) => d.label === 'Person Name'), `${f}: ${texts.join(' | ')}`);
    assert.ok(!dets.some((d) => d.label === 'Person Username' && /^@(?:adobe|alloc|babel|apideck)$/.test(d.text)), `${f}: ${texts.join(' | ')}`);
    assert.ok(!dets.some((d) => /registry\.(?:npmjs\.org|yarnpkg\.com)/.test(d.text)), `${f}: ${texts.join(' | ')}`);
  }
});

test('all-caps banners are not names; real all-caps names in fields still are', () => {
  for (const t of ['# THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.', 'THIS IS GENERATED CODE, DO NOT MODIFY', 'HELLO WORLD PROGRAM']) {
    assert.ok(!P.engine.run(t).some((d) => d.label === 'Person Name'), t);
  }
  assert.ok(P.engine.run('NAME: RAVI KUMAR SHARMA').some((d) => d.label === 'Person Name' && d.text === 'RAVI KUMAR SHARMA'));
  assert.ok(P.engine.run('Hi, this is Ravi Kumar from accounts.').some((d) => d.label === 'Person Name' && d.text === 'Ravi Kumar'));
  assert.ok(P.engine.run('Follow @ravi_k92 for updates').some((d) => d.text === '@ravi_k92'), 'a real handle is still found');
});

test('package names are not usernames: hyphenated scopes and "user-…" packages', () => {
  for (const t of ['"@vite-pwa/assets-generator": {', '"@napi-rs/wasm-runtime"', 'resolved "https://x.test/user-home/-/user-home-1.1.1.tgz"', '    user-home "^1.1.1"']) {
    assert.ok(!P.engine.run(t).some((d) => d.label === 'Person Username'), t);
  }
  assert.ok(P.engine.run('Username - ravi_k92').some((d) => d.text === 'ravi_k92'), 'a spaced dash still separates a field');
  assert.ok(P.engine.run('GitHub: ravi-k92').some((d) => d.text === 'ravi-k92'));
});

test('open-source funding links are not URL/Link PII; other GitHub links still are', () => {
  for (const u of ['https://github.com/sponsors/sindresorhus', 'https://opencollective.com/babel', 'https://tidelift.com/funding/github/npm/debug']) {
    assert.ok(!P.engine.run(`"funding": { "url": "${u}" }`).some((d) => d.label === 'URL/Link'), u);
  }
  assert.ok(P.engine.run('Profile: https://github.com/ravi-k92').some((d) => d.label === 'URL/Link' || d.label === 'Person Username'));
});

test('funding and registry URLs in a real JSON package file (the "url" key goes through the field rule)', () => {
  const left = JSON.stringify({ packages: { 'node_modules/x': {
    resolved: 'https://registry.npmjs.org/x/-/x-1.0.0.tgz',
    funding: [{ url: 'https://github.com/sponsors/ljharb' }, { url: 'https://opencollective.com/parcel' },
      { url: 'https://github.com/vitejs/vite?sponsor=1' }, { url: 'https://www.patreon.com/feross' }, { url: 'https://paulmillr.com/funding/' }],
    homepage: { url: 'https://ravikumar.dev/about' },
  } } }, null, 2);
  const urls = P.engine.run(left).filter((d) => d.label === 'URL/Link').map((d) => d.text);
  assert.deepEqual(urls, ['https://ravikumar.dev/about'], 'only the personal site is a URL/Link');
});

// ---------------------------------------------------------------- @ in code is not a username

test('code: CSS/Tailwind/SCSS at-rules, doc tags, decorators and annotations are not usernames', () => {
  const fs = require('fs');
  const path = require('path');
  for (const f of ['styles.css', 'mixed.txt']) {
    const left = fs.readFileSync(path.join(__dirname, 'fixtures/code-at-rules', f), 'utf8');
    const users = P.engine.run(left).filter((d) => d.label === 'Person Username').map((d) => d.text);
    assert.deepEqual(users, [], `${f}: ${users.join(', ')}`);
  }
});

test('real handles in prose and fields are still usernames', () => {
  for (const [t, h] of [['Follow @ravi_k92 for updates', '@ravi_k92'], ['Follow us: @acme_official', '@acme_official'],
    ['thanks @meera_s, merged!', '@meera_s'], ['Twitter: @Priya_Codes', '@Priya_Codes'], ['cc @arjun.dev on this', '@arjun.dev']]) {
    assert.ok(P.engine.run(t).some((d) => d.label === 'Person Username' && d.text === h), `${t}: ${h}`);
  }
});

test('code from real projects: annotations, quoted @words and username assignments are not usernames', () => {
  for (const t of ['const runtimeRequire = // @ts-ignore\ntypeof require', 'const backOut = /*@__PURE__*/ (0, impor)',
    "return segment.startsWith('@') && segment !== '@children';", 'x.stack.indexOf("@") ? "@unknown:0:0" : "";',
    'font-display:swap}@font-face{font-family:satoshi}', 'const RE = /^(@babel\\/)(?!plugin-)/;',
    'value.includes("@license") || value.includes("@preserve")', 'const username = parsedURL.username;',
    's.username=r.username,s.password=r.password', 'e.username=n.getUsername(),e.password=n.getPassword()',
    'const user = null;']) {
    const users = P.engine.run(t).filter((d) => d.label === 'Person Username').map((d) => d.text);
    assert.deepEqual(users, [], `${t} -> ${users.join(', ')}`);
  }
  for (const [t, h] of [['{"twitter": "@ravi_k92", "city": "Pune"}', '@ravi_k92'], ['Username: ravi_k92', 'ravi_k92'], ['login = meera.s', 'meera.s']]) {
    assert.ok(P.engine.run(t).some((d) => d.label === 'Person Username' && d.text === h), `${t}: ${h}`);
  }
});

// ---------------------------------------------------------------- code config, roles, localhost, panel chrome

test('code: env lookups, variables passed to themselves, file names and placeholders are not secrets or usernames', () => {
  const t = ['# user = os.getenv("POSTGRES_USER", "qla")', '# password = os.getenv("POSTGRES_PASSWORD", "")', '#   user=user,',
    '#   password=password,', 'token: ${API_TOKEN}', 'DB_PASSWORD=$DB_PASSWORD', 'pwd=<password>', 'api_key = process.env.API_KEY',
    'password = config.db_password', '#app/config/secret-token.txt @cto', '#app/config/another-secret-token.txt cto@example.com'].join('\n');
  const found = P.engine.run(t).map((d) => `${d.type}: ${d.text}`);
  assert.deepEqual(found, []);
  for (const [s, v] of [['Password: $ecret123', '$ecret123'], ['api_key = sk_abc12345678', 'sk_abc12345678'], ['Username: ravi_k92', 'ravi_k92'],
    ['DB_PASSWORD=Tr0ub4dor&3', 'Tr0ub4dor&3']]) {
    assert.ok(P.engine.run(s).some((d) => d.text === v), s);
  }
});

test('localhost and loopback addresses are not URL/Link or IP Address; real private IPs still are', () => {
  const t = 'API_URL=http://localhost:8000/api/v1\nopen http://0.0.0.0:3000 or http://127.0.0.1:5173/ or http://api.local:8080 or [::1]\nloopback 127.0.0.1';
  assert.deepEqual(P.engine.run(t).map((d) => `${d.type}: ${d.text}`), []);
  assert.ok(P.engine.run('Server at 192.168.1.20').some((d) => d.type === 'Private IP Address'));
  assert.ok(P.engine.run('See https://ravikumar.dev/cv').some((d) => d.label === 'URL/Link'));
});

test('the review site\'s panel headings are not document text', () => {
  for (const t of ['right.gitignore-3143dca5', 'left.pdf-21bdc7be', 'left.sh-0b0e814e', 'Reference · read-only', 'Annotations · read-only',
    'Annotate here', '20 annotations', '1 match in the right document']) assert.ok(P.textModel.isPanelChrome(t), t);
  for (const t of ['Ravi Kumar', 'right side of the road', 'Annotate here and there please', 'left.']) assert.ok(!P.textModel.isPanelChrome(t), t);
});

test('names in capitals after a field, title or "Ship To:" are still names', () => {
  for (const [t, n] of [['Ship To:\nANKITA SHARMA\n12 MG ROAD', 'ANKITA SHARMA'], ['MR. RAVI KUMAR WILL ATTEND THE MEETING', 'RAVI KUMAR'],
    ['NAME: PRIYA SHARMA', 'PRIYA SHARMA']]) {
    assert.ok(P.engine.run(t).some((d) => d.label === 'Person Name' && d.text === n), t);
  }
});

// ---------------------------------------------------------------- orders export (Shopify-style CSV)

test('orders export CSV: column headings are never PII, even with multi-line notes; the data still is', () => {
  const fs = require('fs');
  const path = require('path');
  const base = fs.readFileSync(path.join(__dirname, 'fixtures/orders-export-csv/left.csv'), 'utf8');
  // The same export with a note that spans lines inside quotes, and capital headings.
  const multi = base.replace('Gift wrap please', '"Gift wrap please.\nCall before delivery,\nleave at gate"');
  const upper = base.replace(/^[^\n]*/, (h) => h.toUpperCase());
  for (const [name, text] of [['plain', base], ['multi-line notes', multi], ['capital headings', upper]]) {
    assert.equal(P.structured.parse(text).format, 'csv', `${name}: read as a table`);
    const header = text.indexOf('\n');
    const dets = P.engine.run(text);
    const inHeader = dets.filter((d) => d.start < header).map((d) => `${d.type}: ${d.text}`);
    assert.deepEqual(inHeader, [], name);
    assert.ok(!dets.some((d) => /^(?:Shipping|Billing) Company$/i.test(d.text)), name);
    for (const v of ['priya.sharma@gmail.com', 'Sunrise Traders Pvt Ltd', 'Orbitron Labs']) {
      assert.ok(dets.some((d) => d.text === v && d.confidence >= P.REVIEW_THRESHOLD), `${name}: ${v}`);
    }
  }
});

test('heading words in front of "Company" / "Services" are not company names', () => {
  for (const t of ['Shipping Company', 'Billing Company', 'Goods and Services', 'Delivery Services']) {
    assert.ok(!P.engine.run(`Columns: ${t}, Notes`).some((d) => d.label === 'Business Name'), t);
  }
  for (const t of ['Bluepeak Logistics', 'Sunrise Traders Pvt Ltd', 'Delivery Services Pvt Ltd']) {
    assert.ok(P.engine.run(`Vendor: ${t}`).some((d) => d.label === 'Business Name' && d.text === t), t);
  }
});

// ---------------------------------------------------------------- URL replaced but the site kept

test('a profile link whose personal part was replaced is redacted correctly, not "partly redacted"', () => {
  const run = (l, r) => runTask({ left: `Profile: ${l}\n`, right: `Profile: ${r}\n` });
  const ok = run('https://www.linkedin.com/in/priya-sharma-92', 'https://www.linkedin.com/in/meera-joshi-41');
  assert.ok(!ok.findings.some((f) => f.category === 'LEAKAGE'), ok.findings.map((f) => `${f.category} ${f.note}`).join(' | '));
  assert.ok(ok.findings.some((f) => f.category === 'REDACTED_OK' && f.label === 'URL/Link'));
  // The personal part kept is still a leak.
  const leak = run('https://www.linkedin.com/in/priya-sharma-92', 'https://www.linkedin.com/in/priya-sharma-07');
  assert.ok(leak.findings.some((f) => f.category === 'LEAKAGE' && /priya/i.test(f.note)), leak.findings.map((f) => `${f.category} ${f.note}`).join(' | '));
  const site = run('https://ravikumar.dev/about', 'https://ravikumar.dev/contact');
  assert.ok(site.findings.some((f) => f.category === 'LEAKAGE'), 'a personal domain kept is a leak');
});
