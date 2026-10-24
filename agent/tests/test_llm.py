"""LLM providers and the adjudication policy, without a real model: a stub OpenAI-compatible server and a fake
Anthropic client."""

from __future__ import annotations

import datetime as dt
import json
import threading
from collections.abc import Iterator, Sequence
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from pii_agent.adjudicate import adjudicate, build_items
from pii_agent.calibration import Calibrator, Sample, isotonic, reliability
from pii_agent.config import get_settings
from pii_agent.draft import Draft, DraftLabel, DraftQuestion
from pii_agent.llm import AdjudicationItem, ApprovalError, CachedProvider, Decision, LLMApproval, make_provider
from pii_agent.llm.anthropic_provider import FALLBACK_BETA, AnthropicProvider
from pii_agent.llm.base import parse_answers, system_prompt
from pii_agent.llm.local import LocalLLMError, LocalProvider
from pii_agent.models import Span

ITEMS = [
    AdjudicationItem(
        id="i1",
        value="Cloudnine",
        label_guess="Business Name",
        context_before="Vendor: ",
        context_after=" invoice",
        file_kind="txt",
    ),
    AdjudicationItem(
        id="i2",
        value="Field Services",
        label_guess="Business Name",
        context_before="Team: ",
        context_after="",
        file_kind="txt",
    ),
]


def test_parse_answers_is_strict_per_item() -> None:
    text = json.dumps(
        {
            "decisions": [
                {"id": "i1", "label": "Business Name", "confidence": 0.9, "reason": "a vendor"},
                {"id": "i2", "label": "Department", "confidence": 0.9, "reason": "not a label"},
            ]
        }
    )
    d1, d2 = parse_answers(text, ITEMS)
    assert d1 == Decision(label="Business Name", confidence=0.9, reason="a vendor")
    assert d2 is None
    assert parse_answers("not json", ITEMS) == [None, None]
    assert parse_answers(
        json.dumps({"decisions": [{"id": "i1", "label": "not_pii", "confidence": 2, "reason": ""}]}), ITEMS
    ) == [None, None]


def test_system_prompt_is_the_rubric_part_a() -> None:
    p = system_prompt(get_settings().rubric_file)
    assert "Part A" in p and "Annotate matching entries" in p and "Part B" not in p


# ------------------------------------------------------------------ local provider against a stub server


class _Stub(BaseHTTPRequestHandler):
    seen: list[dict[str, Any]] = []  # noqa: RUF012

    def log_message(self, *args: object) -> None:
        pass

    def do_GET(self) -> None:
        self._send({"object": "list", "data": [{"id": "stub-model"}]})

    def do_POST(self) -> None:
        body = json.loads(self.rfile.read(int(self.headers["content-length"])))
        _Stub.seen.append(body)
        items = json.loads(body["messages"][1]["content"].split("\n", 1)[1])
        answer = {
            "decisions": [
                {
                    "id": it["id"],
                    "label": "Business Name" if it["value"] == "Cloudnine" else "not_pii",
                    "confidence": 0.93,
                    "reason": "stub",
                }
                for it in items
            ]
        }
        self._send(
            {
                "choices": [{"message": {"content": json.dumps(answer)}, "finish_reason": "stop"}],
                "usage": {"prompt_tokens": 100, "completion_tokens": 20},
            }
        )

    def _send(self, data: dict[str, Any]) -> None:
        raw = json.dumps(data).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


@pytest.fixture
def stub_url() -> Iterator[str]:
    server = HTTPServer(("127.0.0.1", 0), _Stub)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_port}/v1"
    server.shutdown()


def test_local_provider_sends_schema_and_snippets_only(stub_url: str) -> None:
    p = LocalProvider(stub_url, "stub-model", "SYSTEM", batch_size=1)
    p.check()
    out = p.decide(ITEMS)
    assert [d.label if d else None for d in out] == ["Business Name", "not_pii"]
    body = _Stub.seen[-1]
    assert body["temperature"] == 0 and body["response_format"]["type"] == "json_schema"
    assert p.tokens["calls"] == 2 and p.tokens["input"] == 200
    with pytest.raises(LocalLLMError):
        LocalProvider(stub_url, "other-model", "S").check()
    with pytest.raises(LocalLLMError):
        LocalProvider("http://127.0.0.1:9/v1", "m", "S").check()
    assert LocalProvider("http://127.0.0.1:9/v1", "m", "S", timeout_s=2).decide(ITEMS) == [None, None]


