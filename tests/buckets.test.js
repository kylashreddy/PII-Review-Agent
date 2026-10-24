// The six issue-bucket test tasks (tests/bucket-tasks.js): each must produce exactly
// its expected findings, and no other problems.
const test = require('node:test');
const assert = require('node:assert/strict');
const { P } = require('./load');
const TASKS = require('./bucket-tasks.js');

function run(task) {
  const left = task.left.join('\n');
  const right = task.right.join('\n');
  const detections = P.engine.run(left);
  const cmp = P.compare.compareDocuments({ leftText: left, rightText: right, detections, rightLabels: [] });
  return P.redaction.validate({ leftText: left, rightText: right, detections, alignment: cmp.alignment });
}

for (const task of TASKS) {
  test(`bucket task ${task.id} (${task.bucket}): expected findings`, () => {
    const res = run(task);
    for (const exp of task.expected) {
      const got = res.findings.filter((f) => f.category === exp.category && (exp.text == null || f.text === exp.text));
      if (exp.count != null) {
        assert.equal(got.length, exp.count, `${exp.category} "${exp.text}" (${exp.why}): expected ${exp.count}, got ${got.length}`);
      } else {
        assert.ok(got.length > 0, `${exp.category} (${exp.why}): expected at least one`);
      }
    }
  });

  test(`bucket task ${task.id} (${task.bucket}): no unexpected problems`, () => {
    const res = run(task);
    const allowed = task.expected.filter((e) => e.category !== 'REDACTED_OK');
    const unexpected = res.findings.filter((f) => f.category !== 'REDACTED_OK' &&
      !allowed.some((e) => e.category === f.category && (e.text == null || e.text === f.text)));
    assert.deepEqual(unexpected.map((f) => `${f.category}: ${f.text}`), []);
  });
}
