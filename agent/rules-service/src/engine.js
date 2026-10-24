// Loads the extension's own scripts into this Node process, in manifest.json order (the manifest is the only
// list of files), the same way tests/load.js does. No rule is copied here: this file only wires data in.
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const BROWSER_ONLY = new Set([
  'core/config.js', // reads location / chrome.storage when loaded
  'content.js',     // starts the extension on the page
]);

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const scripts = manifest.content_scripts[0].js.filter((f) => !BROWSER_ONLY.has(f));

const hash = crypto.createHash('sha256');
if (!globalThis.PIIRA || !globalThis.PIIRA.engine) {
  for (const f of scripts) {
    const file = path.join(ROOT, f);
    hash.update(f).update(fs.readFileSync(file));
    require(file);
  }
}
const P = globalThis.PIIRA;

const businessNamesFile = path.join(ROOT, 'data', 'business-names.json');
const businessNames = fs.readFileSync(businessNamesFile);
P.knownNames.setData(JSON.parse(businessNames.toString('utf8')));
hash.update(businessNames);

// The offline knowledge base (npm run build-kb), when built, as in the extension and ml/label-bench.js.
let kbMeta = null;
(() => {
  const dir = path.join(ROOT, 'data', 'kb');
  if (!fs.existsSync(path.join(dir, 'meta.json'))) return;
  const rd = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  kbMeta = rd('meta.json');
  P.kb.setData({ meta: kbMeta, companies: rd('companies.json'), people: rd('people.json'), domains: rd('domains.json') });
})();

const VERSION = Object.freeze({
  engine: manifest.version,
  engine_name: manifest.version_name || manifest.version,
  rules_sha: hash.digest('hex').slice(0, 16),
  kb: kbMeta ? { built: kbMeta.built, companies: kbMeta.companies, people: kbMeta.people, domains: kbMeta.domains } : null,
  node: process.version,
});

module.exports = { P, ROOT, VERSION };
