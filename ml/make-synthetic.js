// Generates a synthetic evaluation set with exact gold labels, in the same format as exported
// tasks (see ml/README.md):  ml/eval-data/synthetic/<id>/{left.txt, gold.json, meta.json}
// Everything is made up. A seeded random generator keeps the set the same on every run.
//   node make-synthetic.js [count]
const fs = require('fs');
const path = require('path');

let seed = 20261014;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));

const FIRST = ['Ravi', 'Priya', 'Kavita', 'Arjun', 'Meera', 'Sneha', 'Rohan', 'Kavya', 'Vikram', 'Lakshmi', 'Hrithvik', 'Ishaan',
  'Fatima', 'Harpreet', 'Sowmya', 'Anirudh', 'Deepa', 'Tanvi', 'Karthik', 'Nandini', 'Budi', 'Siti', 'Agus', 'Dewi', 'João', 'Maria',
  'Emily', 'Daniel', 'Aisha', 'Omar'];
const LAST = ['Kumar', 'Sharma', 'Basak', 'Nair', 'Iyer', 'Reddy', 'Kulkarni', 'Mehta', 'Banerjee', 'Chatterjee', 'Gill', 'Rao',
  'Pillai', 'Joshi', 'Deshpande', 'Santoso', 'Wijaya', 'Hartono', 'Silva', 'Oliveira', 'Carter', 'Brooks', 'Khan', 'Siddiqui'];
const COMPANIES = ['Zentrix Analytics', 'Bluepeak Logistics Pvt Ltd', 'Nimbus Foods', 'Kaveri Textiles Ltd', 'Orbitron Labs',
  'Sahyadri Agro Exports', 'Lumen Fintech Pvt Ltd', 'PT Sinar Jaya Abadi', 'Greenleaf Pharma', 'Vortex Mobility Solutions',
  'Tarang Media Networks', 'Arcadia Builders LLP', 'Quillstone Software', 'Mehta & Sons Traders', 'Indigo Crest Hospitality'];
const DEPTS = ['Field Services', 'People Ops', 'Procurement', 'Logistics', 'Finance', 'Compliance', 'Customer Support', 'Operations'];
const STREETS = [['214/09 C-3 Block, Govind Nagar', 'Kanpur'], ['45, 2nd Main, Koramangala 4th Block', 'Bengaluru'],
  ['Flat 302, Sunrise Apartments, MG Road', 'Pune'], ['12, 5th Cross, Indiranagar', 'Bengaluru'], ['Plot 77, Sector 21', 'Gurugram'],
  ['B-14, Lajpat Nagar II', 'New Delhi'], ['Jl. Merdeka No. 10, Gambir', 'Jakarta'], ['221 Baker Street', 'London'],
  ['1600 Amphitheatre Parkway', 'Mountain View'], ['House No. 9, Gandhi Road, Near City Hospital', 'Madurai']];
const USERS = ['ravi_k92', 'priya.codes', 'arjun-dev7', 'meera_s', 'k.nair88', 'snehaops', 'budi_s', 'rohan.m'];
const PLACES = ['the client site', 'our Mumbai office', 'the warehouse', 'head office'];

/** Builds a document while recording gold spans: d.t`…` style via add(). */
function doc() {
  let text = '';
  const gold = [];
  return {
    put(s) { text += s; },
    pii(label, s) { gold.push({ label, start: text.length, end: text.length + s.length, text: s }); text += s; },
    done: (meta) => ({ text, gold, meta }),
  };
}
const fullName = () => `${pick(FIRST)} ${pick(LAST)}`;
const phone = () => `9${int(100000000, 999999999)}`;

