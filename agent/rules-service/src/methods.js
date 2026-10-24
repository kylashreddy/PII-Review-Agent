// The rules service's methods. Each one calls the extension's own code (P.engine, P.hybrid, P.compare,
// P.redaction, P.kb, P.knownNames…) and converts offsets at the edge: requests and answers use code points.
'use strict';
const { P, VERSION } = require('./engine');
const { Offsets, mapRange } = require('./offsets');

const LABEL_NAMES = new Set(P.LABELS.map((l) => l.name));

class BadRequest extends Error {
  constructor(message) { super(message); this.name = 'BadRequest'; }
}

function need(params, key, type) {
  const v = params[key];
  if (type === 'array' ? !Array.isArray(v) : typeof v !== type) throw new BadRequest(`"${key}" must be ${type}`);
  return v;
}

const hintOf = (fileName) => (fileName ? P.fileHint.parse(fileName) : null);

/** Engine objects -> answer objects: offsets to code points. */
const outRange = (o) => (x) => mapRange(x, (u) => o.toPoints(u));
/** Request objects -> engine objects: offsets to UTF-16, text re-read from the document. */
function inSpans(list, text, o) {
  return list.map((x) => {
    if (typeof x.start !== 'number' || typeof x.end !== 'number' || x.start < 0 || x.end < x.start) {
      throw new BadRequest('every span needs 0 <= start <= end');
    }
    const r = mapRange(x, (cp) => o.toUnits(cp));
    if (r.end > text.length) throw new BadRequest('span past the end of the text');
    return { ...r, text: text.slice(r.start, r.end) };
  });
}

function version() {
  return VERSION;
}

/**
 * Rule detections for a document, and — when model entities are given — the hybrid merge (core/hybrid.js).
 * params: {text, file_name?, entities?: [{label, prompt?, start, end, score}]}
 */
function analyze(params) {
  const text = need(params, 'text', 'string');
  const o = new Offsets(text);
  const rules = P.engine.run(text, { hint: hintOf(params.file_name) });
  let merged = null;
  if (params.entities != null) {
    const entities = inSpans(need(params, 'entities', 'array'), text, o);
    merged = P.hybrid.merge(rules, entities, text, { settings: P.SETTINGS.model });
  }
  return { rules: rules.map(outRange(o)), merged: merged && merged.map(outRange(o)) };
}

/** Right-document labels as compare.js reads them from the page: {label, start, end} -> engine shape. */
function rightLabels(list, right, o) {
  const resolve = P.compare.labelResolver(P.SELECTORS);
  const phRe = P.compare.placeholderRegex(P.SELECTORS);
  return inSpans(list, right, o).map((l) => {
    const label = resolve(l.label);
    return {
      label: label || l.label, rawLabel: l.label, known: Boolean(label), start: l.start, end: l.end, text: l.text,
      placeholder: P.compare.isPlaceholderText(l.text, resolve, phRe),
    };
  }).sort((a, b) => a.start - b.start);
}

function findingsOut(findings, lo, ro) {
  const toL = (u) => lo.toPoints(u);
  const toR = (u) => ro.toPoints(u);
  return findings.map((f) => ({ ...f, left: mapRange(f.left, toL), right: mapRange(f.right, toR) }));
}

function alignmentOf(left, right, detections, labels) {
  return P.compare.compareDocuments({ leftText: left, rightText: right, detections, rightLabels: labels });
}

/**
 * Left detections against the right document and its labels (compare.js): MISSED, WRONG_LABEL, OVERSCRUB,
 * NEEDS_REVIEW, CORRECT. params: {left, right, detections (left offsets), right_labels: [{label, start, end}]}
 */
