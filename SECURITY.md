# Security and privacy

Summary for IT, security and privacy review of the PII Review Assistant.

## What it does with data

| | |
|---|---|
| Document text | Read from the open task page, analysed in memory, discarded when the tab closes. Never sent, never stored. |
| Network | None. The extension has no server and makes no network requests. Its `fetch` calls only load its own bundled files (`data/business-names.json`, and the optional model files under `models/` and `vendor/ort/`). |
| On-device model (optional, off by default) | The original document's text is passed inside the browser (Chrome extension messaging) to the extension's own hidden offscreen page, which runs the model with WebAssembly and returns positions of names, companies, addresses and usernames. Nothing leaves the computer; the page keeps the last 5 results in memory and closes itself after 15 idle minutes. |
| Stored in the browser | `chrome.storage.local`: the page setup (CSS selectors), the chosen stage (L1/L2) and the model on/off option. No document text, no names, no findings. |
| Organisation settings | Read-only from Chrome policy (`chrome.storage.managed`). |
| Actions on the page | None. It never adds or removes labels, and never clicks Save, Submit or Complete. All of that stays with the reviewer. |

## Permissions

- `storage` — the page setup, stage and model option above.
- `offscreen` — opens the one hidden page that runs the optional on-device model (`offscreen/offscreen.html`).
- Site access only to `https://*.peaktalent.ai/*` and `https://*.peaktalent.co/*`. It does not run on any other site.
- A background worker (`background.js`) whose only job is opening that page. Extension pages may run WebAssembly
  (`'wasm-unsafe-eval'`, needed by the model runtime) and are cross-origin isolated (so the model can use several threads).
  The content script on Peak Talent pages is not affected.
- No remote code, no `eval`, no analytics. The model runtime (ONNX Runtime Web 1.22.0, MIT) and model
  (gliner_multi_pii-v1, Apache-2.0) are bundled files pinned by SHA-256.

These rules are enforced by `node scripts/build.js --check`, which runs in CI on every push; a build that adds a
permission, a site, a network call or remote code, or ships model files that do not match their pinned SHA-256, fails.

## Page content is data

Text in a task is never treated as an instruction. The panel lives in a closed Shadow DOM and is
built with text nodes only, so page content cannot inject markup into it.

## Reporting a problem

Contact the extension owners (see the support contact in the panel footer, or the repository owners).
