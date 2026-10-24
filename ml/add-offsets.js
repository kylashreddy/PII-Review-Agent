// Fills in start/end for gold.json entries that only give the text, and reports any text that is not
// found in left.txt.   node add-offsets.js eval-data/real
const fs = require('fs');
const path = require('path');

const root = process.argv[2];
if (!root) { console.error('usage: node add-offsets.js <data-dir>'); process.exit(1); }
let problems = 0;
for (const id of fs.readdirSync(root).filter((f) => !f.startsWith('.'))) {
  const dir = path.join(root, id);
  const goldFile = path.join(dir, 'gold.json');
  if (!fs.existsSync(goldFile)) continue;
  const left = fs.readFileSync(path.join(dir, 'left.txt'), 'utf8');
  const gold = JSON.parse(fs.readFileSync(goldFile, 'utf8'));
  const taken = [];
  for (const g of gold) {
    if (Number.isInteger(g.start) && Number.isInteger(g.end)) { taken.push([g.start, g.end]); continue; }
    let from = 0;
    let at = -1;
    while ((at = left.indexOf(g.text, from)) >= 0 && taken.some(([a, b]) => at < b && at + g.text.length > a)) from = at + 1;
    if (at < 0) { console.log(`${id}: not found in left.txt: ${JSON.stringify(g.text)}`); problems++; continue; }
    g.start = at;
    g.end = at + g.text.length;
    taken.push([g.start, g.end]);
  }
  fs.writeFileSync(goldFile, JSON.stringify(gold, null, 1));
}
console.log(problems ? `${problems} entries not found` : 'all gold entries located');
