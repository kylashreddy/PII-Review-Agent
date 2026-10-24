// Downloads the GLiNER PII model into models/ at the extension root (git-ignored), pinned to one revision and
// checked by SHA-256. Run: npm run fetch-model [-- small]
// The model is too large for GitHub (100 MB per file), so builds fetch it instead of committing it.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');

const MODELS = {
  // Multilingual GLiNER fine-tuned for PII (Apache-2.0). https://huggingface.co/urchade/gliner_multi_pii-v1
  multi_pii: {
    repo: 'onnx-community/gliner_multi_pii-v1',
    revision: '2e0397a7e8a250d76c37122232b3cbde42c8d629',
    files: {
      'config.json': null,
      'gliner_config.json': null,
      'tokenizer.json': '914bd3c8fb7b525af9e23b60d0ec7b1248ddb2b99014efd9c02ebeb022f8cab7',
      'tokenizer_config.json': null,
      'special_tokens_map.json': null,
      'added_tokens.json': null,
      'onnx/model_int8.onnx': '3efb3b91aef91ae11cd781126133063a33a2ffd7787ec73057bbd57a9781a7ab',
    },
  },
};

async function sha256(file) {
  const h = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(file), h);
  return h.digest('hex');
}

async function fetchModel(name) {
  const m = MODELS[name];
  if (!m) throw new Error(`unknown model ${name}; known: ${Object.keys(MODELS).join(', ')}`);
  const dir = path.join(__dirname, '..', 'models', name);
  for (const [file, want] of Object.entries(m.files)) {
    const dest = path.join(dir, file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (fs.existsSync(dest) && (!want || (await sha256(dest)) === want)) { console.log('ok      ', file); continue; }
    const url = `https://huggingface.co/${m.repo}/resolve/${m.revision}/${file}`;
    process.stdout.write(`download ${file} … `);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    await pipeline(res.body, fs.createWriteStream(dest + '.part'));
    if (want) {
      const got = await sha256(dest + '.part');
      if (got !== want) throw new Error(`${file}: SHA-256 ${got}, expected ${want}`);
    }
    fs.renameSync(dest + '.part', dest);
    console.log(`${(fs.statSync(dest).size / 1e6).toFixed(1)} MB`);
  }
  return dir;
}

module.exports = { MODELS, fetchModel };

if (require.main === module) {
  fetchModel(process.argv[2] || 'multi_pii').catch((err) => { console.error(err.message); process.exit(1); });
}
