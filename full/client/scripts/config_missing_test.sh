#!/usr/bin/env bash
# Every `holding` command must survive a missing/deleted ~/.config/agents-holding (and a corrupted file): no stack traces,
# no ENOENT, clear message instead. Runs in a throwaway HOME, no Keychain (fake `security`), server pointed at a dead port
# (offline); long-running/launchd/editor commands are skipped. Usage: bash config_missing_test.sh [--corrupt]
set -u
here="$(cd "$(dirname "$0")" && pwd)"; fails=0
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT; mkdir -p "$T/bin" "$T/home" "$T/repo"
printf '#!/bin/sh\nexit 44\n' > "$T/bin/security"; chmod +x "$T/bin/security"
export HOME="$T/home" PATH="$T/bin:$PATH" AH_MCP_URL="http://127.0.0.1:9/functions/v1/mcp" AGENTS_HOLDING_KEY= AGENTS_HOLDING_DEVICE= AH_HOOK=0 EDITOR=true
CMDS=("" "help" "--help" "staff list" "staff presets" "staff unset dev" "task list" "task history" "provider list" "provider unset dev"
  "skill list" "skill where x" "project list" "project remove" "company list" "company show" "company use nope" "company set lang en"
  "company set agent" "company migrate $T/repo/.agents/none" "listener status" "listener logs" "jira list" "jira show X-1" "jira board" "jira sources"
  "inbox list" "ceo" "key show" "credit show" "billing" "status" "doctor" "notify off" "setup sync" "habit list" "habit clear" "flow show" "flow list")
corrupt() { mkdir -p "$HOME/.config/agents-holding/state/acme"; for f in agents.json agent-defaults.json projects.json jira.json stage-owners.json state/acme/agent.json; do
  printf '{not json' > "$HOME/.config/agents-holding/$f"; done; printf '' > "$HOME/.config/agents-holding/active"; }
for mode in missing deleted corrupt; do
  for c in "${CMDS[@]}"; do
    rm -rf "$HOME/.config"; [ "$mode" = deleted ] && { mkdir -p "$HOME/.config/agents-holding"; rm -rf "$HOME/.config/agents-holding"; }
    [ "$mode" = corrupt ] && corrupt
    # shellcheck disable=SC2086
    out="$(cd "$T/repo" && perl -e 'alarm 20; exec @ARGV' bash "$here/holding" $c </dev/null 2>&1)"; rc=$?
    if [ $rc -ge 124 ] || printf '%s' "$out" | grep -qE '^\s+at .*(\.mjs|node:)|ENOENT|SyntaxError: (Unexpected|Expected)|TypeError|ReferenceError|No such file or directory|unbound variable'; then
      fails=$((fails+1)); echo "FAIL [$mode] holding $c (rc=$rc)"; printf '%s\n' "$out" | head -5 | sed 's/^/    /'
    else echo "PASS [$mode] holding $c (rc=$rc)"; fi
  done
done
echo "FAILS $fails"; exit $((fails > 0))
