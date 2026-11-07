#!/bin/bash
# Rust-only wrapper used by the LaunchAgent. Credentials are supplied by the native runtime.
set -euo pipefail
export PATH="$HOME/.grok/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export GROK_BIN="${GROK_BIN:-$HOME/.grok/bin/grok}"
cd "$AH_REPO_DIR"
# Prefer the native Rust listener when the update package installed it.
AH_RUST_BIN="${AH_RUST_LISTENER_BIN:-$HOME/.agents-holding/bin/agents-holding-listener}"
if [ ! -x "$AH_RUST_BIN" ] && [ -x "$HOME/.agents-holding/scripts/install-rust-listener.sh" ]; then
  echo "Rust Jira Listener is not installed; downloading the public release artifact lazily" >&2
  bash "$HOME/.agents-holding/scripts/install-rust-listener.sh"
fi
if [ -x "$AH_RUST_BIN" ]; then
  exec "$AH_RUST_BIN"
fi
echo "ERROR: native Rust Jira Listener is not installed at $AH_RUST_BIN" >&2
echo "Run holding update to install the Rust listener package, then start again." >&2
exit 1
