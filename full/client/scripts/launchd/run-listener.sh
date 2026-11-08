#!/bin/bash
# Native listener wrapper. Credentials are loaded from the user's login Keychain.
set -euo pipefail
export PATH="$HOME/.grok/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export GROK_BIN="${GROK_BIN:-$HOME/.grok/bin/grok}"
export AH_MCP_URL="${AH_MCP_URL:-https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp}"
if [ -z "${AGENTS_HOLDING_KEY:-}" ]; then
  for svc in agents-holding-license agents-holding-test-license; do
    AGENTS_HOLDING_KEY="$(security find-generic-password -s "$svc" -a "${USER:-$(id -un)}" -w 2>/dev/null || true)"
    [ -n "$AGENTS_HOLDING_KEY" ] && break
  done
fi
export AGENTS_HOLDING_KEY
cd "$AH_REPO_DIR"
# The native listener must be scoped to the company represented by this repo.
# Without this, a multi-project checkout can subscribe to every company in the
# user's registry, so a Nailly listener may also recover MARLIN issues.
if [ -z "${AH_COMPANY:-}" ] && [ -f "$AH_REPO_DIR/.agents/company.json" ]; then
  AH_COMPANY="$(node -e 'try{const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); process.stdout.write(String(j.company||""))}catch{}' "$AH_REPO_DIR/.agents/company.json")"
fi
export AH_COMPANY
if [ -z "$AH_COMPANY" ]; then
  echo "ERROR: no company scope in $AH_REPO_DIR/.agents/company.json" >&2
  exit 1
fi
# Prefer the native listener when the update package installed it.
AH_RUST_BIN="${AH_RUST_LISTENER_BIN:-$HOME/.agents-holding/bin/agents-holding-listener}"
if [ ! -x "$AH_RUST_BIN" ] && [ -x "$HOME/.agents-holding/scripts/install-rust-listener.sh" ]; then
  echo "Jira Listener is not installed; downloading the public release artifact lazily" >&2
  bash "$HOME/.agents-holding/scripts/install-rust-listener.sh"
fi
if [ -x "$AH_RUST_BIN" ]; then
  exec "$AH_RUST_BIN"
fi
echo "ERROR: Jira Listener is not installed at $AH_RUST_BIN" >&2
echo "Run holding update to install the listener package, then start again." >&2
exit 1
