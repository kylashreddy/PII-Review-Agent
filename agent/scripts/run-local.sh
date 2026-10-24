#!/usr/bin/env bash
# Runs the agent with the self-hosted LLM (Ollama on this machine; nothing leaves it).
#   agent/scripts/run-local.sh --left doc.txt [--right redacted.txt] [--file-name NAME] [--out out/]
#   agent/scripts/run-local.sh --task-dir tests/fixtures --task bug6-git-logs
# Starts `ollama serve` on 127.0.0.1 if it is not running, pulls the model once, then runs pii-agent.
set -euo pipefail
AGENT="$(cd "$(dirname "$0")/.." && pwd)"
MODEL="${PII_AGENT_LLM_MODEL:-qwen2.5:7b-instruct}"
HOST="127.0.0.1:11434"

command -v ollama >/dev/null || { echo "Ollama is not installed: brew install ollama" >&2; exit 1; }

if ! curl -s -m 2 "http://$HOST/api/tags" >/dev/null; then
  echo "starting ollama serve on $HOST (log: /tmp/ollama.log)" >&2
  OLLAMA_HOST="$HOST" nohup ollama serve >/tmp/ollama.log 2>&1 &
  for _ in $(seq 1 30); do curl -s -m 1 "http://$HOST/api/tags" >/dev/null && break; sleep 1; done
fi

if ! OLLAMA_HOST="$HOST" ollama list | awk 'NR>1 {print $1}' | grep -qx "$MODEL"; then
  echo "pulling $MODEL (about 4.7 GB, once)" >&2
  OLLAMA_HOST="$HOST" ollama pull "$MODEL"
fi

[ "$#" -gt 0 ] || set -- --task-dir "$AGENT/../tests/fixtures" --task bug6-git-logs --out "$AGENT/out"
# Paths you pass stay relative to the folder you run this from.
PII_AGENT_LLM_PROVIDER=local PII_AGENT_LLM_MODEL="$MODEL" PII_AGENT_LLM_BASE_URL="http://$HOST/v1" \
  exec "$AGENT/.venv/bin/pii-agent" run "$@"
