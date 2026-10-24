// The edge-case sweep (tests/sweep.js) as a test: every type × format × scenario, plus
// false-positive bait. `node tests/sweep.js` writes the full table to tests/fixtures/sweep-report.md.
const test = require('node:test');
const assert = require('node:assert/strict');
const { run } = require('./sweep');

test('edge-case sweep: every PII type, format and scenario behaves as expected', () => {
  const { cases, failures } = run();
  assert.ok(cases > 1000, `${cases} cases`);
  assert.deepEqual(failures.map((f) => `${f.type} | ${f.format} | ${f.scenario} | ${f.snippet} | ${f.actual} | expected ${f.expected}`), []);
});
