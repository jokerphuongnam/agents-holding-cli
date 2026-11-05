#!/usr/bin/env bash
# holding <noun> <verb> [args]: instant, deterministic agents-holding commands. One MCP tools/call ("cli"), the server renders the text,
# this prints it. No model, no Node (curl + macOS osascript). Owner commands (key list|add|remove|renew <ref>|set label|reset-device|show <id>) use THIS Mac's license key: the
# server accepts them only from the owner's home-Mac key on its bound device. Recovery (home key lost): AH_OWNER_RECOVERY=1 uses
# the owner admin key + 2FA session (docs/OWNER.md). New keys never print: they go to the Keychain + clipboard (key show <id>).
# Company = .agents/company.json in this dir or a parent, or --company <slug> / $AH_COMPANY.
set -euo pipefail
MCP_URL="${AH_MCP_URL:-https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp}"
cmd="${1:?usage: holding <noun> <verb> [args]}"; shift || true
CO="${AH_COMPANY:-}"; A=()
while [ $# -gt 0 ]; do case "$1" in --company) CO="$2"; shift;; *) A+=("$1");; esac; shift; done
kc() { security find-generic-password -s "$1" -a "$USER" -w 2>/dev/null; }
V="${A[0]:-}"; X="${A[1]:-}"; OWNCMD=""
[ "$cmd" = key ] && case "$V" in list|add|remove|set|reset-device|rotate) OWNCMD=1;; renew|show) [ -n "$X" ] && OWNCMD=1;; esac
LANGH="en"; case "${AH_LANG:-${LANG:-}}" in vi*) LANGH="vi";; esac
say() { [ "$LANGH" = vi ] && echo "$2" || echo "$1"; }
MCP_BASE="${MCP_URL%/}"
# >>> ah_menu (canonical: full/lib/menu.sh; embedded copies are checked by tests/menu_sync_test.sh)
# ah_menu VAR DEFAULT "Title" "item 1" "item 2" ...  -> arrow-key selector on /dev/tty (works under curl | bash).
# Up/Down or k/j move, Enter chooses, 1-9 pick directly, Ctrl-C cancels (terminal restored, exit 130).
# Sets VAR to the chosen 1-based number and returns 0. Returns 2 (VAR untouched) when not interactive:
# AH_NONINTERACTIVE=1, CI set, or no usable /dev/tty -> callers keep their numeric/env fallback. bash 3.2 safe.
ah_menu() {
  local __v="$1" __d="${2:-1}" __t="$3"; shift 3
  local __n=$# __c __k __k2 __st __oi
  [ "${AH_NONINTERACTIVE:-0}" = 1 ] && return 2; [ -n "${CI:-}" ] && return 2
  [ "$__n" -gt 0 ] || return 2
  { exec 3</dev/tty; } 2>/dev/null || return 2
  __st="$(stty -g <&3 2>/dev/null)" || { exec 3<&-; return 2; }
  exec 4>/dev/tty
  __c=$((__d - 1)); [ "$__c" -ge 0 ] && [ "$__c" -lt "$__n" ] || __c=0
  __oi="$(trap -p INT)"
  # bash's read -n turns ISIG back on, so Ctrl-C can arrive as SIGINT inside read: restore the tty, then die of SIGINT (exit 130)
  trap 'stty "$__st" <&3 2>/dev/null; printf "\033[?25h\n" >&4; trap - INT; kill -INT $$' INT
  stty -echo -icanon -isig min 1 time 0 <&3 2>/dev/null   # -isig: Ctrl-C arrives as a byte, handled below
  printf '\033[?25l%s\n' "$__t" >&4
  __ah_menu_draw() { local j=0 s; for s in "$@"; do
      if [ "$j" -eq "$__c" ]; then printf '\033[2K  \033[1;36m❯ %d) %s\033[0m\n' $((j + 1)) "$s" >&4
      else printf '\033[2K    %d) %s\n' $((j + 1)) "$s" >&4; fi; j=$((j + 1)); done
    printf '\033[2K  \033[2m↑/↓ move · Enter choose · 1-%d shortcut · Ctrl-C cancel\033[0m\n' "$__n" >&4; }
  __ah_menu_draw "$@"
  while :; do
    __k=""; IFS= read -rsn1 __k <&3 || break
    case "$__k" in
      $'\e') __k2=""; IFS= read -rsn1 -t 1 __k2 <&3 || true
        if [ "$__k2" = "[" ] || [ "$__k2" = "O" ]; then IFS= read -rsn1 -t 1 __k2 <&3 || true
          case "$__k2" in A) __c=$(( (__c - 1 + __n) % __n ));; B) __c=$(( (__c + 1) % __n ));; esac; fi ;;
      k|K) __c=$(( (__c - 1 + __n) % __n ));;
      j|J) __c=$(( (__c + 1) % __n ));;
      [1-9]) [ "$__k" -le "$__n" ] && { __c=$((__k - 1)); printf '\033[%dA' $((__n + 1)) >&4; __ah_menu_draw "$@"; break; } ;;
      $'\003') stty "$__st" <&3 2>/dev/null; printf '\033[?25h\n' >&4; exit 130;;   # Ctrl-C: cancel cleanly
      ""|$'\r'|$'\n') break;;
    esac
    printf '\033[%dA' $((__n + 1)) >&4; __ah_menu_draw "$@"
  done
  stty "$__st" <&3 2>/dev/null; printf '\033[?25h' >&4
  exec 3<&- 4>&-
  if [ -n "$__oi" ]; then eval "$__oi"; else trap - INT; fi
  unset -f __ah_menu_draw
  printf -v "$__v" '%s' $((__c + 1)); return 0
}
# <<< ah_menu
# ---- Generate key / Import key (the only two setup options). The key is never printed: it goes straight to the Keychain. ----
if [ "$cmd" = key ] && { [ "$V" = generate ] || [ "$V" = import ]; }; then
  DEV="${AGENTS_HOLDING_DEVICE:-$(kc agents-holding-device || true)}"
  [ -n "$DEV" ] || { hw="$(ioreg -rd1 -c IOPlatformExpertDevice | awk -F'"' '/IOPlatformUUID/{print $4}')"; [ -n "$hw" ] || hw="$(uuidgen)"; DEV="mac-$(printf 'agents-holding:%s' "$hw" | shasum -a 256 | cut -c1-32)"; security add-generic-password -U -s agents-holding-device -a "$USER" -w "$DEV" >/dev/null 2>&1; }
  if [ -n "$(kc agents-holding-license || true)" ] && [ "${AH_YES:-0}" != 1 ]; then
    if ah_menu yn 1 "$(say 'This Mac already has a key. Replace it?' 'Máy này đã có key. Thay key mới?')" "$(say 'No, keep the current key' 'Không, giữ key hiện tại')" "$(say 'Yes, replace it' 'Có, thay key mới')"; then [ "$yn" = 2 ] || exit 1
    else read -r -p "$(say 'This Mac already has a key. Replace it? [y/N] ' 'Máy này đã có key. Thay key mới? [y/N] ')" yn; case "$yn" in y|Y) ;; *) exit 1;; esac; fi; fi
  tmp="$(mktemp -d)"; chmod 700 "$tmp"; trap 'rm -rf "$tmp"' EXIT
  if [ "$V" = generate ]; then
    osascript -l JavaScript -e 'function run(a){return JSON.stringify({device:a[1],device_name:a[2],lang:a[3],jira_site:a[4]||undefined})}' "" "$DEV" "$(scutil --get ComputerName 2>/dev/null || hostname)" "$LANGH" "${AH_JIRA_SITE:-}" > "$tmp/b.json"
    curl -sS --max-time 45 -X POST "$MCP_BASE/free-signup" -H "Content-Type: application/json" -H "X-AH-Lang: $LANGH" --data-binary "@$tmp/b.json" -o "$tmp/r.json" || { say "MCP server unreachable, try again." "Không kết nối được MCP server, thử lại."; exit 1; }
    k="$(osascript -l JavaScript -e 'function run(a){ObjC.import("Foundation");const j=JSON.parse($.NSString.stringWithContentsOfFileEncodingError(a[0],4,null).js);return j.ok?"OK "+(j.recovered?"R ":"N ")+j.key:"ERR "+(j.message||"failed")}' "$tmp/r.json")"; rm -f "$tmp/r.json"
    case "$k" in "OK "*) k="${k#OK }"; case "$k" in "R "*) say "Recovered this device's key (old key no longer works)." "Đã khôi phục key của máy này (key cũ không còn dùng được).";; esac; k="${k#? }";; *) echo "${k#ERR }" >&2; exit 1;; esac
  else
    [ -t 0 ] || [ -n "${AH_IMPORT_KEY:-}" ] || { echo "run it in a terminal" >&2; exit 1; }
    k="${AH_IMPORT_KEY:-}"; [ -n "$k" ] || { read -r -s -p "$(say 'Paste your key (hidden): ' 'Dán key của bạn (ẩn): ')" k; echo; }
  fi
  security add-generic-password -U -s agents-holding-license -a "$USER" -w "$k" >/dev/null 2>&1 || { echo "could not store in Keychain" >&2; exit 1; }
  k=""; say "Key stored in this Mac's Keychain (not shown)." "Đã lưu key vào Keychain của máy (không hiển thị)."
  rm -rf "$tmp"; trap - EXIT; exec bash "$0" key show
