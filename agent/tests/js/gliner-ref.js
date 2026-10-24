// Reference GLiNER output for the Python parity test: reads a JSON array of texts on stdin and prints, for each,
// ml/gliner-runner.js's entities with offsets in code points.
'use strict';
const path = require('path');
const { Offsets } = require('../../rules-service/src/offsets');
const runner = require(path.join(__dirname, '..', '..', '..', 'ml', 'gliner-runner'));

let input = '';
process.stdin.on('data', (c) => { input += c; });
process.stdin.on('end', async () => {
  const out = [];
  for (const text of JSON.parse(input)) {
    const o = new Offsets(text);
    const ents = await runner.detect(text, { threshold: 0.05 });
    out.push(ents.map((e) => ({ ...e, start: o.toPoints(e.start), end: o.toPoints(e.end) })));
  }
  process.stdout.write(JSON.stringify(out));
});
