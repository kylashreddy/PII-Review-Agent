// Offline knowledge base (core/knowledge.js), with a tiny made-up base so the tests do not need the
// downloaded files. Rules: well-known companies are public names; any company confirms a Business Name;
// public figures only add a note; popular sites' homepages are not URL/Link.
const test = require('node:test');
const assert = require('node:assert/strict');
const { P } = require('./load');

const KB = {
  meta: { built: 'test' },
  companies: [['Infosys limited', 44, 'Q1'], ['Kaveri Textiles', 3, 'Q2'], ['Target', 40, 'Q3'], ['Square', 17, 'Q4'],
    ['Bluepeak Logistics Pvt Ltd', 5, 'Q5'], ['Zentrix Analytics Corp', 30, 'Q10'], ['Reliance Industries', 41, 'Q6'], ['Shipping Company', 30, 'Q7']],
  people: [['Amit Shah', 39, 'Q8'], ['Shah Rukh Khan', 90, 'Q9']],
  domains: ['google.com', 'infosys.com', 'linkedin.com'],
};

test.before(() => P.kb.setData(KB));
test.after(() => P.kb.setData({}));

test('knowledge base: well-known companies are public names (not PII), found in running text', () => {
  const text = 'The vendor Reliance Industries and our client Infosys Limited signed the MoU.';
  const known = P.knownNames.findIn(text).map((k) => k.text);
  assert.ok(known.includes('Reliance Industries'), known.join(', '));
  assert.ok(P.knownNames.lookup('Infosys Ltd'), 'legal endings do not matter');
  assert.ok(!P.engine.run('Company: Reliance Industries').some((d) => d.label === 'Business Name'));
});

test('knowledge base: one-word names only confirm, never scan running text', () => {
  assert.ok(!P.knownNames.findIn('Our Target this quarter is growth.').some((k) => k.text === 'Target'));
  assert.ok(P.knownNames.lookup('Target'), 'as a detected company name it is well-known');
  assert.equal(P.kb.wellKnownCompany('Square'), null, '17 languages is not enough for one word');
});

test('knowledge base: a lesser-known company confirms a Business Name; headings never count', () => {
  const d = P.engine.run('Supplier: Kaveri Textiles').find((x) => x.text === 'Kaveri Textiles');
  assert.ok(d && d.confidence >= 0.85 && d.kb && d.kb.company === 'Kaveri Textiles');
  assert.equal(P.kb.company('Shipping Company'), null, 'a heading in the source data is ignored');
});

test('knowledge base: a public figure only adds a note; the name stays PII', () => {
  const d = P.engine.run('Name: Amit Shah').find((x) => x.text === 'Amit Shah');
  assert.equal(d.label, 'Person Name');
  assert.ok(d.confidence >= P.REVIEW_THRESHOLD);
  assert.equal(P.describe(d), 'Person Name [also a public figure]');
  assert.equal(P.kb.publicFigure('Amit'), null, 'one word is never matched');
});

test('knowledge base: a popular homepage is not a URL/Link; profile paths still are', () => {
  const urls = (t) => P.engine.run(t).filter((d) => d.label === 'URL/Link').map((d) => d.text);
  assert.deepEqual(urls('See https://www.infosys.com/ and https://google.com'), []);
  assert.deepEqual(urls('Profile https://www.linkedin.com/in/ravi-k92'), ['https://www.linkedin.com/in/ravi-k92']);
  assert.deepEqual(urls('Site https://ravikumar.dev'), ['https://ravikumar.dev']);
});

test('knowledge base: model company suggestions in the base are surer', () => {
  const doc = 'notes: met kaveri textiles about the order';
  const s = doc.indexOf('kaveri textiles');
  const out = P.hybrid.merge(P.engine.run(doc), [{ label: 'Business Name', start: s, end: s + 15, text: 'kaveri textiles', score: 0.16 }], doc);
  const d = out.find((x) => x.text === 'kaveri textiles');
  assert.ok(d && d.confidence >= P.REVIEW_THRESHOLD, 'reported, not just possible');
});

test('knowledge base: without the files nothing changes', () => {
  assert.ok(P.knownNames.lookup('Zentrix Analytics'));
  P.kb.setData({});
  assert.equal(P.knownNames.lookup('Zentrix Analytics'), null);
  assert.ok(P.engine.run('Profile https://www.linkedin.com/').some((d) => d.label === 'URL/Link'));
  P.kb.setData(KB);
});
