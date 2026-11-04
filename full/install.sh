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
AGENTS=""; NOKEY=""
while [ $# -gt 0 ]; do case "$1" in --agent) AGENTS="$2"; shift 2;; --agent=*) AGENTS="${1#*=}"; shift;; --no-key) NOKEY=1; shift;; *) warn "unknown option $1"; exit 2;; esac; done
has() { command -v "$1" >/dev/null || { [ "$1" = grok ] && [ -x "$HOME/.grok/bin/grok" ]; }; }
if [ -z "$AGENTS" ]; then for a in grok claude codex; do has $a && AGENTS="$AGENTS,$a"; done; AGENTS="${AGENTS#,}"; fi
[ "$AGENTS" = all ] && AGENTS="grok,claude,codex"; [ "$AGENTS" = none ] && AGENTS=""

[ "$(uname)" = Darwin ] || { warn "The listener needs macOS (Keychain, launchd). Other systems: just add the MCP URL (SETUP.md)."; exit 1; }
command -v node >/dev/null && [ "$(node -p 'typeof WebSocket' 2>/dev/null)" = function ] || warn "Node.js 22+ is needed for the listener: brew install node"

say "Installing the client into $DEST"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
if [ -n "${AH_SRC:-}" ]; then cp -R "$AH_SRC/full/client" "$tmp/client"
else curl -fsSL "https://codeload.github.com/$REPO/tar.gz/refs/heads/$BRANCH" | tar xz -C "$tmp" && mv "$tmp"/agents-holding-free-*/full/client "$tmp/client"; fi
mkdir -p "$DEST" && rm -rf "$DEST/scripts" && cp -R "$tmp/client/scripts" "$DEST/scripts"
chmod +x "$DEST"/scripts/holding "$DEST"/scripts/*.sh "$DEST"/scripts/launchd/*.sh
mkdir -p "$BIN" && ln -sf "$DEST/scripts/holding" "$BIN/holding"
case ":$PATH:" in *":$BIN:"*) ;; *) warn "Add $BIN to your PATH: echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.zshrc";; esac
mkdir -p "$HOME/.config/agents-holding" && chmod 700 "$HOME/.config/agents-holding"
[ -f "$HOME/.config/agents-holding/license.txt" ] && warn "Old plaintext ~/.config/agents-holding/license.txt found; it is no longer used. Delete it after this install: rm ~/.config/agents-holding/license.txt"

if [ -z "$NOKEY" ]; then
  if security find-generic-password -s "$SVC" -a "$USER" >/dev/null 2>&1; then say "License key already in the Keychain ($SVC)"
  else
    say "Paste your license key (ah_live_...) twice at the hidden Keychain prompt:"
    security add-generic-password -U -s "$SVC" -a "$USER" -l "agents-holding license" -w < /dev/tty
  fi
  code=$( { printf 'header = "Authorization: Bearer '; security find-generic-password -s "$SVC" -a "$USER" -w | tr -d '\n'; printf '"\n'; } | curl -s -o /dev/null -w '%{http_code}' -K - \
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
    else printf '\n[mcp_servers.agents-holding]\nurl = "%s"\nheaders = { "Authorization" = "Bearer ${AGENTS_HOLDING_KEY}" }\n' "$MCP_URL" >> "$GC"; say "Grok: added agents-holding to $GC (key from the Keychain via \$AGENTS_HOLDING_KEY)"; fi
    PROFILE="$HOME/.zshrc"; [ "${SHELL##*/}" = bash ] && PROFILE="$HOME/.bashrc"
    LINE='export AGENTS_HOLDING_KEY="$(security find-generic-password -s agents-holding-license -a "$USER" -w 2>/dev/null)"'
    grep -qsF 'agents-holding-license' "$PROFILE" || { printf '\n# agents-holding (Grok MCP header; key stays in the Keychain)\n%s\n' "$LINE" >> "$PROFILE"; say "Added the Keychain loader to $PROFILE"; } ;;
  *) warn "unknown agent '$a' (grok|claude|codex)";; esac; done

cat <<NEXT

Done. Next (guide: https://github.com/$REPO/blob/main/full/SETUP.md):
  1. In your repo, register it for the listener:  holding add-project --jira-project <KEY> [--agent grok|claude|codex]
  2. Pick the CLI the listener runs (default grok):  holding agent claude     (or codex / grok)
  3. holding listener on --repo <repo>   then   holding doctor --repo <repo>
NEXT
