#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")/.."
S=full/client/scripts
pass=0 fail=0
ok(){ printf 'PASS %s\n' "$1"; pass=$((pass+1)); }
no(){ printf 'FAIL %s\n' "$1"; fail=$((fail+1)); }
check(){ if "$@"; then ok "$1 $2"; else no "$1 $2"; fi; }

tmp=$(mktemp -d "${TMPDIR:-/tmp}/ah-feature-tests.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
cp -R "$S" "$tmp/scripts"
H="$tmp/home"; mkdir -p "$H"

# Version normalization and update checks: never touch the real user config.
cat > "$tmp/scripts/ah-cli.sh" <<'SH'
#!/usr/bin/env bash
[ "${1:-}" = client ] && printf 'client required %s\n' "${FAKE_REQUIRED:-2026110808}"
SH
chmod +x "$tmp/scripts/ah-cli.sh"
cat > "$tmp/scripts/sync-commands.sh" <<'SH'
#!/usr/bin/env bash
printf 'commands synced\n'
SH
chmod +x "$tmp/scripts/sync-commands.sh"
printf '20261107\n' > "$tmp/scripts/VERSION"
out=$(HOME="$H" bash "$tmp/scripts/update.sh" --check 2>&1); rc=$?
if [ "$rc" = 0 ] && printf '%s' "$out" | grep -q '20261107 -> 2026110808 (newer build available)'; then ok 'version legacy build gets actionable update notice'; else no 'version legacy build gets actionable update notice'; fi
printf '2026110808\n' > "$tmp/scripts/VERSION"; rm -rf "$H"
out=$(HOME="$H" bash "$tmp/scripts/update.sh" --check 2>&1); if [ -z "$out" ]; then ok 'current version produces no update prompt'; else no 'current version produces no update prompt'; fi

# Hook guard and 8s cap with fake commands, no credentials/keychain/Jira.
cat > "$tmp/scripts/holding" <<'SH'
#!/usr/bin/env bash
[ "${1:-}" = key ] && printf 'key output\n'
[ "${1:-}" = task ] && sleep 20
exit 0
SH
chmod +x "$tmp/scripts/holding"
if [ -x /usr/bin/osascript ] || command -v osascript >/dev/null; then
  out=$(HOME="$H" AH_UPDATE_NOTICE=0 bash "$S/ah-hook.sh" <<<'not json'); rc=$?
  [ "$rc" = 0 ] && ok 'hook ignores malformed non-event input' || no 'hook ignores malformed non-event input'
  out=$(HOME="$H" AH_HOOK=0 bash "$S/ah-hook.sh" <<<'{"prompt":"/holding key show"}'); rc=$?
  [ "$rc" = 0 ] && ok 'hook disable guard exits before dispatch' || no 'hook disable guard exits before dispatch'
  # Full copy receives deterministic output. Missing hook executable is also guarded in setup templates.
  out=$(HOME="$H" AH_UPDATE_NOTICE=0 bash "$tmp/scripts/ah-hook.sh" <<<'{"prompt":"/holding key show","cwd":"/tmp"}' 2>&1); rc=$?
  if [ "$rc" = 2 ] && printf '%s' "$out" | grep -q 'key output' && printf '%s' "$out" | grep -q 'instant, no model'; then ok 'hook answers deterministic key command without model'; else no 'hook answers deterministic key command without model'; fi
  out=$(HOME="$H" AH_UPDATE_NOTICE=0 AH_HOOK_TIMEOUT=1 bash "$tmp/scripts/ah-hook.sh" <<<'{"prompt":"/holding task list","cwd":"/tmp"}' 2>&1); rc=$?
  if [ "$rc" = 2 ] && printf '%s' "$out" | grep -q 'timed out after 1s'; then ok 'hook hard-cap returns bounded failure'; else no 'hook hard-cap returns bounded failure'; fi
  grep -q 'AH_CLI_TIMEOUT="${AH_CLI_TIMEOUT:-8}"' "$S/ah-hook.sh" && grep -q 'AH_HOOK_TIMEOUT:-8' "$S/ah-hook.sh" && ok 'hook production cap defaults to eight seconds' || no 'hook production cap defaults to eight seconds'
fi
grep -q 'HOOKCMD="\[ -x .*ah-hook.sh \] && bash .* || exit 0"' full/client/scripts/sync-commands.sh && ok 'host hook installation is executable guarded' || no 'host hook installation is executable guarded'
grep -q 'atlassianToken(homedir())' "$S/holding-listen.mjs" && grep -q 'let listenerJira = dryJira || !!jiraCfg' "$S/holding-listen.mjs" && grep -q 'jira_ready: listenerJira' "$S/holding-listen.mjs" && ! grep -q 'mcpJiraFallback\|my own Atlassian MCP' "$S/holding-listen.mjs" && ok 'listener uses Jira REST API without an Atlassian MCP fallback' || no 'listener uses Jira REST API without an Atlassian MCP fallback'
grep -q 'AH_COMPANY=' "$S/launchd/run-listener.sh" && grep -q 'company.json' "$S/launchd/run-listener.sh" && ok 'native listener is scoped to the repo company' || no 'native listener is scoped to the repo company'
grep -q 'routeForRepo' "$S/holding-listen.mjs" && grep -q 'export function routeForRepo' "$S/registry.mjs" && ok 'foreground replay routes parent and child repos explicitly' || no 'foreground replay routes parent and child repos explicitly'
node "$S/release_listener_test.mjs" >/dev/null && ok 'OAuth transport and parent/child replay behavior' || no 'OAuth transport and parent/child replay behavior'
node "$S/registry_registration_test.mjs" >/dev/null && ok 'generic project registration reconcile detects missing/stale/duplicate mappings' || no 'generic project registration reconcile detects missing/stale/duplicate mappings'
node "$S/assignment_recovery_test.mjs" >/dev/null && ok 'generic unassigned agent-owned stage auto-assigns without native dialog' || no 'generic unassigned agent-owned stage auto-assigns without native dialog'
grep -q 'do not read user files by default' README.md && grep -q 'Denied/private paths are never read' README.md && ok 'privacy contract documents default no-read and denied-content exclusion' || no 'privacy contract documents default no-read and denied-content exclusion'
grep -q 'registered real terminal and consent' README.md && grep -q 'no hidden execution' README.md && ok 'privacy contract requires visible terminal execution' || no 'privacy contract requires visible terminal execution'
printf '%s\n' "client_feature_test: $pass passed, $fail failed"
[ "$fail" = 0 ]
