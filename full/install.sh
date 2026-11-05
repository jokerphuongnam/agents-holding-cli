#!/usr/bin/env bash
# agents-holding (full version) OPTIONAL client installer for macOS: only needed for the background Jira listener/runner.
# For chat use you don't need it: add the MCP URL to your agent and sign in with your license key (see full/SETUP.md).
#   curl -fsSL https://raw.githubusercontent.com/jokerphuongnam/agents-holding-free/main/full/install.sh | bash -s -- [--agent grok,claude,codex]
# Installs the client into ~/.agents-holding, links `holding` into ~/.local/bin, stores your license key in the macOS Keychain
# (service agents-holding-license; typed at a hidden prompt, never written to a file) for the listener, and optionally adds the
# MCP server URL to the agents you pick (no key in any config: they sign in with OAuth; Grok falls back to an env header).
# Options: --agent LIST (grok,claude,codex | all | none; default: the ones installed), --no-key. Env: AH_INSTALL_DIR, AH_SRC=<checkout>.
set -euo pipefail
REPO="jokerphuongnam/agents-holding-free"; BRANCH="${AH_BRANCH:-main}"
MCP_URL="${AH_MCP_URL:-https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp}"
DEST="${AH_INSTALL_DIR:-$HOME/.agents-holding}"; BIN="$HOME/.local/bin"; SVC="agents-holding-license"
say() { printf '\033[1;32m==>\033[0m %s\n' "$*"; }; warn() { printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; }

# Ensure `holding` is on PATH: symlink into ~/.local/bin + idempotent PATH line in the shell profile.
ah_ensure_holding_path() {
  local bin="$HOME/.local/bin" dest="${AH_INSTALL_DIR:-$HOME/.agents-holding}" src profile line
  mkdir -p "$bin"
  if [ -x "$dest/scripts/holding" ]; then src="$dest/scripts/holding"
  elif [ -n "${1:-}" ] && [ -x "$1" ]; then src="$1"
  else src=""; fi
  if [ -n "$src" ]; then ln -sfn "$src" "$bin/holding"; fi
  profile="$HOME/.zshrc"; [ "${SHELL##*/}" = bash ] && profile="$HOME/.bashrc"; touch "$profile"
  line='export PATH="$HOME/.local/bin:$PATH"'
  if ! grep -qsF '.local/bin' "$profile"; then
    printf '\n# agents-holding: put `holding` on PATH\n%s\n' "$line" >> "$profile"
  fi
  case ":$PATH:" in *":$bin:"*) ;; *) export PATH="$bin:$PATH";; esac
}

AGENTS=""; NOKEY=""
while [ $# -gt 0 ]; do case "$1" in --agent) AGENTS="$2"; shift 2;; --agent=*) AGENTS="${1#*=}"; shift;; --no-key) NOKEY=1; shift;; *) warn "unknown option $1"; exit 2;; esac; done
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
has() { command -v "$1" >/dev/null || { [ "$1" = grok ] && [ -x "$HOME/.grok/bin/grok" ]; }; }
AGENTS_GIVEN="$AGENTS"
if [ -z "$AGENTS" ]; then for a in grok claude codex; do has $a && AGENTS="$AGENTS,$a"; done; AGENTS="${AGENTS#,}"; fi
if [ -z "$AGENTS_GIVEN" ] && ah_menu ac 1 "Add the agents-holding MCP server to which agents?" "Installed ones (${AGENTS:-none found})" "All (grok, claude, codex)" "None (listener only)"; then
  case "$ac" in 2) AGENTS=all;; 3) AGENTS=none;; esac; fi
[ "$AGENTS" = all ] && AGENTS="grok,claude,codex"; [ "$AGENTS" = none ] && AGENTS=""

[ "$(uname)" = Darwin ] || { warn "The listener needs macOS (Keychain, launchd). Other systems: just add the MCP URL (SETUP.md)."; exit 1; }
command -v node >/dev/null && [ "$(node -p 'typeof WebSocket' 2>/dev/null)" = function ] || warn "Node.js 22+ is needed for the listener: brew install node"

