// Edge-case sweep: every PII type × format × scenario, plus false-positive bait.
//   node tests/sweep.js            -> prints a summary, writes tests/fixtures/sweep-report.md
//   require('./sweep').run()       -> { cases, failures } (used by tests/sweep.test.js)
//
// For each type, `a` is an original value, `b` a different valid value of the same type (a correct
// fake), `wrong` a value of another type, and `kw` / `col` the field label used in text and tables.
// Secret-shaped values are written in two parts so GitHub secret scanning accepts the repository.
const fs = require('fs');
const path = require('path');
const { runTask } = require('./fixture-pipeline');

const S = (type, kw, col, a, b, wrong, opts) => ({ type, kw, col, a, b, wrong, ...(opts || {}) });

const SAMPLES = [
  S('Person Name', 'Customer Name', 'customer_name', 'Ravi Kumar', 'Arjun Shah', '9845012345'),
  S('Person Username', 'Username', 'username', 'ravi_k92', 'user_a01', 'Arjun Shah Mehta Rao'),
  S('GitHub Username', 'GitHub', 'github_username', 'ravi-k92', 'arjun-dev7', 'Arjun Shah Mehta'),
  S('Email Address', 'Email', 'email', 'ravi.kumar@gmail.com', 'arjun.shah@gmail.com', 'Arjun Shah'),
  S('Contact Number', 'Landline', 'phone', '080 2345 6789', '080 4567 1234', 'Arjun Shah'),
  S('Indian Mobile Number', 'Mobile', 'mobile', '9845012345', '9123456780', 'Arjun Shah'),
  S('International Phone Number', 'Phone', 'phone', '+44 20 7946 0958', '+44 161 496 0321', 'Arjun Shah'),
  S('Address', 'Address', 'address', '12, 5th Cross, MG Road, Indiranagar', '45, 2nd Main, Brigade Road, Koramangala', '9845012345', { formats: ['txt'] }),
  S('GPS Coordinates', 'GPS', 'gps', '12.9716, 77.5946', '13.0827, 80.2707', 'Arjun Shah', { formats: ['txt'] }),
  S('URL/Link', 'Profile', 'url', 'https://ravikumar.dev/about', 'https://arjunshah.dev/about', 'Arjun Shah'),
  S('Indian Vehicle Number Plate', 'Vehicle No', 'vehicle_number', 'KA 05 MN 4321', 'MH 12 AB 1234', 'Arjun Shah'),
  S('Vehicle Number Plate', 'Licence Plate', 'license_plate', '7ABC123', '8XYZ987', 'Arjun Shah'),
  S('Business Name', 'Company', 'company_name', 'Sunrise Traders Pvt Ltd', 'Moonlight Exports Pvt Ltd', '12345678'),
  S('Bank Account Number', 'Account No', 'account_number', '50100234567890', '60200345678901', 'Arjun Shah'),
  S('IBAN', 'IBAN', 'iban', 'GB82WEST12345698765432', 'DE89370400440532013000', 'Arjun Shah'),
  S('US Bank Account/Routing Number', 'Routing Number', 'routing_number', '021000021', '011000015', 'Arjun Shah'),
  S('Payment Card Number', 'Card Number', 'card_number', '4111 1111 1111 1111', '5500 0000 0000 0004', 'Arjun Shah'),
  S('Indian UPI ID', 'UPI', 'upi_id', 'ravi.kumar@okicici', 'arjun.s@oksbi', '12345'),
  S('Indian IFSC Code', 'IFSC', 'ifsc', 'HDFC0001234', 'ICIC0004321', 'Arjun Shah'),
  S('Crypto Wallet Address', 'Wallet', 'crypto_wallet', '0x15d44e2229060e03d152d339885570bf0bbc649c', '0x4156cb3c75a90ee7f7b9fbd8e25cfc7f0002e197', 'Arjun Shah'),
  S('Public IPv4 Address', 'IP', 'ip_address', '49.207.12.34', '103.21.58.9', 'Arjun Shah'),
  S('Private IP Address', 'IP', 'ip_address', '10.24.8.17', '10.0.0.11', 'Arjun Shah'),
  S('IPv6 Address', 'IPv6', 'ipv6', '2001:db8:85a3::8a2e:370:7334', '2400:cb00:2049:1::a29f:1804', 'Arjun Shah'),
  S('MAC Address', 'MAC', 'mac_address', '00:1A:2B:3C:4D:5E', 'A4:5E:60:C2:91:0B', 'Arjun Shah'),
  S('Passport Number', 'Passport No', 'passport_number', 'K1234567', 'J7654321', 'Arjun Shah'),
  S('US Passport Number', 'US Passport No', 'us_passport', '123456789', '987654321', 'Arjun Shah'),
  S('Indonesian Passport Number', 'Paspor', 'paspor', 'B1234567', 'C7654321', 'Arjun Shah'),
  S('Driver Licence Number', 'Driving Licence', 'driver_license', 'X12345678', 'Y87654321', 'Arjun Shah'),
  S('US Driver Licence Number', "California Driver's License", 'us_driver_license', 'D1234567', 'F7654321', 'Arjun Shah'),
  S('IMEI Number', 'IMEI', 'imei', '490154203237518', '356938035643809', 'Arjun Shah'),
  S('Indian Aadhaar Number', 'Aadhaar', 'aadhaar', '2345 6789 0124', '7896 5412 3698', 'Arjun Shah'),
  S('Indian PAN (Individual)', 'PAN', 'pan', 'BNZPM2501F', 'ABCPK1234L', 'Arjun Shah'),
  S('Indian GSTIN', 'GSTIN', 'gstin', '29ABCDE1234F1Z5', '27PQRST5678K1Z2', 'Arjun Shah'),
  S('Indian TAN', 'TAN', 'tan', 'BLRA12345B', 'MUMR54321C', 'Arjun Shah'),
  S('Indian CIN', 'CIN', 'cin', 'U72200KA2009PTC049889', 'L17110MH1973PLC019786', 'Arjun Shah'),
  S('Indian UAN', 'UAN', 'uan', '100234567890', '100987654321', 'Arjun Shah'),
  S('Indian Voter ID', 'Voter ID', 'voter_id', 'ABC1234567', 'XYZ7654321', 'Arjun Shah'),
  S('US Social Security Number', 'SSN', 'ssn', '123-45-6789', '234-56-7890', 'Arjun Shah'),
  S('US Employer Identification Number', 'EIN', 'ein', '12-3456789', '98-7654321', 'Arjun Shah'),
  S('Brazilian CPF', 'CPF', 'cpf', '529.982.247-25', '111.444.777-35', 'Arjun Shah'),
  S('Brazilian CNPJ', 'CNPJ', 'cnpj', '11.222.333/0001-81', '45.723.174/0001-10', 'Arjun Shah'),
  S('Indonesian NIK', 'NIK', 'nik', '3174091203880007', '3273012507910003', 'Arjun Shah'),
  S('Indonesian Family Card (KK)', 'No KK', 'nomor_kk', '9451533181049204', '5102847361902845', 'Arjun Shah'),
  S('Indonesian NPWP', 'NPWP', 'npwp', '01.234.567.8-901.000', '09.876.543.2-109.000', 'Arjun Shah'),
  S('SendGrid Key', 'SENDGRID_API_KEY', 'sendgrid_api_key', 'S' + 'G.pdR5AS552xp4j7B4TNIXuh.Z4R43SYM9fwPo2W4ueete7Z6Fk6mjmkrHXs2NgV6dGS',
    'S' + 'G.NJFSVO9Z6F8POXQXWT1QN5.URGAX3UQCVI1B87HPHYXDSV0S59KASVZP57KL648WFO', 'Arjun Shah'),
  S('Stripe Key', 'STRIPE_KEY', 'stripe_key', 'sk_' + 'live_4eC39HqLyjWDarjtT1zdp7dc', 'sk_' + 'live_9xZ81JmNbvCQwerT5yui2opA', 'Arjun Shah'),
  S('GitHub Token', 'GITHUB_TOKEN', 'github_token', 'ghp' + '_1a2B3c4D5e6F7g8H9i0J1k2L3m4N5o6P7q8R', 'ghp' + '_Z9y8X7w6V5u4T3s2R1q0P9o8N7m6L5k4J3i2', 'Arjun Shah'),
  S('AWS Access Key ID', 'AWS_ACCESS_KEY_ID', 'aws_access_key_id', 'AK' + 'IAIOSFODNN7EXAMPLQ', 'AK' + 'IAJ5Q7R2T9W3X6Z8B4', 'Arjun Shah'),
  S('JWT Token', 'token', 'jwt', 'eyJhbGciOiJIUzI1NiJ9.' + 'eyJzdWIiOiJyYXZpLmt1bWFyIn0.Qm9sZEtleVNpZ25hdHVyZTEyMzQ1',
    'eyJhbGciOiJIUzI1NiJ9.' + 'eyJzdWIiOiJ1c2VyXzAwMSJ9.WmFrZVNpZ25hdHVyZTk4NzY1NDMyMQ', 'Arjun Shah'),
  S('Password', 'Password', 'password', 'Pass@1234xyz', 'Word#9876abc', null, { formats: ['txt'] }),
];

