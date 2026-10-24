// Agent mode (preview) in the side panel: one Yes / No card at a time for every label and question in the agent's
// plan (core/agent-plan.js), "Approve all" for the high-confidence group with its list in view, the queue, and the
// summary that gates Submit. Nothing is applied to the site here: answers are kept in the panel (S1).
// Keyboard (when the panel is open and the page's own text fields do not have focus):
//   Y yes · N no (then 1 Not PII · 2 Other label · 3 Fix span) · J next · K previous · Enter show in document · Esc close
(function (g) {
  'use strict';
  const P = g.PIIRA;

  const TIER_NAME = { unsure: 'Unsure', leak: 'Leak', medium: 'Medium', high: 'High', document: 'Document' };
  // The labels a value may get: never Date (out of scope) or Overscrubbed (review only).
  const PII = () => P.LABELS.filter((l) => l.group && l.name !== 'Date' && l.name !== 'Overscrubbed').map((l) => l.name);
  const ui = { menu: null, fixing: null, otherLabel: '', showOps: false, showHigh: true };
  const truncate = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '');
  const lineOf = (text, at) => (at == null ? null : text.slice(0, at).split('\n').length);

  function prompt(card) {
    const it = card.item;
    const q = `“${truncate(it.text, 80)}”`;
    if (card.kind === 'document') return it.prompt;
    if (card.kind === 'question') {
      return {
        'possibly-pii': `Is ${q} PII?${it.suggest ? ` The agent suggests ${it.suggest}.` : ''}`,
        leak: `${q} is unchanged on the right. Is that a leak?`,
        'wrong-replacement': `${q} replaces a value of another kind. Accept the replacement?`,
        'not-sensible': `${q} is a placeholder, not a realistic replacement. Accept it?`,
        inconsistent: `${q} was replaced differently elsewhere. Accept?`,
        'over-redaction': `${q} was changed on the right but does not look like PII. Mark it Overscrubbed?`,
        unaligned: `The agent could not place this value on the right document. Check it by hand.`,
      }[it.kind] || `Check ${q}.`;
    }
    if (it.action === 'remove') return `Remove the ${it.existingLabel} label on ${q}? ${it.why.charAt(0).toUpperCase()}${it.why.slice(1)}.`;
    if (it.action === 'change' && it.existingLabel && it.existingLabel !== it.label) return `Change ${q} from ${it.existingLabel} to ${it.label}?`;
    if (it.action === 'change') return `Fix the span of this ${it.label} to ${q}?`;
    const article = /^[AEIOU]/.test(it.label) ? 'an' : 'a';
    return `Is ${q} ${article} ${it.label}, with this exact span?`;
  }

  function answerText(card, a) {
    if (!a) return null;
    if (card.kind === 'document') return a.verdict === 'yes' ? 'Yes' : 'No';
    if (card.kind === 'question') {
      if (a.verdict === 'yes') return a.label ? `Yes · ${a.label}` : 'Yes';
      return 'No';
    }
    if (card.item.action === 'remove') return a.verdict === 'yes' ? 'Remove' : 'Keep';
    if (a.verdict === 'yes') return 'Yes';
    return { not_pii: 'No · not PII', other_label: `No · ${a.label}`, fix_span: 'No · span fixed' }[a.choice] || 'No';
  }

  /** The card the cursor is on, else the first unanswered one. */
  function current(ctx) {
    return ctx.cards.find((c) => c.key === ctx.cursor) || ctx.cards.find((c) => !ctx.answers.has(c.key)) || ctx.cards[0] || null;
  }

  function step(ctx, dir) {
    const cs = ctx.cards;
    const i = cs.findIndex((c) => c.key === (current(ctx) || {}).key);
    const next = cs[(i + dir + cs.length) % cs.length];
    ui.menu = null;
    ui.fixing = null;
    if (next) ctx.cb.cursor(next.key);
  }

  /** After an answer: the next unanswered card after this one (or before it). */
  function advance(ctx, key) {
    const cs = ctx.cards;
    const i = cs.findIndex((c) => c.key === key);
    const after = cs.slice(i + 1).concat(cs.slice(0, i)).find((c) => c.key !== key && !ctx.answers.has(c.key));
    ui.menu = null;
    ui.fixing = null;
    ctx.cb.cursor(after ? after.key : key);
  }

  function answer(ctx, card, a) {
    ctx.cb.answer(card.key, a);
    if (a) advance(ctx, card.key);
  }

  function yes(ctx, card) {
    if (card.kind === 'question' && card.item.kind === 'possibly-pii') {
      if (!card.item.suggest) { ui.menu = card.key; ui.otherLabel = ''; ctx.cb.redraw(); return; }
      answer(ctx, card, { verdict: 'yes', label: card.item.suggest });
      return;
    }
    answer(ctx, card, { verdict: 'yes' });
  }

  function no(ctx, card) {
    if (card.kind === 'label' && card.item.action !== 'remove') { ui.menu = ui.menu === card.key ? null : card.key; ctx.cb.redraw(); return; }
    answer(ctx, card, { verdict: 'no' });
  }

  function render(h, ctx) {
    const { plan, cards, answers, outcome, rightText } = ctx;
    const t = outcome.summary;
    const card = current(ctx);
    const answeredCount = cards.filter((c) => answers.has(c.key)).length;
    const pct = cards.length ? Math.round((answeredCount / cards.length) * 100) : 100;
    const tag = (label, extra) => h('span', { class: 'tag', bg: P.labelInfo(label).color }, label, extra || '');

    const head = h('div', { class: 'agent-head' },
      h('div', { class: 'agent-title' }, 'Agent · preview', h('span', { class: 'agent-mode' }, plan.mode === 'identify' ? 'Identify task' : 'Verify task')),
      h('div', { class: 'hint' }, 'The agent’s labels are drawn on the right document: dashed = waiting for you, solid = approved, ' +
        'struck through = to remove. Nothing is applied to the site yet.'));

    const summary = h('div', { class: 'agent-summary' + (t.ready ? ' ready' : '') },
      h('div', { class: 'agent-sum-text' }, t.text),
      h('div', { class: 'bar' }, (() => { const d = h('div'); d.style.width = pct + '%'; return d; })()),
      h('div', { class: 'hint' }, t.ready ? 'All answered ✓ — you may submit on the site.' : `Submit stays locked for you until all ${cards.length} cards are answered.`));

    let cardEl = null;
    if (card) {
      const it = card.item;
      const a = answers.get(card.key);
      const idx = cards.indexOf(card);
      const line = it.right ? lineOf(rightText, it.right.start) : null;
      const meta = [line ? `line ${line}` : null, it.confidence != null && card.kind !== 'document' ? `${Math.round(it.confidence * 100)}%` : null,
        it.why && card.kind !== 'document' ? truncate(it.why, 90) : null].filter(Boolean).join(' · ');
      const btn = (label, key, onclick, cls) => h('button', { class: 'btn ' + (cls || ''), title: `${label} (${key})`, onclick }, label, h('kbd', {}, key));
      let actions;
      if (card.kind === 'document') {
        actions = [btn('No', 'N', () => answer(ctx, card, { verdict: 'no' }), 'primary'), btn('Yes', 'Y', () => answer(ctx, card, { verdict: 'yes' }))];
      } else if (card.kind === 'label' && it.action === 'remove') {
        actions = [btn('Yes, remove', 'Y', () => yes(ctx, card), 'primary'), btn('No, keep it', 'N', () => no(ctx, card))];
      } else {
        actions = [btn('Yes', 'Y', () => yes(ctx, card), 'primary'), btn(card.kind === 'label' ? 'No ▾' : 'No', 'N', () => no(ctx, card))];
      }
      const labelPick = (onPick) => {
        const sel = h('select', { class: 'agent-select', 'aria-label': 'Choose a label' },
          h('option', { value: '' }, 'Choose a label…'),
          PII().filter((n) => card.kind !== 'label' || n !== it.label).map((n) => h('option', { value: n }, n)));
        sel.addEventListener('change', () => { if (sel.value) onPick(sel.value); });
        return sel;
      };
      const menu = ui.menu === card.key ? h('div', { class: 'agent-menu' },
        card.kind === 'question'
          ? [h('div', { class: 'hint' }, 'Which label?'), labelPick((v) => answer(ctx, card, { verdict: 'yes', label: v }))]
          : [
            btn('Not PII', '1', () => answer(ctx, card, { verdict: 'no', choice: 'not_pii' })),
            h('div', { class: 'agent-row' }, h('span', { class: 'hint' }, 'Other label:'),
              labelPick((v) => answer(ctx, card, { verdict: 'no', choice: 'other_label', label: v }))),
            btn('Fix span…', '3', () => { ui.fixing = card.key; ui.menu = null; ctx.cb.redraw(); }),
          ]) : null;
      const fixing = ui.fixing === card.key ? h('div', { class: 'agent-menu' },
        h('div', { class: 'hint' }, 'Select the exact value in the right document, then press “Use selection” (or Enter).'),
        h('div', { class: 'agent-row' },
          btn('Use selection', '↵', () => {
            const span = ctx.cb.selection();
            if (span) answer(ctx, card, { verdict: 'no', choice: 'fix_span', span });
            else ctx.cb.notice('Select text inside the right document first.');
          }, 'primary'),
          h('button', { class: 'btn', onclick: () => { ui.fixing = null; ctx.cb.redraw(); } }, 'Cancel'))) : null;

      cardEl = h('div', { class: `agent-card tier-${card.tier}` },
        h('div', { class: 'agent-card-top' },
          h('span', { class: `agent-tier tier-${card.tier}` }, TIER_NAME[card.tier]),
          h('span', { class: 'hint' }, `Card ${idx + 1} of ${cards.length}`),
          h('span', { class: 'agent-nav' },
            h('button', { class: 'icon-btn', title: 'Previous card (K)', onclick: () => step(ctx, -1) }, '◀'),
            h('button', { class: 'icon-btn', title: 'Next card (J)', onclick: () => step(ctx, 1) }, '▶'))),
        card.kind === 'label' ? h('div', { class: 'tags' }, tag(it.label),
          it.existingLabel && it.existingLabel !== it.label ? [h('span', { class: 'arrow' }, 'now'), tag(it.existingLabel)] : null,
          h('span', { class: 'tag outline' }, { add: 'new label', keep: 'already labeled', change: 'change', remove: 'remove' }[it.action])) : null,
        card.kind === 'question' && it.suggest ? h('div', { class: 'tags' }, tag(it.suggest), h('span', { class: 'tag outline' }, it.kind)) : null,
        h('div', { class: 'agent-prompt' }, prompt(card)),
        meta ? h('button', { class: 'link-btn', title: 'Show it in the document (Enter)', onclick: () => ctx.cb.show(card) }, meta) : null,
        h('div', { class: 'agent-actions' }, actions),
        menu, fixing,
        a ? h('div', { class: 'outcome ok' }, `Your answer: ${answerText(card, a)} `,
          h('button', { class: 'link-btn', onclick: () => ctx.cb.answer(card.key, null) }, 'Undo')) : null);
    }

    const approve = ctx.approveKeys;
    const approveEl = approve.length ? h('div', { class: 'agent-approve' },
      h('div', { class: 'agent-row' },
        h('button', { class: 'btn primary', onclick: () => { ctx.cb.approveAll(approve); } },
          approve.length === 1 ? 'Approve the 1 high-confidence label' : `Approve all ${approve.length} high-confidence labels`),
        h('button', { class: 'link-btn', onclick: () => { ui.showHigh = !ui.showHigh; ctx.cb.redraw(); } }, ui.showHigh ? 'Hide list ▴' : 'Show list ▸')),
      h('div', { class: 'hint' }, 'E-mails, phones, IDs, keys and accounts the agent is ≥ 90% sure of. Check the list first; open any row to answer it on its own.'),
      ui.showHigh ? h('ul', { class: 'agent-list' }, approve.map((key) => {
        const l = plan.labels.find((x) => x.key === key);
        return h('li', {}, h('button', { class: 'item-main', onclick: () => ctx.cb.cursor(key) },
          tag(l.label), h('span', { class: 'quote' }, ` “${truncate(l.text, 46)}”`)));
      })) : null) : null;

    const queue = h('details', { class: 'section', open: true },
      h('summary', {}, h('span', {}, 'All cards'), h('span', { class: 'count' }, `${answeredCount}/${cards.length}`)),
      h('ul', { class: 'agent-list' }, cards.map((c) => {
        const a = answers.get(c.key);
        const icon = !a ? '○' : (a.verdict === 'yes' ? '✓' : (a.choice === 'other_label' || a.choice === 'fix_span' ? '✎' : '✗'));
        const it = c.item;
        return h('li', { class: (card && c.key === card.key ? 'current' : '') + (a ? ' done' : '') },
          h('button', { class: 'item-main', onclick: () => ctx.cb.cursor(c.key) },
            h('span', { class: 'agent-icon' }, icon),
            h('span', { class: `agent-tier small tier-${c.tier}` }, TIER_NAME[c.tier]),
            c.kind === 'label' ? tag(it.label) : (c.kind === 'question' && it.suggest ? tag(it.suggest) : null),
            h('span', { class: 'quote' }, ` ${truncate(c.kind === 'document' ? it.prompt : `“${it.text}”`, 52)}`)));
      })));

    const ops = outcome.ops;
    const opsEl = h('div', { class: 'agent-ops' },
      h('button', { class: 'link-btn', onclick: () => { ui.showOps = !ui.showOps; ctx.cb.redraw(); } },
        `On the site, these answers mean: ${ops.filter((o) => o.op === 'add').length} to add · ${ops.filter((o) => o.op === 'change').length} to change · ` +
        `${ops.filter((o) => o.op === 'remove').length} to remove ${ui.showOps ? '▴' : '▸'}`),
      ui.showOps ? h('ul', { class: 'agent-list' }, ops.map((o) => h('li', {},
        h('span', { class: 'tag outline' }, o.op), tag(o.label),
        h('span', { class: 'quote' }, ` “${truncate(rightText.slice(o.span.start, o.span.end), 46)}”`)))) : null,
      h('div', { class: 'hint' }, 'Preview only: applying these on the site is the next step (S2), after your OK.'));

    return h('div', { class: 'agent' }, head, summary, cardEl, approveEl, queue, opsEl);
  }

  /** Keyboard shortcuts. Returns true when the key was handled. */
  function onKey(e, ctx) {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    const card = current(ctx);
    if (!card) return false;
    const k = e.key.toLowerCase();
    if (k === 'j') { step(ctx, 1); return true; }
    if (k === 'k') { step(ctx, -1); return true; }
    if (k === 'escape' && (ui.menu || ui.fixing)) { ui.menu = null; ui.fixing = null; ctx.cb.redraw(); return true; }
    if (k === 'enter') {
      if (ui.fixing === card.key) {
        const span = ctx.cb.selection();
        if (span) answer(ctx, card, { verdict: 'no', choice: 'fix_span', span });
        else ctx.cb.notice('Select text inside the right document first.');
      } else ctx.cb.show(card);
      return true;
    }
    if (k === 'y') { yes(ctx, card); return true; }
    if (k === 'n') {
      if (card.kind === 'document') answer(ctx, card, { verdict: 'no' }); else no(ctx, card);
      return true;
    }
    if (ui.menu === card.key && card.kind === 'label') {
      if (k === '1') { answer(ctx, card, { verdict: 'no', choice: 'not_pii' }); return true; }
      if (k === '3') { ui.fixing = card.key; ui.menu = null; ctx.cb.redraw(); return true; }
    }
    return false;
  }

  P.agentPanel = { render, onKey, current, ui };
})(globalThis);
