"""GLiNER (urchade/gliner_multi_pii-v1, the extension's int8 ONNX file) in Python.

A line-for-line port of offscreen/gliner-core.js and offscreen/prompts.js, so the model sees exactly what it sees in
the extension and the merge thresholds tuned there (core/hybrid.js: min 0.15, add 0.2, strong 0.4) still hold.
tests/test_gliner_parity.py checks the output against ml/gliner-runner.js. Offsets here are code points.

Differences from the JavaScript, all invisible in the output: code points instead of UTF-16 units, and `detect_many`
for a list of documents (still one window per model call: batching padded windows corrupts GLiNER's results).
"""

from __future__ import annotations

import json
import math
import unicodedata
from collections.abc import Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import regex

from .models import Entity

# [prompt, site label] — offscreen/prompts.js. "department" gives "Field Services" a place; it is never reported.
PROMPTS: tuple[tuple[str, str | None], ...] = (
    ("person", "Person Name"),
    ("organization", "Business Name"),
    ("address", "Address"),
    ("username", "Person Username"),
    ("department", None),
)

# JavaScript's String.prototype.trim() whitespace (Python's str.strip() differs: \x1c-\x1f, \x85, no ﻿).
_JS_WS = "\t\n\v\f\r                  　﻿"
_CONTROL = regex.compile(r"[\u0000-\u0008\u000B\u000E-\u001F\u007F\u008F\u009F]")
_WORD = regex.compile(r"[\p{L}\p{M}\p{N}_]+(?:[-_][\p{L}\p{M}\p{N}_]+)*|\S")
_TWO_LETTERS = regex.compile(r"\p{L}{2}")
_LETTER = regex.compile(r"\p{L}")


def js_trim(s: str) -> str:
    return s.strip(_JS_WS)


def js_round2(x: float) -> float:
    """Math.round(x * 100) / 100 (half up, not Python's half-even)."""
    return math.floor(x * 100 + 0.5) / 100


# --------------------------------------------------------------------------- tokenizer


class UnigramTokenizer:
    """SentencePiece Unigram (mDeBERTa-v3) from tokenizer.json, as in gliner-core.js."""

    def __init__(self, data: dict[str, Any]) -> None:
        m = data.get("model") or {}
        if m.get("type") != "Unigram":
            raise ValueError(f"tokenizer: expected a Unigram model, got {m.get('type')}")
        self.pieces: dict[str, tuple[int, float]] = {}
        self.max_len = 1
        min_score = 0.0
        for i, (piece, score) in enumerate(m["vocab"]):
            if piece not in self.pieces:
                self.pieces[piece] = (i, float(score))
            self.max_len = max(self.max_len, len(piece))
            min_score = min(min_score, float(score))
        self.unk_id: int = int(m["unk_id"])
        self.unk_score = min_score - 10
        self.added: dict[str, int] = {t["content"]: int(t["id"]) for t in data.get("added_tokens") or []}
        self.cls_id = self.added["[CLS]"]
        self.sep_id = self.added["[SEP]"]
        self._cache: dict[str, list[int]] = {}

    @staticmethod
    def normalize(s: str) -> str:
        s = _CONTROL.sub("", unicodedata.normalize("NFKC", s))
        s = js_trim(s)
        return str(regex.sub(r" {2,}", " ", s))

    def encode_word(self, word: str) -> list[int]:
        if word in self.added:
            return [self.added[word]]
        hit = self._cache.get(word)
        if hit is not None:
            return hit
        norm = self.normalize(word)
        ids = self._viterbi("▁" + norm.replace(" ", "▁")) if norm else []
        if len(self._cache) > 50000:
            self._cache.clear()
        self._cache[word] = ids
        return ids

    def _viterbi(self, s: str) -> list[int]:
        n = len(s)
        best = [-math.inf] * (n + 1)
        frm = [-1] * (n + 1)
        tok = [-1] * (n + 1)
        best[0] = 0.0
        for i in range(n):
            if best[i] == -math.inf:
                continue
            matched = False
            for ln in range(1, min(self.max_len, n - i) + 1):
                p = self.pieces.get(s[i : i + ln])
                if p is None:
                    continue
                matched = True
                sc = best[i] + p[1]
                if sc > best[i + ln]:
                    best[i + ln], frm[i + ln], tok[i + ln] = sc, i, p[0]
            if not matched:  # an unknown character
                sc = best[i] + self.unk_score
                if sc > best[i + 1]:
                    best[i + 1], frm[i + 1], tok[i + 1] = sc, i, self.unk_id
        ids: list[int] = []
        i = n
        while i > 0:
            if frm[i] < 0:
                return [self.unk_id]
            ids.append(tok[i])
            i = frm[i]
        ids.reverse()
        # Consecutive unknown pieces count as one.
        return [t for k, t in enumerate(ids) if not (t == self.unk_id and k > 0 and ids[k - 1] == self.unk_id)]


