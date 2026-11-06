#!/usr/bin/env bash
# agents-holding: connect THIS Mac in one command (no Node needed):
#   curl -fsSL https://raw.githubusercontent.com/jokerphuongnam/agents-holding-free/main/full/connect.sh | bash
# 1) creates this machine's device id in the Keychain  2) Generate key (new Free key) or Import key (hidden prompt; never
# echoed, never in a file)  3) adds agents-holding to Grok (~/.grok/config.toml), Claude Code and Codex if installed,
# reading the key/device from env vars  4) adds the Keychain loader to ~/.zshrc (idempotent)  5) health check.
# --print-url: print the server URL and exit.
# Env: AH_MCP_URL, AH_AGENTS=grok,claude,codex (default: installed ones), AH_NO_DOCTOR=1, AH_OWNER=1 (owner Mac: also owner commands).
# Menus are arrow-key selectors on /dev/tty (numbers still work); AH_NONINTERACTIVE=1 or CI=1 or no tty: plain numeric prompt / AH_KEY_CHOICE.
set -euo pipefail
# >>> ah_kc_guard (canonical: full/lib/kc-guard.sh): macOS `security` resolves the default keychain from $HOME; under a
# temporary/fake HOME it finds none and pops "keychain not found / restore keychain" dialogs. Pin every *-generic-password
# call to the REAL user's login keychain (passwd home, not $HOME); AH_SKIP_KEYCHAIN=1 = no keychain access (not found).
security() {
  case "${1:-}" in find-generic-password|add-generic-password|delete-generic-password)
    [ "${AH_SKIP_KEYCHAIN:-}" = 1 ] && return 44
    local rh kc; rh="$(dscl . -read "/Users/$(id -un)" NFSHomeDirectory 2>/dev/null | awk '{print $2}')"; [ -n "$rh" ] || rh="$(eval echo "~$(id -un)")"
    kc="$rh/Library/Keychains/login.keychain-db"; [ -f "$kc" ] || kc="$rh/Library/Keychains/login.keychain"; [ -f "$kc" ] || return 44
    command security "$@" "$kc"; return $? ;;
  esac
  command security "$@"
}
# <<< ah_kc_guard
MCP_URL="${AH_MCP_URL:-https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp}"
[ "${1:-}" = "--print-url" ] && { printf '%s\n' "$MCP_URL"; exit 0; }
KSVC="agents-holding-license"; DSVC="agents-holding-device"
say() { printf '\033[1;32m==>\033[0m %s\n' "$*"; }; warn() { printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; }; die() { printf '\033[1;31mFAIL\033[0m %s\n' "$*" >&2; exit 1; }
[ "$(uname)" = Darwin ] || die "macOS only (Keychain). Other systems: see full/SETUP.md"
kc() { security find-generic-password -s "$1" -a "$USER" -w 2>/dev/null; }
# >>> ah_menu (canonical: full/lib/menu.sh; embedded copies are checked by tests/menu_test.sh)
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

# 1. per-machine device id (sha256 of the hardware UUID; stable, not reversible) -> Keychain
if ! kc "$DSVC" >/dev/null; then
  hw="$(ioreg -rd1 -c IOPlatformExpertDevice | awk -F'"' '/IOPlatformUUID/{print $4}')"; [ -n "$hw" ] || hw="$(uuidgen)"
  dev="mac-$(printf 'agents-holding:%s' "$hw" | shasum -a 256 | cut -c1-32)"
  security add-generic-password -U -s "$DSVC" -a "$USER" -l "agents-holding device id" -w "$dev"
