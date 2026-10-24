// One-command beta release for the team (maintainers only; needs git, the GitHub CLI `gh`, and the
// model and knowledge base installed: npm run setup-model, npm run build-kb).
//
//   npm run release -- --next          the beta after the last release (ml-beta-5 -> 2.1.0 beta 6), then release
//   npm run release                    release the current version (if it has no release yet)
//   npm run release -- --next --dry-run   show what would happen; change nothing
//   … --yes                            do not ask before publishing
//
// Steps: clean tree on main -> (bump + commit) -> tests + release checks -> build with model and knowledge
// base -> push main to every repo -> GitHub pre-release "ml-beta-N" on every repo with the zip, install steps
// and "what's new" (CHANGELOG lines added since the previous beta) -> prints the message for the team.
'use strict';
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const run = (cmd, a, opts) => execFileSync(cmd, a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
const step = (s) => console.log(`\n▸ ${s}`);

function fail(msg) { console.error(`\n✗ ${msg}`); process.exit(1); }

function ask(q) {
  if (args.includes('--yes')) return Promise.resolve(true);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(`${q} [y/N] `, (a) => { rl.close(); res(/^y(es)?$/i.test(a.trim())); }));
}

/** "2.1.0 beta 6" -> {base: "2.1.0", beta: 6} */
function parseVersion(manifest) {
  const m = /^(\d+\.\d+\.\d+)(?: beta (\d+))?$/.exec(manifest.version_name || manifest.version);
  if (!m) fail(`version_name "${manifest.version_name}" is not "X.Y.Z beta N"`);
  return { base: m[1], beta: m[2] ? Number(m[2]) : 0 };
}

/** CHANGELOG bullets added since the previous release tag (or the top of "Unreleased" when there is none). */
function changesSince(tag) {
  let added = [];
  try {
    const diff = run('git', ['diff', `${tag}..HEAD`, '--', 'CHANGELOG.md']);
    added = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1));
  } catch (err) {
    added = read('CHANGELOG.md').split('## Unreleased')[1].split('\n## ')[0].split('\n');
  }
  // Join wrapped bullet lines into one line per bullet.
  const bullets = [];
  for (const l of added) {
    if (/^- /.test(l)) bullets.push(l);
    else if (/^\s{2,}\S/.test(l) && bullets.length) bullets[bullets.length - 1] += ` ${l.trim()}`;
  }
  return bullets.slice(0, 12);
}

function notes({ label, repo, tag, changes, zipName, typesZipName }) {
  const zip = `https://github.com/${repo}/releases/download/${tag}/${zipName}`;
  const typesZip = `https://github.com/${repo}/releases/download/${tag}/${typesZipName}`;
  return `## PII Review Assistant — v${label}

### ⬇️ Download (pick one)
| Version | For | Download |
|---|---|---|
| **Standard** | all tasks; switches to one label per PII type by itself on tasks that list the types | **[${zipName}](${zip})** |
| **PII Types** | tasks labelled with the full PII type list (Indian Aadhaar Number, Stripe Key, Indonesian NIK…): always one label per type | **[${typesZipName}](${typesZip})** |

Each is about 270 MB (the on-device model is included). Install **only one** of them.

### ✨ What's new
${changes.length ? changes.join('\n') : '- Fixes and improvements.'}

### Update from an older beta
Unzip **into the same folder** (replace all files) → \`chrome://extensions\` → **↻ reload** on PII Review Assistant → reload the task page.
The panel footer then shows **v${label}**.

### First time (5 minutes)
1. Download the zip above and unzip it into a folder you will keep (not Downloads).
2. Chrome → \`chrome://extensions\` → **Developer mode** on → remove any old PII Review Assistant → **Load unpacked** → pick the folder (the one with \`manifest.json\`).
3. **Details → Extension options** → tick **Use model suggestions** → **Test the model** → **Ready** ✅
4. Reload your Peak Talent task.

### Help us improve it
- **Report a problem** (in a finding's Details) or **Report** (on the select-text card) saves a small file — send it to Kylash.
- After reviewing a task, **Save task for testing** (panel footer) saves it with your answers as test data.
These files contain document text: share them only inside the team.

🔒 Everything runs inside your browser — document text never leaves your computer. Suggestions only; you decide every label.
`;
}