def test_cached_provider_asks_each_snippet_once(stub_url: str) -> None:
    inner = LocalProvider(stub_url, "stub-model", "S", batch_size=8)
    p = CachedProvider(inner)
    twice = [*ITEMS, ITEMS[0].model_copy(update={"id": "i9"})]
    assert [d.label if d else None for d in p.decide(twice)] == ["Business Name", "not_pii", "Business Name"]
    p.decide(ITEMS)
    assert inner.tokens["calls"] == 1 and p.hits == 2


# ------------------------------------------------------------------ Claude: gate and request shape


class _FakeMessages:
    def __init__(self, stop: str = "end_turn") -> None:
        self.calls: list[dict[str, Any]] = []
        self.stop = stop

    def create(self, **kw: Any) -> Any:
        self.calls.append(kw)
        items = json.loads(kw["messages"][0]["content"].split("\n", 1)[1])
        text = json.dumps(
            {
                "decisions": [
                    {"id": it["id"], "label": "Business Name", "confidence": 0.9, "reason": "x"} for it in items
                ]
            }
        )
        return SimpleNamespace(
            stop_reason=self.stop,
            content=[SimpleNamespace(type="text", text=text)],
            usage=SimpleNamespace(input_tokens=50, output_tokens=10, cache_read_input_tokens=40),
        )


def test_anthropic_request_shape_and_refusal() -> None:
    fake = _FakeMessages()
    p = AnthropicProvider("claude-opus-5-5", "SYSTEM", client=SimpleNamespace(beta=SimpleNamespace(messages=fake)))
    assert [d.label if d else None for d in p.decide(ITEMS)] == ["Business Name", "Business Name"]
    kw = fake.calls[0]
    assert kw["model"] == "claude-opus-5-5" and kw["betas"] == [FALLBACK_BETA] and kw["fallbacks"] == "default"
    assert kw["output_config"]["format"]["type"] == "json_schema" and kw["output_config"]["effort"] == "medium"
    assert "thinking" not in kw  # adaptive is Opus 5.5's default
    assert kw["system"][0]["cache_control"] == {"type": "ephemeral"}
    refused = AnthropicProvider(
        "claude-opus-5-5", "S", client=SimpleNamespace(beta=SimpleNamespace(messages=_FakeMessages("refusal")))
    )
    assert refused.decide(ITEMS) == [None, None] and refused.tokens["refusals"] == 1


def _approval(tmp: Path, **kw: Any) -> Path:
    data = {
        "provider": "anthropic",
        "approved_by": "lead@example.com",
        "reference": "DPA-1",
        "approved_on": "2026-01-01",
        "valid_until": "2027-01-01",
        **kw,
    }
    f = tmp / "approval.json"
    f.write_text(json.dumps(data))
    return f


def test_claude_needs_the_flag_and_a_valid_approval(tmp_path: Path) -> None:
    s = get_settings().model_copy(update={"llm_provider": "anthropic"})
    with pytest.raises(ApprovalError, match="disabled"):
        make_provider(s)
    with pytest.raises(ApprovalError, match="no recorded"):
        make_provider(s.model_copy(update={"anthropic_enabled": True}))
    expired = _approval(tmp_path, valid_until="2026-02-01")
    with pytest.raises(ApprovalError, match="not valid today"):
        make_provider(s.model_copy(update={"anthropic_enabled": True, "llm_approval_file": expired}))
    other = _approval(tmp_path, provider="openai")
    with pytest.raises(ApprovalError, match="not anthropic"):
        make_provider(s.model_copy(update={"anthropic_enabled": True, "llm_approval_file": other}))
    LLMApproval.model_validate(json.loads(_approval(tmp_path).read_text())).check("anthropic", dt.date(2026, 6, 1))


# ------------------------------------------------------------------ policy


class _Fixed:
    name = "fixed"
    model = "fixed"
    external = True

    def __init__(self, answers: dict[str, Decision]) -> None:
        self.answers = answers
        self.seen: list[AdjudicationItem] = []

    def decide(self, items: Sequence[AdjudicationItem]) -> list[Decision | None]:
        self.seen += items
        return [self.answers.get(it.value) for it in items]