fi
# 2. key -> Keychain. Exactly two options: Generate key (new Free key for THIS machine; one per machine, ever) or
#    Import key (a key you already have: from the owner, or your own key from another Mac; counts against its max devices).
#    The key is never printed and never passes through the chat model.
MCP_URL="${AH_MCP_URL:-https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp}"
LANGH=en; case "${AH_LANG:-${LANG:-}}" in vi*) LANGH=vi;; esac
# Privacy + automatic skill collection notice, shown before Generate/Import key (tests: tests/notice_test.sh)
ah_notice() { if [ "$LANGH" = vi ]; then cat <<'N'
Quyền riêng tư: Chúng tôi không lấy thông tin của bạn, chỉ ghi nhận thói quen sử dụng: giờ bạn hay làm việc, bạn dùng chat hay comment, và cách bạn cấu hình công cụ (như model).
Mọi công cụ bạn kết nối và dữ liệu trên máy (Jira, Git, Slack, Notion, email, cơ sở dữ liệu, file và thư mục) chỉ được dùng ngay trên máy bạn, không gửi về server.
Skill: các skill tự tạo trong ~/.agents-holding/skills/public sẽ được tự động thu thập (đã lọc thông tin cá nhân) để làm thư viện chung. Muốn giữ riêng: holding skill set <tên> private. Thư mục history/, assets/ và file cá nhân không bao giờ được thu thập.
N
else cat <<'N'
Privacy: we don't take your information. We only record usage habits: the hours you usually work, whether you use chat or comments, and how you configure your tools (such as models).
Every tool you connect and all data on your machine (Jira, Git, Slack, Notion, email, databases, files and folders) are used only on your machine and never sent to our server.
Skills: custom skills in ~/.agents-holding/skills/public are collected automatically (personal info filtered out) for the shared library. To keep one private: holding skill set <name> private. history/, assets/ and personal files are never collected.
N
fi; }
[ "${1:-}" = "--print-notice" ] && { ah_notice; exit 0; }
if kc "$KSVC" >/dev/null && [ "${AH_REPLACE_KEY:-0}" != 1 ]; then say "A key is already in the Keychain ($KSVC). To replace it, rerun with AH_REPLACE_KEY=1."
else
  ah_notice
  ch="${AH_KEY_CHOICE:-}"
  if [ -z "$ch" ] && ! ah_menu ch 1 "Choose:" "Generate key   (new Free key for this machine)" "Import key     (enter an existing key)"; then
    echo "  1) Generate key   (new Free key for this machine)"; echo "  2) Import key     (enter an existing key)"
    read -r -p "Choose 1 or 2: " ch < /dev/tty; fi
  case "$ch" in
    1|g|generate) b="$(osascript -l JavaScript -e 'function run(a){return JSON.stringify({device:a[0],device_name:a[1],lang:a[2]})}' "$(kc "$DSVC")" "$( (scutil --get LocalHostName 2>/dev/null || hostname -s) | LC_ALL=C tr -cd 'A-Za-z0-9 ._-' | cut -c1-60)" "$LANGH")"
      r="$(curl -sS --max-time 45 -X POST "$MCP_URL/free-signup" -H "Content-Type: application/json" -H "X-AH-Lang: $LANGH" --data-binary "$b")" || die "MCP server unreachable, try again"
      k="$(osascript -l JavaScript -e 'function run(a){const j=JSON.parse(a[0]);return j.ok?"OK "+j.key:"ERR "+(j.message||"failed")}' "$r")"; r=""
      case "$k" in "OK "*) security add-generic-password -U -s "$KSVC" -a "$USER" -l "agents-holding license" -w "${k#OK }" || die "could not store the key"; k=""; say "New Free key generated and stored in the Keychain (not shown).";;
        *) die "${k#ERR }";; esac ;;
    2|i|import) say "Paste your key (ah_live_...) at the hidden prompt, then again to confirm:"
      security add-generic-password -U -s "$KSVC" -a "$USER" -l "agents-holding license" -w < /dev/tty || die "could not store the key" ;;
    *) die "choose 1 (Generate key) or 2 (Import key)" ;; esac
fi
export AGENTS_HOLDING_KEY="$(kc "$KSVC")" AGENTS_HOLDING_DEVICE="$(kc "$DSVC")"
export AGENTS_HOLDING_DEVICE_NAME="$( (scutil --get LocalHostName 2>/dev/null || hostname -s) | LC_ALL=C tr -cd 'A-Za-z0-9 ._-' | cut -c1-60)"
say "This machine: ${AGENTS_HOLDING_DEVICE_NAME:-mac} (device ${AGENTS_HOLDING_DEVICE:0:12}…)"

