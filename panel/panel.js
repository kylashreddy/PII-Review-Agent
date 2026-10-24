
(function (g) {
  'use strict';
  const P = g.PIIRA;

  const D = P.decisions;

  /** Tiny element builder. Strings become text nodes (never HTML). */
  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'bg') el.style.backgroundColor = v;
      else if (k === 'checked' || k === 'open' || k === 'value') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  const truncate = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  const PAGE = 100;          // findings rendered per section before "Show more"
  const SEARCH_DELAY = 250;  // ms to wait after typing before filtering

  function create(cb) {
    const host = document.createElement('div');
    host.id = 'piira-host';
    // Inline CSSOM styles are not blocked by page CSP (unlike style attributes in HTML).
    host.style.position = 'fixed';
    host.style.zIndex = '2147483646';
    host.style.top = '0';
    host.style.left = '0';
    host.style.width = '0';
    host.style.height = '0';
    // Closed on real pages. test.html sets PIIRA.testMode so automated checks can reach inside;
    // the site itself can never set this, because content scripts run in an isolated world.
    const shadow = host.attachShadow({ mode: P.testMode ? 'open' : 'closed' });
    // Clicks and typing inside the panel must not reach the site's own listeners
    // (e.g. a site shortcut firing while the reviewer types in the search box).
    for (const type of ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'keydown', 'keyup', 'keypress', 'input', 'paste', 'copy', 'cut']) {
      host.addEventListener(type, (e) => e.stopPropagation());
    }

    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(P.PANEL_CSS);
      shadow.adoptedStyleSheets = [sheet];
    } catch (e) {
      shadow.append(h('style', {}, P.PANEL_CSS));
    }

    const ui = {
      category: null,       // chip filter
      search: '',
      hideReviewed: false,
      collapsed: true,        // the panel starts closed: only the small launcher shows
      wantOpen: false,        // the reviewer left it open last time (opened on a task page only)
      shownOnce: false,
      dockLeft: false,
      open: new Set(['PI_TODO', 'BI_TODO', 'CRED_TODO', 'NOT_PII', 'CHECK', 'MISSED', 'WRONG_LABEL', 'OVERSCRUB', 'NEEDS_REVIEW', 'TASK', 'LEAKAGE', 'INCOHERENT', 'DATATYPE',
        'NOT_SENSIBLE', 'UNKNOWN_TEXT', 'OVER_REDACTED', 'UNSURE']),
      expanded: new Set(),    // findings / cards whose details are shown
      dismissed: new Set(),   // notices the reviewer closed (this tab only)
      label: '',              // label filter ('' = all labels)
      limit: {},              // per-section number of findings rendered
      cursor: null,           // id of the finding shown by Next/Previous issue
    };
    let last = null;   // last render() args
    let mode = 'status';
    let message = { text: 'Starting…', details: [] };
    let setupInfo = null;    // current click-setup step
    let searchTimer = null;
    let busyEl = null;       // "Updating…" indicator, updated without a full redraw
    let busyText = '';
    // Pages where a review task can be open. Elsewhere (dashboard, lists) nothing is shown
    // at all until documents are found. Checked on every draw: the site changes pages without reloading.
    const isReviewPage = () => /review|annotat|task|label/i.test(location.pathname + location.hash);
    const setOpen = (open) => {
      ui.collapsed = !open;
      if (cb.onOpenChange) cb.onOpenChange(open);
      redraw();
    };

    // The launcher can be dragged anywhere on the screen, so it never covers the site's own
    // buttons. Its spot (distance from the right and bottom edges) is remembered. A press that
    // moves less than a few pixels is a click and opens the panel.
    const DRAG_PX = 4;
    const EDGE = 6;
    let launcherPos = null;     // { right, bottom } in px; null = the default bottom corner
    let dragged = false;        // the last press was a drag: do not treat it as a click
    const validPos = (p) => p && Number.isFinite(p.right) && Number.isFinite(p.bottom) ? { right: p.right, bottom: p.bottom } : null;
    function clampPos(p, el) {
      const r = el.getBoundingClientRect();
      const w = Math.max(r.width, 70);
      const hgt = Math.max(r.height, 34);
      return {
        right: Math.round(Math.min(Math.max(p.right, EDGE), Math.max(EDGE, innerWidth - w - EDGE))),
        bottom: Math.round(Math.min(Math.max(p.bottom, EDGE), Math.max(EDGE, innerHeight - hgt - EDGE))),
      };
    }
    function placeLauncher(el) {
      if (!el) return;
      if (!launcherPos) { el.style.removeProperty('right'); el.style.removeProperty('bottom'); el.style.removeProperty('left'); return; }
      const p = clampPos(launcherPos, el);
      el.style.left = 'auto';
      el.style.right = p.right + 'px';
      el.style.bottom = p.bottom + 'px';
    }
    function moveLauncher(p, save) {
      const el = root.querySelector('.launcher');
      launcherPos = el ? clampPos(p, el) : p;
      placeLauncher(el);
      if (save && cb.onLauncherMove) cb.onLauncherMove(launcherPos);
    }
    function startDrag(e) {
      if (e.button !== 0) return;
      const r = e.currentTarget.getBoundingClientRect();
      const start = { x: e.clientX, y: e.clientY, right: innerWidth - r.right, bottom: innerHeight - r.bottom };
      let moved = false;
      const onMove = (ev) => {
        const dx = ev.clientX - start.x;
        const dy = ev.clientY - start.y;
        if (!moved && Math.hypot(dx, dy) < DRAG_PX) return;
        if (!moved) { moved = true; root.classList.add('dragging'); }
        ev.preventDefault();
        moveLauncher({ right: start.right - dx, bottom: start.bottom - dy }, false);
      };
      const onUp = () => {
        removeEventListener('pointermove', onMove, true);
        removeEventListener('pointerup', onUp, true);
        removeEventListener('pointercancel', onUp, true);
        root.classList.remove('dragging');
        if (!moved) return;
        dragged = true;
        setTimeout(() => { dragged = false; }, 0); // swallow only the click that ends this drag
        moveLauncher(launcherPos, true);
      };
      // On the window, so the drag keeps going even if the panel redraws under the pointer.
      addEventListener('pointermove', onMove, true);
      addEventListener('pointerup', onUp, true);
      addEventListener('pointercancel', onUp, true);
    }
    // Keyboard: Alt + arrow keys move the launcher (Shift for bigger steps).
    function keyMove(e) {
      const step = e.shiftKey ? 48 : 16;
      const d = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
      if (!d || !e.altKey) return;
      e.preventDefault();
      const r = e.currentTarget.getBoundingClientRect();
      moveLauncher({ right: innerWidth - r.right + d[0], bottom: innerHeight - r.bottom + d[1] }, true);
    }
    addEventListener('resize', () => { if (launcherPos) placeLauncher(root.querySelector('.launcher')); });

    const root = h('div', { class: 'root' });
    // Outline boxes for click setup / "show panels" live in their own layer so re-renders keep them.
    const layer = h('div', { class: 'layer' });
    shadow.append(root, layer);
    (document.body || document.documentElement).append(host);

    // The company wordmark and the product badge, as in the Evaratus Review desktop app.
    // If the site blocks the images, the company name shows as text instead.
    function brandMark() {
      const B = P.BRAND;
      const img = (src, cls) => h('img', {
        class: 'wordmark ' + cls, src, alt: B.name, draggable: 'false',
        onerror: (e) => e.target.replaceWith(h('span', { class: 'wordmark-text ' + cls }, B.name)),
      });
      return h('h1', { 'aria-label': 'PII Review Assistant' },
        img(B.wordmarkBlack, 'on-light'), img(B.wordmarkWhite, 'on-dark'),
        h('span', { class: 'product' }, 'PII Review'));
    }

    // The labels to list: all 13, or in 'types' mode (one label per PII type, 80 of them) only those this
    // task uses, on either side, plus Overscrubbed.
    function shownLabels(res) {
      if (P.SETTINGS.labelMode !== 'types') return P.LABELS;
      const by = (res && res.legendStats && res.legendStats.byLabel) || {};
      return P.LABELS.filter((l) => l.name === 'Overscrubbed' || (by[l.name] && (by[l.name].detected || by[l.name].labeled)));
    }

    function frame(content, statusText) {
      // Re-rendering must not steal focus or the caret from the search box.
      const active = shadow.activeElement;
      const typing = active && active.classList && active.classList.contains('search');
      const caret = typing ? active.selectionStart : null;
      requestAnimationFrame(() => {
        if (!typing) return;
        const input = root.querySelector('.search');
        if (input) { input.focus(); if (caret != null) input.setSelectionRange(caret, caret); }
      });
      // Nothing on screen unless there is a task (documents found, or setting up) or this is a
      // review page, where the quiet launcher waits and the panel explains any problem.
      const visible = mode === 'result' || mode === 'setup' || isReviewPage();
      root.className = 'root' + (ui.collapsed ? ' collapsed' : '') + (ui.dockLeft ? ' dock-left' : '') + (visible ? '' : ' hidden');
      const agentView = last && last.stage === 'AGENT' && last.agent;
      const open = agentView ? last.agent.outcome.summary.open
        : last ? last.result.findings.filter((f) => D.isIssue(f) && !last.reviewed.has(f.id)).length : null;
      const highlightsOn = last ? last.highlightsOn : true;
      // On a review page with no task open yet (the task list), the launcher stays a quiet
      // grey "PII"; the explanation and setup are inside the panel.
      const state = open == null ? 'idle' : open ? 'issues' : 'clear';
      const title = mode === 'error' ? 'PII Review Assistant — no task documents found yet (click to set up)'
        : state === 'issues' ? `PII Review Assistant — ${open} to check` : 'Open PII Review Assistant';
      root.replaceChildren(
        h('button', {
          class: 'launcher ' + state, title: `${title}. Drag to move it (or Alt + arrow keys).`, 'aria-label': title,
          onclick: () => { if (!dragged) setOpen(true); }, onpointerdown: startDrag, onkeydown: keyMove,
        },
          h('span', { class: 'launcher-dot' }),
          h('span', {}, state === 'clear' ? 'PII ✓' : 'PII'),
          state === 'issues' ? h('span', { class: 'launcher-count' }, String(open)) : null),
        h('aside', { class: 'panel', role: 'complementary', 'aria-label': 'PII Review Assistant' },
          h('header', {},
            h('div', { class: 'title-row' },
              brandMark(),
              h('button', { class: 'icon-btn', title: 'Re-analyse this task', onclick: () => cb.onRefresh() }, '↻'),
              h('button', {
                class: 'icon-btn', title: 'Show/hide colour highlights on the left document',
                'aria-pressed': String(highlightsOn), onclick: () => cb.onToggleHighlights(),
              }, 'Aa'),
              h('button', { class: 'icon-btn', title: 'Move panel to the other side', onclick: () => { ui.dockLeft = !ui.dockLeft; redraw(); } }, '⇆'),
              h('button', { class: 'icon-btn', title: 'Close panel (it stays closed until you open it)', onclick: () => setOpen(false) }, '✕'),
            ),
            h('div', { class: 'status' }, statusText, (busyEl = h('span', { class: 'busy' }, busyText))),
            mode === 'result' && last ? stageBar() : null,
            mode === 'result' && last && !agentView ? navBar() : null,
          ),
          content,
          h('footer', {}, '🔒 Runs in your browser — document text is never sent anywhere. Labels and Submit are always done by you.',
            P.policy.current.supportContact ? ` Questions: ${P.policy.current.supportContact}` : '',
            h('div', { class: 'foot-row' },
              h('span', { class: 'version', title: 'Version of the PII Review Assistant' }, `v${P.report.version()}`),
              mode === 'result' && last ? h('button', {
                class: 'link-btn', title: 'Save this task with your answers as a test file (it contains the document — share it only with your team)',
                onclick: (e) => { cb.onSaveTask(); flash(e.currentTarget, 'Saved ✓'); },
              }, 'Save task for testing') : null)),
        ),
      );
      placeLauncher(root.querySelector('.launcher'));
    }

    // Brief confirmation on a button ("Saved ✓"), then its label comes back.
    function flash(btn, text) {
      if (!btn) return;
      const before = btn.textContent;
      btn.textContent = text;
      btn.disabled = true;
      setTimeout(() => { btn.textContent = before; btn.disabled = false; }, 1800);
    }

    // "Details ▸" — the short version stays on screen, the long one opens on request.
    function moreToggle(key, label) {
      const open = ui.expanded.has(key);
      return h('button', {
        class: 'more-toggle', 'aria-expanded': String(open),
        onclick: () => { if (open) ui.expanded.delete(key); else ui.expanded.add(key); redraw(); },
      }, open ? 'Hide ▴' : `${label || 'Details'} ▸`);
    }

    function banner(kind, title, details, dismissKey) {
      // Notices with a key are one line with "More"; error banners always show their details.
      const key = dismissKey && `banner-${dismissKey}`;
      const showDetails = details && details.length && (!key || ui.expanded.has(key));
      return h('div', { class: `banner ${kind}` },
        dismissKey ? h('button', {
          class: 'banner-close', title: 'Hide this message', 'aria-label': 'Hide this message',
          onclick: () => { ui.dismissed.add(dismissKey); redraw(); },
        }, '×') : null,
        h('strong', {}, title, key && details && details.length ? [' ', moreToggle(key, 'More')] : null),
        showDetails ? h('ul', {}, details.map((d) => h('li', {}, h('code', {}, d)))) : null);
    }

    function renderStatus() {
      frame(h('div', { class: 'body' }, message.details.length ? banner('info', message.text, message.details) : null),
        message.text);
    }

    function renderError() {
      frame(h('div', { class: 'body' },
        banner('error', message.text, message.details),
        h('div', { class: 'setup-actions' },
          h('button', { class: 'btn primary', onclick: () => cb.onSetup() }, 'Set up manually'),
          h('button', { class: 'btn', onclick: () => cb.onRefresh() }, 'Try again')),
        h('p', { class: 'hint' }, 'Set up takes three clicks: the original document, the reviewed document, and one label. ' +
          'It is saved in this browser for this site. No document text is saved.')),
      'Not running on this page');
    }

    function renderSetup() {
      const s = setupInfo;
      frame(h('div', { class: 'body' },
        h('div', { class: 'setup' },
          h('div', { class: 'step' }, `Setup · step ${s.step} of ${s.total}`),
          h('h2', {}, s.title),
          h('p', { class: 'hint' }, s.help),
          s.detail ? h('div', { class: `banner ${s.detail.warn ? 'error' : 'info'}` }, s.detail.text) : null,
          h('div', { class: 'setup-actions' }, s.buttons.map((b) =>
            h('button', { class: 'btn' + (b.primary ? ' primary' : ''), onclick: b.onClick }, b.label))))),
      'Setting up — your clicks on the page are not sent to the site');
    }

    function setupSection(layout) {
      if (!layout) return null;
      const src = {
        saved: `Saved setup${layout.savedAt ? ' (' + new Date(layout.savedAt).toLocaleDateString() + ')' : ''}`,
        managed: 'Set by your organisation',
        auto: `Auto-detected${layout.similarity != null ? ' (' + Math.round(layout.similarity * 100) + '% matching words)' : ''}`,
        'selectors.js': 'selectors.js',
      }[layout.source] || layout.source;
      return section('setup', 'Page setup', '',
        h('div', { class: 'setup-info' },
          h('div', {}, h('b', {}, 'Panels: '), src),
          h('div', {}, h('b', {}, 'Labels: '), layout.labelVia ? `${layout.labelCount} found (${layout.labelVia})` : `${layout.labelCount} found`),
          h('div', { class: 'setup-actions' },
            h('button', { class: 'btn', onclick: () => cb.onShowPanels() }, 'Show panels'),
            layout.source === 'auto' ? h('button', { class: 'btn primary', onclick: () => cb.onSaveDetected() }, 'Looks right — save') : null,
            h('button', { class: 'btn', onclick: () => cb.onSetup() }, 'Set up manually'),
            layout.source === 'saved' ? h('button', { class: 'btn', onclick: () => cb.onResetSetup() }, 'Forget saved setup') : null)));
    }

    function renderAgent() {
      const ag = last.agent;
      const body = h('div', { class: 'body' },
        (last.info || []).filter((i) => !ui.dismissed.has(i.key)).map((i) => banner('info', i.title, i.details, i.key)),
        P.agentPanel.render(h, { ...ag, cb: { ...ag.cb, redraw } }));
      const prevScroll = root.querySelector('.body') ? root.querySelector('.body').scrollTop : 0;
      frame(body, `Agent · preview · ${ag.outcome.summary.open.toLocaleString()} open`);
      const nb = root.querySelector('.body');
      if (nb) nb.scrollTop = prevScroll;
    }

    function renderResult() {
      if (last.stage === 'AGENT' && last.agent) { renderAgent(); return; }
      const { result, reviewed, hidden, info } = last;
      const { findings, stats } = result;
      const CATS = D.sections(last.stage);
      const actionable = findings.filter(D.isIssue);
      const doneCount = actionable.filter((f) => reviewed.has(f.id)).length;
      const pct = actionable.length ? Math.round((doneCount / actionable.length) * 100) : 100;

      const visible = filtered();

      const chips = h('div', { class: 'chips' },
        h('button', { class: 'chip' + (ui.category ? '' : ' active'), onclick: () => { ui.category = null; redraw(); } },
          'All ', h('b', {}, findings.length)),
        CATS.map((c) => h('button', {
          class: 'chip' + (ui.category === c.key ? ' active' : ''), title: c.hint,
          onclick: () => { ui.category = ui.category === c.key ? null : c.key; redraw(); },
        }, h('span', { class: `cat-${c.key}` }, '●'), c.title, ' ', h('b', {}, stats.byCategory[c.key] || 0))));

      const legend = section('legend', 'Labels & colours', '',
        h('table', { class: 'legend' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Label (click to hide)'), h('th', { class: 'num' }, 'Left'), h('th', { class: 'num' }, 'Right'))),
          h('tbody', {}, ['PI', 'BI', 'CRED'].flatMap((grp) => [h('tr', { class: 'grp' }, h('td', { colspan: '3' }, P.GROUP_NAMES[grp]))].concat(
            shownLabels(last).filter((l) => l.group === grp).map((l) => {
            const s = last.legendStats.byLabel[l.name] || { detected: 0, labeled: 0 };
            const off = hidden.has(l.name);
            return h('tr', { class: off ? 'off' : '' },
              h('td', {}, h('button', {
                class: 'swatch-toggle', title: off ? 'Show highlights for this label' : 'Hide highlights for this label',
                onclick: () => cb.onToggleLabel(l.name),
              }, h('span', { class: 'dot', bg: l.color }), l.name)),
              h('td', { class: 'num' }, s.detected),
              h('td', { class: 'num' }, s.labeled));
          }))),
          (() => {
            const key = P.RIGHT_OVERSCRUB_KEY;
            const off = hidden.has(key);
            return h('tr', { class: off ? 'off' : '' },
              h('td', {}, h('button', {
                class: 'swatch-toggle', title: off ? 'Show overscrub marks on the right document' : 'Hide overscrub marks on the right document',
                onclick: () => cb.onToggleLabel(key),
              }, h('span', { class: 'wavy' }), 'Possible overscrub (right side)')),
              h('td', { class: 'num' }, '—'),
              h('td', { class: 'num' }, last.legendStats.byCategory.OVERSCRUB || 0));
          })(),
          (() => {
            const key = P.KNOWN_NAMES_KEY;
            const off = hidden.has(key);
            return h('tr', { class: off ? 'off' : '' },
              h('td', {}, h('button', {
                class: 'swatch-toggle', title: off ? 'Show the marks on known names' : 'Hide the marks on known names',
                onclick: () => cb.onToggleLabel(key),
              }, h('span', { class: 'known-mark' }), 'Known names (not PII)')),
              h('td', { class: 'num' }, last.knownCount),
              h('td', { class: 'num' }, '—'));
          })())),
        h('div', { class: 'hint' }, 'Left = detected by the assistant. Right = labels already on the reviewed document. ' +
          'Possible overscrubs are marked on the right with a wavy underline; names from the business names list ' +
          'are dotted green on the left: they are not PII and must not be redacted.'));

      const filtering = ui.category || ui.search.trim() || ui.hideReviewed || ui.label;
      const groups = CATS.map((c) => {
        const items = visible.filter((f) => f.category === c.key);
        if (!items.length && filtering) return null;
        // Empty sections are a single quiet line; the section's explanation is its title's tooltip.
        if (!items.length) {
          return h('div', { class: 'section-empty', title: c.hint }, h('span', { class: `cat-${c.key}` }, c.title), h('span', { class: 'count' }, '0'));
        }
        const limit = ui.limit[c.key] || PAGE;
        const shown = items.slice(0, limit);
        const more = items.length - shown.length;
        // Closed sections render nothing; open ones render one page at a time.
        const el = !ui.open.has(c.key) ? section(c.key, c.title, items.length.toLocaleString())
          : section(c.key, c.title, items.length.toLocaleString(),
            h('ul', { class: 'items' }, shown.map((f) => item(f, reviewed.has(f.id)))),
            more > 0 ? h('div', { class: 'more' },
              h('button', { class: 'btn', onclick: () => { ui.limit[c.key] = limit + PAGE; redraw(); } },
                `Show ${Math.min(PAGE, more)} more`),
              h('span', { class: 'hint' }, ` ${more.toLocaleString()} not shown`)) : null);
        el.querySelector('summary').title = c.hint;
        return el;
      });

      const body = h('div', { class: 'body' },
        (info || []).filter((i) => !ui.dismissed.has(i.key)).map((i) => banner('info', i.title, i.details, i.key)),
        overview(),
        taskCard(last.taskCheck),
        decisionSummary(),
        h('div', { class: 'progress' },
          h('div', { class: 'progress-row' },
            h('span', {}, `Reviewed ${doneCount} of ${actionable.length} items to check`),
            h('label', { class: 'check' },
              h('input', { type: 'checkbox', checked: ui.hideReviewed, onchange: (e) => { ui.hideReviewed = e.target.checked; redraw(); } }),
              'Hide reviewed')),
          h('div', { class: 'bar' }, (() => { const d = h('div'); d.style.width = pct + '%'; return d; })())),
        chips,
        h('div', { class: 'filters' },
          h('input', {
            class: 'search', type: 'search', placeholder: 'Filter findings…', value: ui.search,
            // Large documents can have thousands of findings: filter once typing pauses.
            oninput: (e) => {
              ui.search = e.target.value;
              clearTimeout(searchTimer);
              searchTimer = setTimeout(() => { resetPaging(); redraw(); }, SEARCH_DELAY);
            },
          }),
          h('select', {
            class: 'label-filter', title: 'Show only one label', 'aria-label': 'Show only one label',
            onchange: (e) => { ui.label = e.target.value; resetPaging(); redraw(); },
          },
          h('option', { value: '' }, 'All labels'),
          shownLabels(last).map((l) => {
            const o = h('option', { value: l.name }, l.name);
            if (ui.label === l.name) o.selected = true;
            return o;
          }))),
        legend,
        groups,
        setupSection(last.layout));

      const toCheck = actionable.filter((f) => !reviewed.has(f.id)).length;
      const status = `${last.stage === 'L1' ? 'L1 · Identify' : 'L2 · Verify'} · ${toCheck.toLocaleString()} to check · ` +
        `${(findings.length - actionable.length).toLocaleString()} OK`;
      const prevScroll = root.querySelector('.body') ? root.querySelector('.body').scrollTop : 0;
      frame(body, status);
      const nb = root.querySelector('.body');
      if (nb) nb.scrollTop = prevScroll;
    }

    function section(key, title, count, ...children) {
      return h('details', {
        class: 'section', open: ui.open.has(key),
        ontoggle: (e) => {
          const was = ui.open.has(key);
          if (e.target.open) ui.open.add(key); else ui.open.delete(key);
          if (e.target.open && !was && D.sections(last ? last.stage : 'L2').some((c) => c.key === key)) redraw(); // render its items now
        },
      }, h('summary', {}, h('span', { class: `cat-${key}` }, title), count !== '' ? h('span', { class: 'count' }, count) : null), children);
    }

    // One finding: a one-line summary and the decision; the explanation is under "Details".
    function item(f, done) {
      const stage = last.stage;
      const verdict = last.verdicts.get(f.id);
      const q = D.question(f, stage);
      const res = q ? D.outcome(f, stage, verdict) : null;
      const pick = D.suggested(f, stage);
      const open = ui.expanded.has(f.id);
      const entity = f.label ? h('span', { class: 'tag', bg: P.labelInfo(f.label).color, title: f.type && f.type !== f.label ? f.type : f.label }, f.label)
        : h('span', { class: 'tag outline' }, f.category === 'TASK' ? 'Whole task' : 'Text');
      const choice = (opt, cls) => h('button', {
        class: 'vbtn' + (verdict === opt.key ? ` on ${cls}` : '') + (pick === opt.key ? ' suggested' : ''),
        'aria-pressed': String(verdict === opt.key),
        title: opt.title + (pick === opt.key ? ' (the assistant suggests this)' : ''),
        onclick: () => cb.onVerdict(f.id, verdict === opt.key ? null : opt.key),
      }, opt.label);
      const details = open ? h('div', { class: 'item-details' },
        h('div', { class: 'tags' },
          f.type && f.type !== f.label ? h('span', { class: 'tag outline', title: 'The kind of PII found' }, f.type) : null,
          f.rightLabel && f.rightLabel !== f.label ? [h('span', { class: 'arrow' }, 'right says'),
            h('span', { class: 'tag', bg: P.labelInfo(f.rightLabel).color }, f.rightLabel)] : null,
          f.confidence != null ? h('span', { class: 'tag outline' }, `${Math.round(f.confidence * 100)}% · ${f.source}`) : null,
          f.knownName ? h('span', { class: 'tag known', title: 'On the business names list: not PII' }, `Known name · ${f.knownName.category}`) : null,
          f.left || f.right ? h('span', { class: 'where' }, f.left && f.right ? 'left ↔ right' : f.left ? 'left only' : 'right only') : null),
        f.text && f.text.length > 70 ? h('div', { class: 'quote' }, `“${truncate(f.text, 400)}”`) : null,
        f.note ? h('div', { class: 'note' }, f.note) : null,
        q ? h('div', { class: `suggest suggest-${q.tone}` }, q.suggestion) : null,
        h('button', {
          class: 'link-btn report', title: 'Save a small report about this finding to send to the maintainer (it contains a few lines of the document)',
          onclick: (e) => { cb.onReport(f); flash(e.currentTarget, 'Report saved ✓'); },
        }, 'Report a problem')) : null;
      return h('li', { class: 'item' + (done ? ' done' : '') + (ui.cursor === f.id ? ' current' : ''), 'data-id': f.id },
        h('input', {
          type: 'checkbox', checked: done, title: 'Mark as reviewed', 'aria-label': 'Mark as reviewed',
          onchange: (e) => cb.onToggleReviewed(f.id, e.target.checked),
        }),
        h('div', { class: 'item-body' },
          h('button', { class: 'item-main', title: 'Show on both documents', onclick: () => cb.onSelect(f) },
            h('div', { class: 'line1' }, entity, h('span', { class: 'quote' }, `“${truncate(f.text || '', 70)}”`),
              h('span', { class: 'status-chip' }, D.short(f, stage)))),
          h('div', { class: 'item-actions' },
            q ? [choice(q.yes, 'redact'), choice(q.no, 'keep')] : null,
            moreToggle(f.id)),
          res ? h('div', { class: 'outcome' + (res.fix ? ' fix' : ' ok') }, res.text) : null,
          details));
    }

    function decisionSummary() {
      const t = D.summary(last.result.findings, last.stage, last.verdicts);
      const n = (k) => t.kinds[k] || 0;
      const plural = (count, word) => `${count} ${word}${count > 1 ? 's' : ''}`;
      const parts = last.stage === 'L1'
        ? [n('label') && `${n('label')} to label`, n('relabel') && `${n('relabel')} to relabel`, n('remove') && `${plural(n('remove'), 'label')} to remove`]
        : [n('missed') && plural(n('missed'), 'missed redaction'), n('over') && plural(n('over'), 'over-redaction'), n('quality') && plural(n('quality'), 'bad replacement')];
      const counts = last.stage === 'L1'
        ? [['ok', t.groups.PI, 'personal'], ['ok', t.groups.BI, 'business'], ['ok', t.groups.CRED, 'credentials'], ['fix', t.fix, 'label changes'], ['open', t.open, 'undecided']]
        : [['fix', t.fix, 'to fix on the right'], ['ok', t.ok, 'OK'], ['open', t.open, 'undecided']];
      return h('div', { class: 'decisions' },
        h('div', { class: 'dec-title' }, last.stage === 'L1' ? 'Your identification' : 'Your decisions'),
        h('div', { class: 'dec-row' }, counts.map(([cls, count, word]) => h('span', { class: `dec ${cls}` }, h('b', {}, count), ` ${word}`))),
        t.fix ? h('div', { class: 'hint' }, parts.filter(Boolean).join(' · ')) : null);
    }

    // Whole-task check: other language (sampling imperfection) and unstructured text,
    // with the reason ready to copy into the site's own flag/skip field.
    // Overview, shown first: a brief about the two documents and the issue buckets at a glance.
    // Clicking a bucket filters the list below to it.
    function overview() {
      const b = last.brief;
      const stage = last.stage;
      const rows = D.buckets(last.result.findings, stage, last.reviewed);
      const issues = rows.filter((r) => !r.ok);
      const openTotal = issues.reduce((n, r) => n + r.open, 0);
      const okRow = rows.find((r) => r.ok);
      const n = (x) => Number(x || 0).toLocaleString();
      const doc = (title, lines) => h('div', { class: 'doc-tile' }, h('div', { class: 'doc-k' }, title),
        lines.map((l) => h('div', { class: 'doc-v' }, l)));
      const brief = b ? [
        h('div', { class: 'docs' },
          doc('Original', [`${n(b.left.words)} words · ${n(b.left.lines)} lines`, `${n(b.pii)} PII found`]),
          doc('Reviewed', [`${n(b.right.words)} words · ${n(b.right.lines)} lines`,
            stage === 'L1' ? `${n(b.rightLabels)} labels` : `${n(b.replaced)} replaced · ${n(b.leaked)} still visible`])),
        h('div', { class: 'ov-line' },
          h('span', {}, `Personal ${n(b.groups.PI)}`), h('span', {}, `Business ${n(b.groups.BI)}`),
          h('span', {}, `Credentials ${n(b.groups.CRED)}`),
          h('span', { class: b.language === 'English' && b.structured ? '' : 'warn' },
            `${b.language}${b.structured ? '' : ' · unstructured'}`)),
        b.topKinds.length ? h('div', { class: 'ov-kinds', title: 'The kinds of PII found most often in the original' },
          'Most found: ', b.topKinds.map((k) => `${k.name} ${n(k.count)}`).join(' · ')) : null,
      ] : null;
      return h('div', { class: 'overview' },
        h('div', { class: 'ov-head' },
          h('span', { class: 'ov-title' }, 'Overview'),
          h('span', { class: 'ov-total' + (openTotal ? '' : ' zero') }, openTotal ? `${n(openTotal)} open issue${openTotal === 1 ? '' : 's'}` : 'No open issues ✓')),
        brief,
        h('div', { class: 'buckets', role: 'list' },
          issues.map((r) => h('button', {
            class: 'bucket' + (r.open ? ' has' : '') + (ui.category === r.key ? ' active' : ''), role: 'listitem', title: r.hint,
            onclick: () => { ui.category = ui.category === r.key ? null : r.key; ui.open.add(r.key); resetPaging(); redraw(); },
          }, h('span', { class: 'b-name' }, r.title), h('b', {}, n(r.open))))),
        okRow ? h('div', { class: 'ov-ok' }, `${okRow.title.replace(/ ✓$/, '')}: ${n(okRow.total)}`) : null);
    }

    function taskCard(tc) {
      if (!tc) return null;
      const lang = tc.language;
      const hasLang = lang && lang.verdict !== 'english';
      if (!hasLang && !tc.structure) return null;
      const reasons = [];
      if (hasLang) reasons.push(lang.reason);
      if (tc.structure) reasons.push(`Task text is unstructured (${tc.structure.reasons.join('; ')}).`);
      const reasonText = reasons.join(' ');
      const pct = (x) => (x > 0 && x < 0.01 ? '<1' : String(Math.round(x * 100))) + '%';
      const title = hasLang
        ? (lang.verdict === 'other' ? 'Flag this task: not in English' : 'Flag this task: contains other language')
        : 'Flag this task: unstructured text';
      const copyBtn = h('button', { class: 'btn primary', title: 'Copy the reason to paste into the site', onclick: async () => {
        try {
          await navigator.clipboard.writeText(reasonText);
          copyBtn.textContent = 'Copied ✓';
        } catch (e) {
          copyBtn.textContent = 'Copy blocked — select the text below';
        }
        setTimeout(() => { copyBtn.textContent = 'Copy reason'; }, 2500);
      } }, 'Copy reason');
      const others = hasLang ? lang.languages.filter((l) => l.language !== 'English') : [];
      const line = [others.map((l) => `${l.language} ${pct(l.share)}`).join(' · '), hasLang && `lines ${lang.where}`,
        tc.structure && 'unstructured text'].filter(Boolean).join(' — ');
      const open = ui.expanded.has('task-card');
      return h('div', { class: 'task-card' },
        h('div', { class: 'task-title' }, '⚠ ', title),
        h('div', { class: 'task-sub' }, line),
        h('div', { class: 'item-actions' }, copyBtn, moreToggle('task-card')),
        !open ? null : h('div', { class: 'item-details' },
        h('div', { class: 'task-sub' }, 'Other language and unstructured text are sampling imperfections.'),
        hasLang ? h('table', { class: 'task-langs' },
          h('tbody', {}, lang.languages.map((l) => h('tr', { class: l.language === 'English' ? 'en' : '' },
            h('td', {}, l.language), h('td', { class: 'num' }, pct(l.share)),
            h('td', { class: 'num' }, `${l.lines} line${l.lines > 1 ? 's' : ''}`))))) : null,
        hasLang ? h('div', { class: 'task-where' }, `Where: line${lang.segments.length > 1 || (lang.segments[0] && lang.segments[0].lines > 1) ? 's' : ''} ${lang.where}`) : null,
        tc.structure ? h('div', { class: 'task-where' }, `Unstructured: ${tc.structure.reasons.join('; ')}`) : null,
        h('div', { class: 'task-reason' }, reasonText),
        hasLang && lang.segments.length ? section('task-parts', `Show the non-English parts`, String(lang.segments.length),
          h('ul', { class: 'items' }, lang.segments.slice(0, 50).map((sg) => h('li', { class: 'item' },
            h('button', { class: 'item-main', title: 'Show it in the document', onclick: () => cb.onSelect({ left: { start: sg.start, end: sg.end } }) },
              h('div', { class: 'tags' }, h('span', { class: 'tag outline' }, sg.lines > 1 ? `Lines ${sg.line}–${sg.lastLine}` : `Line ${sg.line}`),
                h('span', { class: 'tag outline' }, sg.language)),
              h('div', { class: 'quote' }, `“${truncate(last.leftText.slice(sg.start, sg.end), 120)}”`))))),
          lang.segments.length > 50 ? h('div', { class: 'hint' }, `${lang.segments.length - 50} more not shown`) : null) : null));
    }

    function filtered() {
      const { result, reviewed } = last;
      const q = ui.search.trim().toLowerCase();
      return result.findings.filter((f) =>
        (!ui.category || f.category === ui.category) &&
        (!ui.label || f.label === ui.label || f.rightLabel === ui.label) &&
        (!ui.hideReviewed || !reviewed.has(f.id)) &&
        (!q || [f.text, f.label, f.type, f.rightLabel, f.note].some((s) => s && s.toLowerCase().includes(q))));
    }

    function resetPaging() { ui.limit = {}; }

    // Issues still to check (not Correct, not ticked), in document order, within the current filters.
    function issues() {
      return filtered().filter((f) => D.isIssue(f) && !last.reviewed.has(f.id));
    }

    function stageBar() {
      const btn = (key, label, title) => h('button', {
        class: 'seg' + (last.stage === key ? ' on' : ''), title, 'aria-pressed': String(last.stage === key),
        onclick: () => cb.onStage(key),
      }, label);
      return h('div', { class: 'stage' },
        btn('L1', 'L1 · Identify', 'L1: identify the PII in the raw document, as in the PII / BII Annotation Guide'),
        btn('L2', 'L2 · Verify', 'L2: judge / verify the redacted work against the raw document'),
        last.agent ? btn('AGENT', 'Agent ✦', 'Agent (preview): the agent proposes every label on the right document; you answer Yes / No') : null);
    }

    function navBar() {
      const list = issues();
      const idx = list.findIndex((f) => f.id === ui.cursor);
      const label = !list.length ? 'No open issues' : idx >= 0 ? `Issue ${(idx + 1).toLocaleString()} of ${list.length.toLocaleString()}`
        : `${list.length.toLocaleString()} open issues`;
      return h('div', { class: 'nav' },
        h('button', { class: 'btn', disabled: !list.length, title: 'Previous open issue', onclick: () => go(-1) }, '◀ Prev'),
        h('span', { class: 'nav-label' }, label),
        h('button', { class: 'btn primary', disabled: !list.length, title: 'Next open issue', onclick: () => go(1) }, 'Next ▶'));
    }

    function go(step) {
      const list = issues();
      if (!list.length) return;
      const idx = list.findIndex((f) => f.id === ui.cursor);
      const next = list[idx < 0 ? (step > 0 ? 0 : list.length - 1) : (idx + step + list.length) % list.length];
      ui.cursor = next.id;
      // Make sure the finding is rendered: open its section and page far enough.
      ui.open.add(next.category);
      const pos = filtered().filter((f) => f.category === next.category).findIndex((f) => f.id === next.id);
      if (pos >= (ui.limit[next.category] || PAGE)) ui.limit[next.category] = (Math.floor(pos / PAGE) + 1) * PAGE;
      redraw();
      const li = [...root.querySelectorAll('li.item')].find((el) => el.getAttribute('data-id') === next.id);
      if (li) li.scrollIntoView({ block: 'center' });
      cb.onSelect(next);
    }

    function redraw() {
      if (mode === 'setup' && setupInfo) renderSetup();
      else if (mode === 'error') renderError();
      else if (mode === 'result' && last) renderResult();
      else renderStatus();
    }

    redraw();

    return {
      host,
      layer,
      render(args) {
        last = args;
        mode = 'result';
        busyText = '';
        // Re-open on the first task only if the reviewer left the panel open last time.
        if (!ui.shownOnce) { ui.shownOnce = true; if (ui.wantOpen) ui.collapsed = false; }
        redraw();
      },
      /** The reviewer's last choice (open or closed), from saved preferences. */
      preferOpen(open) { ui.wantOpen = Boolean(open); },
      /** Where the reviewer last dragged the launcher, from saved preferences. */
      setLauncherPos(pos) { launcherPos = validPos(pos); placeLauncher(root.querySelector('.launcher')); },
      /** Show/hide a small "Updating…" note without redrawing the panel. */
      setBusy(text) { busyText = text || ''; if (busyEl) busyEl.textContent = busyText; },
      // Status changes and errors never open the panel: the reviewer opens it from the launcher.
      showError(text, details) {
        message = { text, details: details || [] };
        mode = 'error';
        last = null;
        redraw();
      },
      showSetup(info) { setupInfo = info; mode = 'setup'; ui.collapsed = false; redraw(); },
      endSetup() { setupInfo = null; if (mode === 'setup') mode = 'status'; redraw(); },
      get mode() { return mode; },
      get isOpen() { return !ui.collapsed; },
      showStatus(text, details) { message = { text, details: details || [] }; mode = 'status'; last = null; redraw(); },
      contains(node) { return node === host || host.contains(node); },
    };
  }

  P.panel = { create };
})(globalThis);
