// Release build: checks the extension, then writes dist/pii-review-assistant-<version>.zip
// with only the files the extension needs (no tests, docs or test page).
//
//   node scripts/build.js                     zip for the Chrome Web Store
//   node scripts/build.js --update-url=URL    zip for self-hosting (adds update_url)
//   node scripts/build.js --check             checks only, no output
//
// The checks are the release rules from the README: storage (and offscreen, for the optional
// on-device model) are the only permissions, Peak Talent the only sites, and no code that can
// reach the network.
//
//   node scripts/build.js --with-model        also packs the on-device model (npm run setup-model first)
//   node scripts/build.js --edition=types     the "PII Types" version: one label per PII type, always
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const ALLOWED_PERMISSIONS = ['storage', 'offscreen'];
// The on-device model: a background worker that opens one offscreen page, and WebAssembly for extension pages only.
const EXPECTED_BACKGROUND = { service_worker: 'background.js' };
const EXPECTED_CSP = "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'";
const MODEL_PAGES = ['offscreen/offscreen.html'];
const ALLOWED_HOSTS = /^https:\/\/\*\.peaktalent\.(ai|co)\/\*$/;
// Ways a script could send data off the machine or run code it was given.
const FORBIDDEN = [
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
  [/\bnew\s+WebSocket\b/, 'WebSocket'],
  [/\bsendBeacon\b/, 'navigator.sendBeacon'],
  [/\bEventSource\b/, 'EventSource'],
  [/\bimportScripts\b/, 'importScripts'],
  [/\beval\s*\(/, 'eval'],
  [/\bnew\s+Function\s*\(/, 'new Function'],
  [/<script[^>]+src=/i, 'remote <script>'],
  [/\.(?:inner|outer)HTML\s*=|insertAdjacentHTML/, 'HTML strings (the panel uses text nodes only)'],
];
// fetch() is only allowed for the extension's own files.
const FETCH_ALLOWED = new Set(['core/known-names.js', 'core/knowledge.js', 'offscreen/model-host.js', 'options/options.js']);

// Optional on-device model files (git-ignored, installed by npm run setup-model). Third-party code
// is not scanned like ours; it is pinned by SHA-256 instead.
function optionalFiles() {
  const { ORT_FILES } = require('./setup-model.js');
  const { MODELS } = require('../ml/fetch-model.js');
  const files = {};
  for (const [f, sha] of Object.entries(ORT_FILES)) files[`vendor/ort/${f}`] = sha;
  for (const [f, sha] of Object.entries(MODELS.multi_pii.files)) files[`models/multi_pii/${f}`] = sha;
  return files;
}

// The offline knowledge base (npm run build-kb, git-ignored): generated from public lists, so checked for
// being all there and valid JSON rather than pinned. Packed into every build when present.
const KB_FILES = ['data/kb/meta.json', 'data/kb/companies.json', 'data/kb/people.json', 'data/kb/domains.json'];

/** Local files an HTML page loads (<script src>, <link href>); remote ones are reported. */
function pageAssets(page, problems) {
  const html = read(page);
  const out = [];
  if (/<script(?![^>]*\bsrc=)[^>]*>\s*\S/i.test(html)) problems.push(`${page} has an inline script`);
  for (const m of html.matchAll(/<(?:script[^>]+src|link[^>]+href)=["']([^"']+)["']/gi)) {
    if (/^[a-z]+:|^\/\//i.test(m[1])) { problems.push(`${page} loads a remote file: ${m[1]}`); continue; }
    out.push(path.posix.normalize(path.posix.join(path.posix.dirname(page), m[1])));
  }
  return out;
}

function runtimeFiles(manifest, problems) {
  const cs = manifest.content_scripts.flatMap((c) => [...(c.js || []), ...(c.css || [])]);
  const war = (manifest.web_accessible_resources || []).flatMap((w) => w.resources);
  const icons = Object.values(manifest.icons || {});
  const schema = manifest.storage && manifest.storage.managed_schema ? [manifest.storage.managed_schema] : [];
  const bg = manifest.background && manifest.background.service_worker ? [manifest.background.service_worker] : [];
  const pages = [...(manifest.options_ui ? [manifest.options_ui.page] : []), ...(manifest.background ? MODEL_PAGES : [])];
  const optional = new Set(Object.keys(optionalFiles()));
  const assets = pages.flatMap((p) => (fs.existsSync(path.join(ROOT, p)) ? pageAssets(p, problems || []) : []))
    .filter((f) => !optional.has(f));
  return [...new Set(['manifest.json', ...cs, ...war, ...icons, ...schema, ...bg, ...pages, ...assets])];
}

/** Every release rule; returns a list of problems (empty when the build may ship). */
function check() {
  const problems = [];
  const manifest = JSON.parse(read('manifest.json'));
  const pkg = JSON.parse(read('package.json'));

  if (manifest.version !== pkg.version) problems.push(`version mismatch: manifest ${manifest.version}, package.json ${pkg.version}`);
  if (!/^\d+(\.\d+){0,3}$/.test(manifest.version)) problems.push(`manifest version "${manifest.version}" is not a Chrome version number`);

  const perms = manifest.permissions || [];
  const extra = perms.filter((p) => !ALLOWED_PERMISSIONS.includes(p));
  if (extra.length) problems.push(`permissions beyond ${ALLOWED_PERMISSIONS.join(', ')}: ${extra.join(', ')}`);
  if (manifest.optional_permissions && manifest.optional_permissions.length) problems.push('optional_permissions must stay empty');

  const hosts = [...(manifest.host_permissions || []), ...manifest.content_scripts.flatMap((c) => c.matches),
    ...(manifest.web_accessible_resources || []).flatMap((w) => w.matches)];
  for (const h of new Set(hosts)) if (!ALLOWED_HOSTS.test(h)) problems.push(`site not allowed: ${h}`);
  if (manifest.background && JSON.stringify(manifest.background) !== JSON.stringify(EXPECTED_BACKGROUND)) {
    problems.push(`background must be exactly ${JSON.stringify(EXPECTED_BACKGROUND)}`);
  }
  const csp = manifest.content_security_policy && manifest.content_security_policy.extension_pages;
  if (manifest.content_security_policy && (csp !== EXPECTED_CSP || Object.keys(manifest.content_security_policy).length !== 1)) {
    problems.push(`content_security_policy must be exactly extension_pages: "${EXPECTED_CSP}"`);
  }
  if (perms.includes('offscreen') && !manifest.background) problems.push('the offscreen permission needs background.js');
  // Cross-origin isolation for extension pages lets the model use several threads.
  const coep = manifest.cross_origin_embedder_policy;
  const coop = manifest.cross_origin_opener_policy;
  if (coep && coep.value !== 'require-corp') problems.push('cross_origin_embedder_policy must be require-corp');
  if (coop && coop.value !== 'same-origin') problems.push('cross_origin_opener_policy must be same-origin');

  // Optional model files: all or none, each matching its pinned SHA-256.
  const opt = optionalFiles();
  const present = Object.keys(opt).filter((f) => fs.existsSync(path.join(ROOT, f)));
  if (present.length && present.length !== Object.keys(opt).length) {
    problems.push(`model files incomplete (${present.length}/${Object.keys(opt).length}): run npm run setup-model`);
  }
  for (const f of present) {
    const want = opt[f];
    if (want && crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex') !== want) {
      problems.push(`${f} does not match its pinned SHA-256`);
    }
  }

  const kbPresent = KB_FILES.filter((f) => fs.existsSync(path.join(ROOT, f)));
  if (kbPresent.length && kbPresent.length !== KB_FILES.length) problems.push('knowledge base incomplete: run npm run build-kb');

  for (const f of runtimeFiles(manifest, problems)) {
    if (KB_FILES.includes(f) && !fs.existsSync(path.join(ROOT, f))) continue; // optional, not built
    if (!fs.existsSync(path.join(ROOT, f))) { problems.push(`missing file: ${f}`); continue; }
    if (f.endsWith('.json')) {
      try { JSON.parse(read(f)); } catch (err) { problems.push(`${f} is not valid JSON: ${err.message}`); }
    }
    if (!f.endsWith('.js')) continue;
    const src = read(f);
    for (const [re, what] of FORBIDDEN) if (re.test(src)) problems.push(`${f} uses ${what}`);
    if (/\bfetch\s*\(/.test(src) && !FETCH_ALLOWED.has(f)) problems.push(`${f} uses fetch()`);
    // Comments may mention web addresses; code may not ("//" after ":" is a URL, not a comment).
    if (/https?:\/\/(?!\*\.peaktalent\.)[\w.-]+\.\w+/.test(src.replace(/(^|[^:])\/\/.*$/gm, '$1'))) {
      problems.push(`${f} contains a web address in code`);
    }
  }
  return problems;
}

const EDITIONS = {
  standard: {},
  // One label per PII type (the team's Complete PII Type List), for tasks that label every type.
  types: { suffix: '-types', name: 'PII Review Assistant – PII Types',
    description: 'PII Types version: suggests one label per PII type (Indian Aadhaar Number, Stripe Key, Indonesian NIK…) on Peak Talent review tasks. Runs entirely in your browser.' },
};

function build({ updateUrl, withModel, edition = 'standard' } = {}) {
  const ed = EDITIONS[edition];
  if (!ed) throw new Error(`unknown --edition=${edition} (standard or types)`);
  const manifest = JSON.parse(read('manifest.json'));
  if (ed.name) Object.assign(manifest, { name: ed.name, description: ed.description, version_name: `${manifest.version_name || manifest.version} (PII Types)` });
  const name = `pii-review-assistant${ed.suffix || ''}-${manifest.version}${withModel ? '-model' : ''}`;
  const stage = path.join(DIST, name);
  fs.rmSync(stage, { recursive: true, force: true });

  const files = runtimeFiles(manifest).filter((f) => !KB_FILES.includes(f) || fs.existsSync(path.join(ROOT, f)));
  if (withModel) {
    const opt = Object.keys(optionalFiles());
    const missing = opt.filter((f) => !fs.existsSync(path.join(ROOT, f)));
    if (missing.length) throw new Error(`--with-model: missing ${missing.join(', ')} (run npm run setup-model)`);
    files.push(...opt);
  }
  for (const f of files) {
    fs.mkdirSync(path.dirname(path.join(stage, f)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, f), path.join(stage, f));
  }
  if (updateUrl && !/^https:\/\//.test(updateUrl)) throw new Error('--update-url must be an https:// address');
  if (updateUrl || ed.name) {
    fs.writeFileSync(path.join(stage, 'manifest.json'), JSON.stringify({ ...manifest, ...(updateUrl ? { update_url: updateUrl } : {}) }, null, 2) + '\n');
  }
  if (ed.name) {
    const f = path.join(stage, 'core', 'edition.js');
    const src = fs.readFileSync(f, 'utf8');
    if (!src.includes(".EDITION = 'standard'")) throw new Error('core/edition.js: edition line not found');
    fs.writeFileSync(f, src.replace(".EDITION = 'standard'", `.EDITION = '${edition}'`));
  }

  const zip = path.join(DIST, `${name}${updateUrl ? '-selfhosted' : ''}.zip`);
  fs.rmSync(zip, { force: true });
  // Windows has no zip command; its built-in tar (Windows 10+) writes zip files with -a.
  if (process.platform === 'win32') execFileSync('tar', ['-a', '-c', '-f', zip, '.'], { cwd: stage });
  else execFileSync('zip', ['-q', '-r', '-X', zip, '.'], { cwd: stage });
  const sha = crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
  fs.writeFileSync(`${zip}.sha256`, `${sha}  ${path.basename(zip)}\n`);
  return { folder: stage, zip, sha, files: files.length };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const problems = check();
  if (problems.length) {
    console.error('Release checks failed:\n  - ' + problems.join('\n  - '));
    process.exit(1);
  }
  console.log('Release checks passed.');
  if (!args.includes('--check')) {
    const urlArg = args.find((a) => a.startsWith('--update-url='));
    const edArg = args.find((a) => a.startsWith('--edition='));
    const out = build({ updateUrl: urlArg ? urlArg.slice('--update-url='.length) : '', withModel: args.includes('--with-model'),
      edition: edArg ? edArg.slice('--edition='.length) : 'standard' });
    console.log(`Built ${path.relative(ROOT, out.zip)} (${out.files} files)\n  sha256 ${out.sha}\n  unpacked: ${path.relative(ROOT, out.folder)}`);
  }
}

module.exports = { check, build, runtimeFiles };
