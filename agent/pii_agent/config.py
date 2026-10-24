"""Settings, from the environment (PII_AGENT_*). Defaults keep everything local and the LLM off."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

AGENT_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = AGENT_DIR.parent

# Labels whose values have a fixed shape; at >= high_confidence they may join "Approve all" (rubric Part C1).
FIXED_SHAPE_LABELS = (
    "Email Address",
    "Contact Number",
    "IP Address",
    "URL/Link",
    "Account Number",
    "Credentials",
    "Vehicle Number Plate",
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="PII_AGENT_", env_file=None, frozen=True)

    node_bin: str = "node"
    rules_service: Path = AGENT_DIR / "rules-service" / "server.js"
    rules_timeout_s: float = 120.0

    # GLiNER: the extension's int8 model. "auto" = on when the files exist.
    gliner: Literal["auto", "on", "off"] = "auto"
    model_dir: Path = REPO_DIR / "models" / "multi_pii"
    gliner_threshold: float = 0.05
    gliner_max_words: int = 200
    gliner_max_width: int = 12
    onnx_providers: tuple[str, ...] = ("CPUExecutionProvider",)
    onnx_threads: int = 0  # 0 = onnxruntime's default

    # Rubric Part B confidence bands.
    review_threshold: float = 0.7  # below: not labeled, a "Possibly PII" question
    high_confidence: float = 0.9
    # Below this a model-only "possible" value is not worth a human's time (measured on the gold sets).
    question_min_confidence: float = 0.5
    approve_all_labels: tuple[str, ...] = FIXED_SHAPE_LABELS

    # LLM adjudicator. "none": unsure items stay human questions. "local": a self-hosted model behind an
    # OpenAI-compatible endpoint (vLLM, Ollama). "anthropic": Claude, only with the flag AND a recorded approval.
    llm_provider: Literal["none", "local", "anthropic"] = "local"
    llm_base_url: str = "http://127.0.0.1:11434/v1"
    llm_model: str = "qwen2.5:7b-instruct"
    llm_batch_size: int = 8
    llm_timeout_s: float = 180.0
    anthropic_enabled: bool = False
    anthropic_model: str = "claude-opus-5-5"
    anthropic_effort: Literal["low", "medium", "high"] = "medium"
    llm_approval_file: Path | None = None
    llm_cache_file: Path | None = None  # eval only: reuse decisions across runs (holds no snippet text)
    # What the adjudicator is asked about, and how its answers are used (measured in eval, see eval/reports/P2).
    llm_review_medium: bool = True  # also ask about medium labels (names, companies, addresses, usernames)
    llm_accept: float = 0.8  # an unsure question becomes a label when the LLM names a label this surely
    llm_dismiss: float = 0.95  # an unsure question is dropped when the LLM says not PII this surely
    llm_may_dismiss: bool = False  # off: a "not PII" answer only annotates the question
    llm_demote: bool = True  # a medium label the LLM rejects becomes a question (never silently removed)
    mask_context: Literal["auto", "always", "never"] = "auto"  # auto: mask other PII for external providers

    # Per-label isotonic calibration (eval/calibrate.py writes it; human answers refit it in P3+).
    calibration_file: Path | None = AGENT_DIR / "pii_agent" / "data" / "calibration.json"
    approve_all_min: float = 0.98  # calibrated confidence needed to join "Approve all"

    log_level: Literal["debug", "info", "warning", "error"] = "info"
    rubric_file: Path = REPO_DIR / "docs" / "SINGLE-REVIEW-RUBRIC.md"
    context_chars: int = Field(default=200, ge=0, le=500)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