// Out-of-scope types: never reported, and replacing them is not over-scrubbing to worry about here.
const BAIT = {
  departments: ['Field Services', 'People Ops', 'Procurement', 'Logistics', 'Support', 'Finance', 'Compliance', 'Operations'],
  statuses: ['open', 'closed', 'pending', 'active', 'inactive'],
  recordIds: ['R000001', 'R000042', 'R001337'],
  shas: ['47764c58fa7d6bfbe88939dfc6db2cfb92c57a58', 'a333e24011a25eb03f4cc04673094dbd762e3fea'],
  uuids: ['3f2b8c1e-9a4d-4e7b-b6a1-2c9d8e7f6a5b', '0d9c8b7a-6f5e-4d3c-2b1a-0f9e8d7c6b5a'],
};

// ---------------------------------------------------------------- documents

function txtDoc(kw, v, n) {
  // Repeated rows, a value next to punctuation and inside quotes.
  return [`Record R000001 Department: Support`, `${kw}: ${v}`, `Note: the value "${v}" was confirmed.`, `Status: open`].slice(0, n || 4).join('\n') + '\n';
}
function csvDoc(col, vals) {
  return [`record_id,department,status,${col}`, ...vals.map((v, i) => `R00000${i + 1},${BAIT.departments[i]},open,${/,/.test(v) ? `"${v}"` : v}`)].join('\n') + '\n';
}
function jsonDoc(col, vals) {
  return JSON.stringify(vals.map((v, i) => ({ record_id: `R00000${i + 1}`, department: BAIT.departments[i], status: 'open', [col]: v })), null, 2) + '\n';
}

