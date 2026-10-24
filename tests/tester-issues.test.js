// Regression set from the team's testing sheet (tests/fixtures/tester-issues/cases.json): each case is
// checked with the rules alone and with the rules + the model's guesses (given by hand, so no model needed).
const test = require('node:test');
const assert = require('node:assert/strict');
const { P } = require('./load');
const { cases } = require('./fixtures/tester-issues/cases.json');

const reported = (list) => list.filter((d) => d.confidence >= P.REVIEW_THRESHOLD);
const covers = (d, s, e) => d.start < e && d.end > s;

function entities(c) {
  return c.model.flatMap((m) => {
    const out = [];
    for (let i = c.text.indexOf(m.text); i >= 0; i = c.text.indexOf(m.text, i + 1)) {
      out.push({ label: m.label, start: i, end: i + m.text.length, text: m.text, score: m.score });
    }
    return out;
  });
}

for (const c of cases) {
  const hint = P.fileHint.parse(c.file);
  const rules = P.engine.run(c.text, { hint });
  const systems = { rules, hybrid: P.hybrid.merge(rules, entities(c), c.text, { settings: P.SETTINGS.model }) };
  for (const [name, list] of Object.entries(systems)) {
    test(`tester issue ${c.issues} ${c.id} (${name})`, () => {
      const rep = reported(list);
      for (const t of c.notPii) {
        // Every occurrence of a non-PII text must be free of a reported finding that is not one of the expected ones.
        for (let i = c.text.indexOf(t); i >= 0; i = c.text.indexOf(t, i + 1)) {
          const bad = rep.filter((d) => covers(d, i, i + t.length) && !c.find.some((f) => f.text === d.text && f.label === d.label) &&
            (!c.notLabel || d.label === c.notLabel));
          assert.deepEqual(bad.map((d) => `${d.label}: ${d.text}`), [], `"${t}" is not PII`);
        }
      }
      for (const f of c.find) {
        // The model's job: a name only the model finds, and the handles linked to it.
        if (name === 'rules' && (f.needsModel || (f.label === 'Person Name' && c.model.some((m) => m.text === f.text)))) continue;
        const hit = rep.find((d) => d.text === f.text && d.label === f.label);
        assert.ok(hit, `finds ${f.label}: ${f.text}; got ${rep.map((d) => `${d.label}: ${d.text}`).join(', ')}`);
      }
    });
  }
}
