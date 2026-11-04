#!/usr/bin/env bash
# agents-holding (full version) client installer for macOS.
#   curl -fsSL https://raw.githubusercontent.com/jokerphuongnam/agents-holding-free/main/full/install.sh | bash
# Installs the small local client (listener + setup scripts) into ~/.agents-holding, links `holding` into
# ~/.local/bin, asks for your license key at a hidden prompt (stored in ~/.config/agents-holding/license.txt, 0600)
# and adds the agents-holding MCP server to Grok. All prompts, skills and workflow logic live on the server.
# Options (env): AH_KEY_FILE=<file with the key> (non-interactive), AH_NO_GROK=1 (skip Grok config),
#   AH_INSTALL_DIR (default ~/.agents-holding), AH_SRC=<local checkout of this repo> (install without downloading).
set -euo pipefail
REPO="jokerphuongnam/agents-holding-free"; BRANCH="${AH_BRANCH:-main}"
MCP_URL="${AH_MCP_URL:-https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp}"
DEST="${AH_INSTALL_DIR:-$HOME/.agents-holding}"; CFG="$HOME/.config/agents-holding"; BIN="$HOME/.local/bin"
say() { printf '\033[1;32m==>\033[0m %s\n' "$*"; }; warn() { printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; }

[ "$(uname)" = Darwin ] || warn "This client is built for macOS (Keychain, launchd). Other systems: MCP only, no listener."
command -v node >/dev/null && [ "$(node -p 'typeof WebSocket' 2>/dev/null)" = function ] || warn "Node.js 22+ is needed for the listener: brew install node"
command -v grok >/dev/null || [ -x "$HOME/.grok/bin/grok" ] || warn "Grok CLI not found: install it: curl -fsSL https://x.ai/cli/install.sh | bash, then run: grok login"

say "Installing the client into $DEST"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
if [ -n "${AH_SRC:-}" ]; then cp -R "$AH_SRC/full/client" "$tmp/client"
else curl -fsSL "https://codeload.github.com/$REPO/tar.gz/refs/heads/$BRANCH" | tar xz -C "$tmp" && mv "$tmp"/agents-holding-free-*/full/client "$tmp/client"; fi
mkdir -p "$DEST" && rm -rf "$DEST/scripts" && cp -R "$tmp/client/scripts" "$DEST/scripts"
chmod +x "$DEST"/scripts/holding "$DEST"/scripts/*.sh "$DEST"/scripts/launchd/*.sh
mkdir -p "$BIN" && ln -sf "$DEST/scripts/holding" "$BIN/holding"
case ":$PATH:" in *":$BIN:"*) ;; *) warn "Add $BIN to your PATH: echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.zshrc";; esac

mkdir -p "$CFG" && chmod 700 "$CFG"
if [ -s "$CFG/license.txt" ]; then say "License key already saved ($CFG/license.txt)"
else
  if [ -n "${AH_KEY_FILE:-}" ]; then KEY="$(tr -d ' \n' < "$AH_KEY_FILE")"
  else printf 'Paste your license key (starts with ah_live_, input hidden): ' > /dev/tty; IFS= read -rs KEY < /dev/tty; echo > /dev/tty; fi
  [[ "$KEY" == ah_live_* ]] || { warn "That doesn't look like a license key (ah_live_...). Re-run the installer."; exit 1; }
  (umask 077; printf '%s' "$KEY" > "$CFG/license.txt")
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$MCP_URL" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
    -K - <<<"header = \"Authorization: Bearer $KEY\"" --data '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' || true)
  unset KEY
  [ "$code" = 200 ] && say "License key accepted by the server" || warn "The server answered $code for this key; check it with the person who gave it to you."
fi

# Grok reads the key from the environment, so it is never written into a config file.
PROFILE="$HOME/.zshrc"; [ -n "${BASH_VERSION:-}" ] && [ "${SHELL##*/}" = bash ] && PROFILE="$HOME/.bashrc"
LINE='[ -f "$HOME/.config/agents-holding/license.txt" ] && export AGENTS_HOLDING_KEY="$(cat "$HOME/.config/agents-holding/license.txt")"'
grep -qsF 'agents-holding/license.txt' "$PROFILE" || { printf '\n# agents-holding\n%s\n' "$LINE" >> "$PROFILE"; say "Added AGENTS_HOLDING_KEY loader to $PROFILE"; }

if [ -z "${AH_NO_GROK:-}" ]; then
  GC="$HOME/.grok/config.toml"; mkdir -p "$HOME/.grok"
  if grep -qs '^\[mcp_servers.agents-holding\]' "$GC"; then say "Grok already has the agents-holding MCP server"
  else printf '\n[mcp_servers.agents-holding]\nurl = "%s"\nheaders = { "Authorization" = "Bearer ${AGENTS_HOLDING_KEY}" }\n' "$MCP_URL" >> "$GC"; say "Added agents-holding MCP server to $GC"; fi
fi

cat <<NEXT

Done. Next steps (full guide: https://github.com/$REPO/blob/main/full/SETUP.md):
  1. Open a new terminal (loads AGENTS_HOLDING_KEY), then: grok mcp doctor agents-holding
  2. In your repo: grok   then type  /holding-ceo set up a company for this repo
  3. /doctor            (checks every step)        holding doctor   (checks this Mac)
  4. Optional Jira:     /connect-jira <PROJECT KEY>, then holding listener on --repo <repo>
NEXT
