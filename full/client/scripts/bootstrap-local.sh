#!/usr/bin/env bash
# Idempotent local client bootstrap (called by the agent after MCP OAuth, with user approval).
# Installs: ~/.agents-holding (scripts), holding on PATH, slash-command sync, Keychain device id.
# Does NOT install or start the Jira Listener (that happens lazily on first Jira need).
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
DEST="${AH_INSTALL_DIR:-$HOME/.agents-holding}"
REPO_URL="${AH_FREE_REPO:-https://github.com/jokerphuongnam/agents-holding-cli.git}"
SRC="${AH_FREE_SRC:-$HOME/.agents-holding-src}"
progress() { printf '[bootstrap %s] %s\n' "$1" "$2"; }

progress 1/5 "published client artifact -> $DEST"
mkdir -p "$HOME/.config/agents-holding" "$HOME/.local/bin"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/ah-bootstrap.XXXXXX")"; trap 'rm -rf "$tmp"' EXIT
endpoint="https://api.github.com/repos/jokerphuongnam/agents-holding-cli/releases/latest"
asset_url="$(curl -fsSL -H 'Accept: application/vnd.github+json' "$endpoint" | awk -F'"' '$2=="browser_download_url" && $4 ~ /agents-holding-cli-.*\.tar\.gz$/ {print $4; exit}')"
[ -n "$asset_url" ] || { echo "published agents-holding-cli release artifact not found" >&2; exit 1; }
curl -fsSL "$asset_url" -o "$tmp/client.tar.gz"
mkdir -p "$tmp/src" && tar xzf "$tmp/client.tar.gz" -C "$tmp/src"
SRC="$tmp/src"
if [ ! -d "$SRC/full/client/scripts" ]; then
  SRC="$(find "$tmp/src" -type d -path '*/full/client/scripts' -print -quit | sed 's#/full/client/scripts$##')"
fi
[ -d "$SRC/full/client/scripts" ] || { echo "published artifact is missing full/client/scripts" >&2; exit 1; }
mkdir -p "$DEST"
rsync -a --delete --exclude .git "$SRC/full/client/scripts/" "$DEST/scripts/" 2>/dev/null \
  || { mkdir -p "$DEST/scripts"; cp -R "$SRC/full/client/scripts/." "$DEST/scripts/"; }
chmod -R u+rwX "$DEST/scripts"
chmod a+x "$DEST/scripts/holding" "$DEST/scripts/"*.sh 2>/dev/null || true

progress 2/5 "holding on PATH (~/.local/bin)"
# shellcheck source=/dev/null
ah_ensure() {
  local bin="$HOME/.local/bin" src="$DEST/scripts/holding" profile line
  mkdir -p "$bin"; [ -x "$src" ] && ln -sfn "$src" "$bin/holding"
  profile="$HOME/.zshrc"; [ "${SHELL##*/}" = bash ] && profile="$HOME/.bashrc"; touch "$profile"
  line='export PATH="$HOME/.local/bin:$PATH"'
  grep -qsF '.local/bin' "$profile" || printf '\n# agents-holding: put `holding` on PATH\n%s\n' "$line" >> "$profile"
  case ":$PATH:" in *":$bin:"*) ;; *) export PATH="$bin:$PATH";; esac
}
ah_ensure
command -v holding >/dev/null && progress 2/5 "holding -> $(command -v holding)" || progress 2/5 "holding -> $HOME/.local/bin/holding (open a new shell)"

progress 3/5 "device id in Keychain (no secrets printed)"
if [ "$(uname -s)" = Darwin ] && [ -z "${AH_SKIP_KEYCHAIN:-}" ]; then
  if ! security find-generic-password -s agents-holding-device -a "$USER" -w >/dev/null 2>&1; then
    uuid="$(ioreg -rd1 -c IOPlatformExpertDevice 2>/dev/null | awk -F'"' '/IOPlatformUUID/{print $4}')"
    did="mac-$(printf 'agents-holding:%s' "${uuid:-unknown}" | shasum -a 256 | cut -c1-32)"
    # default ACL trusts /usr/bin/security so later reads never prompt in agent bootstrap (AH_NONINTERACTIVE)
    if ! security add-generic-password -U -s agents-holding-device -a "$USER" -w "$did" >/dev/null 2>&1; then
      progress 3/5 "Keychain write skipped (locked or denied); OAuth/device bind will retry later"
    else
      progress 3/5 "device id ready"
    fi
  else
    progress 3/5 "device id ready"
  fi
else
  progress 3/5 "skipped (non-macOS or AH_SKIP_KEYCHAIN)"
fi

progress 4/5 "pair this Mac with your agent session (no key shown)"
MCP_URL="${AH_MCP_URL:-https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp}"
if [ -n "${AH_PAIR_CODE:-}" ] && [ "$(uname -s)" = Darwin ] && ! security find-generic-password -s "${AH_KC_LICENSE:-agents-holding-license}" -a "$USER" -w >/dev/null 2>&1; then
  resp="$(curl -fsS --retry 2 -X POST "${MCP_URL%/}/pair" -H "Content-Type: application/json" --data "{\"code\":\"$AH_PAIR_CODE\"}" 2>/dev/null || true)"
  tok="$(printf '%s' "$resp" | sed -n 's/.*"token" *: *"\(aho_at_[0-9a-f]*\)".*/\1/p')"
  if [ -n "$tok" ] && security add-generic-password -U -s "${AH_KC_LICENSE:-agents-holding-license}" -a "$USER" -w "$tok" >/dev/null 2>&1; then progress 4/5 "paired (token in Keychain)"
  else progress 4/5 "pairing failed (code expired or used): ask your agent to run install again"; fi
else progress 4/5 "already paired or no pairing code (skipped)"; fi

progress 4/5 "sync agent commands and local shortcuts"
SYNC=(); [ -d "$HOME/.claude" ] && SYNC+=(--claude)
# Codex uses its shell escape (`!holding`) for the zero-model path; generated prompt files still invoke the model.
[ -d "$HOME/.codex" ] && SYNC+=(--dir "$HOME/.grok/commands")
if [ -x "$DEST/scripts/sync-commands.sh" ]; then
  bash "$DEST/scripts/sync-commands.sh" ${SYNC[@]+"${SYNC[@]}"} 2>&1 | tail -5 | sed 's/^/[bootstrap 4\/5] /' || true
else
  progress 4/5 "sync-commands.sh missing (agent should call setup_commands)"
fi

# first CLI call reports this client's version to the server (turns off the install notice in chat)
"$DEST/scripts/holding" key show >/dev/null 2>&1 && progress 5/5 "server sees this client" || true
progress 5/5 "done (Jira Listener NOT installed — will set up on first Jira use)"
printf 'OK bootstrap complete. VERSION=%s holding=%s\n' "$(cat "$DEST/scripts/VERSION" 2>/dev/null || echo '?')" "$(command -v holding 2>/dev/null || echo "$HOME/.local/bin/holding")"