# 3. check the key against the server (key via curl config on stdin, never on the command line)
code=$( { printf 'header = "Authorization: Bearer %s"\nheader = "X-AH-Device: %s"\nheader = "X-AH-Device-Name: %s"\n' "$AGENTS_HOLDING_KEY" "$AGENTS_HOLDING_DEVICE" "$AGENTS_HOLDING_DEVICE_NAME"; } |
  curl -s -o /tmp/ah-connect.$$ -w '%{http_code}' -K - -X POST "$MCP_URL" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"connect.sh","version":"1"}}}' || true)
msg="$(sed -n 's/.*"message":"\([^"]*\)".*/\1/p' /tmp/ah-connect.$$ 2>/dev/null | head -1)"; rm -f /tmp/ah-connect.$$
case "$code" in
  200) say "Key accepted; this machine is now bound to it" ;;
  403) die "${msg:-This key is bound to another machine.} " ;;
  401) die "The server rejected the key. Fix it: security delete-generic-password -s $KSVC, then rerun this command." ;;
  *) warn "Server answered $code (${msg:-no message}); continuing with the setup" ;;
esac

# 4. agents
has() { command -v "$1" >/dev/null || { [ "$1" = grok ] && [ -x "$HOME/.grok/bin/grok" ]; }; }
AGENTS="${AH_AGENTS:-}"; if [ -z "$AGENTS" ]; then for a in grok claude codex; do has $a && AGENTS="$AGENTS,$a"; done; AGENTS="${AGENTS#,}"; fi
[ -n "$AGENTS" ] || { AGENTS=grok; warn "No agent CLI found; configuring Grok anyway (~/.grok/config.toml)"; }
HDR='headers = { "Authorization" = "Bearer ${AGENTS_HOLDING_KEY}", "X-AH-Device" = "${AGENTS_HOLDING_DEVICE}", "X-AH-Device-Name" = "${AGENTS_HOLDING_DEVICE_NAME}" }'
IFS=, read -ra LIST <<<"$AGENTS"
for a in "${LIST[@]}"; do case "$a" in
  grok) GC="$HOME/.grok/config.toml"; mkdir -p "$HOME/.grok"; touch "$GC"
    if grep -qs '^\[mcp_servers.agents-holding\]' "$GC"; then
      cp "$GC" "$GC.bak-ah"   # replace only this server's headers line (adds the device header to old setups)
      awk -v h="$HDR" 'BEGIN{s=0;done=0} /^\[/{ if(s&&!done){print h;done=1} s=($0=="[mcp_servers.agents-holding]") } s&&/^headers[ ]*=/{ if(!done){print h;done=1}; next } {print} END{ if(s&&!done) print h }' "$GC.bak-ah" > "$GC"
      say "Grok: updated agents-holding in $GC (backup $GC.bak-ah)"
    else printf '\n[mcp_servers.agents-holding]\ntype = "http"\nurl = "%s"\nenabled = true\nstartup_timeout_sec = 60\n%s\n' "$MCP_URL" "$HDR" >> "$GC"; say "Grok: added agents-holding to $GC"; fi ;;
  claude) has claude || { warn "claude not found, skipped"; continue; }
    claude mcp remove --scope user agents-holding >/dev/null 2>&1 || true
    claude mcp add --transport http --scope user agents-holding "$MCP_URL" --header 'Authorization: Bearer ${AGENTS_HOLDING_KEY}' --header 'X-AH-Device: ${AGENTS_HOLDING_DEVICE}' >/dev/null \
      && say "Claude Code: added agents-holding (user scope, key from env)" || warn "claude mcp add failed" ;;
  codex) has codex || { warn "codex not found, skipped"; continue; }
    CC="$HOME/.codex/config.toml"; mkdir -p "$HOME/.codex"; touch "$CC"
    HELPER_DIR="$HOME/.agents-holding"; mkdir -p "$HELPER_DIR"
    HELPER="$HELPER_DIR/codex-mcp-headers.sh"
    curl -fsSL "https://raw.githubusercontent.com/jokerphuongnam/agents-holding-free/${AH_BRANCH:-main}/full/client/scripts/codex-mcp-headers.sh" -o "$HELPER" || { warn "could not download Codex Keychain header helper"; continue; }
    chmod 700 "$HELPER"
    TMP="$CC.ah-tmp"; awk 'BEGIN{s=0} /^\[/{if(s) s=0} !s {if($0=="[mcp_servers.agents-holding]"){s=1;next} print}' "$CC" > "$TMP"
    printf '\n[mcp_servers.agents-holding]\nurl = "%s"\nhttp_headers_helper = "bash %s"\n' "$MCP_URL" "$HELPER" >> "$TMP"
    mv "$TMP" "$CC"; say "Codex: configured remote MCP with Keychain header helper in $CC" ;;
  *) warn "unknown agent '$a' (grok|claude|codex)";; esac; done

