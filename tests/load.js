// Loads the extension's scripts into Node, in manifest.json order (the manifest
// is the only list of files). Scripts that need a browser page to start are skipped.
const path = require('path');
const manifest = require('../manifest.json');

const BROWSER_ONLY = new Set([
  'core/config.js', // reads location / chrome.storage when loaded
  'content.js',     // starts the extension on the page
]);

if (!globalThis.PIIRA || !globalThis.PIIRA.engine) {
  for (const f of manifest.content_scripts[0].js) {
    if (!BROWSER_ONLY.has(f)) require(path.join(__dirname, '..', f));
  }
}

const P = globalThis.PIIRA;
P.knownNames.setData(require('../data/business-names.json'));

/** All raw detections (before overlap resolution) with this label. */
function detectLabel(label, text) {
  return P.detectors.flatMap((d) => d.detect(text)).filter((d) => d.label === label);
}

module.exports = { P, detectLabel };
