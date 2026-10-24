// Quick check that GLiNER runs locally on the downloaded model (no network).
const path = require('path');
const { Gliner } = require('gliner/node');
const { env } = require('@xenova/transformers');

env.allowRemoteModels = false;
env.localModelPath = path.join(__dirname, 'models') + '/';

(async () => {
  const gliner = new Gliner({
    tokenizerPath: 'multi_pii',
    onnxSettings: { modelPath: path.join(__dirname, 'models/multi_pii/onnx/model_int8.onnx'), executionProvider: 'cpu' },
    transformersSettings: { allowLocalModels: true, useBrowserCache: false },
    maxWidth: 12,
  });
  env.allowRemoteModels = false; // set again: the constructor writes the same env
  let t = Date.now();
  await gliner.initialize();
  console.log('load ms', Date.now() - t);
  const texts = [
    'Ship To:\nKavita Kavita\n214/09 C-3 BLOCK, GOVIND NAGAR, NEAR MOTILAL\nNEHRU SCHOOL\nKanpur Nagar, Uttar Pradesh - 208011\nPhone: 9839054321',
    'R000001 Field Services handled the ticket for Sunrise Traders Pvt Ltd; Priya Sharma from People Ops approved it.',
  ];
  const entities = ['person', 'organization', 'address', 'department', 'phone number'];
  t = Date.now();
  const res = [];
  for (const text of texts) res.push((await gliner.inference({ texts: [text], entities, threshold: Number(process.argv[2] || 0.3), flatNer: true }))[0]);
  console.log('infer ms', Date.now() - t);
  for (const r of res) console.log(r.map((e) => `${e.label}(${e.score.toFixed(2)}) “${e.spanText}” [${e.start}-${e.end}]`).join('\n'), '\n---');
})().catch((e) => { console.error(e); process.exit(1); });
