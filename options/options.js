// Extension options: switch the on-device model on or off, see its status, and test it on a sample.
'use strict';

const PREF_KEY = 'modelEnabled';
const $ = (id) => document.getElementById(id);
const SAMPLE = 'Ship To:\nKavita Sharma\n214/09 C-3 Block, Govind Nagar, Near Nehru School\nKanpur, Uttar Pradesh\n' +
  'notes: spoke with ravi kumar from zentrix analytics; the Field Services team will follow up.';

function send(msg, timeoutMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, code: 'timeout', error: `no answer after ${timeoutMs / 1000} s` }), timeoutMs);
    chrome.runtime.sendMessage(msg, (res) => {
      clearTimeout(timer);
      const err = chrome.runtime.lastError;
      resolve(err ? { ok: false, code: 'unavailable', error: err.message } : (res || { ok: false, code: 'failed', error: 'empty answer' }));
    });
  });
}

const STATUS_TEXT = {
  idle: ['Installed, not loaded yet', ''],
  loading: ['Loading…', ''],
  ready: ['Ready', 'ok'],
  'not-installed': ['Not installed in this build', 'bad'],
  unsupported: ['This browser cannot run it', 'bad'],
  failed: ['Failed to load', 'bad'],
};

function show(status, detail) {
  const [text, cls] = STATUS_TEXT[status] || [status, ''];
  $('status').textContent = text;
  $('status').className = cls;
  $('detail').textContent = detail || '';
}

async function refreshStatus() {
  const page = await send({ target: 'pii-background', type: 'ensure-model-page' }, 15000);
  if (!page.ok) { show('failed', page.error); return; }
  const r = await send({ target: 'pii-model', type: 'status' }, 10000);
  if (r.ok) show(r.status, r.detail); else show('failed', r.error);
}

async function test() {
  $('test').disabled = true;
  $('result').hidden = false;
  $('result').textContent = 'Loading the model and checking a sample…';
  show('loading');
  const t0 = performance.now();
  await send({ target: 'pii-background', type: 'ensure-model-page' }, 15000);
  const r = await send({ target: 'pii-model', type: 'detect', text: SAMPLE, key: 'options-sample' }, 180000);
  const secs = ((performance.now() - t0) / 1000).toFixed(1);
  if (!r.ok) {
    $('result').textContent = `Failed (${r.code}): ${r.error}`;
  } else {
    const lines = r.entities.map((e) => `${e.label.padEnd(16)} ${Math.round(e.score * 100)}%  “${e.text.replace(/\n/g, ' ')}”`);
    $('result').textContent = `Sample:\n${SAMPLE}\n\nFound in ${secs} s (model ${r.ms} ms):\n${lines.join('\n') || '(nothing)'}`;
  }
  $('test').disabled = false;
  refreshStatus();
}

// One read-only line: what the offline knowledge base holds (npm run build-kb), or that it is not installed.
async function showKnowledgeBase() {
  try {
    const m = await (await fetch(chrome.runtime.getURL('data/kb/meta.json'))).json();
    const n = (x) => Number(x).toLocaleString();
    $('kb').textContent = `Knowledge base: ${n(m.companies)} companies · ${n(m.people)} public figures · ${n(m.domains)} websites (built ${m.built}). Works offline.`;
  } catch (e) {
    $('kb').textContent = 'Knowledge base: not installed in this build.';
  }
}

async function init() {
  const m = chrome.runtime.getManifest();
  $('ver').textContent = `v${m.version_name || m.version}`;
  let policy = {};
  try { policy = await chrome.storage.managed.get('model'); } catch (e) { policy = {}; }
  const box = $('enabled');
  if (policy.model === 'on' || policy.model === 'off') {
    box.checked = policy.model === 'on';
    box.disabled = true;
    $('policy').hidden = false;
    $('policy').textContent = `Set by your organisation (${policy.model}).`;
  } else {
    box.checked = (await chrome.storage.local.get(PREF_KEY))[PREF_KEY] === true;
    box.addEventListener('change', () => chrome.storage.local.set({ [PREF_KEY]: box.checked }));
  }
  const tags = $('tags');
  tags.checked = (await chrome.storage.local.get('labelTags')).labelTags !== false;
  tags.addEventListener('change', () => chrome.storage.local.set({ labelTags: tags.checked }));
  const sel = $('selcheck');
  sel.checked = (await chrome.storage.local.get('selectCheck')).selectCheck !== false;
  sel.addEventListener('change', () => chrome.storage.local.set({ selectCheck: sel.checked }));
  // Label list: the PII Types version always uses one label per type.
  const mode = $('labelmode');
  if (globalThis.PIIRA && globalThis.PIIRA.EDITION === 'types') {
    mode.value = 'types';
    mode.disabled = true;
    $('labelmode-note').textContent = 'This is the PII Types version: one label per PII type, always.';
  } else {
    const prefs = (await chrome.storage.local.get('piira.prefs'))['piira.prefs'] || {};
    mode.value = prefs.labelMode || 'broad';
    mode.addEventListener('change', async () => {
      const cur = (await chrome.storage.local.get('piira.prefs'))['piira.prefs'] || {};
      await chrome.storage.local.set({ 'piira.prefs': { ...cur, labelMode: mode.value } });
    });
  }
  const agent = $('agent');
  agent.checked = (await chrome.storage.local.get('agentPreview')).agentPreview === true;
  agent.addEventListener('change', () => chrome.storage.local.set({ agentPreview: agent.checked }));
  $('test').addEventListener('click', test);
  showKnowledgeBase();
  refreshStatus();
}

init();
