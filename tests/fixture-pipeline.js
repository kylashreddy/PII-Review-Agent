// Runs a left/right fixture pair through the same steps content.js runs on the page:
// detect on the left (with the task's file name as a hint), align, then the L2 check.
const fs = require('fs');
const path = require('path');
const { P } = require('./load');

const DIR = path.join(__dirname, 'fixtures');
const CASES = require('./fixtures/cases.json');

function runTask({ left, right, fileName }) {
  const hint = P.fileHint ? P.fileHint.parse(fileName || '') : null;
  const detections = P.engine.run(left, { hint });
  const l1 = P.compare.compareDocuments({ leftText: left, rightText: right, detections, rightLabels: [] });
  const l2 = P.redaction.validate({ leftText: left, rightText: right, detections, alignment: l1.alignment, hint });
  const at = (f, side) => (f[side] ? (side === 'left' ? left : right).slice(f[side].start, f[side].end) : null);
  return { left, right, hint, detections, l2, findings: l2.findings, at };
}

function loadCase(name) {
  const dir = path.join(DIR, name);
  const files = fs.readdirSync(dir);
  // "{{}}" breaks up secret-shaped values (S{{}}G.…) so the repository holds none: GitHub secret
  // scanning would reject the push. It is removed when the fixture is read.
  const read = (side) => fs.readFileSync(path.join(dir, files.find((f) => f.startsWith(side + '.'))), 'utf8').replace(/\{\{\}\}/g, '');
  return { name, left: read('left'), right: read('right'), fileName: (CASES[name] || {}).fileName || '' };
}

const runCase = (name) => runTask(loadCase(name));

module.exports = { P, runTask, runCase, loadCase };