def test_policy_accepts_demotes_and_masks() -> None:
    right = "Vendor Cloudnine, contact Ravi Kumar ravi@x.in, team Field Services, by Sita Rao"

    def sp(v: str) -> Span:
        return Span(start=right.index(v), end=right.index(v) + len(v))

    d = Draft(
        mode="identify",
        labels=[
            DraftLabel("Person Name", sp("Ravi Kumar"), sp("Ravi Kumar"), 0.85, "heuristic"),
            DraftLabel("Email Address", sp("ravi@x.in"), sp("ravi@x.in"), 0.95, "regex"),
            DraftLabel("Business Name", sp("Field Services"), sp("Field Services"), 0.75, "model"),
        ],
        questions=[
            DraftQuestion("possibly-pii", sp("Cloudnine"), sp("Cloudnine"), "Business Name", 0.6, "low"),
            DraftQuestion("possibly-pii", sp("Sita Rao"), sp("Sita Rao"), "Person Name", 0.55, "low"),
        ],
    )
    llm = _Fixed(
        {
            "Cloudnine": Decision(label="Business Name", confidence=0.9, reason="vendor"),
            "Sita Rao": Decision(label="not_pii", confidence=0.99, reason="?"),
            "Ravi Kumar": Decision(label="Person Name", confidence=0.95, reason="name"),
            "Field Services": Decision(label="not_pii", confidence=0.95, reason="department"),
        }
    )
    st = adjudicate(d, right, "notes.txt", llm, get_settings())
    assert st["question_to_label"] == 1 and st["question_kept"] == 1 and st["label_agreed"] == 1
    assert st["label_to_question"] == 1 and st["asked"] == 4  # the e-mail is high: never asked
    new = [x for x in d.labels if x.source == "llm"]
    assert len(new) == 1 and new[0].label == "Business Name" and new[0].confidence <= 0.89
    assert next(x for x in d.labels if x.label == "Business Name" and x.source == "model").dropped == "llm-disagrees"
    assert any(q.right == sp("Sita Rao") for q in d.questions)  # not dismissed: llm_may_dismiss is off
    ctx = " ".join(it.context_before + it.context_after for it in llm.seen)
    assert "ravi@x.in" not in ctx and "[Email Address]" in ctx  # external provider: other PII masked
    assert all(it.file_kind == "txt" for it in llm.seen)


def test_build_items_window_is_bounded() -> None:
    right = "x" * 1000 + "VALUE" + "y" * 1000
    q = DraftQuestion("possibly-pii", Span(start=1000, end=1005), None, None, 0.6, "")
    (it,) = build_items([q], right, 200, "", None)
    assert len(it.context_before) == 200 and len(it.context_after) == 200 and it.value == "VALUE"


# ------------------------------------------------------------------ calibration


def test_isotonic_is_monotone_and_calibrator_round_trips(tmp_path: Path) -> None:
    pts = isotonic([0.1, 0.2, 0.3, 0.4, 0.5], [0, 1, 0, 1, 1])
    ys = [y for _, y in pts]
    assert ys == sorted(ys)
    samples = [Sample("Contact Number", "none", 0.95, i % 10 != 0) for i in range(100)]
    samples += [Sample("Contact Number", "none", 0.99, True) for _ in range(100)]
    cal = Calibrator.fit(samples)
    assert cal("Contact Number", None, 0.95) == pytest.approx(0.9)
    assert cal("Contact Number", None, 0.99) == 1.0
    assert cal("Unknown Label", None, 0.5) == pytest.approx(0.9)  # global curve, lowest block
    cal.save(tmp_path / "c.json")
    again = Calibrator.load(tmp_path / "c.json")
    assert again.version == cal.version and again("Contact Number", None, 0.95) == cal("Contact Number", None, 0.95)
    assert Calibrator.load(None)("X", None, 0.42) == 0.42
    r = reliability([(0.9, True), (0.9, False)])
    assert r["n"] == 2 and r["ece"] == pytest.approx(0.4)


def test_disk_cache_reuses_decisions_and_holds_no_snippet_text(stub_url: str, tmp_path: Path) -> None:
    f = tmp_path / "cache.jsonl"
    first = LocalProvider(stub_url, "stub-model", "S")
    CachedProvider(first, f).decide(ITEMS)
    second = LocalProvider(stub_url, "stub-model", "S")
    again = CachedProvider(second, f).decide(ITEMS)
    assert [d.label if d else None for d in again] == ["Business Name", "not_pii"]
    assert second.tokens["calls"] == 0
    assert "Cloudnine" not in f.read_text() and "Vendor" not in f.read_text()
    other_model = LocalProvider(stub_url, "stub-model-2", "S")
    CachedProvider(other_model, f).decide(ITEMS[:1])
    assert other_model.tokens["calls"] == 1  # the key includes the model