function compare(params) {
  const left = need(params, 'left', 'string');
  const right = need(params, 'right', 'string');
  const lo = new Offsets(left);
  const ro = new Offsets(right);
  const detections = inSpans(need(params, 'detections', 'array'), left, lo).sort((a, b) => a.start - b.start);
  const labels = rightLabels(params.right_labels || [], right, ro);
  const r = alignmentOf(left, right, detections, labels);
  const s = r.alignment;
  const changed = s.l2r.some((v) => v < 0) || s.r2l.some((v) => v < 0) || s.leftTokens.length !== s.rightTokens.length;
  return {
    findings: findingsOut(r.findings, lo, ro),
    stats: r.stats,
    right_labels: labels.map(outRange(ro)),
    identical: left === right,
    aligned: !changed,
  };
}

/**
 * Is the right document a correct redaction of the left one (redaction.js)? LEAKAGE, DATATYPE, NOT_SENSIBLE,
 * OVER_REDACTED, INCOHERENT, UNSURE, REDACTED_OK… params: {left, right, detections, file_name?}
 */
function redactionCheck(params) {
  const left = need(params, 'left', 'string');
  const right = need(params, 'right', 'string');
  const lo = new Offsets(left);
  const ro = new Offsets(right);
  const detections = inSpans(need(params, 'detections', 'array'), left, lo).sort((a, b) => a.start - b.start);
  const { alignment } = alignmentOf(left, right, detections, []);
  const r = P.redaction.validate({ leftText: left, rightText: right, detections, alignment, hint: hintOf(params.file_name) });
  return { findings: findingsOut(r.findings, lo, ro) };
}

/**
 * What the rules know about given spans of a text — for the agent's rubric self-check (Part B):
 * out-of-scope type, department / document phrase, public name, placeholder, field name or header.
 * params: {text, spans: [{start, end}]}
 */
function spanFacts(params) {
  const text = need(params, 'text', 'string');
  const o = new Offsets(text);
  const structure = P.structured.parse(text);
  const resolve = P.compare.labelResolver(P.SELECTORS);
  const phRe = P.compare.placeholderRegex(P.SELECTORS);
  return {
    facts: inSpans(need(params, 'spans', 'array'), text, o).map((s) => {
      const t = s.text;
      const known = P.knownNames.lookup(t);
      const cell = P.structured.cellAt(structure, s.start, s.end);
      return {
        start: o.toPoints(s.start),
        end: o.toPoints(s.end),
        out_of_scope: P.engine.outOfScopeType(text, s.start, s.end),
        department: P.isDepartment(t),
        doc_phrase: P.isDocPhrase(t),
        known_name: known ? { name: known.name, category: known.category } : null,
        placeholder: P.compare.isPlaceholderText(t, resolve, phRe),
        in_key: P.structured.inKey(structure, s.start, s.end),
        non_pii_field: Boolean(cell && cell.nonPii),
      };
    }),
  };
}

/** Offline knowledge base (data/kb). params: {kind: company|person|domain, value} */
function kbLookup(params) {
  const kind = need(params, 'kind', 'string');
  const value = need(params, 'value', 'string');
  const ready = P.kb.ready;
  if (kind === 'company') {
    const c = P.kb.company(value);
    const w = P.kb.wellKnownCompany(value);
    const listed = P.knownNames.lookup(value);
    return { ready, in_kb: Boolean(c), well_known: Boolean(w || listed), links: c ? c.links : null,
      listed: listed ? listed.category : null };
  }
  if (kind === 'person') return { ready, public_figure: Boolean(P.kb.publicFigure(value)) };
  if (kind === 'domain') {
    const rank = P.kb.siteRank(value);
    return { ready, rank, popular: P.kb.popularSite(value) };
  }
  throw new BadRequest('kind must be company, person or domain');
}

function labels() {
  return { labels: P.LABELS.map((l) => ({ name: l.name, slug: l.slug, color: l.color, group: l.group })),
    review_threshold: P.REVIEW_THRESHOLD, model: { ...P.SETTINGS.model }, model_labels: [...P.MODEL_LABELS] };
}

const METHODS = {
  version, labels, analyze, compare, redaction_check: redactionCheck, span_facts: spanFacts, kb_lookup: kbLookup,
};

module.exports = { METHODS, BadRequest, LABEL_NAMES };