fi
[ "$cmd" = credit ] && case "$V" in add|list) OWNCMD=1;; show) [ -n "$X" ] && OWNCMD=1;; esac
case "$OWNCMD" in 1) if [ "${AH_OWNER_RECOVERY:-0}" = 1 ]; then KEY="${AGENTS_HOLDING_OWNER_KEY:-$(kc agents-holding-owner-admin-key || true)}"; OWN=1; else KEY="${AGENTS_HOLDING_KEY:-$(kc agents-holding-license || true)}"; OWN=""; fi;;
  *) KEY="${AGENTS_HOLDING_KEY:-$(kc agents-holding-license || true)}"; OWN="";; esac
[ -n "$KEY" ] || { echo "no $([ -n "$OWN" ] && echo owner || echo license) key in the Keychain: run connect.sh first" >&2; exit 1; }
DEV="${AGENTS_HOLDING_DEVICE:-$(kc agents-holding-device || true)}"
SK=""; case " ${A[*]:-} " in *" --custom "*) [ -n "$OWNCMD" ] && { SK="${AH_CUSTOM_KEY:-}"; [ -n "$SK" ] || { read -r -s -p "Custom key string (hidden): " SK; echo; }; } ;; esac
if [ -z "$CO" ]; then d="$PWD"; while [ "$d" != "/" ]; do [ -f "$d/.agents/company.json" ] && { CO="$(sed -nE 's/.*"company" *: *"([^"]+)".*/\1/p' "$d/.agents/company.json" | head -1)"; break; }; d="$(dirname "$d")"; done; fi
[ -z "$CO" ] && [ -f "$HOME/.config/agents-holding/active" ] && CO="$(tr -d '\n' < "$HOME/.config/agents-holding/active")"  # holding company use <company>
SESS=""; [ -n "$OWN" ] && [ -f "$HOME/.config/agents-holding/owner-session.txt" ] && SESS="$(tr -d '\n' < "$HOME/.config/agents-holding/owner-session.txt")"
tmp="$(mktemp -d)"; chmod 700 "$tmp"; trap 'rm -rf "$tmp"' EXIT
# JSON body built by osascript (safe quoting of free text); secrets go to curl via its config on stdin, never argv
call() { # call <cmd> <args> -> $tmp/txt
osascript -l JavaScript -e 'function run(a){return JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"cli",arguments:Object.assign({command:a[0],args:a[1]},a[2]?{company:a[2]}:{},a[3]?{owner_session:a[3]}:{},a[4]?{secret_key:a[4]}:{})}})}' \
  "$1" "$2" "$CO" "$SESS" "$SK" > "$tmp/body.json"
code="$({ printf 'header = "Authorization: Bearer %s"\n' "$KEY"; [ -n "$DEV" ] && printf 'header = "X-AH-Device: %s"\n' "$DEV"; true; } |
  curl -sS --retry 2 --retry-delay 1 -K - -X POST "$MCP_URL" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -H "X-AH-Client: ah-cli" -H "X-AH-Lang: ${LANGH:-en}" \
  --max-time "${AH_CLI_TIMEOUT:-45}" --data-binary "@$tmp/body.json" -o "$tmp/out.json" -w '%{http_code}')" || { stale "server unreachable"; exit 1; }
osascript -l JavaScript -e 'function run(a){ObjC.import("Foundation");const s=$.NSString.stringWithContentsOfFileEncodingError(a[0],4,null).js;let j;
  try{j=JSON.parse(s)}catch(e){return "HTTP "+a[1]+": "+s.slice(0,300)}
  if(j.error)return "ERR "+j.error.message; const r=j.result||{};const t=(r.content||[]).map(c=>c.text).join("\n");
  let x=t; try{const v=JSON.parse(t); x=typeof v==="string"?v:JSON.stringify(v,null,1)}catch(e){}
  return (r.isError?"ERR ":"")+x}' "$tmp/out.json" "$code" > "$tmp/txt"
}
# key show <id>: pick up a parked key -> Keychain (agents-holding-issued-<id>) + clipboard; only a masked form is printed
pickup() { # pickup <id> [team]
  if [ "${2:-}" = team ]; then call team "key $1"; else call key "show $1"; fi; line="$(grep '^AH_NEW_KEY ' "$tmp/txt" || true)"
  [ -n "$line" ] || { cat "$tmp/txt"; return 1; }
  id="$(printf '%s' "$line" | cut -d' ' -f2)"; k="$(printf '%s' "$line" | cut -d' ' -f3)"; : > "$tmp/txt"
  security add-generic-password -U -s "agents-holding-issued-$id" -a "$USER" -w "$k" 2>/dev/null || { echo "could not store in Keychain" >&2; return 1; }
  printf '%s' "$k" | pbcopy 2>/dev/null || true
  echo "Key ${k:0:8}…${k: -4} for $id: copied to the clipboard and stored in the Keychain (service agents-holding-issued-$id)."
  echo "Send it PRIVATELY. Read it again later: security find-generic-password -s agents-holding-issued-$id -w | pbcopy"; k=""
}
args="${A[*]:-}"
# billing: language follows the input; no words typed -> the terminal language (vi_* -> Vietnamese)
[ "$cmd" = billing ] && [ -z "${args// /}" ] && case "${AH_LANG:-${LANG:-}}" in vi*) args="vi";; esac
# read-only commands keep the last good answer; on server down / 5xx / timeout they print it marked STALE (never for writes)
RO=0; case "$cmd $V" in "status "*|"doctor "*|"task list"|"task history"|"task plan"|"staff list"|"staff "|"task "|"billing "|"billing usage"|"flow "*|"listener status"|"help "*|"skill list"|"jira sources"|"company show") RO=1;; esac
CACHE="$HOME/.config/agents-holding/cache/cli-${CO:-none}-$cmd-$(printf '%s' "$args" | shasum | cut -c1-10).txt"
QUOTA="MCP server quota exceeded (plan limit / too many requests). Work pauses; nothing is lost. Check: holding status, or wait for the reset."
stale() { # stale <why>: print the cached answer marked STALE (read-only cmds) or the error
  [ "$1" = quota ] && echo "$QUOTA" >&2 || echo "$1" >&2
  if [ "$RO" = 1 ] && [ -f "$CACHE" ]; then echo "⚠️  STALE (cached $(date -r "$CACHE" '+%Y-%m-%d %H:%M'); server unavailable: $1)"; cat "$CACHE"; exit 0; fi
}
if [ -n "$OWNCMD" ] && [ "$cmd" = key ] && [ "$V" = show ]; then pickup "$X"; exit $?; fi
if [ "$cmd" = team ] && [ "$V" = key ]; then pickup "$X" team; exit $?; fi
call "$cmd" "$args"
case "$code" in 402|429) stale quota; exit 1;; 5*|000) stale "server error HTTP $code"; exit 1;; esac
grep -qi '^ERR .*\(quota\|limit \(reached\|exceeded\)\)' "$tmp/txt" && { stale quota; exit 1; }
cat "$tmp/txt"; grep -q '^ERR \|^HTTP ' "$tmp/txt" && exit 1
[ "$RO" = 1 ] && { mkdir -p "$(dirname "$CACHE")"; chmod 700 "$(dirname "$CACHE")"; cp "$tmp/txt" "$CACHE"; }
case "$cmd $V" in "team add"|"team rotate") id="$(sed -nE 's/.*holding team key ([0-9a-f-]{36}).*/\1/p' "$tmp/txt" | head -1)"; [ -n "$id" ] && { echo; pickup "$id" team || true; } ;; esac
[ -n "$SK" ] && exit 0  # custom key: the owner already knows it; nothing to pick up
case "$OWNCMD $cmd $V" in "1 key add"|"1 key renew"|"1 key rotate") id="$(sed -nE 's/.*holding key show ([0-9a-f-]{36}).*/\1/p' "$tmp/txt" | head -1)"; [ -n "$id" ] && { echo; pickup "$id" || true; } ;; esac
exit 0
