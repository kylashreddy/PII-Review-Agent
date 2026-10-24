// Collects the "Report" files reviewers saved from the extension into one summary.
//   npm run reports                    reads pii-report-*.json from ~/Downloads
//   npm run reports -- <file|folder>…  other places
// Writes ml/reports.md (git-ignored: it quotes document text) and prints the counts.
const fs = require('fs');
const os = require('os');
const path = require('path');

const places = process.argv.slice(2).length ? process.argv.slice(2) : [path.join(os.homedir(), 'Downloads')];
const files = [];
for (const p of places) {
  if (!fs.existsSync(p)) continue;
  if (fs.statSync(p).isFile()) files.push(p);
  else for (const f of fs.readdirSync(p)) if (/^pii-report-.*\.json$/.test(f)) files.push(path.join(p, f));
}
const reports = files.map((f) => { try { return { f, r: JSON.parse(fs.readFileSync(f, 'utf8')) }; } catch (e) { return null; } })
  .filter((x) => x && x.r.format === 'pii-review-report');
if (!reports.length) {
  console.log('No reports found. In the extension, "Report a problem" (finding details) or "Report" (select-to-check card)');
  console.log('saves a pii-report-….json file; collect them in ~/Downloads or pass a folder: npm run reports -- <folder>.');
  process.exit(0);
}

const one = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const rows = reports.sort((a, b) => String(a.r.created).localeCompare(String(b.r.created))).map(({ f, r }) => {
  if (r.kind === 'finding') {
    const x = r.finding;
    return { kind: 'Wrong finding', what: `${x.label || '-'}${x.type && x.type !== x.label ? ` (${x.type})` : ''} · ${x.category}`, text: x.text,
      why: one(x.note, 140), rule: x.rule || x.source || '', task: r.fileName, version: r.version, file: path.basename(f) };
  }
  return { kind: 'Selection', what: r.verdict ? r.verdict.title : '-', text: r.selection && r.selection.text,
    why: one(r.verdict && r.verdict.reasons && r.verdict.reasons.join(' · '), 140), rule: '', task: r.fileName, version: r.version, file: path.basename(f) };
});

const by = (k) => rows.reduce((m, x) => m.set(x[k], (m.get(x[k]) || 0) + 1), new Map());
const esc = (s) => one(s, 200).replace(/\|/g, '\\|');
const md = ['# Reports from reviewers', '', `${rows.length} reports.`, '',
  '| Kind | Finding / verdict | Count |', '|---|---|---|',
  ...[...by('what')].sort((a, b) => b[1] - a[1]).map(([w, n]) => `| ${rows.find((x) => x.what === w).kind} | ${esc(w)} | ${n} |`), '',
  '| # | Kind | Finding / verdict | Text | Why | Rule | Task | Version |', '|---|---|---|---|---|---|---|---|',
  ...rows.map((x, i) => `| ${i + 1} | ${x.kind} | ${esc(x.what)} | ${esc(x.text)} | ${esc(x.why)} | ${esc(x.rule)} | ${esc(String(x.task).split('~~').pop())} | ${esc(x.version)} |`)];
fs.writeFileSync(path.join(__dirname, 'reports.md'), md.join('\n') + '\n');
console.log(`${rows.length} reports (${[...by('kind')].map(([k, n]) => `${n} ${k.toLowerCase()}`).join(', ')}).`);
for (const [w, n] of [...by('what')].sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`  ${String(n).padStart(3)} × ${w}`);
console.log('\nFull list: ml/reports.md');
