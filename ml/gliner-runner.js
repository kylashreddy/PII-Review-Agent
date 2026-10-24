// Runs GLiNER over a whole document in Node with the same code the extension runs in its offscreen
// page (offscreen/gliner-core.js), on onnxruntime-node instead of onnxruntime-web.
const fs = require('fs');
const path = require('path');
const { UnigramTokenizer, Gliner, planLines } = require('../offscreen/gliner-core.js');
const { PROMPTS, toSiteLabels } = require('../offscreen/prompts.js');

let model = null;

async function load(modelDir) {
  if (model) return model;
  const ort = require('onnxruntime-node');
  const dir = modelDir || path.join(__dirname, '..', 'models', 'multi_pii');
  const tokenizer = new UnigramTokenizer(JSON.parse(fs.readFileSync(path.join(dir, 'tokenizer.json'), 'utf8')));
  const session = await ort.InferenceSession.create(path.join(dir, 'onnx', 'model_int8.onnx'));
  model = new Gliner(ort, session, tokenizer, { maxWidth: 12, maxWords: 200 });
  return model;
}

/** Entities in `text` with site labels: [{label, prompt, start, end, text, score}]. */
async function detect(text, opts) {
  const g = await load(opts && opts.modelDir);
  const threshold = (opts && opts.threshold) || 0.05;
  const raw = [];
  // Same plan as the extension's model page (offscreen/model-host.js): distinct lines with words.
  const plan = planLines(text, g.maxWords);
  for (const w of plan.windows) {
    for (const e of await g.predict(w.text, PROMPTS.map((p) => p[0]), threshold)) {
      const line = w.lines.find((l) => e.start >= l.at && e.start < l.at + l.len);
      if (!line) continue;
      const s = e.start - line.at;
      const end = Math.min(e.end - line.at, line.len);
      for (const at of plan.occurrences.get(line.key)) raw.push({ ...e, start: at + line.offset + s, end: at + line.offset + end });
    }
  }
  return toSiteLabels(raw, text);
}

module.exports = { load, detect };
