#!/bin/bash
# holding doctor [--repo DIR]: verify every LOCAL setup step on this Mac. Server-side steps: /doctor in your agent.
SERVER_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LABEL=com.agentsholding.listener
CFG="$HOME/.config/agents-holding"; LOG_DIR="$HOME/Library/Logs/agents-holding"
MASTER="$HOME/Library/Application Support/agents-holding/$LABEL.plist"; AUTO="$HOME/Library/LaunchAgents/$LABEL.plist"
repo=""; [ "${1:-}" = "--repo" ] && repo="$2"
for p in "$MASTER" "$AUTO"; do [ -z "$repo" ] && [ -f "$p" ] && repo="$(/usr/libexec/PlistBuddy -c 'Print :EnvironmentVariables:AH_REPO_DIR' "$p" 2>/dev/null)"; done
[ -z "$repo" ] && [ -f .agents/company.json ] && repo="$PWD"
left=0
ok()  { echo "[x] $1"; }
bad() { echo "[ ] $1"; echo "      How: $2"; left=$((left+1)); }
if [ -n "${AGENTS_HOLDING_KEY:-}" ] || security find-generic-password -s agents-holding-license -a "$USER" >/dev/null 2>&1 || security find-generic-password -s agents-holding-test-license -a "$USER" >/dev/null 2>&1; then ok "License key available (env or Keychain agents-holding-license)"
else bad "License key for the background listener" "security add-generic-password -U -s agents-holding-license -a \"\$USER\" -w   (paste at the hidden prompt)"; fi
command -v node >/dev/null && [ "$(node -p 'typeof WebSocket' 2>/dev/null)" = function ] && ok "node $(node -v) with WebSocket ($(command -v node))" || bad "node >= 22 on PATH" "brew install node"
if [ -n "$repo" ] && [ -f "$repo/.agents/company.json" ]; then ok "Company repo: $repo"; else bad "Company repo with .agents/company.json" "run /holding-ceo in your repo, then: holding listener on --repo <repo>"; fi
if grep -qs "mcp.atlassian.com" "$HOME/.grok/config.toml" ${repo:+"$repo/.grok/config.toml"}; then
  ok "Atlassian MCP configured in Grok (verify login: grok mcp doctor atlassian; if it asks, run: grok mcp login atlassian)"
else bad "Atlassian MCP in Grok" "add [mcp_servers.atlassian] url = \"https://mcp.atlassian.com/v1/mcp\" to ~/.grok/config.toml, then grok mcp login atlassian (other clients: add Atlassian's remote MCP and sign in)"; fi
if grep -qs "Operation not permitted" "$LOG_DIR/launchd.err.log"; then
  bad "macOS permission: node may read your Documents folder" "System Settings > Privacy & Security > Files and Folders > node > Documents ON (or Full Disk Access > + > $(command -v node)); then holding listener off && holding listener on, and clear $LOG_DIR/launchd.err.log"
else
  case "$repo" in "$HOME/Documents"*|"$HOME/Desktop"*|"$HOME/Downloads"*)
    grep -qs " join ok " "$LOG_DIR/listen.log" && ok "macOS permission for node (repo is in a protected folder; listener read it fine)" \
      || bad "macOS permission for node (repo is in a protected folder)" "click Allow on the 'node would like to access files in your Documents folder' dialog, or System Settings > Privacy & Security > Files and Folders" ;;
    *) ok "macOS permission: repo not in a protected folder" ;; esac
fi
st="$(bash "$SERVER_DIR/scripts/launchd/listener.sh" status)"
echo "$st" | grep -q "^listener : ON" && ok "Listener running ($(echo "$st" | sed -n 's/^listener : //p'))" || bad "Listener running" "holding listener on${repo:+ --repo $repo}"
echo "$st" | grep -q "^autostart: ON" && ok "Listener auto-starts at login" || bad "Listener auto-start at login" "holding listener autostart on (needs the listener on)"
last="$(grep ' join ' "$LOG_DIR/listen.log" 2>/dev/null | tail -1)"
echo "$last" | grep -q " join ok " && ok "Last realtime join: $last" || bad "Realtime 'join ok' in listen.log" "holding listener logs"
echo; echo "Jira steps (webhook, columns) are checked server-side: run /doctor in your agent."
[ $left -eq 0 ] && echo "Local setup: all set." || echo "Local setup: $left step(s) left."
