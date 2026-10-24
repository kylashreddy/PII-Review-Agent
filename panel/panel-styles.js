// Styles for the side panel, in the Evaratus / scaler ai labs look (black and white). Applied inside the panel's Shadow DOM only, so
// they cannot leak into the Peak Talent page (and the page's CSS cannot
// reach in). Kept as a JS string so no web_accessible_resources are needed.
(function (g) {
  'use strict';
  g.PIIRA.PANEL_CSS = `
/* ---------- tokens */
:host { all: initial; }
* { box-sizing: border-box; }
.root {
  /* Evaratus / scaler ai labs: black and white like the company wordmark. --accent is the "ink"
     (black on light, white on dark) and --on-ink the text on it. Colour is kept only where it
     matches something on the page: the label tags and highlight swatches, and the launcher dot. */
  --bg: #ffffff; --bg2: #f2f2f2; --fg: #0a0a0a; --muted: #6b6b6b; --faint: #a3a3a3; --line: #e2e2e2;
  --accent: #0a0a0a; --on-ink: #ffffff; --accent-soft: #f2f2f2;
  --missed: #0a0a0a; --wrong: #0a0a0a; --review: #6b6b6b; --ok: #6b6b6b; --over: #7c3aed; --known: #2e7d32;
  --flag: #0a0a0a; --flag-ink: #0a0a0a;
  --shadow: 0 1px 2px rgba(0, 0, 0, .04), 0 16px 40px rgba(0, 0, 0, .14);
  font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, Helvetica, Arial, sans-serif;
  color: var(--fg); -webkit-font-smoothing: antialiased;
}
@media (prefers-color-scheme: dark) {
  .root { --bg: #141414; --bg2: #1c1c1c; --fg: #f5f5f5; --muted: #a3a3a3; --faint: #6b6b6b; --line: #2a2a2a;
    --accent: #f5f5f5; --on-ink: #0a0a0a; --accent-soft: #1c1c1c;
    --missed: #f5f5f5; --wrong: #f5f5f5; --review: #a3a3a3; --ok: #a3a3a3; --over: #b388ff; --known: #66bb6a;
    --flag: #f5f5f5; --flag-ink: #f5f5f5; --shadow: 0 16px 40px rgba(0, 0, 0, .6); }
}
.root.hidden { display: none; }

/* ---------- shell: a floating card, and a small launcher when closed */
.panel {
  position: fixed; top: 12px; right: 12px; bottom: 12px; width: 384px; max-width: calc(100vw - 24px);
  display: flex; flex-direction: column; overflow: hidden;
  background: var(--bg); border: 1px solid var(--line); border-radius: 14px; box-shadow: var(--shadow);
  z-index: 2147483646; animation: piira-in .16s ease-out;
}
@keyframes piira-in { from { opacity: 0; transform: translateX(8px); } to { opacity: 1; transform: none; } }
.root.dock-left .panel { right: auto; left: 12px; }
.root.collapsed .panel { display: none; }
.launcher {
  position: fixed; right: 18px; bottom: 18px; z-index: 2147483646; display: none; align-items: center; gap: 8px;
  padding: 8px 12px 8px 11px; border: 1px solid var(--accent); border-radius: 999px; cursor: pointer;
  background: var(--accent); color: var(--on-ink); font: 700 12.5px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif; letter-spacing: .02em;
  box-shadow: 0 8px 24px rgba(0, 0, 0, .25); transition: transform .12s ease, box-shadow .12s ease;
}
.launcher:hover { transform: translateY(-1px); box-shadow: 0 12px 28px rgba(0, 0, 0, .32); }
/* Draggable: no page scrolling or text selection while it is moved. */
.launcher { touch-action: none; user-select: none; -webkit-user-select: none; }
.root.dragging .launcher { cursor: grabbing; transform: scale(1.04); box-shadow: 0 16px 36px rgba(0, 0, 0, .38); transition: none; }
.launcher:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.launcher-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--faint); }
.launcher.issues .launcher-dot { background: #ef4444; }
.launcher.clear .launcher-dot { background: #22c55e; }
.launcher-count { min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px; display: inline-grid; place-items: center;
  background: var(--on-ink); color: var(--accent); font-size: 11.5px; font-variant-numeric: tabular-nums; }
.root.dock-left .launcher { right: auto; left: 18px; }
.root.collapsed .launcher { display: inline-flex; }
header { padding: 14px 16px 12px; border-bottom: 1px solid var(--line); background: var(--bg); }
.title-row { display: flex; align-items: center; gap: 4px; }
h1 { margin: 0; flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; overflow: hidden; }
.title-row .icon-btn { flex: none; }
/* the wordmark: black on light, white on dark (the same files as the desktop app) */
.wordmark { display: block; width: 104px; min-width: 72px; flex: 0 1 auto; height: auto; }
.wordmark.on-dark, .wordmark-text.on-dark { display: none; }
@media (prefers-color-scheme: dark) {
  .wordmark.on-light, .wordmark-text.on-light { display: none; }
  .wordmark.on-dark { display: block; } .wordmark-text.on-dark { display: inline; }
}
.wordmark-text { font-size: 16px; font-weight: 600; letter-spacing: -.02em; }
.product { font-size: 11.5px; font-weight: 600; letter-spacing: .02em; padding: 2px 8px; border: 1px solid var(--accent); border-radius: 6px; white-space: nowrap; }
@media (max-width: 400px) { .product { display: none; } }
.status { color: var(--muted); font-size: 12px; margin-top: 6px; }
.busy { margin-left: 6px; color: var(--accent); }
.body { flex: 1; overflow: auto; padding: 2px 16px 16px; scrollbar-width: thin; }
footer { border-top: 1px solid var(--line); padding: 9px 16px; color: var(--muted); font-size: 11px; background: var(--bg); }

/* ---------- controls */
.icon-btn {
  border: 1px solid transparent; background: transparent; color: var(--muted); border-radius: 8px;
  height: 28px; min-width: 28px; padding: 0 7px; cursor: pointer; font: inherit; font-size: 13px;
}
.icon-btn:hover { background: var(--bg2); color: var(--fg); border-color: var(--line); }
.icon-btn:focus-visible, .btn:focus-visible, .seg:focus-visible, .chip:focus-visible, .vbtn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.icon-btn[aria-pressed="false"] { opacity: .5; }
.btn { border: 1px solid var(--line); background: var(--bg); color: var(--fg); border-radius: 8px; padding: 6px 12px; cursor: pointer; font: inherit; font-size: 12.5px; font-weight: 600; }
.btn:hover { border-color: var(--accent); }
.btn:disabled { opacity: .45; cursor: default; }
.btn.primary { background: var(--accent); border-color: var(--accent); color: var(--on-ink); }
.btn.primary:hover { opacity: .88; }
.stage { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 3px; margin-top: 10px; padding: 3px; border-radius: 10px; background: var(--bg2); border: 1px solid var(--line); }
.seg { border: 0; border-radius: 7px; background: transparent; color: var(--muted); font: inherit; font-size: 12px; font-weight: 600; padding: 6px 4px; cursor: pointer; }
.seg.on { background: var(--accent); color: var(--on-ink); }
.nav { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
.nav .nav-label { flex: 1; text-align: center; font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.chip {
  border: 1px solid var(--line); background: var(--bg); color: var(--fg); border-radius: 999px; padding: 3px 10px;
  cursor: pointer; font: inherit; font-size: 12px; display: inline-flex; gap: 6px; align-items: center;
}
.chip:hover { border-color: var(--accent); }
.chip b { font-weight: 700; }
.chip.active { border-color: var(--accent); background: var(--accent); color: var(--on-ink); }
.filters { display: flex; gap: 6px; margin-top: 12px; }
.search { flex: 1; min-width: 0; padding: 7px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--bg); color: var(--fg); font: inherit; }
.search:focus { outline: none; border-color: var(--accent); }
.label-filter { max-width: 140px; padding: 0 6px; border: 1px solid var(--line); border-radius: 8px; background: var(--bg); color: var(--fg); font: inherit; font-size: 12px; }
label.check { display: inline-flex; align-items: center; gap: 5px; cursor: pointer; }
.progress { margin-top: 12px; }
.progress-row { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--muted); }
.bar { height: 4px; background: var(--bg2); border-radius: 999px; overflow: hidden; margin-top: 6px; }
.bar > div { height: 100%; background: var(--accent); border-radius: 999px; width: 0; transition: width .3s; }

/* ---------- notices */
.banner { position: relative; margin: 10px 16px 0; padding: 10px 12px; border-radius: 10px; font-size: 12.5px; }
.banner { border: 1px solid var(--line); border-left: 3px solid var(--accent); color: var(--fg); }
.banner.error { background: var(--bg2); }
.banner.info { background: var(--bg); }
.banner li, .banner code { color: var(--muted); }
.banner strong { display: block; margin-bottom: 4px; padding-right: 18px; }
.banner ul { margin: 4px 0 0; padding-left: 18px; }
.banner code { font-size: 11.5px; word-break: break-all; }
.banner-close { position: absolute; top: 4px; right: 6px; padding: 2px 4px; border: 0; background: none; color: inherit; font-size: 16px; line-height: 1; cursor: pointer; opacity: .7; }
.banner-close:hover { opacity: 1; }

/* task check: other language / unstructured text */
.task-card { margin-top: 12px; padding: 10px 12px; border: 1px solid var(--line); border-left: 3px solid var(--accent); border-radius: 10px; background: var(--bg2); }
.task-title { font-weight: 700; font-size: 13.5px; color: var(--flag-ink); }
.task-sub { margin-top: 2px; font-size: 11.5px; color: var(--muted); }
.task-langs { width: 100%; margin-top: 8px; border-collapse: collapse; font-size: 12px; }
.task-langs td { padding: 3px 0; border-top: 1px solid var(--line); }
.task-langs td.num { width: 70px; text-align: right; font-variant-numeric: tabular-nums; }
.task-langs tr.en td { color: var(--muted); }
.task-where { margin-top: 6px; font-size: 12px; }
.task-reason { margin-top: 8px; padding: 6px 8px; border: 1px dashed var(--line); border-radius: 6px; background: var(--bg); font-size: 11.5px; user-select: text; }
.task-card details.section { background: var(--bg); }

/* Overview: document brief and issue buckets (shown before the decisions) */
.overview { margin-top: 12px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--bg); }
.ov-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.ov-title { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
.ov-total { font-size: 13px; font-weight: 800; }
.ov-total.zero { color: var(--muted); font-weight: 650; }
.docs { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 10px; }
.doc-tile { padding: 7px 9px; border: 1px solid var(--line); border-radius: 9px; background: var(--bg2); min-width: 0; }
.doc-k { font-size: 12px; font-weight: 700; }
.doc-v { font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ov-line { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 8px; font-size: 11.5px; color: var(--muted); font-variant-numeric: tabular-nums; }
.ov-line .warn { color: var(--fg); font-weight: 700; text-decoration: underline; text-underline-offset: 3px; }
.ov-kinds { margin-top: 4px; font-size: 11.5px; color: var(--muted); }
.buckets { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-top: 10px; }
.bucket { display: flex; align-items: center; justify-content: space-between; gap: 6px; min-width: 0; padding: 5px 8px;
  border: 1px solid var(--line); border-radius: 8px; background: var(--bg); color: var(--muted); font: inherit; font-size: 11.5px; cursor: pointer; text-align: left; }
.bucket .b-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bucket b { font-variant-numeric: tabular-nums; }
.bucket.has { color: var(--fg); border-color: var(--fg); }
.bucket.has b { font-weight: 800; }
.bucket:hover { border-color: var(--accent); }
.bucket.active { background: var(--accent); border-color: var(--accent); color: var(--on-ink); }
.bucket:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.ov-ok { margin-top: 6px; font-size: 11.5px; color: var(--muted); }

/* "Your identification" / "Your decisions" */
.decisions { margin-top: 12px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--bg2); }
.dec-title { font-weight: 650; font-size: 12.5px; }
.dec-row { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 4px; font-size: 12px; }
.dec b { font-variant-numeric: tabular-nums; } .dec.fix b { font-weight: 800; text-decoration: underline; text-underline-offset: 3px; }
.dec.ok b, .dec.open b { color: var(--muted); }
.decisions .hint { padding: 4px 0 0; }

/* ---------- sections and the legend */
details.section { margin-top: 12px; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; background: var(--bg); }
details.section > summary {
  list-style: none; cursor: pointer; padding: 9px 12px; font-weight: 650; display: flex; align-items: center; gap: 8px;
  background: var(--bg);
}
details.section > summary:hover { background: var(--bg2); }
details.section[open] > summary { border-bottom: 1px solid var(--line); }
details.section > summary::-webkit-details-marker { display: none; }
details.section > summary::before { content: "›"; color: var(--faint); font-size: 16px; line-height: 1; width: 8px; transition: transform .15s; }
details.section[open] > summary::before { transform: rotate(90deg); }
.count { margin-left: auto; color: var(--muted); font-weight: 600; font-size: 11.5px; background: var(--bg2); padding: 1px 8px; border-radius: 999px; }
.hint { color: var(--muted); font-size: 11.5px; padding: 6px 10px 0; }
.body > .hint { padding: 0; margin: 8px 0 0; }
.empty { padding: 10px; color: var(--muted); font-size: 12px; }
.section-empty { display: flex; gap: 8px; margin-top: 6px; padding: 4px 10px; font-size: 12px; opacity: .6; }
.more { display: flex; align-items: center; gap: 6px; padding: 8px 10px; border-top: 1px solid var(--line); }
table.legend { width: 100%; border-collapse: collapse; font-size: 12px; }
table.legend th { text-align: left; font-weight: 600; color: var(--muted); padding: 6px 10px 4px; font-size: 11px; }
table.legend td { padding: 4px 10px; border-top: 1px solid var(--line); }
table.legend td.num { width: 44px; text-align: right; font-variant-numeric: tabular-nums; }
table.legend tr.grp td { background: var(--bg2); color: var(--muted); font-weight: 650; font-size: 11px; text-transform: uppercase; letter-spacing: .03em; }
table.legend tr.off td { opacity: .45; }
.swatch-toggle { display: inline-flex; align-items: center; gap: 7px; padding: 0; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; }
.dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; flex: none; }
.wavy { width: 18px; height: 9px; flex: none; display: inline-block; border-bottom: 2px dotted var(--over); background: rgba(124,58,237,.22); border-radius: 2px; }
.setup-info { display: grid; gap: 4px; padding: 8px 10px; font-size: 12px; }

.known-mark { width: 18px; height: 9px; flex: none; display: inline-block; border-bottom: 2px dotted var(--known); }
.tag.known { background: transparent; color: var(--known); border: 1px solid var(--known); font-weight: 600; }

/* section titles: text colour, with a filled dot for "to fix" and a ring for "looks fine" */
[class^="cat-"], [class*=" cat-"] { color: var(--fg); }
.chip.active [class^="cat-"] { color: inherit; }
.cat-IDENTIFIED, .cat-REDACTED_OK { color: var(--muted); }

/* ---------- findings */
ul.items { list-style: none; margin: 0; padding: 0; }
li.item { display: flex; gap: 8px; padding: 9px 12px; border-top: 1px solid var(--line); align-items: flex-start; transition: background .1s; }
li.item:hover { background: var(--bg2); }
li.item:first-child { border-top: 0; }
li.item.done { opacity: .75; }
li.item.current { background: var(--bg2); box-shadow: inset 3px 0 0 var(--accent); }
li.item input { margin-top: 3px; cursor: pointer; flex: none; }
.item-body { flex: 1; min-width: 0; }
.item-main { width: 100%; padding: 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.item-main:hover .quote { text-decoration: underline; }
.item-main:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }
.tags { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.tag { font-size: 11px; padding: 2px 7px; border-radius: 5px; color: #fff; font-weight: 700; }
.tag.outline { background: transparent !important; color: var(--fg); border: 1px solid var(--line); font-weight: 500; }
.arrow { color: var(--muted); font-size: 11px; }
.quote { margin-top: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; word-break: break-word; }
.note { margin-top: 3px; color: var(--muted); font-size: 11.5px; }
.where { margin-top: 2px; color: var(--muted); font-size: 10.5px; text-transform: uppercase; letter-spacing: .03em; }

/* compact finding: one line + actions; the rest under "Details" */
.line1 { display: flex; align-items: center; gap: 6px; min-width: 0; }
.line1 .quote { margin-top: 0; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.status-chip { flex: none; font-size: 11px; color: var(--muted); white-space: nowrap; }
.item-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 6px; }
.more-toggle { padding: 2px 4px; border: 0; background: none; color: var(--fg); font: inherit; font-size: 11.5px; font-weight: 600;
  text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
.more-toggle:hover { color: var(--muted); }
.item-details { margin-top: 6px; padding: 6px 8px; border-left: 2px solid var(--line); }
.item-details .quote { margin-top: 4px; }
.vbtn.suggested { border-style: dashed; border-color: var(--accent); }

/* the decision under a finding */
.decide { margin-top: 6px; }
.suggest { font-size: 11.5px; font-weight: 600; }
.suggest-redact { color: var(--fg); } .suggest-keep, .suggest-unsure { color: var(--muted); }
.verdict { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 5px; }
.verdict .q { margin-right: 2px; color: var(--muted); font-size: 11.5px; }
.vbtn { padding: 4px 11px; border: 1px solid var(--line); border-radius: 7px; background: var(--bg); color: var(--fg); font: inherit; font-size: 11.5px; font-weight: 600; cursor: pointer; }
.vbtn:hover { border-color: var(--accent); }
.vbtn.on.redact, .vbtn.on.keep, .vbtn.on { background: var(--accent); border-color: var(--accent); border-style: solid; color: var(--on-ink); }
.outcome { display: inline-block; margin-top: 5px; padding: 3px 7px; border-radius: 4px; font-size: 11.5px; }
.outcome.fix { background: var(--accent); color: var(--on-ink); font-weight: 700; }
.outcome.ok { background: var(--bg2); color: var(--muted); }
li.item.done .outcome { opacity: 1; }

/* ---------- page setup and the click-setup overlay */
.setup { margin-top: 14px; }
.setup h2 { font-size: 15px; margin: 4px 0 6px; }
.setup .step { color: var(--muted); font-size: 11.5px; text-transform: uppercase; letter-spacing: .04em; }
.setup .hint { padding: 0; margin: 8px 0 0; }
.setup .banner { margin: 10px 0 0; }
.setup-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; }
.pick-box { position: fixed; display: none; pointer-events: none; border: 2px solid #0a0a0a; border-radius: 4px; background: rgba(10,10,10,.06);
  box-shadow: 0 0 0 1px rgba(255,255,255,.8); }
.pick-box.fixed { border-style: dashed; border-color: #6b6b6b; background: rgba(10,10,10,.03); }
.pick-tag { position: absolute; top: -20px; left: -2px; padding: 4px 6px; border-radius: 4px 4px 0 0; background: #0a0a0a; color: #fff; font: 700 11px/1 -apple-system, sans-serif; letter-spacing: .03em; white-space: nowrap; }
.pick-box.fixed .pick-tag { background: #6b6b6b; }

  footer .foot-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 4px; }
  footer .version { opacity: .7; font-variant-numeric: tabular-nums; }
  .link-btn { background: none; border: 0; padding: 0; font: inherit; color: inherit; text-decoration: underline; cursor: pointer; opacity: .85; }
  .link-btn:hover { opacity: 1; }
  .link-btn:disabled { text-decoration: none; cursor: default; }
  .item-details .report { display: inline-block; margin-top: 6px; font-size: 11px; }

/* ---------- agent mode (preview) */
.agent { display: flex; flex-direction: column; gap: 10px; }
.agent-head .agent-title { font-weight: 700; font-size: 14px; display: flex; gap: 8px; align-items: center; }
.agent-mode { font-size: 11px; font-weight: 600; color: var(--muted); border: 1px solid var(--line); border-radius: 999px; padding: 1px 8px; }
.agent-summary { border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; }
.agent-summary.ready { border-color: var(--known); }
.agent-sum-text { font-weight: 600; }
.agent-card { border: 2px solid var(--accent); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
.agent-card.tier-leak { border-color: #d32f2f; }
.agent-card.tier-unsure { border-color: #ef6c00; }
.agent-card-top { display: flex; align-items: center; gap: 8px; }
.agent-nav { margin-left: auto; display: flex; gap: 2px; }
.agent-tier { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: var(--bg2); color: var(--fg); }
.agent-tier.small { font-size: 10px; padding: 1px 6px; margin-right: 4px; }
.agent-tier.tier-leak { background: #d32f2f; color: #fff; }
.agent-tier.tier-unsure { background: #ef6c00; color: #fff; }
.agent-tier.tier-high { background: var(--accent); color: var(--on-ink); }
.agent-prompt { font-size: 14px; font-weight: 600; line-height: 1.4; word-break: break-word; }
.agent-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.agent-actions .btn, .agent-menu .btn { display: inline-flex; align-items: center; gap: 6px; }
.agent kbd { font: 600 10px ui-monospace, Menlo, monospace; border: 1px solid currentColor; border-radius: 4px; padding: 0 4px; opacity: .7; }
.agent-menu { display: flex; flex-direction: column; gap: 6px; padding: 8px; background: var(--bg2); border-radius: 8px; }
.agent-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.agent-select { font: inherit; font-size: 12.5px; padding: 4px 6px; border-radius: 6px; border: 1px solid var(--line); background: var(--bg); color: var(--fg); }
.agent-approve { border: 1px dashed var(--line); border-radius: 10px; padding: 8px 10px; display: flex; flex-direction: column; gap: 6px; }
.agent-list { list-style: none; margin: 4px 0 0; padding: 0; max-height: 220px; overflow: auto; }
.agent-list li { padding: 3px 4px; border-radius: 6px; display: flex; gap: 6px; align-items: center; }
.agent-list li.current { background: var(--bg2); }
.agent-list li.done { opacity: .6; }
.agent-list .quote { margin-top: 0; }
.agent-icon { display: inline-block; width: 16px; text-align: center; font-weight: 700; }
.agent-ops { font-size: 12px; }
`;
})(globalThis);