const SCENARIOS = {
  changed: (s) => [s.a, s.b],
  unchanged: (s) => [s.a, s.a],
  masked: (s) => [s.a, '*'.repeat(Math.max(4, s.a.length))],
  deleted: (s) => [s.a, ''],
  wrongType: (s) => (s.wrong == null ? null : [s.a, s.wrong]),
};
const EXPECT = { changed: 'REDACTED_OK', unchanged: 'LEAKAGE', masked: 'NOT_SENSIBLE', deleted: 'NOT_SENSIBLE', wrongType: 'DATATYPE' };

function build(sample, format, scenario) {
  const pair = SCENARIOS[scenario](sample);
  if (!pair) return null;
  const [a, b] = pair;
  if (format === 'txt') return { left: `${sample.kw}: ${a}\nStatus: open\n`, right: `${sample.kw}: ${b}\nStatus: open\n` };
  // In a sentence, next to quotes and punctuation: (“…”), "…", end of sentence.
  if (format === 'prose') {
    const line = (v) => `Ticket R000042 (Support): the customer's ${sample.kw} is "${v}". Please verify (${sample.kw}: ${v}).\n`;
    return { left: line(a), right: line(b) };
  }
  // A table whose column name says nothing ("value"): only the file name says what the values are.
  if (format === 'csv-hint') {
    return { left: csvDoc('value', [a, a]), right: csvDoc('value', [b, b]), fileName: `by-pii-type~~${sample.col}~~records_0001.csv` };
  }
  // Non-English column names (Indonesian, Portuguese, Hindi).
  if (format === 'csv-intl') {
    const col = { 'Person Name': 'nama_lengkap', 'Brazilian CPF': 'número_cpf', 'Indonesian NIK': 'nomor_nik', 'Indonesian Family Card (KK)': 'nomor_kartu_keluarga',
      'Passport Number': 'पासपोर्ट' }[sample.type];
    return col ? { left: csvDoc(col, [a, a]), right: csvDoc(col, [b, b]) } : null;
  }
  // Tables repeat the value on a second row (the same value must get the same treatment).
  if (format === 'csv') return { left: csvDoc(sample.col, [a, a]), right: csvDoc(sample.col, [b, b]) };
  if (format === 'json') return { left: jsonDoc(sample.col, [a, a]), right: jsonDoc(sample.col, [b, b]) };
  return null;
}

