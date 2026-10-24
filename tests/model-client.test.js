// Error handling of the on-device model, with a stand-in for chrome.runtime: every failure must end
// in a status the panel can show (never an exception), and the review carries on with the rules.
const test = require('node:test');
const assert = require('node:assert/strict');
const { P } = require('./load');
const core = require('../offscreen/gliner-core.js');
const prompts = require('../offscreen/prompts.js');

/** Installs a fake chrome.runtime whose replies come from `handler(msg)`; returns the sent messages. */
function fakeChrome(handler, extra) {
  const sent = [];
  globalThis.chrome = {
    runtime: {
      id: 'test-ext',
      lastError: null,
      sendMessage(msg, cb) {
        sent.push(msg);
        const r = handler(msg, sent.length);
        if (r && r.throw) throw new Error(r.throw);
        if (r && r.never) return; // no answer at all
        setTimeout(() => {
          globalThis.chrome.runtime.lastError = r && r.lastError ? { message: r.lastError } : null;
          cb(r && r.lastError ? undefined : r);
          globalThis.chrome.runtime.lastError = null;
        }, 1);
      },
    },
    storage: { local: { get: async () => (extra && extra.storage) || {} } },
  };
  return sent;
}
const page = (msg) => (msg.target === 'pii-background' ? { ok: true } : null);

test.afterEach(() => { delete globalThis.chrome; });

test('model client: a normal answer comes back with its entities', async () => {
  fakeChrome((m) => page(m) || { ok: true, entities: [{ label: 'Person Name', start: 0, end: 4, text: 'Ravi', score: 0.8 }], partial: false, ms: 12 });
  const r = await P.modelClient.detect('Ravi', 'k1');
  assert.equal(r.status, 'ready');
  assert.equal(r.entities.length, 1);
});

test('model client: a large document cut short by the time budget is "partial"', async () => {
  fakeChrome((m) => page(m) || { ok: true, entities: [], partial: true, windows: 10, done: 4 });
  assert.equal((await P.modelClient.detect('x', 'k')).status, 'partial');
});

test('model client: every error code becomes a status, never an exception', async () => {
  for (const [code, status] of [['not-installed', 'not-installed'], ['unsupported', 'unsupported'], ['too-large', 'too-large'],
    ['load-failed', 'failed'], ['failed', 'failed'], ['cancelled', 'cancelled'], ['weird', 'failed']]) {
    fakeChrome((m) => page(m) || { ok: false, code, error: 'x' });
    const r = await P.modelClient.detect('text', 'k');
    assert.equal(r.status, status, code);
    assert.deepEqual(r.entities, []);
  }
});

test('model client: the model page closed itself (idle) -> reopened and asked once more', async () => {
  const sent = fakeChrome((m, n) => {
    if (m.target === 'pii-background') return { ok: true };
    return n === 2 ? { lastError: 'Could not establish connection. Receiving end does not exist.' } : { ok: true, entities: [], partial: false };
  });
  const r = await P.modelClient.detect('text', 'k');
  assert.equal(r.status, 'ready');
  assert.deepEqual(sent.map((m) => m.target), ['pii-background', 'pii-model', 'pii-background', 'pii-model']);
});

test('model client: background worker cannot open the page -> unavailable', async () => {
  fakeChrome((m) => (m.target === 'pii-background' ? { ok: false, code: 'offscreen-failed', error: 'nope' } : null));
  const r = await P.modelClient.detect('text', 'k');
  assert.equal(r.status, 'unavailable');
  assert.match(r.error, /nope/);
});

test('model client: extension reloaded under the page ("context invalidated") -> unavailable', async () => {
  fakeChrome(() => ({ throw: 'Extension context invalidated.' }));
  assert.equal((await P.modelClient.detect('text', 'k')).status, 'unavailable');
  delete globalThis.chrome;
  assert.equal((await P.modelClient.detect('text', 'k')).status, 'unavailable', 'no chrome API at all');
});

test('model client: no answer -> timeout (send gives up on its own)', async () => {
  fakeChrome(() => ({ never: true }));
  const r = await P.modelClient.send({ target: 'pii-model', type: 'status' }, 30);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'timeout');
});

test('model client: on/off follows policy first, then the reviewer option (default off)', async () => {
  fakeChrome(() => null, { storage: {} });
  assert.equal(await P.modelClient.enabled({ model: 'user' }), false);
  fakeChrome(() => null, { storage: { modelEnabled: true } });
  assert.equal(await P.modelClient.enabled({ model: 'user' }), true);
  assert.equal(await P.modelClient.enabled({ model: 'off' }), false);
  delete globalThis.chrome;
  assert.equal(await P.modelClient.enabled({ model: 'on' }), true);
  assert.equal(await P.modelClient.enabled({}), false, 'no chrome API: off');
});

test('model page plan: distinct lines with words only, repeats mapped back', () => {
  const text = 'Name: Ravi Kumar\n12345 67890\nName: Ravi Kumar\n\n  Name: Arjun Shah';
  const plan = core.planLines(text, 200);
  assert.equal(plan.windows.length, 1);
  assert.deepEqual(plan.windows[0].lines.map((l) => l.key), ['Name: Ravi Kumar', 'Name: Arjun Shah']);
  assert.deepEqual(plan.occurrences.get('Name: Ravi Kumar'), [0, text.indexOf('Name: Ravi Kumar', 5)]);
  assert.deepEqual(plan.occurrences.get('Name: Arjun Shah'), [text.indexOf('Name: Arjun')]);
  assert.equal(plan.skipped, 1);
  const long = Array.from({ length: 450 }, (_, i) => `word${i}`).join(' ');
  assert.equal(core.planLines(long, 200).windows.length, 3, 'a very long line is cut into windows');
});

test('model answers become site labels; spans never cross a line break; department prompts dropped', () => {
  const text = 'Kavita Sharma\n128 MG Road';
  const out = prompts.toSiteLabels([
    { label: 'person', start: 0, end: text.length, score: 0.5 },
    { label: 'department', start: 0, end: 6, score: 0.9 },
  ], text);
  assert.equal(out.length, 1);
  assert.equal(out[0].label, 'Person Name');
  assert.equal(out[0].text, 'Kavita Sharma');
});

test('model notes say where a suggestion came from', () => {
  assert.equal(P.describe({ label: 'Person Name', type: 'Person Name', source: 'model', model: { score: 0.82 } }), 'Person Name [model, 82%]');
  assert.equal(P.describe({ label: 'Person Name', type: 'Person Name', model: { label: 'Business Name', score: 0.7, agrees: false } }),
    'Person Name [model suggests Business Name, 70%]');
  assert.equal(P.describe({ label: 'Credentials', type: 'Indian GSTIN' }), 'Credentials (Indian GSTIN)');
});
