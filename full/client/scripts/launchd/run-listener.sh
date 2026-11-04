#!/bin/bash
# Wrapper used by the LaunchAgent: loads the license from file (never embedded in the plist).
set -euo pipefail
export PATH="$HOME/.grok/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export GROK_BIN="${GROK_BIN:-$HOME/.grok/bin/grok}"
CFG="$HOME/.config/agents-holding"
if [ -z "${AGENTS_HOLDING_KEY:-}" ]; then
  for f in license.txt test-license.txt; do
    [ -f "$CFG/$f" ] && { export AGENTS_HOLDING_KEY="$(tr -d '\n' < "$CFG/$f")"; break; }
  done
fi
cd "$AH_REPO_DIR"
exec node "$AH_SERVER_DIR/scripts/holding-listen.mjs" --repo "$AH_REPO_DIR"
