#!/bin/bash
# Wrapper used by the LaunchAgent: license comes from the Keychain (read by holding-listen.mjs), never a file or the plist.
set -euo pipefail
export PATH="$HOME/.grok/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export GROK_BIN="${GROK_BIN:-$HOME/.grok/bin/grok}"
cd "$AH_REPO_DIR"
# Multi-project: with ~/.config/agents-holding/projects.json one process serves every registered repo.
# Without it, AH_REPO_DIR (old single-repo setup) is migrated into the registry on first start.
if [ -f "$HOME/.config/agents-holding/projects.json" ]; then exec node "$AH_SERVER_DIR/scripts/holding-listen.mjs"
else exec node "$AH_SERVER_DIR/scripts/holding-listen.mjs" --repo "$AH_REPO_DIR"; fi
