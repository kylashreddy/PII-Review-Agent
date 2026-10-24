
(function (g) {
  'use strict';
  const P = g.PIIRA;
  if (P.started) return;
  P.started = true;

  // Two versions installed (standard and PII Types) would both draw on the page: the first one wins.
  const root = document.documentElement;
  if (root.dataset.piiraEdition && root.dataset.piiraEdition !== P.EDITION) {
    console.warn(`[PII Review Assistant] the ${root.dataset.piiraEdition} version is already running here; remove one of them in chrome://extensions.`);
    return;
  }
  root.dataset.piiraEdition = P.EDITION || 'standard';
  // An administrator can switch the assistant off for the whole organisation
  // (core/policy.js); then nothing is added to the page at all.
  P.policy.load().then((policy) => { if (policy.enabled) start(policy); });

  function start(policy) {
    const startedAt = Date.now();
    // Keep showing the last result through short glitches (e.g. the site briefly
    // re-rendering the task) instead of flashing "Looking for…" messages.
    const GRACE_MS = 4000;
    // Findings marked on the RIGHT document in each stage.
    const RIGHT_MARKS = {
      L1: new Set(['NOT_PII']),
      L2: new Set(['LEAKAGE', 'OVER_REDACTED', 'UNSURE', 'INCOHERENT', 'DATATYPE', 'NOT_SENSIBLE', 'UNKNOWN_TEXT']),
    };

    const state = {
      stagePref: 'L2',     // the reviewer's choice: 'L1' (identify) or 'L2' (verify)
      stage: 'L2',         // the stage on screen
      result: null,        // findings on screen (L1 identification or L2 verification)
      l1: null,            // label comparison behind L1 (also colours the left document)
      l1id: null,          // L1 identification checklist
      l2: null,            // L2 redaction check
      taskCheck: null,     // other language / unstructured text
      knownNames: [],      // names from the business names list in the original (not PII)
      reviewed: new Set(),
      verdicts: new Map(), // finding id -> the reviewer's decision
      hidden: new Set(),   // labels whose colour is switched off
      highlightsOn: true,
      info: [],
      layout: null,        // what Page setup shows
      leftModel: null,
      rightModel: null,
      sticky: null,        // the layout in use; kept while its elements stay on the page
      signature: null,
      taskKey: null,
      failSince: 0,
      retryTimer: null,
      picking: null,
      gen: 0,              // increases with every analysis; older async runs stop early
      detCache: null,      // detections reused while the left text is unchanged
      alignCache: {},      // word alignment reused while the words on both sides are unchanged
      lastMs: 0,           // duration of the last analysis (spaces out re-checks)
      modelOn: false,      // on-device model switched on (policy or the reviewer's option)
      lastRun: null,       // inputs of the last analysis, to redo it when the model answers
      dirtyLeft: true,     // which document changed since the last analysis
      dirtyRight: true,
      // Agent mode (preview, off unless switched on): the agent's plan for the right document and the
      // reviewer's Yes / No answers (kept for this task only, in this tab). Nothing is applied to the site.
      agentOn: false,
      agentPlan: null,
      agentCards: [],
      agentAnswers: new Map(), // card key -> {verdict, choice?, label?, span?}
      agentCursor: null,
    };

    const hashOf = (model) => model.hash || (model.hash = P.util.hash(model.text));
    const refresh = () => { renderHighlights(); renderPanel(); };
    const toggle = (set, key, on) => { if (on) set.add(key); else set.delete(key); };

    const panel = P.panel.create({
      // Open or closed is remembered, so the panel does not pop open on every task.
      onOpenChange(open) { P.config.savePrefs({ panelOpen: open }); },
      // Where the reviewer dragged the PII button, so it stays out of the site's way next time.
      onLauncherMove(pos) { P.config.savePrefs({ launcherPos: pos }); },
      onRefresh: () => { P.layout.redetect(); analyze('manual', true); },
      // Files saved on the reviewer's computer for the maintainer (core/report.js).
      onReport(f) {
        P.report.download(`pii-report-${P.report.slug(state.fileName)}-${P.report.stamp()}.json`, P.report.findingReport({
          finding: f, stage: state.stage, fileName: state.fileName,
          leftText: state.leftModel && state.leftModel.text, rightText: state.rightModel && state.rightModel.text,
        }));
      },
      onSaveTask() {
        if (!state.result || !state.leftModel) return;
        P.report.download(`${P.report.slug(state.fileName)}-${P.report.stamp()}.pii-task.json`, P.report.taskExport({
          stage: state.stage, fileName: state.fileName, leftText: state.leftModel.text,
          findings: state.result.findings, verdicts: state.verdicts,
        }));
      },
      onSelect: select,
      onToggleReviewed(id, done) { toggle(state.reviewed, id, done); refresh(); },
      onToggleLabel(label) { toggle(state.hidden, label, !state.hidden.has(label)); refresh(); },
      onToggleHighlights() { state.highlightsOn = !state.highlightsOn; refresh(); },
      onVerdict(id, verdict) {
        // A decision also ticks the item as reviewed; clearing it un-ticks it.
        if (verdict) state.verdicts.set(id, verdict); else state.verdicts.delete(id);
        toggle(state.reviewed, id, Boolean(verdict));
        refresh();
      },
      onStage(stage) {
        state.stagePref = stage;
        P.config.savePrefs({ stage });
        applyStage();
        refresh();
      },
      onSetup: startSetup,
      async onSaveDetected() {
        if (!P.config.detected) return;
        await P.config.save({ ...P.config.detected, method: 'auto' });
        analyze('saved', true);
      },
      onShowPanels() {
        if (state.sticky) P.picker.showPanels(panel, state.sticky.loc.left, state.sticky.loc.right);
      },
      async onResetSetup() {
        await P.config.reset();
        P.layout.redetect();
        analyze('reset', true);
      },
    });

    // ------------------------------------------------------------ rendering

    function applyStage() {
      if (!state.l1id || !state.l2) return;
      state.stage = state.stagePref === 'AGENT' && state.agentOn && state.agentPlan ? 'AGENT'
        : state.stagePref === 'L1' || state.stagePref === 'AGENT' ? 'L1' : 'L2';
      state.result = state.stage === 'L2' ? state.l2 : state.l1id;
    }

    function renderPanel() {
      if (!state.result || state.picking) return;
      panel.render({
        stage: state.stage,
        result: state.result,
        legendStats: state.l1.stats,
        verdicts: state.verdicts,
        reviewed: state.reviewed,
        hidden: state.hidden,
        highlightsOn: state.highlightsOn,
        taskCheck: state.taskCheck,
        brief: state.brief,
        knownCount: state.knownNames.length,
        leftText: state.leftModel.text,
        // L2 compares replaced text, so "no labels on the right" is expected there.
        info: state.stage === 'L2' ? state.info.filter((i) => i.key !== 'no-labels') : state.info,
        layout: state.layout,
        agent: agentView(),
      });
    }

    function renderHighlights() {
      if (!state.result || !state.highlightsOn) { P.highlight.clear(); return; }
      // The left (raw, never labeled) document is coloured the same way in both stages.
      let detected = state.l1.findings.filter((f) => f.left && f.label && f.source !== 'right');
      // L2 · Verify: a value the right document already replaced correctly needs nothing; only what is
      // still a problem (leaks, partial leaks, unsure) stays coloured on the left.
      if (state.stage === 'L2') {
        const done = state.result.findings.filter((f) => f.category === 'REDACTED_OK' && f.left);
        if (done.length) detected = detected.filter((d) => !done.some((f) => f.left.start < d.left.end && f.left.end > d.left.start));
      }
      // Problems on the right document are underlined there, until ticked as reviewed.
      const marks = state.hidden.has(P.RIGHT_OVERSCRUB_KEY) || !RIGHT_MARKS[state.stage] ? [] : state.result.findings.filter((f) =>
        RIGHT_MARKS[state.stage].has(f.category) && f.right && !state.reviewed.has(f.id));
      const known = state.hidden.has(P.KNOWN_NAMES_KEY) ? [] : state.knownNames;
      const right = state.stage === 'AGENT' ? { model: state.rightModel, named: agentLayers() }
        : { model: state.rightModel, findings: marks, kind: state.stage === 'L2' ? 'issue' : 'overscrub' };
      P.highlight.render(state.leftModel, detected, state.hidden, right, known);
      // Label names above the highlighted values ("Person Name", "Address · model").
      P.labelTags.render(state.leftModel, detected, state.hidden);
    }

    function select(f) {
      const ranges = [];
      if (f.left && state.leftModel) ranges.push(P.textModel.toRange(state.leftModel, f.left.start, f.left.end));
      if (f.right && state.rightModel) ranges.push(P.textModel.toRange(state.rightModel, f.right.start, f.right.end));
      // Nothing to show: the page changed since the last analysis, so look again.
      if (!P.highlight.flash(ranges)) analyze('stale', true);
    }

    function startSetup() {
      if (state.picking) return;
      P.highlight.clear();
      const finish = (reason) => { state.picking = null; panel.endSetup(); analyze(reason, true); };
      state.picking = P.picker.start(panel, {
        async onDone(setup) { await P.config.save(setup); finish('setup'); },
        onCancel() { finish('setup-cancel'); },
      });
    }

    function notices(source, labelCount) {
      const out = [];
      if (source === 'auto') {
        out.push({ key: 'auto', title: 'Document panels were found automatically.',
          details: ['Check them with “Show panels” under Page setup, then press “Looks right — save”. If they are wrong, use “Set up manually”.'] });
      }
      if (!labelCount) {
        out.push({ key: 'no-labels', title: 'No labels found on the right document yet.',
          details: ['This is normal for a task with no labels. If the right panel does show labels, use “Set up manually” and click one of them.'] });
      }
      if (!P.highlight.supported) out.push({ key: 'no-highlight', title: 'Colour highlights need Chrome 105 or newer.', details: [] });
      return out;
    }

    // ------------------------------------------------------------ analysis

    // Cheap check, safe to call for every DOM change.
    function stickyConnected() {
      const st = state.sticky;
      return Boolean(st && st.loc.left.isConnected && st.loc.right.isConnected);
    }

    const hasText = (el) => {
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) if (n.data.trim()) return true;
      return false;
    };

    // Full check, once per analysis: both documents must still contain text.
    const stickyStillValid = () => stickyConnected() && hasText(state.sticky.loc.left) && hasText(state.sticky.loc.right);

    /** During a short glitch, keep the last result on screen and retry. */
    function withinGrace(force) {
      if (!state.result || force) return false;
      if (!state.failSince) state.failSince = Date.now();
      if (Date.now() - state.failSince < GRACE_MS) {
        state.retryTimer = setTimeout(() => analyze('retry'), 700);
        return true;
      }
      state.failSince = 0;
      return false;
    }

    function notFound(loc) {
      Object.assign(state, { sticky: null, result: null, signature: null });
      P.highlight.clear();
      if (Date.now() - startedAt < (P.SELECTORS.waitForTaskMs || 8000)) {
        panel.showStatus('Looking for the task documents…');
        state.retryTimer = setTimeout(() => analyze('retry'), 1000);
      } else {
        panel.showError(loc.message, [...loc.details, 'Auto-detect could not find two side-by-side documents either.']);
      }
    }

    // Label mode: 'auto' (default), 'broad' (13 labels) or 'types' (one per PII type). In 'auto', the task's
    // label list decides: a page that offers type labels ("Indian Aadhaar Number", "Stripe Key"…) is a types task.
    const TYPE_ONLY = ['Indian Aadhaar Number', 'Indian PAN (Individual)', 'Indian GSTIN', 'Stripe Key', 'Slack Token',
      'AWS Access Key ID', 'Brazilian CPF', 'Indonesian NIK', 'US Social Security Number', 'Private Key Block', 'Indian UPI ID',
      'Payment Card Number', 'Indian Mobile Number', 'Bank Account Number', 'Public IPv4 Address'];
    const pageLabelMode = { key: null, mode: 'broad' };
    function applyLabelMode(loc) {
      // The normal version uses the site's 13 labels unless the reviewer chose otherwise (team decision 2026-10-23).
      let mode = P.EDITION === 'types' ? 'types' : state.labelModePref || 'broad';
      if (mode === 'auto') {
        // The label list sits outside both documents; read the page once per task.
        const key = location.href + '|' + document.title;
        if (pageLabelMode.key !== key) {
          const outside = [...document.querySelectorAll('button, [role="button"], label, span, li')]
            .filter((el) => el.childElementCount <= 2 && !loc.left.contains(el) && !loc.right.contains(el))
            .slice(0, 4000).map((el) => el.textContent.trim()).filter((t) => t && t.length <= 60);
          const names = new Set(outside);
          pageLabelMode.mode = TYPE_ONLY.filter((n) => names.has(n)).length >= 3 ? 'types' : 'broad';
          pageLabelMode.key = key;
        }
        mode = pageLabelMode.mode;
      }
      P.setLabelMode(mode);
    }

    function analyze(reason, force) {
      if (state.picking) return;
      clearTimeout(state.retryTimer);
      // Some sites re-render <body> children; put the panel back if it was removed.
      if (!panel.host.isConnected && document.body) document.body.append(panel.host);

      // Keep using the same documents while they are on the page: re-detecting on
      // every change is what makes a panel jumpy.
      const layout = !force && stickyStillValid() ? state.sticky : P.layout.resolve();
      if (!layout.loc.ok) {
        if (!withinGrace(force)) notFound(layout.loc);
        return;
      }
      P.layout.findLabels(layout);
      const { loc, S, source, layer } = layout;

      // Re-read only the document that changed: adding a label on the right
      // should not re-read a large original.
      const ignore = (S.ignoreInText || []).join(',');
      const reuse = (model, el, dirty) => !force && !dirty && layout === state.sticky && model && model.root === el;
      const leftModel = reuse(state.leftModel, loc.left, state.dirtyLeft) ? state.leftModel : P.textModel.build(loc.left, ignore);
      const rightModel = reuse(state.rightModel, loc.right, state.dirtyRight) ? state.rightModel : P.textModel.build(loc.right, ignore);
      state.dirtyLeft = state.dirtyRight = false;
      if ((!leftModel.text.trim() || !rightModel.text.trim()) && withinGrace(force)) return;
      state.sticky = layout;
      state.failSince = 0;

      // One label per PII type when this task's label list names the types (or the reviewer chose it).
      applyLabelMode(loc);
      // Labels only ever live on the right: the left document is the raw original.
      const rightLabels = P.compare.readLabels(loc.right, rightModel, S);

      const signature = [source, P.SETTINGS.labelMode, hashOf(leftModel), hashOf(rightModel),
        P.util.hash(rightLabels.map((l) => `${l.label}@${l.start}-${l.end}`).join('|'))].join(':');
      if (!force && signature === state.signature && state.result) {
        // Same text and labels: just refresh the live node references for highlights.
        Object.assign(state, { leftModel, rightModel });
        renderHighlights();
        return;
      }
      state.signature = signature;
      state.layout = {
        source,
        savedAt: source === 'saved' ? layer.savedAt : null,
        similarity: layer ? layer.similarity : null,
        labelVia: layer ? layer.labelVia : 'selectors.js',
        labelCount: rightLabels.length,
      };

      if (!leftModel.text.trim()) {
        state.result = null;
        P.highlight.clear();
        panel.showStatus('Waiting for document text…');
        return;
      }

      // A different original means a new task: start the checklist again.
      if (hashOf(leftModel) !== state.taskKey) {
        state.taskKey = hashOf(leftModel);
        state.reviewed.clear();
        state.verdicts.clear();
        state.agentAnswers.clear();
        state.agentCursor = null;
      }

      const gen = ++state.gen;
      // Only show "Updating…" when it takes long enough to notice (large documents).
      const busyTimer = setTimeout(() => panel.setBusy(' · Updating…'), 300);
      finishAnalysis({ gen, reason, source, leftModel, rightModel, rightLabels })
        .catch((err) => console.warn('[PII Review Assistant] analysis failed', err))
        .finally(() => { clearTimeout(busyTimer); if (gen === state.gen) panel.setBusy(''); });
    }

    /** The heavy part, run in small steps so large documents never freeze the page. */
    async function finishAnalysis({ gen, reason, source, leftModel, rightModel, rightLabels }) {
      const t0 = performance.now();
      const current = () => gen === state.gen;
      const pause = async () => { await P.engine.yieldNow(); return current(); };
      if (!(await pause())) return;

      // The task's file name ("by-pii-type~~us_itin~~…") says which PII type the file is about.
      const loc = state.sticky && state.sticky.loc;
      state.fileName = P.fileHint.findOnPage(document, loc ? [loc.left, loc.right] : []) || document.title || '';
      const hint = P.fileHint.parse(state.fileName);
      // Detections and the task check depend on the original (and its file name) only.
      const leftKey = [hashOf(leftModel), leftModel.text.length, JSON.stringify(P.SETTINGS), P.knownNames.version,
        hint ? hint.type : ''].join(':');
      const cached = Boolean(state.detCache && state.detCache.key === leftKey);
      if (!cached) {
        const detections = await P.engine.runAsync(leftModel.text, current, { hint });
        if (!detections) return; // superseded by a newer analysis
        const structure = P.redactionRules.structure(leftModel.text);
        const language = P.redactionRules.languageReport(leftModel.text, { scriptOnly: Boolean(structure) });
        // Names from the business names list: not PII, marked so they are not over-scrubbed.
        // A surname inside a detected person's name ("Harrison Ford") is left out.
        const people = detections.filter((d) => d.label === 'Person Name');
        const knownNames = P.knownNames.findIn(leftModel.text).filter((k) => !people.some((d) => k.start < d.end && k.end > d.start));
        state.detCache = { key: leftKey, detections, knownNames, taskCheck: { language, structure } };
      }
      const { knownNames, taskCheck } = state.detCache;
      // With the model on, its suggestions are merged in once they arrive (modelPass below).
      const detections = state.detCache.merged || state.detCache.detections;
      const tDetect = performance.now();
      if (!(await pause())) return;

      // L1: the right document's labels against what the original contains.
      const l1 = await P.compare.compareDocumentsAsync({
        leftText: leftModel.text, rightText: rightModel.text, detections, rightLabels, cache: state.alignCache,
      }, current);
      if (!l1 || !(await pause())) return;
      // L2: validate the redacted text against the original, with the same word alignment.
      const l2 = P.redaction.validate({ leftText: leftModel.text, rightText: rightModel.text, detections, alignment: l1.alignment, hint });
      if (!current()) return;

      if (state.agentOn) {
        state.agentPlan = P.agentPlan.build({ leftText: leftModel.text, rightText: rightModel.text, detections, l1, l2, rightLabels });
        state.agentCards = P.agentPlan.cards(state.agentPlan);
      }
      Object.assign(state, {
        l1, l1id: P.identify.fromCompare(l1), l2, taskCheck, knownNames,
        leftModel, rightModel, info: notices(source, rightLabels.length).concat(modelNotices()),
        brief: P.decisions.documentBrief({
          leftText: leftModel.text, rightText: rightModel.text, rightLabelCount: rightLabels.length, detections, l2, taskCheck,
        }),
      });
      applyStage();
      refresh();
      state.lastRun = { source, leftModel, rightModel, rightLabels };
      if (!state.detCache.model) modelPass(state.detCache, leftModel.text);
      state.lastMs = performance.now() - t0;
      console.debug(`[PII Review Assistant] ${reason} (${source}): ${detections.length} detections${cached ? ' (cached)' : ''}, ` +
        `${rightLabels.length} right labels, ${Math.round(state.lastMs)} ms (detect ${Math.round(tDetect - t0)})` +
        (hint ? `, file type: ${hint.type}` : ''));
    }

    // ------------------------------------------------------------ on-device model (optional)

    /**
     * Asks the model for names, companies, addresses and usernames in the original, then merges its
     * answer with the rules (core/hybrid.js) and redoes the comparison. Runs in the background; the
     * rules' result is already on screen. Any problem leaves the rules' result and shows why.
     */
    async function modelPass(cache, text) {
      cache.model = { status: 'off' };
      if (!state.modelOn) return;
      cache.model = { status: 'loading' };
      const showStatus = (status) => {
        if (state.detCache !== cache) return;
        cache.model.status = status;
        state.info = state.info.filter((i) => !i.key.startsWith('model')).concat(modelNotices());
        renderPanel();
      };
      showStatus('loading');
      let r;
      try {
        r = await P.modelClient.detect(text, cache.key, showStatus);
      } catch (err) {
        r = { status: 'failed', entities: [], error: String(err && err.message || err) };
      }
      if (state.detCache !== cache) return; // another document is on screen now
      cache.model = { status: r.status, error: r.error || '', ms: r.ms || 0 };
      if (r.entities && r.entities.length) {
        try {
          const merged = P.hybrid.merge(cache.detections, r.entities, text);
          const fromModel = merged.filter((d) => d.source === 'model');
          cache.model.added = fromModel.filter((d) => d.confidence >= P.REVIEW_THRESHOLD).length;
          cache.model.possible = fromModel.length - cache.model.added;
          cache.model.confirmed = merged.filter((d) => d.model && d.model.agrees && d.source !== 'model').length;
          cache.merged = merged;
        } catch (err) {
          cache.model = { status: 'failed', error: `merge: ${err.message || err}` };
          console.warn('[PII Review Assistant] model merge failed', err);
        }
      }
      // Redo the comparison with the merged detections (or just show the final status).
      const run = state.lastRun;
      if (!run || run.leftModel.text !== text) { showStatus(cache.model.status); return; }
      const gen = ++state.gen;
      finishAnalysis({ gen, reason: 'model', ...run }).catch((err) => console.warn('[PII Review Assistant] analysis failed', err));
    }

    function modelNotices() {
      const m = state.detCache && state.detCache.model;
      if (!m || m.status === 'off' || m.status === 'cancelled') return [];
      const M = P.modelClient.MESSAGES;
      if (m.status === 'ready' || m.status === 'partial') {
        const parts = [];
        if (m.added) parts.push(`${m.added} new finding${m.added > 1 ? 's' : ''}`);
        if (m.possible) parts.push(`${m.possible} possible`);
        if (m.confirmed) parts.push(`${m.confirmed} confirmed`);
        return [{ key: 'model', title: `${m.status === 'partial' ? M.partial : 'Model: done'} — ${parts.join(', ') || 'nothing new'}.`,
          details: [`Model suggestions are marked "model" in each finding. Took ${Math.round((m.ms || 0) / 100) / 10} s.`] }];
      }
      const details = m.error ? [m.error] : [];
      if (m.status === 'not-installed') details.push('An administrator can add the model with "npm run setup-model" and reload the extension.');
      return [{ key: `model-${m.status}`, title: M[m.status] || `Model: ${m.status}`, details }];
    }

    // The model option can change while a task is open (extension options page).
    const refreshModelSwitch = async () => {
      const on = await P.modelClient.enabled(policy);
      if (on === state.modelOn) return;
      state.modelOn = on;
      if (state.detCache) { state.detCache.model = null; state.detCache.merged = null; }
      analyze('model-switch', true);
    };
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes[P.modelClient.PREF_KEY]) refreshModelSwitch();
        if (area === 'local' && changes[AGENT_PREF]) {
          agentEnabled().then((on) => { state.agentOn = on; if (!on && state.stagePref === 'AGENT') state.stagePref = 'L1'; analyze('agent-switch', true); });
        }
      });
    }

    // ------------------------------------------------------------ agent mode (preview)

    // Off unless the reviewer switches it on (Options → Agent) or the test page asks for it (?agent=1).
    const AGENT_PREF = 'agentPreview';
    async function agentEnabled() {
      if (P.agentPreview === true) return true;
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          return (await chrome.storage.local.get(AGENT_PREF))[AGENT_PREF] === true;
        }
      } catch (e) { /* no storage: off */ }
      return false;
    }

    const agentCb = {
      answer(key, a) {
        if (a) state.agentAnswers.set(key, a); else state.agentAnswers.delete(key);
        refresh();
      },
      cursor(key) {
        state.agentCursor = key;
        refresh();
        const c = state.agentCards.find((x) => x.key === key);
        if (c) showCard(c);
      },
      approveAll(keys) {
        for (const k of keys) if (!state.agentAnswers.has(k)) state.agentAnswers.set(k, { verdict: 'yes', bulk: true });
        const next = state.agentCards.find((c) => !state.agentAnswers.has(c.key));
        state.agentCursor = next ? next.key : state.agentCursor;
        refresh();
      },
      show: showCard,
      /** The reviewer's selection inside the right document, as text offsets, or null. */
      selection() {
        const sel = document.getSelection();
        const m = state.rightModel;
        if (!sel || !sel.rangeCount || sel.isCollapsed || !m) return null;
        const r = sel.getRangeAt(0);
        if (!m.root.contains(r.commonAncestorContainer)) return null;
        const a = P.textModel.offsetOf(m, r.startContainer, r.startOffset);
        const b = P.textModel.offsetOf(m, r.endContainer, r.endOffset);
        if (a < 0 || b <= a) return null;
        return P.agentPlan.exactSpan(m.text, { start: a, end: b });
      },
      notice(text) {
        state.info = state.info.filter((i) => i.key !== 'agent-notice').concat({ key: 'agent-notice', title: text, details: [] });
        renderPanel();
      },
    };

    function showCard(card) {
      const it = card && card.item;
      if (!it || (!it.left && !it.right)) return;
      select({ left: it.left, right: it.right });
    }

    function agentView() {
      if (!state.agentOn || !state.agentPlan || !state.rightModel) return null;
      const plan = state.agentPlan;
      const answers = state.agentAnswers;
      return {
        plan, cards: state.agentCards, answers, cursor: state.agentCursor, rightText: state.rightModel.text,
        outcome: P.agentPlan.outcome(plan, answers), approveKeys: P.agentPlan.approveAllKeys(plan, answers), cb: agentCb,
      };
    }

    /** What agent mode draws on the right document: pending, approved, to-remove, questions and the current card. */
    function agentLayers() {
      const named = {};
      const add = (name, span, priority) => {
        if (!span) return;
        (named[name] = named[name] || { spans: [], priority }).spans.push(span);
      };
      const slug = (label) => P.labelInfo(label).slug;
      const plan = state.agentPlan;
      const answers = state.agentAnswers;
      if (!plan) return named;
      for (const l of plan.labels) {
        const a = answers.get(l.key);
        if (l.action === 'remove') { if (!a || a.verdict === 'yes') add('piira-agent-remove', l.right, 12); continue; }
        if (!a) add(`piira-pend-${slug(l.label)}`, l.right, 11);
        else if (a.verdict === 'yes') add(`piira-ok-${slug(l.label)}`, l.right, 11);
        else if (a.choice === 'other_label' && a.label) add(`piira-ok-${slug(a.label)}`, l.right, 11);
        else if (a.choice === 'fix_span' && a.span) add(`piira-ok-${slug(l.label)}`, a.span, 11);
        else if (l.existingLabel) add('piira-agent-remove', l.right, 12);
      }
      for (const q of plan.questions) {
        const a = answers.get(q.key);
        if (q.kind === 'leak') { if (!a) add('piira-right-issue', q.right, 13); continue; }
        if (!a) add('piira-agent-ask', q.right, 12);
        else if (q.kind === 'possibly-pii' && a.verdict === 'yes' && a.label) add(`piira-ok-${slug(a.label)}`, q.right, 11);
      }
      const view = agentView();
      const cur = view && P.agentPanel.current(view);
      if (cur && cur.item.right) add('piira-agent-current', cur.item.right, 20);
      return named;
    }

    // Y / N / J / K / Enter while agent mode is on screen. Typing in the page's own fields is never taken.
    document.addEventListener('keydown', (e) => {
      if (state.stage !== 'AGENT' || !panel.isOpen || state.picking) return;
      const t = (e.composedPath && e.composedPath()[0]) || e.target;
      if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName || ''))) return;
      const view = agentView();
      if (!view) return;
      if (P.agentPanel.onKey(e, { ...view, cb: { ...view.cb, redraw: renderPanel } })) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);

    // Select text in either document: a card says whether it is PII and why (core/select-check.js).
    P.selectCheck.start(() => ({
      fileName: state.fileName,
      loc: state.sticky && state.sticky.loc,
      leftModel: state.leftModel,
      rightModel: state.rightModel,
      detections: state.detCache && (state.detCache.merged || state.detCache.detections),
    }));

    P.watcher.start({
      onChange: (reason) => analyze(reason),
      // Big documents take longer to analyse, so wait a little longer between re-checks.
      delay: () => Math.min(1500, Math.max(P.SELECTORS.debounceMs || 600, state.lastMs)),
      // Only changes inside the two documents matter once they are found. Clocks,
      // notifications, menus and hover effects elsewhere on the page are ignored.
      isRelevant(node) {
        if (panel.contains(node)) return false;
        if (!stickyConnected()) { state.dirtyLeft = state.dirtyRight = true; return true; }
        const { left, right } = state.sticky.loc;
        if (left.contains(node)) { state.dirtyLeft = true; return true; }
        if (right.contains(node)) { state.dirtyRight = true; return true; }
        return false;
      },
    });

    Promise.all([P.config.load(), P.config.loadPrefs(), P.knownNames.load(policy.extraKnownNames), P.kb.load(),
      P.modelClient.enabled(policy).then((on) => { state.modelOn = on; }),
      agentEnabled().then((on) => { state.agentOn = on; })]).then(([, prefs]) => {
      // The reviewer's own choice, else the organisation's default. An old "auto" counts as no choice.
      const stage = prefs && (prefs.stage === 'L1' || prefs.stage === 'L2' || (prefs.stage === 'AGENT' && state.agentOn))
        ? prefs.stage : policy.defaultStage;
      state.stagePref = stage;
      state.labelModePref = (prefs && prefs.labelMode) || 'broad';
      panel.preferOpen(prefs && prefs.panelOpen === true);
      panel.setLauncherPos(prefs && prefs.launcherPos);
      analyze('initial');
    });
  }
})(globalThis);