// A hint or field gives a family's type ("Contact Number"); the value itself may say more ("Indian Mobile Number").
function sameOrMoreSpecific(got, want) {
  const { P } = require('./load');
  return got === want || (P.piiKeys && P.piiKeys.sameFamily(got, want) && P.specificityRank(got) < P.specificityRank(want));
}

function describe(r, f) {
  return `${f.category} ${f.label || '-'}${f.type && f.type !== f.label ? ` (${f.type})` : ''} L“${(r.at(f, 'left') || '').replace(/\n/g, '⏎')}” R“${(r.at(f, 'right') || '').replace(/\n/g, '⏎')}”`;
}

function check(sample, format, scenario) {
  const doc = build(sample, format, scenario);
  if (!doc) return null;
  const r = runTask({ fileName: '', ...doc });
  const want = EXPECT[scenario];
  // With a file name, the expected type is the one the file name maps to (docs/GUIDE.md).
  const { P } = require('./load');
  const expectType = doc.fileName && P.fileHint ? (P.fileHint.parse(doc.fileName) || {}).type : sample.type;
  const a = SCENARIOS[scenario](sample)[0];
  const atA = r.findings.filter((f) => f.left && r.left.slice(f.left.start, f.left.end).includes(a.split('\n')[0]) && f.category !== 'TASK');
  const hit = atA.find((f) => f.category === want);
  const problems = [];
  if (!hit) problems.push(`expected ${want}`);
  else if (!sameOrMoreSpecific(hit.type, expectType) && scenario !== 'deleted' && scenario !== 'masked') problems.push(`label ${hit.type || hit.label}, expected ${expectType}`);
  // Nothing may be flagged outside the value.
  const stray = r.findings.filter((f) => f.category !== 'TASK' && f.category !== 'REDACTED_OK' && !(f.left && r.left.slice(f.left.start, f.left.end).includes(a.split('\n')[0])) &&
    !(f.right && !f.left));
  if (stray.length) problems.push(`stray: ${stray.map((f) => describe(r, f)).join('; ')}`);
  if (!problems.length) return { ok: true };
  return {
    ok: false, type: sample.type, format, scenario,
    snippet: `${a} → ${SCENARIOS[scenario](sample)[1] || '(empty)'}`,
    actual: atA.length ? atA.map((f) => describe(r, f)).join('; ') : 'nothing at the value',
    expected: `${want} ${expectType}`,
    problems,
  };
}

function baitCases() {
  const out = [];
  const all = [...BAIT.departments, ...BAIT.statuses, ...BAIT.recordIds, ...BAIT.shas, ...BAIT.uuids];
  const docs = {
    txt: all.map((v, i) => `Row ${i}: Department: ${BAIT.departments[i % 8]} Ref: ${v}`).join('\n') + '\n',
    csv: ['record_id,department,status,commit,request_id',
      ...BAIT.recordIds.map((id, i) => `${id},${BAIT.departments[i]},${BAIT.statuses[i]},${BAIT.shas[i % 2]},${BAIT.uuids[i % 2]}`)].join('\n') + '\n',
    json: JSON.stringify(BAIT.recordIds.map((id, i) => ({ record_id: id, department: BAIT.departments[i + 3], status: BAIT.statuses[i],
      commit: BAIT.shas[i % 2], request_id: BAIT.uuids[i % 2], created: `2024-03-1${i} 10:2${i}` })), null, 2) + '\n',
    'git-log': BAIT.shas.map((s, i) => `${s} ${BAIT.shas[1 - i]} Build Bot <ci@example.com> 177244998${i} +0530\tcommit: Field Services sync for Support`).join('\n') + '\n',
  };
  for (const [format, text] of Object.entries(docs)) {
    const r = runTask({ left: text, right: text, fileName: '' });
    const flagged = r.findings.filter((f) => f.category !== 'TASK');
    out.push(flagged.length || r.detections.length
      ? { ok: false, type: '(false-positive bait)', format, scenario: 'unchanged', snippet: text.split('\n')[1].slice(0, 90),
        actual: flagged.map((f) => describe(r, f)).concat(r.detections.map((d) => `detected ${d.type} “${d.text}”`)).join('; '),
        expected: 'nothing flagged', problems: ['false positive'] }
      : { ok: true });
  }
  return out;
}