say "Installing the client into $DEST"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
if [ -n "${AH_SRC:-}" ]; then cp -R "$AH_SRC/full/client" "$tmp/client"
else curl -fsSL "https://codeload.github.com/$REPO/tar.gz/refs/heads/$BRANCH" | tar xz -C "$tmp" && mv "$tmp"/agents-holding-free-*/full/client "$tmp/client"; fi
mkdir -p "$DEST" && rm -rf "$DEST/scripts" && cp -R "$tmp/client/scripts" "$DEST/scripts"
chmod +x "$DEST"/scripts/holding "$DEST"/scripts/*.sh "$DEST"/scripts/launchd/*.sh
mkdir -p "$BIN" && ln -sfn "$DEST/scripts/holding" "$BIN/holding"
ah_ensure_holding_path
say "holding CLI: $BIN/holding (on PATH; open a new terminal if holding is not found)"
mkdir -p "$HOME/.config/agents-holding" && chmod 700 "$HOME/.config/agents-holding"
[ -f "$HOME/.config/agents-holding/license.txt" ] && warn "Old plaintext ~/.config/agents-holding/license.txt found; it is no longer used. Delete it after this install: rm ~/.config/agents-holding/license.txt"

if [ -z "$NOKEY" ]; then
  if security find-generic-password -s "$SVC" -a "$USER" >/dev/null 2>&1; then say "License key already in the Keychain ($SVC)"
  else
    say "Paste your license key (ah_live_...) twice at the hidden Keychain prompt:"
    security add-generic-password -U -s "$SVC" -a "$USER" -l "agents-holding license" -w < /dev/tty
  fi
  # 1 key = 1 machine: per-machine device id (sha256 of the hardware UUID) in the Keychain, sent as X-AH-Device
  if ! security find-generic-password -s agents-holding-device -a "$USER" >/dev/null 2>&1; then
    hw="$(ioreg -rd1 -c IOPlatformExpertDevice | awk -F'"' '/IOPlatformUUID/{print $4}')"; [ -n "$hw" ] || hw="$(uuidgen)"
    security add-generic-password -U -s agents-holding-device -a "$USER" -l "agents-holding device id" -w "mac-$(printf 'agents-holding:%s' "$hw" | shasum -a 256 | cut -c1-32)"
  fi
  code=$( { printf 'header = "X-AH-Device: '; security find-generic-password -s agents-holding-device -a "$USER" -w | tr -d '\n'; printf '"\n'; printf 'header = "Authorization: Bearer '; security find-generic-password -s "$SVC" -a "$USER" -w | tr -d '\n'; printf '"\n'; } | curl -s -o /dev/null -w '%{http_code}' -K - \
    -X POST "$MCP_URL" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" --data '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' || true)
  [ "$code" = 200 ] && say "License key accepted by the server" || warn "The server answered $code for the stored key. Fix it: security add-generic-password -U -s $SVC -a \"\$USER\" -w"
fi

LIST=(); [ -n "$AGENTS" ] && IFS=, read -ra LIST <<<"$AGENTS"
for a in ${LIST[@]+"${LIST[@]}"}; do case "$a" in
  claude) has claude || { warn "claude not found, skipped"; continue; }
    if claude mcp get agents-holding >/dev/null 2>&1; then say "Claude Code already has agents-holding"
    else claude mcp add --transport http --scope user agents-holding "$MCP_URL" >/dev/null && say "Claude Code: added agents-holding (user scope). Run /mcp in claude to sign in with your key."; fi ;;
  codex) has codex || { warn "codex not found, skipped"; continue; }
    if codex mcp get agents-holding >/dev/null 2>&1; then say "Codex already has agents-holding"
    else codex mcp add agents-holding --url "$MCP_URL" < /dev/tty || warn "codex mcp add failed"; say "Codex: if no browser opened, run: codex mcp login agents-holding"; fi ;;
  grok) GC="$HOME/.grok/config.toml"; mkdir -p "$HOME/.grok"
    if grep -qs '^\[mcp_servers.agents-holding\]' "$GC"; then say "Grok already has agents-holding"
    else printf '\n[mcp_servers.agents-holding]\nurl = "%s"\nheaders = { "Authorization" = "Bearer ${AGENTS_HOLDING_KEY}", "X-AH-Device" = "${AGENTS_HOLDING_DEVICE}" }\n' "$MCP_URL" >> "$GC"; say "Grok: added agents-holding to $GC (key + device id from the Keychain via env)"; fi
    PROFILE="$HOME/.zshrc"; [ "${SHELL##*/}" = bash ] && PROFILE="$HOME/.bashrc"
    LINE='export AGENTS_HOLDING_KEY="$(security find-generic-password -s agents-holding-license -a "$USER" -w 2>/dev/null)"'
    grep -qsF 'agents-holding-license' "$PROFILE" || { printf '\n# agents-holding (Grok MCP header; key stays in the Keychain)\n%s\n' "$LINE" >> "$PROFILE"; say "Added the Keychain loader to $PROFILE"; }
    grep -qsF 'AGENTS_HOLDING_DEVICE=' "$PROFILE" || printf '%s\n' 'export AGENTS_HOLDING_DEVICE="$(security find-generic-password -s agents-holding-device -a "$USER" -w 2>/dev/null)"' >> "$PROFILE" ;;
  *) warn "unknown agent '$a' (grok|claude|codex)";; esac; done

case ",$AGENTS," in *,grok,*) bash "$DEST/scripts/sync-commands.sh" && say "Grok slash commands synced into ~/.grok/commands (refresh: holding setup sync)" || warn "holding setup sync failed; rerun it later";; esac

cat <<NEXT

Done. Next (guide: https://github.com/$REPO/blob/main/full/SETUP.md):
  1. In your repo, register it for the listener:  holding project add --jira-project <KEY> [--agent grok|claude|codex]
  2. Pick the CLI the listener runs (default grok):  holding company set agent claude     (or codex / grok)
  3. holding listener start --repo <repo>   then   holding doctor --repo <repo>
NEXT
