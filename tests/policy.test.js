// Organisation policy (chrome.storage.managed) and the release rules.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { P } = require('./load');
const build = require('../scripts/build');

test('policy: no policy means the defaults', () => {
  const p = P.policy.normalize(undefined);
  assert.deepStrictEqual({ ...p }, { ...P.policy.DEFAULTS });
  assert.strictEqual(p.enabled, true);
});

test('policy: valid settings are kept', () => {
  const p = P.policy.normalize({
    enabled: false, defaultStage: 'L1', supportContact: ' pii-help@company.example ',
    extraKnownNames: ['Acme Corp', ' Globex '],
    pageSetup: { leftDocument: '#left', rightDocument: '#right', label: { rightLabelSpan: 'span.lbl', labelNameAttributes: ['data-label'] } },
  });
  assert.strictEqual(p.enabled, false);
  assert.strictEqual(p.defaultStage, 'L1');
  assert.strictEqual(p.supportContact, 'pii-help@company.example');
  assert.deepStrictEqual(p.extraKnownNames, ['Acme Corp', 'Globex']);
  assert.strictEqual(p.pageSetup.leftDocument, '#left');
  assert.strictEqual(p.pageSetup.label.rightLabelSpan, 'span.lbl');
  assert.deepStrictEqual(p.pageSetup.label.labelNameAttributes, ['data-label']);
});

test('policy: wrong types fall back to the defaults', () => {
  const p = P.policy.normalize({
    enabled: 'no', defaultStage: 'L3', supportContact: 42,
    extraKnownNames: 'Acme', pageSetup: { leftDocument: '#left' },
  });
  assert.strictEqual(p.enabled, true, 'only an explicit false switches it off');
  assert.strictEqual(p.defaultStage, 'L2');
  assert.strictEqual(p.supportContact, '');
  assert.deepStrictEqual(p.extraKnownNames, []);
  assert.strictEqual(p.pageSetup, null, 'a setup needs both documents');
});

test('policy: extra known names join the business names list', () => {
  const json = require('../data/business-names.json');
  try {
    P.knownNames.setData({ ...json, organisation_list: ['Globex Industries'] });
    assert.deepStrictEqual(P.knownNames.lookup('Globex Industries'), { name: 'Globex Industries', category: 'Organisation List' });
    assert.ok(P.knownNames.lookup('Infosys'), 'the built-in list is still there');
  } finally {
    P.knownNames.setData(json);
  }
  assert.strictEqual(P.knownNames.lookup('Globex Industries'), null);
});

test('policy: managed_schema.json describes every setting', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'managed_schema.json'), 'utf8'));
  assert.deepStrictEqual(Object.keys(schema.properties).sort(), Object.keys(P.policy.DEFAULTS).sort());
});

test('release: the extension passes the release checks', () => {
  assert.deepStrictEqual(build.check(), []);
});

test('release: the package holds only extension files', () => {
  const files = build.runtimeFiles(require('../manifest.json'));
  assert.ok(files.includes('managed_schema.json') && files.includes('icons/icon-128.png'));
  assert.ok(!files.some((f) => f.startsWith('tests/') || f.startsWith('docs/') || f === 'test.html'));
});
