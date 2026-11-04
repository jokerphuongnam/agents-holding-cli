#!/usr/bin/env bash
# holding <cmd> [args]: instant, deterministic agents-holding commands. One MCP tools/call ("cli"), the server renders the text,
# this prints it. No model, no Node (curl + macOS osascript). Owner commands (tokens, token-*) use THIS Mac's license key: the
# server accepts them only from the owner's home-Mac key on its bound device. Recovery (home key lost): AH_OWNER_RECOVERY=1 uses
# the owner admin key + 2FA session (docs/OWNER.md). New keys never print: they go to the Keychain + clipboard (token-show).
# Company = .agents/company.json in this dir or a parent, or --company <slug> / $AH_COMPANY.
set -euo pipefail
MCP_URL="${AH_MCP_URL:-https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp}"
cmd="${1:?usage: holding <command> [args]}"; shift || true
CO="${AH_COMPANY:-}"; A=()
while [ $# -gt 0 ]; do case "$1" in --company) CO="$2"; shift;; *) A+=("$1");; esac; shift; done
kc() { security find-generic-password -s "$1" -a "$USER" -w 2>/dev/null; }
case "$cmd" in tokens|token-*) if [ "${AH_OWNER_RECOVERY:-0}" = 1 ]; then KEY="${AGENTS_HOLDING_OWNER_KEY:-$(kc agents-holding-owner-admin-key || true)}"; OWN=1; else KEY="${AGENTS_HOLDING_KEY:-$(kc agents-holding-license || true)}"; OWN=""; fi;;
  *) KEY="${AGENTS_HOLDING_KEY:-$(kc agents-holding-license || true)}"; OWN="";; esac
[ -n "$KEY" ] || { echo "no $([ -n "$OWN" ] && echo owner || echo license) key in the Keychain: run connect.sh first" >&2; exit 1; }
DEV="${AGENTS_HOLDING_DEVICE:-$(kc agents-holding-device || true)}"
if [ -z "$CO" ]; then d="$PWD"; while [ "$d" != "/" ]; do [ -f "$d/.agents/company.json" ] && { CO="$(sed -nE 's/.*"company" *: *"([^"]+)".*/\1/p' "$d/.agents/company.json" | head -1)"; break; }; d="$(dirname "$d")"; done; fi
[ -z "$CO" ] && [ -f "$HOME/.config/agents-holding/active" ] && CO="$(tr -d '\n' < "$HOME/.config/agents-holding/active")"  # holding use <company>
SESS=""; [ -n "$OWN" ] && [ -f "$HOME/.config/agents-holding/owner-session.txt" ] && SESS="$(tr -d '\n' < "$HOME/.config/agents-holding/owner-session.txt")"
tmp="$(mktemp -d)"; chmod 700 "$tmp"; trap 'rm -rf "$tmp"' EXIT
# JSON body built by osascript (safe quoting of free text); secrets go to curl via its config on stdin, never argv
call() { # call <cmd> <args> -> $tmp/txt
osascript -l JavaScript -e 'function run(a){return JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"cli",arguments:Object.assign({command:a[0],args:a[1]},a[2]?{company:a[2]}:{},a[3]?{owner_session:a[3]}:{})}})}' \
  "$1" "$2" "$CO" "$SESS" > "$tmp/body.json"
code="$({ printf 'header = "Authorization: Bearer %s"\n' "$KEY"; [ -n "$DEV" ] && printf 'header = "X-AH-Device: %s"\n' "$DEV"; true; } |
  curl -sS --retry 2 --retry-delay 1 -K - -X POST "$MCP_URL" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -H "X-AH-Client: ah-cli" \
  --max-time "${AH_CLI_TIMEOUT:-45}" --data-binary "@$tmp/body.json" -o "$tmp/out.json" -w '%{http_code}')" || { stale "server unreachable"; exit 1; }
osascript -l JavaScript -e 'function run(a){ObjC.import("Foundation");const s=$.NSString.stringWithContentsOfFileEncodingError(a[0],4,null).js;let j;
  try{j=JSON.parse(s)}catch(e){return "HTTP "+a[1]+": "+s.slice(0,300)}
  if(j.error)return "ERR "+j.error.message; const r=j.result||{};const t=(r.content||[]).map(c=>c.text).join("\n");
  let x=t; try{const v=JSON.parse(t); x=typeof v==="string"?v:JSON.stringify(v,null,1)}catch(e){}
  return (r.isError?"ERR ":"")+x}' "$tmp/out.json" "$code" > "$tmp/txt"
}
# token-show <id>: pick up a parked key -> Keychain (agents-holding-issued-<id>) + clipboard; only a masked form is printed
pickup() {
  call token-show "$1"; line="$(grep '^AH_NEW_KEY ' "$tmp/txt" || true)"
  [ -n "$line" ] || { cat "$tmp/txt"; return 1; }
  id="$(printf '%s' "$line" | cut -d' ' -f2)"; k="$(printf '%s' "$line" | cut -d' ' -f3)"; : > "$tmp/txt"
  security add-generic-password -U -s "agents-holding-issued-$id" -a "$USER" -w "$k" 2>/dev/null || { echo "could not store in Keychain" >&2; return 1; }
  printf '%s' "$k" | pbcopy 2>/dev/null || true
  echo "Key ${k:0:8}…${k: -4} for $id: copied to the clipboard and stored in the Keychain (service agents-holding-issued-$id)."
  echo "Send it PRIVATELY. Read it again later: security find-generic-password -s agents-holding-issued-$id -w | pbcopy"; k=""
}
args="${A[*]:-}"
# read-only commands keep the last good answer; on server down / 5xx / timeout they print it marked STALE (never for writes)
RO=0; case "$cmd" in status|board|tasks|task|usage|staffs|staff|team|flow|flows|listener|help|skills|habits|setup-status|ceo) RO=1;; esac
CACHE="$HOME/.config/agents-holding/cache/cli-${CO:-none}-$cmd-$(printf '%s' "$args" | shasum | cut -c1-10).txt"
QUOTA="MCP server quota exceeded (plan limit / too many requests). Work pauses; nothing is lost. Check: holding status · upgrade or wait for the reset."
stale() { # stale <why>: print the cached answer marked STALE (read-only cmds) or the error
  [ "$1" = quota ] && echo "$QUOTA" >&2 || echo "$1" >&2
  if [ "$RO" = 1 ] && [ -f "$CACHE" ]; then echo "⚠️  STALE (cached $(date -r "$CACHE" '+%Y-%m-%d %H:%M'); server unavailable: $1)"; cat "$CACHE"; exit 0; fi
}
if [ "$cmd" = token-show ]; then pickup "${A[0]:-}"; exit $?; fi
call "$cmd" "$args"
case "$code" in 402|429) stale quota; exit 1;; 5*|000) stale "server error HTTP $code"; exit 1;; esac
grep -qi '^ERR .*\(quota\|limit \(reached\|exceeded\)\)' "$tmp/txt" && { stale quota; exit 1; }
cat "$tmp/txt"; grep -q '^ERR \|^HTTP ' "$tmp/txt" && exit 1
[ "$RO" = 1 ] && { mkdir -p "$(dirname "$CACHE")"; chmod 700 "$(dirname "$CACHE")"; cp "$tmp/txt" "$CACHE"; }
case "$cmd" in token-add|token-renew) id="$(sed -nE 's/.*holding token-show ([0-9a-f-]{36}).*/\1/p' "$tmp/txt" | head -1)"; [ -n "$id" ] && { echo; pickup "$id" || true; } ;; esac
exit 0
