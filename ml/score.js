// Scores the extension on real tasks that reviewers saved with "Save task for testing".
//   npm run score                    reads *.pii-task.json from ~/Downloads
//   npm run score -- <file|folder>…  other places (files are copied in; the originals are not changed)
// Each task is imported once into ml/eval-data/real/ (git-ignored: it holds real document text), then
// rules (and the model and hybrid, when installed) are scored; the full report is ml/eval-report.md.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const REAL = path.join(__dirname, 'eval-data', 'real');

function findExports(args) {
  const places = args.length ? args : [path.join(os.homedir(), 'Downloads')];
  const files = [];
  for (const p of places) {
    if (!fs.existsSync(p)) { console.warn(`not found: ${p}`); continue; }
    if (fs.statSync(p).isFile()) { files.push(p); continue; }
    for (const f of fs.readdirSync(p)) if (f.endsWith('.pii-task.json')) files.push(path.join(p, f));
  }
  return files;
}

function importTask(file) {
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (err) { return { file, error: `not JSON: ${err.message}` }; }
  if (data.format !== 'pii-review-task' || typeof data.leftText !== 'string') return { file, error: 'not a saved task' };
  // Same document saved twice (e.g. after more decisions): keep the newest export.
  const id = crypto.createHash('sha1').update(data.leftText).digest('hex').slice(0, 10);
  const name = `${String(data.fileName || 'task').split('~~').pop().replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 40)}-${id}`;
  const dir = path.join(REAL, name);
  const metaFile = path.join(dir, 'meta.json');
  if (fs.existsSync(metaFile) && JSON.parse(fs.readFileSync(metaFile, 'utf8')).exported >= data.exported) return { file, skipped: true, name };
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'left.txt'), data.leftText);
  fs.writeFileSync(path.join(dir, 'gold.json'), JSON.stringify(data.gold, null, 1));
  fs.writeFileSync(metaFile, JSON.stringify({ fileName: data.fileName, stage: data.stage, version: data.version, exported: data.exported,
    partial: true, undecided: data.undecided, negatives: data.negatives }, null, 1));
  return { file, name, gold: data.gold.length, negatives: data.negatives.length, undecided: data.undecided };
}

function main() {
  const files = findExports(process.argv.slice(2));
  if (!files.length) {
    console.log('No saved tasks found. In the extension panel, press "Save task for testing" after reviewing a task,');
    console.log('then run this again (it looks in ~/Downloads, or pass a folder: npm run score -- <folder>).');
    return;
  }
  fs.mkdirSync(REAL, { recursive: true });
  let added = 0;
  for (const f of files) {
    const r = importTask(f);
    if (r.error) console.log(`skipped ${path.basename(f)}: ${r.error}`);
    else if (r.skipped) console.log(`already imported: ${r.name}`);
    else { added++; console.log(`imported ${r.name}: ${r.gold} PII, ${r.negatives} not PII, ${r.undecided} undecided`); }
  }
  const total = fs.readdirSync(REAL).filter((d) => fs.existsSync(path.join(REAL, d, 'left.txt'))).length;
  console.log(`\n${added} new, ${total} saved tasks in total. Scoring…\n`);
  execFileSync(process.execPath, [path.join(__dirname, 'eval.js'), REAL], { stdio: 'inherit', cwd: __dirname });
}

main();
