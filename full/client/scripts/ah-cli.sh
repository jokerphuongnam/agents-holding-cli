#!/usr/bin/env bash
# holding <cmd> [args]: instant, deterministic agents-holding commands. One MCP tools/call ("cli"), the server renders the text,
# this prints it. No model, no Node (curl + macOS osascript). Owner commands (tokens, token-*) use the owner admin key.
# Company = .agents/company.json in this dir or a parent, or --company <slug> / $AH_COMPANY.
set -euo pipefail
MCP_URL="${AH_MCP_URL:-https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp}"
cmd="${1:?usage: holding <command> [args]}"; shift || true
CO="${AH_COMPANY:-}"; A=()
while [ $# -gt 0 ]; do case "$1" in --company) CO="$2"; shift;; *) A+=("$1");; esac; shift; done
kc() { security find-generic-password -s "$1" -a "$USER" -w 2>/dev/null; }
case "$cmd" in tokens|token-*) KEY="${AGENTS_HOLDING_OWNER_KEY:-$(kc agents-holding-owner-admin-key || true)}"; OWN=1;;
  *) KEY="${AGENTS_HOLDING_KEY:-$(kc agents-holding-license || true)}"; OWN="";; esac
[ -n "$KEY" ] || { echo "no $([ -n "$OWN" ] && echo owner || echo license) key in the Keychain: run connect.sh first" >&2; exit 1; }
DEV="${AGENTS_HOLDING_DEVICE:-$(kc agents-holding-device || true)}"
if [ -z "$CO" ]; then d="$PWD"; while [ "$d" != "/" ]; do [ -f "$d/.agents/company.json" ] && { CO="$(sed -nE 's/.*"company" *: *"([^"]+)".*/\1/p' "$d/.agents/company.json" | head -1)"; break; }; d="$(dirname "$d")"; done; fi
SESS=""; [ -n "$OWN" ] && [ -f "$HOME/.config/agents-holding/owner-session.txt" ] && SESS="$(tr -d '\n' < "$HOME/.config/agents-holding/owner-session.txt")"
tmp="$(mktemp -d)"; chmod 700 "$tmp"; trap 'rm -rf "$tmp"' EXIT
# JSON body built by osascript (safe quoting of free text); secrets go to curl via its config on stdin, never argv
args="${A[*]:-}"
osascript -l JavaScript -e 'function run(a){return JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"cli",arguments:Object.assign({command:a[0],args:a[1]},a[2]?{company:a[2]}:{},a[3]?{owner_session:a[3]}:{})}})}' \
  "$cmd" "$args" "$CO" "$SESS" > "$tmp/body.json"
code="$({ printf 'header = "Authorization: Bearer %s"\n' "$KEY"; [ -n "$DEV" ] && printf 'header = "X-AH-Device: %s"\n' "$DEV"; true; } |
  curl -sS --retry 2 --retry-delay 1 -K - -X POST "$MCP_URL" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  --data-binary "@$tmp/body.json" -o "$tmp/out.json" -w '%{http_code}')" || { echo "server unreachable" >&2; exit 1; }
osascript -l JavaScript -e 'function run(a){ObjC.import("Foundation");const s=$.NSString.stringWithContentsOfFileEncodingError(a[0],4,null).js;let j;
  try{j=JSON.parse(s)}catch(e){return "HTTP "+a[1]+": "+s.slice(0,300)}
  if(j.error)return "ERR "+j.error.message; const r=j.result||{};const t=(r.content||[]).map(c=>c.text).join("\n");
  let x=t; try{const v=JSON.parse(t); x=typeof v==="string"?v:JSON.stringify(v,null,1)}catch(e){}
  return (r.isError?"ERR ":"")+x}' "$tmp/out.json" "$code" > "$tmp/txt"
cat "$tmp/txt"; grep -q '^ERR \|^HTTP ' "$tmp/txt" && exit 1; exit 0
