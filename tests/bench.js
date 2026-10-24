// Performance benchmark on a large synthetic document. Run: node tests/bench.js [records]
const { P } = require('./load');

const FIRST = ['Ravi', 'Priya', 'Anil', 'Meera', 'Arjun', 'Lakshmi', 'Kiran', 'Sneha', 'Vikram', 'Divya', 'Rahul', 'Pooja'];
const LAST = ['Sharma', 'Kumar', 'Rao', 'Iyer', 'Mehta', 'Reddy', 'Nair', 'Gupta', 'Das', 'Patel'];
const AREAS = ['Indiranagar', 'Jayanagar', 'Koramangala', 'Whitefield', 'Malleshwaram'];

/** Returns {leftText, rightText, rightLabels} with ~10 annotations per record and some deliberate mistakes. */
function makeDoc(records) {
  let left = '';
  let right = '';
  const labels = [];
  const add = (plain, label, mode) => {
    left += plain;
    if (!label || mode === 'miss') { right += plain; return; }
    const start = right.length;
    right += plain;
    labels.push({ label: mode === 'wrong' ? 'URL/Link' : label, rawLabel: label, known: true, start, end: right.length, text: plain, placeholder: false });
  };
  for (let i = 0; i < records; i++) {
    const name = `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`;
    const mode = i % 17 === 0 ? 'miss' : i % 23 === 0 ? 'wrong' : 'ok';
    add(`Record ${i + 1}. Name: `); add(name, 'Person Name');
    add('. DOB: '); add(`${String(1 + (i % 28)).padStart(2, '0')}/${String(1 + (i % 12)).padStart(2, '0')}/19${60 + (i % 40)}`); // out of scope
    add('. Mobile: '); add(`+91 9${String(800000000 + i * 7919).slice(0, 4)} ${String(10000 + i).slice(-5)}`, 'Contact Number', mode);
    add('. Email: '); add(`${name.toLowerCase().replace(' ', '.')}${i}@gmail.com`, 'Email Address', mode);
    add('. Address: '); add(`Flat ${100 + i}, ${i % 9 + 1}th Cross, ${AREAS[i % AREAS.length]}, Bengaluru`, 'Address');
    add(` 5600${String(10 + (i % 80)).padStart(2, '0')}`);
    add('. Account: '); add(`${50100000000000 + i}`, 'Account Number');
    add('. Last login on 2024-03-15 from '); add(`10.0.${i % 255}.${(i * 3) % 255}`, 'IP Address');
    add(`. Notes: Mr. ${name} called about the premium plan, reference to the meeting held earlier.\n`);
    if (i % 31 === 0) { const s = right.length - 40; labels.push({ label: 'Account Number', rawLabel: 'x', known: true, start: s, end: s + 7, text: right.slice(s, s + 7), placeholder: false }); }
  }
  return { leftText: left, rightText: right, rightLabels: labels.sort((a, b) => a.start - b.start) };
}

function time(label, fn) {
  const t0 = process.hrtime.bigint();
  const r = fn();
  console.log(label.padEnd(28), `${Number(process.hrtime.bigint() - t0) / 1e6 | 0} ms`);
  return r;
}

if (require.main !== module) { module.exports = { makeDoc }; return; }
const records = +(process.argv[2] || 2000);
const doc = makeDoc(records);
console.log(`records=${records} chars=${doc.leftText.length.toLocaleString()} rightLabels=${doc.rightLabels.length.toLocaleString()}`);
const perDetector = {};
for (const d of P.detectors) {
  const t0 = process.hrtime.bigint();
  d.detect(doc.leftText);
  perDetector[d.label] = Number(process.hrtime.bigint() - t0) / 1e6 | 0;
}
console.log('per detector (ms):', perDetector);
const detections = time('engine.run (all detectors)', () => P.engine.run(doc.leftText));
const res = time('compareDocuments', () => P.compare.compareDocuments({ ...doc, detections }));
console.log('detections', detections.length, 'findings', res.findings.length, res.stats.byCategory);
module.exports = { makeDoc };