# 5. shell profile: load key + device from the Keychain in every new shell (idempotent)
PROFILE="$HOME/.zshrc"; [ "${SHELL##*/}" = bash ] && PROFILE="$HOME/.bashrc"; touch "$PROFILE"
add() { grep -qsF "$1" "$PROFILE" || printf '%s\n' "$2" >> "$PROFILE"; }
grep -qsF '# agents-holding' "$PROFILE" || printf '\n# agents-holding (MCP headers; key + device id stay in the Keychain)\n' >> "$PROFILE"
add 'AGENTS_HOLDING_KEY=' 'export AGENTS_HOLDING_KEY="$(security find-generic-password -s agents-holding-license -a "$USER" -w 2>/dev/null)"'
add 'AGENTS_HOLDING_DEVICE=' 'export AGENTS_HOLDING_DEVICE="$(security find-generic-password -s agents-holding-device -a "$USER" -w 2>/dev/null)"'
add 'AGENTS_HOLDING_DEVICE_NAME=' "export AGENTS_HOLDING_DEVICE_NAME=\"$AGENTS_HOLDING_DEVICE_NAME\""
say "Shell profile: $PROFILE loads the key and device id from the Keychain"

# 6. Grok slash commands: Grok does not list MCP prompts, it loads ~/.grok/commands/*.md -> sync them (refreshed on every run)
if [[ ",$AGENTS," == *",grok,"* ]]; then
  SYNC="${AH_SRC:+$AH_SRC/full/client/scripts/sync-commands.sh}"
  if [ -z "$SYNC" ]; then SYNC="$(mktemp)"; curl -fsSL "https://raw.githubusercontent.com/jokerphuongnam/agents-holding-free/${AH_BRANCH:-main}/full/client/scripts/sync-commands.sh" -o "$SYNC"; fi
  bash "$SYNC" ${AH_OWNER:+--owner} && say "Grok slash commands synced into ~/.grok/commands (refresh: rerun this, or holding setup sync)" || warn "could not sync slash commands"
fi

# 6b. health check
GROK="$(command -v grok || echo "$HOME/.grok/bin/grok")"
if [ -z "${AH_NO_DOCTOR:-}" ] && [ -x "$GROK" ] && [[ ",$AGENTS," == *",grok,"* ]]; then
  out="$(cd "$HOME" && "$GROK" mcp doctor agents-holding 2>&1 || true)"
  if printf '%s' "$out" | grep -q 'handshake OK'; then say "OK  grok mcp doctor agents-holding: $(printf '%s' "$out" | grep -Eo '[0-9]+ tools discovered' | head -1)"
  else printf '%s\n' "$out" | tail -8; die "grok mcp doctor agents-holding is not healthy (see above)"; fi
fi
printf '\nDone. Open a NEW terminal (or: source %s), then in your repo run: grok   and type /help\n' "$PROFILE"