# --------------------------------------------------------------------------- words and windows


@dataclass(frozen=True)
class Word:
    w: str
    start: int
    end: int


def split_words(text: str) -> list[Word]:
    return [Word(m.group(0), m.start(), m.end()) for m in _WORD.finditer(text)]


@dataclass
class _Line:
    at: int
    len: int
    key: str
    offset: int


@dataclass
class _Window:
    text: str = ""
    lines: list[_Line] = field(default_factory=list)
    words: int = 0


@dataclass
class LinePlan:
    windows: list[_Window]
    occurrences: dict[str, list[int]]
    words: int
    skipped: int


def plan_lines(text: str, max_words: int) -> LinePlan:
    """Distinct lines with two letters in a row, packed into windows of at most max_words words (planLines)."""
    occurrences: dict[str, list[int]] = {}
    unique: list[str] = []
    pos = 0
    total = 0
    skipped = 0
    for line in text.split("\n"):
        key = js_trim(line)
        if key and _TWO_LETTERS.search(key):
            lead = len(line) - len(line.lstrip(_JS_WS))
            if key not in occurrences:
                occurrences[key] = []
                unique.append(key)
            occurrences[key].append(pos + lead)
        elif key:
            skipped += 1
        pos += len(line) + 1
    wins: list[_Window] = []
    cur: _Window | None = None
    for key in unique:
        ws = split_words(key)
        n = len(ws)
        total += n
        if n > max_words:  # a very long line: its own windows, cut at word boundaries
            for k in range(0, n, max_words):
                a = ws[k].start
                b = ws[min(k + max_words, n) - 1].end
                wins.append(_Window(key[a:b], [_Line(0, b - a, key, a)], min(max_words, n - k)))
            continue
        if cur is None or cur.words + n > max_words:
            cur = _Window()
            wins.append(cur)
        if cur.text:
            cur.text += "\n"
        cur.lines.append(_Line(len(cur.text), len(key), key, 0))
        cur.text += key
        cur.words += n
    return LinePlan(wins, occurrences, total, skipped)


def to_site_labels(entities: Sequence[dict[str, Any]], text: str) -> list[Entity]:
    """Prompt labels -> site labels; spans never cross a line break and are trimmed (prompts.js toSiteLabels)."""
    out: list[Entity] = []
    for e in entities:
        label = next((p[1] for p in PROMPTS if p[0] == e["label"]), None)
        if not label:
            continue
        s: int = e["start"]
        end: int = e["end"]
        span = text[s:end]
        if "\n" in span:
            off = 0
            best: tuple[int, int, int] | None = None  # (off, len, letters)
            for part in span.split("\n"):
                n = len(_LETTER.findall(part))
                if best is None or n > best[2]:
                    best = (off, len(part), n)
                off += len(part) + 1
            if best is None:
                continue
            s += best[0]
            end = s + best[1]
        while s < end and text[s] in _JS_WS:
            s += 1
        while end > s and text[end - 1] in _JS_WS:
            end -= 1
        if end <= s:
            continue
        out.append(
            Entity(label=label, prompt=e["label"], start=s, end=end, text=text[s:end], score=js_round2(e["score"]))
        )
    # JavaScript's sort is stable, as is Python's.
    return sorted(out, key=lambda x: x.start)


# --------------------------------------------------------------------------- model


