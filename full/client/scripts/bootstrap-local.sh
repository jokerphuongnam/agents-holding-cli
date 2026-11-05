#!/usr/bin/env bash
# Idempotent local client bootstrap (called by the agent after MCP OAuth, with user approval).
# Installs: ~/.agents-holding (scripts), holding on PATH, slash-command sync, Keychain device id.
# Does NOT install or start the Jira Listener (that happens lazily on first Jira need).
set -euo pipefail
DEST="${AH_INSTALL_DIR:-$HOME/.agents-holding}"
REPO_URL="${AH_FREE_REPO:-https://github.com/jokerphuongnam/agents-holding-free.git}"
SRC="${AH_FREE_SRC:-$HOME/.agents-holding-src}"
progress() { printf '[bootstrap %s] %s\n' "$1" "$2"; }

progress 1/5 "client scripts -> $DEST"
mkdir -p "$HOME/.config/agents-holding" "$HOME/.local/bin"
if [ -d "$SRC/.git" ]; then
  git -C "$SRC" fetch -q --depth 1 origin main 2>/dev/null || true
  git -C "$SRC" checkout -q -f origin/main 2>/dev/null || git -C "$SRC" pull -q --ff-only 2>/dev/null || true
else
  rm -rf "$SRC"
  git clone -q --depth 1 --branch main "$REPO_URL" "$SRC"
fi
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
    # -T "" allows this app; never prompt in agent bootstrap (AH_NONINTERACTIVE)
    if ! security add-generic-password -U -T "" -s agents-holding-device -a "$USER" -w "$did" >/dev/null 2>&1; then
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

progress 4/5 "slash commands + hooks"
if [ -x "$DEST/scripts/sync-commands.sh" ]; then
  bash "$DEST/scripts/sync-commands.sh" 2>&1 | tail -3 | sed 's/^/[bootstrap 4\/5] /' || true
else
  progress 4/5 "sync-commands.sh missing (agent should call setup_commands)"
fi

progress 5/5 "done (Jira Listener NOT installed — will set up on first Jira use)"
printf 'OK bootstrap complete. VERSION=%s holding=%s\n' "$(cat "$DEST/scripts/VERSION" 2>/dev/null || echo '?')" "$(command -v holding 2>/dev/null || echo "$HOME/.local/bin/holding")"