async function main() {
  const pkg = JSON.parse(read('package.json'));
  const repos = (pkg.piira && pkg.piira.releaseRepos) || [];
  if (!repos.length) fail('package.json piira.releaseRepos lists no repositories');

  step('Checking the working tree');
  if (run('git', ['branch', '--show-current']) !== 'main') fail('switch to the main branch first');
  if (run('git', ['status', '--porcelain'])) fail('commit or stash your changes first');
  try { run('gh', ['auth', 'status']); } catch (err) { fail('log in to GitHub first: gh auth login'); }
  for (const f of ['models/multi_pii/onnx/model_int8.onnx', 'vendor/ort/ort.wasm.min.js', 'data/kb/meta.json']) {
    if (!fs.existsSync(path.join(ROOT, f))) fail(`missing ${f}: run npm run setup-model and npm run build-kb`);
  }

  // Version: bump to the next beta with --next.
  const manifestText = read('manifest.json');
  const manifest = JSON.parse(manifestText);
  let { base, beta } = parseVersion(manifest);
  run('git', ['fetch', '--tags', '--quiet', 'origin']);
  const tags = run('git', ['tag', '--list', 'ml-beta-*']).split('\n').filter(Boolean);
  const prevTag = tags.sort((a, b) => Number(a.split('-').pop()) - Number(b.split('-').pop())).pop();
  // --next: the beta after the last release (a version already bumped but not yet released is kept).
  if (args.includes('--next')) beta = Math.max(beta, (prevTag ? Number(prevTag.split('-').pop()) : 0) + 1);
  const tag = `ml-beta-${beta}`;
  const label = `${base} beta ${beta}`;
  if (tags.includes(tag)) fail(`${tag} is already released: use --next`);
  console.log(`  ${manifest.version_name || manifest.version} -> ${label} (${tag}); previous release ${prevTag || 'none'}`);

  const changes = changesSince(prevTag || 'HEAD~50');
  console.log(`  What's new (${changes.length} lines from CHANGELOG):`);
  for (const c of changes) console.log(`    ${c.slice(0, 110)}${c.length > 110 ? '…' : ''}`);
  if (DRY) { console.log(`\n(dry run) would release ${label} to: ${repos.join(', ')}`); return; }
  if (!(await ask(`Release ${label} to ${repos.join(' and ')}?`))) fail('cancelled');

  if (manifest.version_name !== label) {
    step(`Setting the version to ${label}`);
    manifest.version_name = label;
    fs.writeFileSync(path.join(ROOT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    run('git', ['commit', '-q', '-am', `Release ${label}`]);
  }

  step('Tests and release checks');
  try { run('npm', ['test', '--silent']); } catch (err) { fail('tests failed — nothing was published'); }
  run(process.execPath, ['scripts/build.js', '--check']);

  step('Building both packages with the model and knowledge base');
  console.log('  ' + run(process.execPath, ['scripts/build.js', '--with-model']).split('\n').slice(-3).join('\n  '));
  console.log('  ' + run(process.execPath, ['scripts/build.js', '--with-model', '--edition=types']).split('\n').slice(-3).join('\n  '));
  const zipName = `pii-review-assistant-${manifest.version}-model.zip`;
  const typesZipName = `pii-review-assistant-types-${manifest.version}-model.zip`;
  const zip = path.join(ROOT, 'dist', zipName);
  const typesZip = path.join(ROOT, 'dist', typesZipName);
  const sha = run('git', ['rev-parse', 'HEAD']);

  for (const repo of repos) {
    step(`Publishing to ${repo}`);
    run('git', ['push', '-q', `https://github.com/${repo}.git`, 'main:main']);
    const notesFile = path.join(ROOT, 'dist', `notes-${tag}-${repo.replace('/', '_')}.md`);
    fs.writeFileSync(notesFile, notes({ label, repo, tag, changes, zipName, typesZipName }));
    console.log('  ' + run('gh', ['release', 'create', tag, zip, `${zip}.sha256`, typesZip, `${typesZip}.sha256`, '-R', repo, '--target', sha, '--prerelease',
      '--title', `PII Review Assistant v${label}`, '--notes-file', notesFile]));
  }

  const dl = `https://github.com/${repos[repos.length - 1]}/releases/download/${tag}`;
  const link = `${dl}/${zipName}\n📥 PII Types version: ${dl}/${typesZipName}`;
  console.log(`\n✓ Released ${label}.\n\nMessage for the team:\n----\nPII Review Assistant v${label} 🎉\n📥 ${link}\n` +
    `Update: unzip into the same folder → chrome://extensions → ↻ reload → reload the task (footer shows v${label}).\n` +
    `New:\n${changes.slice(0, 5).map((c) => '• ' + c.replace(/^- /, '').replace(/\*\*/g, '').slice(0, 160)).join('\n')}\n----`);
}

main().catch((err) => fail(err.stderr ? String(err.stderr) : err.message));