const TEMPLATES = {
  hrEmail() {
    const d = doc();
    const a = fullName(); const b = fullName(); const c = fullName(); const co = pick(COMPANIES);
    d.put('Dear '); d.pii('Person Name', a.split(' ')[0]); d.put(',\n\nThis is to confirm that ');
    d.pii('Person Name', a); d.put(` from the ${pick(DEPTS)} team has joined `); d.pii('Business Name', co);
    d.put(' as a senior analyst. Please reach out to '); d.pii('Person Name', b);
    d.put(` in ${pick(DEPTS)} for the onboarding kit.\n\nRegards,\n`); d.pii('Person Name', c); d.put(`\n${pick(DEPTS)}\n`);
    return d.done({ kind: 'hr-email' });
  },
  shippingLabel() {
    const d = doc();
    const [street, city] = pick(STREETS);
    d.put('SHIPPING LABEL\nOrder ID: 403-' + int(1000000, 9999999) + '\nShip To:\n'); d.pii('Person Name', fullName().toUpperCase());
    d.put('\n'); d.pii('Address', `${street}\n${city} - ${int(110001, 799999)}`); d.put('\nPhone: ' + phone() + '\nPayment: Prepaid\n');
    return d.done({ kind: 'shipping-label' });
  },
  chat() {
    const d = doc();
    const cust = pick(FIRST); const agent = pick(FIRST); const co = pick(COMPANIES);
    d.pii('Person Name', cust); d.put(': hi, my order from '); d.pii('Business Name', co); d.put(" hasn't arrived\n");
    d.pii('Person Name', agent); d.put(': sorry about that! can you share your username?\n');
    d.pii('Person Name', cust); d.put(': sure, it is '); d.pii('Person Username', pick(USERS)); d.put('\n');
    d.pii('Person Name', agent); d.put(`: thanks, I have escalated it to ${pick(DEPTS)}.\n`);
    return d.done({ kind: 'chat' });
  },
  csv() {
    const d = doc();
    d.put('record_id,name,company,department,status\n');
    for (let i = 1; i <= int(3, 6); i++) {
      d.put(`R00000${i},`); d.pii('Person Name', fullName()); d.put(','); d.pii('Business Name', pick(COMPANIES).replace(/,/g, ''));
      d.put(`,${pick(DEPTS)},${pick(['open', 'closed', 'pending'])}\n`);
    }
    return d.done({ kind: 'csv', fileName: 'by-pii-type~~person_name~~people.csv' });
  },
  json() {
    const d = doc();
    d.put('[\n');
    const n = int(2, 4);
    for (let i = 0; i < n; i++) {
      const [street, city] = pick(STREETS);
      d.put('  {"record_id": "R00000' + (i + 1) + '", "owner": "'); d.pii('Person Name', fullName());
      d.put('", "department": "' + pick(DEPTS) + '", "office": "'); d.pii('Address', `${street.replace(/\n/g, ' ')}, ${city}`);
      d.put('"}' + (i < n - 1 ? ',' : '') + '\n');
    }
    d.put(']\n');
    return d.done({ kind: 'json', fileName: 'by-pii-type~~address~~offices.json' });
  },
  prose() {
    const d = doc();
    const [street, city] = pick(STREETS);
    d.put('Yesterday '); d.pii('Person Name', fullName()); d.put(' met '); d.pii('Person Name', fullName()); d.put(' of ');
    d.pii('Business Name', pick(COMPANIES)); d.put(' at their office at '); d.pii('Address', `${street}, ${city}`);
    d.put(`. The ${pick(DEPTS)} team will follow up from ${pick(PLACES)} next week.\n`);
    return d.done({ kind: 'prose' });
  },
  lowercaseNotes() {
    const d = doc();
    const a = fullName().toLowerCase(); const co = pick(COMPANIES).toLowerCase();
    d.put('notes: spoke with '); d.pii('Person Name', a); d.put(' from '); d.pii('Business Name', co);
    d.put(`, they want the ${pick(DEPTS).toLowerCase()} report by friday.\n`);
    return d.done({ kind: 'lowercase-notes' });
  },
  gitLog() {
    const d = doc();
    for (let i = 0; i < int(2, 4); i++) {
      const name = fullName();
      d.put(`${'0123456789abcdef'.repeat(3).slice(i, i + 40)} ${'fedcba9876543210'.repeat(3).slice(i, i + 40)} `);
      d.pii('Person Name', name); d.put(` <${name.toLowerCase().replace(' ', '.')}@gmail.com> 17724${int(10000, 99999)} +0530\tcommit: ${pick(['Fix retry logic', 'Update README', 'Bump deps'])}\n`);
    }
    return d.done({ kind: 'git-log', fileName: 'by-pii-type~~person_name~~repo~~.git~~logs~~HEAD' });
  },
  invoice() {
    const d = doc();
    const [street, city] = pick(STREETS);
    d.put('TAX INVOICE\nBill To:\n'); d.pii('Business Name', pick(COMPANIES)); d.put('\n');
    d.pii('Address', `${street}, ${city}`); d.put('\nAttn: '); d.pii('Person Name', fullName());
    d.put(`\nPrepared by: ${pick(DEPTS)}\nAmount: INR ${int(1000, 99999)}.00\n`);
    return d.done({ kind: 'invoice' });
  },
  indonesian() {
    const d = doc();
    d.put('Nama: '); d.pii('Person Name', `${pick(['Budi', 'Siti', 'Agus', 'Dewi'])} ${pick(['Santoso', 'Wijaya', 'Hartono'])}`);
    d.put('\nAlamat: '); d.pii('Address', `Jl. ${pick(['Merdeka', 'Sudirman', 'Diponegoro'])} No. ${int(1, 99)}, ${pick(['Gambir', 'Menteng', 'Kebayoran'])}`);
    d.put('\nPerusahaan: '); d.pii('Business Name', pick(['PT Sinar Jaya Abadi', 'PT Maju Bersama', 'CV Karya Mandiri']));
    d.put(`\nDepartemen: ${pick(DEPTS)}\n`);
    return d.done({ kind: 'indonesian' });
  },
};

function main() {
  const count = +(process.argv[2] || 200);
  const dir = path.join(__dirname, 'eval-data', 'synthetic');
  fs.rmSync(dir, { recursive: true, force: true });
  const kinds = Object.keys(TEMPLATES);
  for (let i = 0; i < count; i++) {
    const t = TEMPLATES[kinds[i % kinds.length]]();
    const id = String(i + 1).padStart(4, '0') + '-' + t.meta.kind;
    const out = path.join(dir, id);
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'left.txt'), t.text);
    fs.writeFileSync(path.join(out, 'gold.json'), JSON.stringify(t.gold, null, 1));
    fs.writeFileSync(path.join(out, 'meta.json'), JSON.stringify({ fileName: t.meta.fileName || '', kind: t.meta.kind, synthetic: true }, null, 1));
  }
  console.log(`${count} synthetic tasks in ${path.relative(process.cwd(), dir)}`);
}

main();
