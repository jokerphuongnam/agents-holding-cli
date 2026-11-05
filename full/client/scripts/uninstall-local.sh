#!/usr/bin/env bash
# Remove the local agents-holding client (CLI + hooks + slash command files).
# Order matters: detach hooks BEFORE deleting scripts so Grok/Claude/Codex never
# hit "bash: .../ah-hook.sh: No such file or directory" (exit 127).
# Keeps MCP OAuth credentials (~/.grok/mcp_credentials.json) and Keychain license/device.
set -euo pipefail
HOME="${HOME:-$(eval echo "~$(id -un)")}"
MARK='<!-- synced by agents-holding (holding setup sync); edits are overwritten -->'

echo "[uninstall 1/4] remove UserPromptSubmit hooks (before deleting scripts)"
rm -f "$HOME/.grok/hooks/agents-holding.json"
# Claude: strip only ah-hook entries
if [ -f "$HOME/.claude/settings.json" ] && command -v node >/dev/null; then
  node -e 'const fs=require("fs"),p=process.argv[1];let j;try{j=JSON.parse(fs.readFileSync(p,"utf8"))}catch{process.exit(0)}
    if(!j.hooks||!j.hooks.UserPromptSubmit)process.exit(0);
    j.hooks.UserPromptSubmit=(j.hooks.UserPromptSubmit||[]).filter(h=>!JSON.stringify(h).includes("ah-hook"));
    if(!j.hooks.UserPromptSubmit.length)delete j.hooks.UserPromptSubmit;
    if(j.hooks&&!Object.keys(j.hooks).length)delete j.hooks;
    fs.writeFileSync(p,JSON.stringify(j,null,2)+"\n")' "$HOME/.claude/settings.json" || true
fi
if [ -f "$HOME/.codex/hooks.json" ] && command -v node >/dev/null; then
  node -e 'const fs=require("fs"),p=process.argv[1];let j;try{j=JSON.parse(fs.readFileSync(p,"utf8"))}catch{process.exit(0)}
    if(!j.hooks||!j.hooks.UserPromptSubmit)process.exit(0);
    j.hooks.UserPromptSubmit=(j.hooks.UserPromptSubmit||[]).filter(h=>!JSON.stringify(h).includes("ah-hook"));
    if(!j.hooks.UserPromptSubmit.length)delete j.hooks.UserPromptSubmit;
    if(j.hooks&&!Object.keys(j.hooks).length)delete j.hooks;
    fs.writeFileSync(p,JSON.stringify(j,null,2)+"\n")' "$HOME/.codex/hooks.json" || true
fi

echo "[uninstall 2/4] remove synced slash command files"
for d in "$HOME/.grok/commands" "$HOME/.claude/commands" "$HOME/.codex/prompts" "$HOME/.codex/commands"; do
  [ -d "$d" ] || continue
  for f in "$d"/*.md; do [ -e "$f" ] || continue; grep -qF "$MARK" "$f" 2>/dev/null && rm -f "$f" || true; done
done

echo "[uninstall 3/4] remove holding symlink + client files"
rm -f "$HOME/.local/bin/holding"
rm -rf "$HOME/.agents-holding" "$HOME/.agents-holding-src" "$HOME/.agents-holding/lite" 2>/dev/null || true
# lite may live under agents-holding; also clear orphan lite path
rm -rf "$HOME/.agents-holding/lite" 2>/dev/null || true

echo "[uninstall 4/4] done (MCP OAuth + Keychain license/device kept). Start a new agent session so hooks reload."
echo "OK uninstall-local complete"
