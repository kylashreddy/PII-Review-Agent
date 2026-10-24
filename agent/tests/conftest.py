from __future__ import annotations

import shutil
from collections.abc import Iterator

import pytest

from pii_agent.config import Settings, get_settings
from pii_agent.log import Logger
from pii_agent.pipeline import Pipeline
from pii_agent.rules_client import RulesClient
from pii_agent.tools import Toolbox

HAS_NODE = shutil.which(get_settings().node_bin) is not None
HAS_MODEL = (get_settings().model_dir / "onnx" / "model_int8.onnx").exists()

needs_node = pytest.mark.skipif(not HAS_NODE, reason="node is not installed")
needs_model = pytest.mark.skipif(not HAS_MODEL, reason="GLiNER model files are not installed (npm run setup-model)")


@pytest.fixture(scope="session")
def rules() -> Iterator[RulesClient]:
    if not HAS_NODE:
        pytest.skip("node is not installed")
    client = RulesClient()
    yield client
    client.close()


@pytest.fixture(scope="session")
def rules_settings() -> Settings:
    return get_settings().model_copy(update={"gliner": "off", "llm_provider": "none", "calibration_file": None})


@pytest.fixture(scope="session")
def tools(rules: RulesClient, rules_settings: Settings) -> Toolbox:
    return Toolbox(settings=rules_settings, rules=rules)


@pytest.fixture
def pipeline(tools: Toolbox) -> Pipeline:
    return Pipeline(tools, Logger(level="error"))
