#!/usr/bin/env bash
# Every check for the agent and the extension it reuses. Run from anywhere: agent/scripts/check.sh
set -euo pipefail
AGENT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$AGENT/.." && pwd)"
PY="${PY:-$AGENT/.venv/bin/python}"

echo "== extension: npm test";            (cd "$REPO" && npm test --silent 2>&1 | grep -E "^# (pass|fail)")
echo "== extension: build --check";       (cd "$REPO" && node scripts/build.js --check)
echo "== extension: label-bench";         (cd "$REPO" && node ml/label-bench.js | grep "All")
echo "== rules service";                  (cd "$AGENT/rules-service" && npm test --silent 2>&1 | grep -E "^# (pass|fail)")
echo "== ruff";                           (cd "$AGENT" && "$PY" -m ruff check . && "$PY" -m ruff format --check pii_agent eval tests)
echo "== mypy --strict";                  (cd "$AGENT" && "$PY" -m mypy)
echo "== pytest";                         (cd "$AGENT" && "$PY" -m pytest)
