// Agent mode (preview): the agent's plan for the RIGHT document — the labels it should carry and the questions only
// a person can answer — plus the Yes / No cards built from it. Same shape as the Python agent's plan.json
// (agent/pii_agent), so the panel can later show a plan computed by the agent service instead.
//
// Nothing here touches the page: the plan is drawn as pending highlights and answered in the panel. Applying the
// approved labels on the site is a later step (S2), always after a person's Yes.
// Pure functions, unit-tested in Node (tests/agent-plan.test.js).
(function (g) {
  'use strict';
  const P = g.PIIRA;

  // Fixed-shape labels: at high confidence they may join "Approve all" (rubric Part C1). Names, companies and
  // addresses always get their own card until real tasks show they are right ≥ 98% of the time.
  const FIXED_SHAPE = new Set(['Email Address', 'Contact Number', 'IP Address', 'URL/Link', 'Account Number',
    'Credentials', 'Vehicle Number Plate']);
  const NEVER = new Set(['Date', 'Overscrubbed']);
  const HIGH = 0.9;
  const QUESTION_MIN = 0.5;
  const TIER_ORDER = { unsure: 0, leak: 1, medium: 2, high: 3 };
  const QUOTES = { '"': '"', "'": "'", '“': '”', '‘': '’', '`': '`' };
  const isWord = (ch) => Boolean(ch) && /[\p{L}\p{N}]/u.test(ch);
  const overlaps = (a, b) => a.start < b.end && b.start < a.end;

  /** Exact span (rubric A1 rule 1): no surrounding spaces, quotes, unmatched brackets or trailing , ; */
  function exactSpan(text, span) {
    let s = span.start;
    let e = span.end;
    for (let pass = 0; pass < 4; pass++) {
      const before = s + ':' + e;
      while (s < e && /\s/.test(text[s])) s++;
      while (e > s && /\s/.test(text[e - 1])) e--;
      if (e - s >= 2 && QUOTES[text[s]] && text[e - 1] === QUOTES[text[s]]) { s++; e--; }
      if (e > s && '([{'.includes(text[s]) && !text.slice(s, e).includes(')]}'['([{'.indexOf(text[s])])) s++;
      if (e > s && ')]}'.includes(text[e - 1]) && !text.slice(s, e).includes('([{'[')]}'.indexOf(text[e - 1])])) e--;
      while (e > s && /[,;]/.test(text[e - 1])) e--;
      if (before === s + ':' + e) break;
    }
    return { start: s, end: e };
  }

  /** Never a part of a word (rubric A1 rule 3). */
  const partOfWord = (text, span) => (span.start > 0 && isWord(text[span.start - 1]) && isWord(text[span.start])) ||
    (span.end < text.length && isWord(text[span.end]) && isWord(text[span.end - 1]));

  /** Left offsets -> right offsets through the word alignment (identify tasks: the same words on both sides). */
  function mapper(leftText, rightText, alignment) {
    if (leftText === rightText || !alignment) return (span) => ({ start: span.start, end: span.end });
    const { leftTokens: lt, rightTokens: rt, l2r } = alignment;
    const first = (pos) => P.util.lowerBound(lt, pos + 1, (t) => t.end);
    return (span) => {
      const a = first(span.start);
      const b = P.util.lowerBound(lt, span.end, (t) => t.start) - 1;
      if (a >= lt.length || b < a || l2r[a] < 0 || l2r[b] < 0) return null;
      const ra = rt[l2r[a]];
      const rb = rt[l2r[b]];
      const start = ra.start + Math.max(0, span.start - lt[a].start);
      const end = rb.end - Math.max(0, lt[b].end - span.end);
      return end > start ? { start, end } : null;
    };
  }

  /** The two documents carry the same words in the same order: an identify task. */
  function sameWords(leftText, rightText, alignment) {
    if (leftText === rightText) return true;
    if (!alignment) return false;
    const { leftTokens, rightTokens, l2r } = alignment;
    if (leftTokens.length !== rightTokens.length) return false;
    for (let i = 0; i < l2r.length; i++) if (l2r[i] !== i) return false;
    return true;
  }

  const why = (d) => {
    if (!d) return '';
    const m = d.model || {};
    if (d.source === 'model') return `model only (${Math.round((m.score || 0) * 100)}%)`;
    const base = d.rule ? `rule ${d.rule}` : (d.source || 'rules');
    return m.agrees ? `${base}; model agrees` : base;
  };

  function group(label, confidence, source) {
    return confidence >= HIGH && FIXED_SHAPE.has(label) && source !== 'model' && source !== 'right' ? 'high' : 'medium';
  }

  /**
   * @param input {leftText, rightText, detections (left), l1 (compare result), l2 (redaction result), rightLabels}
   * @returns {mode, labels: [...], questions: [...]}  labels/questions carry a stable `key` for answers
   */
  function build({ leftText, rightText, detections, l1, l2, rightLabels }) {
    const alignment = l1 && l1.alignment;
    const identify = sameWords(leftText, rightText, alignment);
    const toRight = mapper(leftText, rightText, alignment);
    const labels = [];
    const questions = [];
    const ask = (kind, right, left, suggest, confidence, text) => questions.push({ kind, right, left, suggest, confidence, why: text || '' });

    if (identify) {
      for (const d of detections || []) {
        if (NEVER.has(d.label) || !P.labelGroup(d.label)) continue;
        const right = toRight(d);
        if (!right) continue;
        if (d.confidence >= P.REVIEW_THRESHOLD) {
          labels.push({ label: d.label, right, left: { start: d.start, end: d.end }, confidence: d.confidence,
            source: d.source || 'rules', rule: d.rule, type: d.type, action: 'add', existingLabel: null, why: why(d) });
        } else if (d.confidence >= QUESTION_MIN) {
          ask('possibly-pii', right, { start: d.start, end: d.end }, d.label, d.confidence, `low confidence: ${why(d)}`);
        }
      }
    } else {
      const byLeft = new Map((detections || []).map((d) => [`${d.start}-${d.end}`, d]));
      for (const f of (l2 && l2.findings) || []) {
        const d = f.left ? byLeft.get(`${f.left.start}-${f.left.end}`) : null;
        const conf = f.confidence == null ? 0 : f.confidence;
        if (['REDACTED_OK', 'LEAKAGE', 'INCOHERENT'].includes(f.category) && f.right && f.label && !NEVER.has(f.label)) {
          if (conf < P.REVIEW_THRESHOLD) {
            if (conf >= QUESTION_MIN) ask('possibly-pii', f.right, f.left, f.label, conf, `low confidence: ${why(d || f)}`);
            continue;
          }
          const item = { label: f.label, right: f.right, left: f.left, confidence: conf, source: f.source || 'rules',
            rule: d ? d.rule : f.rule, type: f.type, action: 'add', existingLabel: null, why: why(d || f) };
          labels.push(item);
          // A value left unchanged on the right is never approved in bulk: it gets its own card next to the Leak card.
          if (f.category === 'LEAKAGE') item.leak = true;
          if (f.category === 'LEAKAGE') questions.push({ kind: 'leak', right: f.right, left: f.left, suggest: f.label, confidence: conf, why: f.note || '', leakOf: item });
          if (f.category === 'INCOHERENT') ask('inconsistent', f.right, f.left, f.label, conf, f.note);
        } else if (f.category === 'DATATYPE') ask('wrong-replacement', f.right, f.left, f.label, f.confidence, f.note);
        else if (f.category === 'NOT_SENSIBLE') ask('not-sensible', f.right, f.left, f.label, f.confidence, f.note);
        else if (f.category === 'OVER_REDACTED') ask('over-redaction', f.right, f.left, 'Overscrubbed', f.confidence, f.note);
        else if (f.category === 'UNSURE') ask('possibly-pii', f.right, f.left, f.label, f.confidence, f.note);
        else if (f.category === 'UNKNOWN_TEXT') ask('unaligned', f.right, f.left, null, null, f.note);
      }
    }

    // Self-check (rubric Part B): exact span; never a part of a word; one label per value.
    for (const x of labels) {
      x.right = exactSpan(rightText, x.right);
      if (x.right.end <= x.right.start) x.dropped = 'empty';
      else if (partOfWord(rightText, x.right)) {
        x.dropped = 'part-of-word';
        ask('possibly-pii', x.right, x.left, x.label, x.confidence, 'the value continues into a longer word');
      }
    }
    const kept = [];
    for (const x of labels.filter((l) => !l.dropped).sort((a, b) => b.confidence - a.confidence || (b.right.end - b.right.start) - (a.right.end - a.right.start))) {
      if (kept.some((k) => overlaps(k.right, x.right))) x.dropped = 'overlap'; else kept.push(x);
    }

    // Labels already on the right: keep the ones the agent agrees with, change or remove the others.
    const overscrub = new Set(((l1 && l1.findings) || []).filter((f) => f.category === 'OVERSCRUB' && f.right)
      .map((f) => `${f.right.start}-${f.right.end}`));
    for (const rl of rightLabels || []) {
      if (rl.label === 'Overscrubbed' || rl.placeholder) continue;
      const span = { start: rl.start, end: rl.end };
      const hits = kept.filter((x) => x.action === 'add' && overlaps(x.right, span));
      if (hits.length) {
        const best = hits.sort((a, b) => Math.min(b.right.end, span.end) - Math.max(b.right.start, span.start) -
          (Math.min(a.right.end, span.end) - Math.max(a.right.start, span.start)))[0];
        best.existingLabel = rl.label;
        best.existingSpan = span;
        best.action = best.label === rl.label && best.right.start === span.start && best.right.end === span.end ? 'keep' : 'change';
        continue;
      }
      kept.push({
        label: rl.label, right: span, left: null, confidence: 0, source: 'right', action: overscrub.has(`${span.start}-${span.end}`) ? 'remove' : 'keep',
        existingLabel: rl.label, existingSpan: span,
        why: overscrub.has(`${span.start}-${span.end}`) ? 'no PII found under this label' : 'already labeled; the rules neither confirm nor reject it',
      });
    }

    kept.sort((a, b) => a.right.start - b.right.start || a.right.end - b.right.end);
    const outLabels = kept.map((x, i) => ({
      id: `L${i + 1}`, key: `L|${x.label}|${x.right.start}-${x.right.end}`, label: x.label,
      text: rightText.slice(x.right.start, x.right.end), right: x.right, left: x.left,
      confidence: Math.round(x.confidence * 100) / 100, group: x.leak ? 'medium' : group(x.label, x.confidence, x.source), action: x.action,
      existingLabel: x.existingLabel, existingSpan: x.existingSpan || null, source: x.source, rule: x.rule || null, type: x.type || null, why: x.why,
      _src: x,
    }));
    const idOf = new Map(outLabels.map((l) => [l._src, l.id]));
    for (const l of outLabels) delete l._src;
    const pos = (q) => (q.right ? q.right.start : Infinity);
    const outQuestions = questions.sort((a, b) => pos(a) - pos(b)).map((q, i) => ({
      id: `Q${i + 1}`, key: `Q|${q.kind}|${q.right ? q.right.start + '-' + q.right.end : 'x'}|${q.left ? q.left.start : 'x'}`,
      kind: q.kind, text: q.right ? rightText.slice(q.right.start, q.right.end) : '', right: q.right || null, left: q.left || null,
      suggest: q.suggest || null, confidence: q.confidence == null ? null : Math.round(q.confidence * 100) / 100, why: q.why,
      labelId: q.leakOf ? idOf.get(q.leakOf) || null : null,
    }));
    return { mode: identify ? 'identify' : 'verify', labels: outLabels, questions: outQuestions };
  }

  // ---------------------------------------------------------------- cards and answers

  const DOCUMENT_QUESTIONS = [
    { key: 'D|missed', prompt: 'Skim the highlighted document: is any PII left unlabeled?', good: 'no' },
    { key: 'D|unexpected', prompt: 'Any label you did not expect (a heading, a code word, a well-known company)?', good: 'no' },
  ];

  /** Cards in the order the person answers them: Unsure -> Leaks -> Medium -> High, then the two document questions. */
  function cards(plan) {
    const out = [];
    for (const q of plan.questions) out.push({ key: q.key, kind: 'question', tier: q.kind === 'leak' ? 'leak' : 'unsure', item: q });
    for (const l of plan.labels) out.push({ key: l.key, kind: 'label', tier: l.group, item: l });
    out.sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] ||
      (a.item.right ? a.item.right.start : Infinity) - (b.item.right ? b.item.right.start : Infinity));
    for (const d of DOCUMENT_QUESTIONS) out.push({ key: d.key, kind: 'document', tier: 'document', item: d });
    return out;
  }

  /** High-confidence labels the person may approve with one click (the list is always shown with the button). */
  const approveAllKeys = (plan, answers) => plan.labels
    .filter((l) => l.group === 'high' && (l.action === 'add' || l.action === 'keep') && !answers.has(l.key)).map((l) => l.key);

  /**
   * What the person decided, as the operations S2 will perform on the site, and the summary next to Submit.
   * answers: Map(key -> {verdict: 'yes'|'no', choice?: 'not_pii'|'other_label'|'fix_span', label?, span?})
   */
  function outcome(plan, answers) {
    const ops = [];
    const t = { labels: plan.labels.length, approved: 0, changed: 0, removed: 0, open: 0, questions: plan.questions.length };
    for (const l of plan.labels) {
      const a = answers.get(l.key);
      if (!a) { t.open++; continue; }
      if (l.action === 'remove') {
        if (a.verdict === 'yes') { t.removed++; ops.push({ op: 'remove', label: l.existingLabel, span: l.existingSpan || l.right, key: l.key }); }
        else t.approved++;
        continue;
      }
      if (a.verdict === 'yes') {
        if (l.action === 'add') { t.approved++; ops.push({ op: 'add', label: l.label, span: l.right, key: l.key }); }
        else if (l.action === 'keep') t.approved++;
        else { t.changed++; ops.push({ op: 'change', from: l.existingLabel, fromSpan: l.existingSpan, label: l.label, span: l.right, key: l.key }); }
      } else if (a.choice === 'other_label' && a.label) {
        t.changed++;
        ops.push(l.existingLabel ? { op: 'change', from: l.existingLabel, fromSpan: l.existingSpan, label: a.label, span: l.right, key: l.key }
          : { op: 'add', label: a.label, span: l.right, key: l.key });
      } else if (a.choice === 'fix_span' && a.span) {
        t.changed++;
        ops.push(l.existingLabel ? { op: 'change', from: l.existingLabel, fromSpan: l.existingSpan, label: l.label, span: a.span, key: l.key }
          : { op: 'add', label: l.label, span: a.span, key: l.key });
      } else {
        t.removed++;
        if (l.existingLabel) ops.push({ op: 'remove', label: l.existingLabel, span: l.existingSpan || l.right, key: l.key });
      }
    }
    for (const q of plan.questions) {
      const a = answers.get(q.key);
      if (!a) { t.open++; continue; }
      if (q.kind === 'possibly-pii' && a.verdict === 'yes' && a.label && q.right) ops.push({ op: 'add', label: a.label, span: q.right, key: q.key });
      if (q.kind === 'over-redaction' && a.verdict === 'yes' && q.right) ops.push({ op: 'add', label: 'Overscrubbed', span: q.right, key: q.key });
    }
    for (const d of DOCUMENT_QUESTIONS) if (!answers.has(d.key)) t.open++;
    t.ready = t.open === 0;
    t.text = `${t.labels} labels · ${t.approved} approved · ${t.changed} changed · ${t.removed} removed · ${t.open} open`;
    return { ops, summary: t };
  }

  P.agentPlan = { build, cards, outcome, approveAllKeys, exactSpan, partOfWord, FIXED_SHAPE, DOCUMENT_QUESTIONS, TIER_ORDER };
})(globalThis);
