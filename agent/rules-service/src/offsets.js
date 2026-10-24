// The engine counts characters in UTF-16 code units (JavaScript strings); the Python agent and the API count
// code points. A character outside the Basic Multilingual Plane (most emoji) is 2 units but 1 code point, so
// every offset after it differs. Every offset crossing this service's edge goes through one of these.
'use strict';

class Offsets {
  constructor(text) {
    // astral[k] = UTF-16 index of the k-th astral character. Empty for most documents: then both are identity.
    this.astral = [];
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
        const d = text.charCodeAt(i + 1);
        if (d >= 0xdc00 && d <= 0xdfff) { this.astral.push(i); i++; }
      }
    }
  }

  /** Code-point index -> UTF-16 index. Each astral character before it adds one unit. */
  toUnits(cp) {
    if (!this.astral.length) return cp;
    // The k-th astral character sits at code point astral[k] - k.
    return cp + countBelow(this.astral, (k) => this.astral[k] - k < cp);
  }

  /** UTF-16 index -> code-point index (an index inside a surrogate pair rounds down to its character). */
  toPoints(u) {
    if (!this.astral.length) return u;
    return u - countBelow(this.astral, (k) => this.astral[k] < u);
  }
}

/** Number of leading indexes k of `list` for which `below(k)` holds (it holds for a prefix). */
function countBelow(list, below) {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (below(mid)) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/** Copy of `obj` with its {start, end} converted by `fn`; nothing else is touched. */
function mapRange(obj, fn) {
  if (!obj || typeof obj.start !== 'number') return obj;
  return { ...obj, start: fn(obj.start), end: fn(obj.end) };
}

module.exports = { Offsets, mapRange };
