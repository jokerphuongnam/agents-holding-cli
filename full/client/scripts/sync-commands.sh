#!/usr/bin/env bash
# holding setup sync [--owner] [--claude] [--dir DIR]: write the server's slash commands as Grok command files.
# Grok CLI does not show MCP prompts as slash commands; it loads ~/.grok/commands/<name>.md. This fetches prompts/list +
# prompts/get (request=$ARGUMENTS) and writes one file per command, refreshing on every run (stale ones it wrote are removed).
# One file per noun (/staff, /task, /key ...); the verb is the first argument (/staff add). No Node needed (curl + macOS osascript).
# --owner: use the owner admin key (Keychain agents-holding-owner-admin-key) so owner commands (/key list, /key add ...) are
#   included, and add an `agents-holding-owner` MCP server to ~/.grok/config.toml (key via $AGENTS_HOLDING_OWNER_KEY).
# Also installs a Grok UserPromptSubmit hook (~/.grok/hooks/agents-holding.json -> ah-hook.sh) that answers the deterministic
#   commands (/staff list, /key list, /jira list ...) instantly WITHOUT a model turn; --no-hook skips it (AH_HOOK=0 disables it live).
# --claude: also write ~/.claude/commands (Claude Code already lists MCP prompts as /mcp__agents-holding__<name>).
set -euo pipefail
MCP_URL="${AH_MCP_URL:-https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp}"
OWNER=""; CLAUDE=""; HOOK=1; DIRS=()
while [ $# -gt 0 ]; do case "$1" in --owner) OWNER=1;; --claude) CLAUDE=1;; --no-hook) HOOK="";; --dir) DIRS+=("$2"); shift;; *) echo "unknown option $1" >&2; exit 2;; esac; shift; done
[ ${#DIRS[@]} -gt 0 ] || DIRS=("$HOME/.grok/commands"); [ -n "$CLAUDE" ] && DIRS+=("$HOME/.claude/commands")
MARK="<!-- synced by agents-holding (holding setup sync); edits are overwritten -->"
kc() { security find-generic-password -s "$1" -a "$USER" -w 2>/dev/null; }
if [ -n "$OWNER" ]; then KEY="$(kc agents-holding-owner-admin-key)" || { echo "no owner key in the Keychain (agents-holding-owner-admin-key)" >&2; exit 1; }
else KEY="${AGENTS_HOLDING_KEY:-$(kc agents-holding-license || true)}"; fi
[ -n "$KEY" ] || { echo "no license key: run connect.sh first" >&2; exit 1; }
DEV="${AGENTS_HOLDING_DEVICE:-$(kc agents-holding-device || true)}"
tmp="$(mktemp -d)"; chmod 700 "$tmp"; trap 'rm -rf "$tmp"' EXIT
rpc() { # $1 = JSON body, $2 = out file; key only via curl config on stdin
  { printf 'header = "Authorization: Bearer %s"\n' "$KEY"; [ -n "$DEV" ] && printf 'header = "X-AH-Device: %s"\n' "$DEV"; true; } |
    curl -fsS --retry 3 --retry-all-errors --retry-delay 1 -K - -X POST "$MCP_URL" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" --data "$1" -o "$2"; }
js() { osascript -l JavaScript -e 'function run(a){ObjC.import("Foundation");const s=$.NSString.stringWithContentsOfFileEncodingError(a[0],4,null).js;const j=JSON.parse(s);if(j.error)throw new Error(j.error.message);'"$1"'}' "${@:2}"; }
rpc '{"jsonrpc":"2.0","id":1,"method":"prompts/list"}' "$tmp/list.json" || { echo "server unreachable or key rejected" >&2; exit 1; }
names="$(js 'return j.result.prompts.map(p=>p.name).join("\n")' "$tmp/list.json")"
for d in "${DIRS[@]}"; do mkdir -p "$d"; done
n=0; written=" "
for name in $names; do
  rpc "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"prompts/get\",\"params\":{\"name\":\"$name\",\"arguments\":{\"request\":\"\$ARGUMENTS\"}}}" "$tmp/p.json"
  file="$name"
  js 'const L=JSON.parse($.NSString.stringWithContentsOfFileEncodingError(a[1],4,null).js).result.prompts;const p=L.find(x=>x.name===a[2])||{};
      const t=j.result.messages.map(m=>m.content.text).join("\n");const d=(p.description||a[2]).replace(/\n/g," ");
      return "---\ndescription: "+JSON.stringify(d)+"\n---\n"+t+"\n\nUser arguments: $ARGUMENTS\n"+a[3]+"\n"' "$tmp/p.json" "$tmp/list.json" "$name" "$MARK" > "$tmp/$file.md"
  for d in "${DIRS[@]}"; do cp "$tmp/$file.md" "$d/$file.md"; done
  written="$written$file "; n=$((n+1))
done
for d in "${DIRS[@]}"; do for f in "$d"/*.md; do [ -e "$f" ] || continue; b="$(basename "$f" .md)"
  case "$written" in *" $b "*) ;; *) grep -qF "$MARK" "$f" && rm -f "$f" && echo "removed stale /$b";; esac; done; done
if [ -n "$HOOK" ]; then # zero-model path: Grok UserPromptSubmit hook (global; Grok runs it after folder trust)
  SD="$(cd "$(dirname "$0")" && pwd)"
  if [ ! -f "$SD/ah-hook.sh" ] || [ ! -f "$SD/ah-cli.sh" ]; then SD="$HOME/.agents-holding/lite"; mkdir -p "$SD"
    for f in ah-hook.sh ah-cli.sh; do curl -fsSL --retry 3 "https://raw.githubusercontent.com/jokerphuongnam/agents-holding-free/${AH_BRANCH:-main}/full/client/scripts/$f" -o "$SD/$f"; chmod +x "$SD/$f"; done; fi
  mkdir -p "$HOME/.grok/hooks"
  printf '{"hooks":{"UserPromptSubmit":[{"hooks":[{"type":"command","command":"bash %s/ah-hook.sh","timeout":30}]}]}}\n' "$SD" > "$HOME/.grok/hooks/agents-holding.json"
  echo "hook: ~/.grok/hooks/agents-holding.json -> $SD/ah-hook.sh (pure-data commands answer instantly, no model)"
fi
if [ -n "$OWNER" ]; then
  GC="$HOME/.grok/config.toml"; touch "$GC"
  grep -qs '^\[mcp_servers.agents-holding-owner\]' "$GC" || printf '\n[mcp_servers.agents-holding-owner]\ntype = "http"\nurl = "%s"\nenabled = true\nheaders = { "Authorization" = "Bearer ${AGENTS_HOLDING_OWNER_KEY}" }\n' "$MCP_URL" >> "$GC"
  P="$HOME/.zshrc"; grep -qsF 'AGENTS_HOLDING_OWNER_KEY=' "$P" || printf '%s\n' 'export AGENTS_HOLDING_OWNER_KEY="$(security find-generic-password -s agents-holding-owner-admin-key -a "$USER" -w 2>/dev/null)"' >> "$P"
fi
echo "synced $n commands into ${DIRS[*]}$([ -n "$OWNER" ] && echo ' (incl. owner commands; MCP server agents-holding-owner)')"
