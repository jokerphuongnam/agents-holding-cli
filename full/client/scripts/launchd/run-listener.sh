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
# Resolve the Jira project from the local repo registration. This keeps the
# native listener scoped to the project registered for this repo instead of
# relying on a global/default project.
if [ -z "${AH_JIRA_PROJECT:-}" ] && [ -f "$HOME/.config/agents-holding/projects.json" ]; then
  AH_JIRA_PROJECT="$(node -e '
    try {
      const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
      const repo=process.argv[2];
      const p=(j.projects||[]).find(x=>require("path").resolve(x.path||"")===require("path").resolve(repo));
      process.stdout.write(String(p?.jira?.project_key||p?.project_key||p?.boards?.[0]?.project_key||""));
    } catch {}
  ' "$HOME/.config/agents-holding/projects.json" "$AH_REPO_DIR")"
fi
export AH_JIRA_PROJECT
# The native recovery scan uses the same local Jira Keychain integration as
# the CLI. Keep the token in process memory only; jira.json contains no secret.
if [ -f "$HOME/.config/agents-holding/jira.json" ]; then
  AH_JIRA_BASE_URL="${AH_JIRA_BASE_URL:-$(node -e 'try{const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(String(j.site||""))}catch{}' "$HOME/.config/agents-holding/jira.json")}"
  AH_JIRA_EMAIL="${AH_JIRA_EMAIL:-$(node -e 'try{const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(String(j.email||""))}catch{}' "$HOME/.config/agents-holding/jira.json")}"
  jira_service="$(node -e 'try{const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(String(j.keychain_service||"agents-holding-atlassian"))}catch{process.stdout.write("agents-holding-atlassian")}' "$HOME/.config/agents-holding/jira.json")"
  if [ -n "$AH_JIRA_EMAIL" ]; then
    AH_JIRA_TOKEN="${AH_JIRA_TOKEN:-$(security find-generic-password -s "$jira_service" -a "$AH_JIRA_EMAIL" -w 2>/dev/null || true)}"
  fi
fi
export AH_JIRA_BASE_URL AH_JIRA_EMAIL AH_JIRA_TOKEN
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
