// Installs the optional on-device model into the extension folder (both git-ignored):
//   vendor/ort/   ONNX Runtime Web 1.22.0 (from ml/node_modules), SHA-256 checked
//   models/multi_pii/   the GLiNER PII model (ml/fetch-model.js), SHA-256 checked
// Run once after cloning:  npm run setup-model
// Without these files the extension works as before and reports "model not installed".
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const ORT_DIST = path.join(ROOT, 'ml', 'node_modules', 'onnxruntime-web', 'dist');

// The only runtime files the extension loads, pinned by hash (also checked by scripts/build.js).
const ORT_FILES = {
  'ort.wasm.min.js': '65e09376df69107e881b5c34d2d37aed333a366b6d941073ec518168e269b87d',
  'ort-wasm-simd-threaded.mjs': '30dd851d9c00622940500f71ddd2ff8820c5cb65270816080175b958705385a8',
  'ort-wasm-simd-threaded.wasm': '71aef04959c5c1b6de461b6538e2058e306610034a85aad2742d0c7fd4533fe4',
};

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

async function main() {
  if (!fs.existsSync(ORT_DIST)) {
    console.log('installing ml/ dependencies (onnxruntime-web) …');
    // On Windows npm is npm.cmd, which needs a shell.
    execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--prefix', path.join(ROOT, 'ml'), 'ci', '--no-audit', '--no-fund'],
      { stdio: 'inherit', shell: process.platform === 'win32' });
  }
  const vendor = path.join(ROOT, 'vendor', 'ort');
  fs.mkdirSync(vendor, { recursive: true });
  for (const [file, want] of Object.entries(ORT_FILES)) {
    const src = path.join(ORT_DIST, file);
    const got = sha256(src);
    if (got !== want) throw new Error(`${file}: SHA-256 ${got}, expected ${want} (wrong onnxruntime-web version?)`);
    fs.copyFileSync(src, path.join(vendor, file));
    console.log('ok      ', `vendor/ort/${file}`);
  }
  const { fetchModel } = require(path.join(ROOT, 'ml', 'fetch-model.js'));
  await fetchModel('multi_pii');
  console.log('\nModel installed. Reload the extension in chrome://extensions, then switch it on in the extension options.');
}

module.exports = { ORT_FILES };

if (require.main === module) main().catch((err) => { console.error(err.message); process.exit(1); });