// Task file names, including paths inside archives.
const FILE_NAMES = [
  ['by-pii-type~~sendgrid_key~~bundle.zip~~config~~app.env', 'SendGrid Key', 'txt'],
  ['by-pii-type~~kartu_keluarga~~export.tar.gz~~2024~~families.json', 'Indonesian Family Card (KK)', 'json'],
  ['by-pii-type~~us_itin~~archive.zip~~nested.zip~~tax_ids.csv', 'US Social Security Number', 'csv'],
  ['by-pii-type~~aws_secret_key~~infra~~.git~~logs~~HEAD', 'AWS Secret Access Key', 'git-log'],
  ['by-pii-type~~in_vehicle_registration~~scans~~label_01.pdf', 'Indian Vehicle Number Plate', 'pdf'],
  ['BY-PII-TYPE~~Crypto_Wallet~~wallets.CSV', 'Crypto Wallet Address', 'csv'],
];

function fileNameCases() {
  const { P } = require('./load');
  return FILE_NAMES.map(([name, type, format]) => {
    const h = P.fileHint ? P.fileHint.parse(name) : null;
    return h && h.type === type && h.format === format ? { ok: true }
      : { ok: false, type, format: 'file name', scenario: 'parse', snippet: name, actual: JSON.stringify(h), expected: `${type} / ${format}`, problems: ['file name'] };
  });
}

function run() {
  const results = fileNameCases();
  for (const s of SAMPLES) {
    for (const format of s.formats || ['txt', 'csv', 'json', 'prose', 'csv-hint', 'csv-intl']) {
      for (const scenario of Object.keys(SCENARIOS)) {
        const res = check(s, format, scenario);
        if (res) results.push(res);
      }
    }
  }
  results.push(...baitCases());
  return { cases: results.length, failures: results.filter((r) => !r.ok) };
}

// Key- and token-shaped values are shortened in the report ("SG.4LA…(69 chars)") so the repository
// holds no secret-shaped text: GitHub secret scanning would reject the push.
const SECRET = /\b(?:SG\.[\w-]{16,}\.[\w-]{16,}|(?:sk|pk|rk)_(?:live|test)_\w{10,}|sk-(?:ant-|proj-)?[\w-]{20,}|gh[pousr]_\w{20,}|github_pat_\w{20,}|xox[abpres]-[\w-]{10,}|npm_\w{20,}|glpat-[\w-]{15,}|(?:AKIA|ASIA)[0-9A-Z]{16}|eyJ[\w-]+\.[\w-]+\.[\w-]+)/g;
const maskSecrets = (t) => String(t).replace(SECRET, (m) => `${m.slice(0, 6)}…(${m.length} chars)`);

function report({ cases, failures }) {
  const esc = (t) => maskSecrets(String(t)).replace(/\|/g, '\\|');
  const lines = [`# Edge-case sweep`, '', `${cases} cases, ${failures.length} failing. Generated by \`node tests/sweep.js\`.`, '',
    '| Type | File | Scenario | Input | Actual | Expected |', '|---|---|---|---|---|---|'];
  for (const f of failures) {
    lines.push(`| ${esc(f.type)} | ${f.format} | ${f.scenario} | ${esc(f.snippet)} | ${esc(f.actual)}${f.problems.length ? ` — ${esc(f.problems.join('; '))}` : ''} | ${esc(f.expected)} |`);
  }
  return lines.join('\n') + '\n';
}

module.exports = { run, report, maskSecrets, SAMPLES };

if (require.main === module) {
  const res = run();
  fs.writeFileSync(path.join(__dirname, 'fixtures', 'sweep-report.md'), report(res));
  console.log(`${res.cases} cases, ${res.failures.length} failing -> tests/fixtures/sweep-report.md`);
  const byType = {};
  for (const f of res.failures) byType[f.type] = (byType[f.type] || 0) + 1;
  console.log(byType);
}