class Gliner:
    def __init__(
        self,
        model_dir: Path,
        max_width: int = 12,
        max_words: int = 200,
        providers: Sequence[str] = ("CPUExecutionProvider",),
        threads: int = 0,
    ) -> None:
        import onnxruntime as ort

        model_dir = Path(model_dir)
        self.tok = UnigramTokenizer(json.loads((model_dir / "tokenizer.json").read_text(encoding="utf-8")))
        opts = ort.SessionOptions()
        if threads:
            opts.intra_op_num_threads = threads
        available = set(ort.get_available_providers())
        chosen = [p for p in providers if p in available] or ["CPUExecutionProvider"]
        self.session = ort.InferenceSession(str(model_dir / "onnx" / "model_int8.onnx"), opts, providers=chosen)
        self.max_width = max_width
        self.max_words = max_words

    def predict(self, text: str, labels: Sequence[str], threshold: float) -> list[dict[str, Any]]:
        """Entities in one short text (<= max_words words): [{label, start, end, score}]."""
        words = split_words(text)
        if not words:
            return []
        if len(words) > self.max_words:
            raise ValueError(f"text has {len(words)} words; split it into windows of {self.max_words}")
        ids = [self.tok.cls_id]
        wmask = [0]
        for label in labels:
            for w in ["<<ENT>>", *label.split(" ")]:
                for t in self.tok.encode_word(w):
                    ids.append(t)
                    wmask.append(0)
        for t in self.tok.encode_word("<<SEP>>"):
            ids.append(t)
            wmask.append(0)
        for k, word in enumerate(words):
            for j, t in enumerate(self.tok.encode_word(word.w)):
                ids.append(t)
                wmask.append(k + 1 if j == 0 else 0)
        ids.append(self.tok.sep_id)
        wmask.append(0)

        n = len(words)
        width = self.max_width
        # Span k = (word i, width j) for k = i * width + j; spans past the end of the text are masked out.
        starts = np.repeat(np.arange(n, dtype=np.int64), width)
        ends = starts + np.tile(np.arange(width, dtype=np.int64), n)
        span_mask = ends < n
        span_idx = np.where(span_mask[:, None], np.stack([starts, ends], axis=1), 0)
        feeds = {
            "input_ids": np.asarray([ids], dtype=np.int64),
            "attention_mask": np.ones((1, len(ids)), dtype=np.int64),
            "words_mask": np.asarray([wmask], dtype=np.int64),
            "text_lengths": np.asarray([[n]], dtype=np.int64),
            "span_idx": span_idx[None, :, :],
            "span_mask": span_mask[None, :],
        }
        logits = self.session.run(["logits"], feeds)[0]
        _, rows, _, classes = logits.shape
        # float32 logits, sigmoid in float64 as in JavaScript.
        probs = 1.0 / (1.0 + np.exp(-logits[0, : min(rows, n), :width, : min(classes, len(labels))].astype(np.float64)))
        valid = (np.arange(probs.shape[0])[:, None] + np.arange(probs.shape[1])[None, :]) < n
        ii, jj, cc = np.nonzero((probs >= threshold) & valid[:, :, None])  # in (i, j, c) loop order
        scores = probs[ii, jj, cc]
        order = np.argsort(-scores, kind="stable")  # stable, as JavaScript's sort
        # Flat NER: the highest-scoring spans first; a span sharing a word with a kept one is dropped.
        used = np.zeros(n, dtype=np.bool_)
        result: list[dict[str, Any]] = []
        for k in order:
            i, e = int(ii[k]), int(ii[k] + jj[k])
            if used[i : e + 1].any():
                continue
            used[i : e + 1] = True
            result.append(
                {"label": labels[int(cc[k])], "start": words[i].start, "end": words[e].end, "score": float(scores[k])}
            )
        return sorted(result, key=lambda r: r["start"])

    def detect(self, text: str, threshold: float = 0.05) -> list[Entity]:
        """Entities in a whole document, with site labels (ml/gliner-runner.js detect)."""
        raw: list[dict[str, Any]] = []
        plan = plan_lines(text, self.max_words)
        prompts = [p[0] for p in PROMPTS]
        for w in plan.windows:
            for e in self.predict(w.text, prompts, threshold):
                line = next((ln for ln in w.lines if ln.at <= e["start"] < ln.at + ln.len), None)
                if line is None:
                    continue
                s = e["start"] - line.at
                end = min(e["end"] - line.at, line.len)
                for at in plan.occurrences[line.key]:
                    raw.append({**e, "start": at + line.offset + s, "end": at + line.offset + end})
        return to_site_labels(raw, text)

    def detect_many(self, texts: Sequence[str], threshold: float = 0.05) -> list[list[Entity]]:
        return [self.detect(t, threshold) for t in texts]


def model_sha(model_dir: Path) -> str | None:
    """A short hash of the ONNX file, for run keys and the audit trail (None without the model)."""
    import hashlib

    f = Path(model_dir) / "onnx" / "model_int8.onnx"
    if not f.exists():
        return None
    h = hashlib.sha256()
    with f.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()[:16]
