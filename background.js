// Background service worker. Its only job is to open the hidden offscreen page that runs the
// on-device model (offscreen/offscreen.html) when a review tab asks for it. The tab then talks
// to that page directly, so a long model run never depends on this worker staying awake.
'use strict';

const OFFSCREEN = 'offscreen/offscreen.html';
let creating = null; // one creation at a time, even when several tabs ask together

async function hasOffscreen() {
  if (chrome.runtime.getContexts) {
    const ctx = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [chrome.runtime.getURL(OFFSCREEN)] });
    return ctx.length > 0;
  }
  return false;
}

async function ensureOffscreen() {
  if (await hasOffscreen()) return;
  if (!creating) {
    creating = chrome.offscreen.createDocument({
      url: OFFSCREEN,
      reasons: ['WORKERS'],
      justification: 'Runs the on-device PII detection model; document text never leaves the browser.',
    }).catch((err) => {
      // Another request created it in the meantime.
      if (!/single offscreen|already exists/i.test(String(err && err.message))) throw err;
    }).finally(() => { creating = null; });
  }
  await creating;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.target !== 'pii-background' || sender.id !== chrome.runtime.id) return false;
  if (msg.type === 'ensure-model-page') {
    ensureOffscreen().then(() => sendResponse({ ok: true }), (err) => sendResponse({ ok: false, code: 'offscreen-failed', error: String(err && err.message || err) }));
    return true;
  }
  return false;
});
