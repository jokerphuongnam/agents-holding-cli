#!/usr/bin/env bash
# holding update [--check] [--yes]: safe, idempotent client update.
#  1) pull the client scripts (git fast-forward only; refuses on local edits, never force)
#  2) regenerate native agent configs + sandbox profiles (policy cache sync per staff)
#  3) re-sync slash commands   4) restart the Jira Listener if it is installed
# --check: only compare the local build with the server's required build; outdated -> arrow menu (AH_AUTO_UPDATE=1 = update without asking).
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; ver() { cat "$here/VERSION" 2>/dev/null || echo 0; }
if [ "${1:-}" = "--check" ]; then
  stamp="$HOME/.config/agents-holding/cache/update-check"; mkdir -p "$(dirname "$stamp")"
  [ -f "$stamp" ] && [ $(( $(date +%s) - $(stat -f %m "$stamp" 2>/dev/null || stat -c %Y "$stamp" 2>/dev/null || echo 0) )) -lt 86400 ] && exit 0
  touch "$stamp"
  req="$(bash "$here/ah-cli.sh" client version 2>/dev/null | sed -n 's/.*required[^0-9]*\([0-9]\{8\}\).*/\1/p' | head -1)"
  [ -n "$req" ] && [ "$(ver)" -lt "$req" ] 2>/dev/null || exit 0
  echo "agents-holding client $(ver) is older than required $req."
  if [ "${AH_AUTO_UPDATE:-}" = 1 ]; then exec bash "$here/update.sh" --yes; fi
  [ -t 0 ] || { echo "Run: holding update"; exit 0; }
  pick="$(node -e 'import("'"$here"'/menu.mjs").then(async m=>{const i=await m.select("Update now?",["Update now","Later"]);console.log(i)}).catch(()=>console.log(1))')"
  [ "$pick" = 0 ] && exec bash "$here/update.sh" --yes; exit 0
fi
before="$(ver)"; root="$(git -C "$here" rev-parse --show-toplevel 2>/dev/null || true)"
echo "1/4 client scripts ($before)"
if [ -n "$root" ]; then
  if [ -n "$(git -C "$root" status --porcelain -- "$here" 2>/dev/null)" ]; then echo "   local edits in $here: not pulling (commit or stash them, then rerun)";
  else git -C "$root" pull --ff-only -q 2>&1 | sed 's/^/   /' || echo "   pull failed (network?); continuing with the current scripts"; fi
else echo "   $here is not a git checkout: reinstall from the package to update the scripts"; fi
echo "   now $(ver)"
echo "2/4 native agent configs + sandbox profiles"
for co in $(ls "$HOME/.config/agents-holding/state" 2>/dev/null); do
  for role in $(node -e 'try{const c=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(Object.keys(c.staff||{}).join(" "))}catch{}' "$HOME/.config/agents-holding/state/$co/policy.json" 2>/dev/null); do
    AH_COMPANY="$co" node "$here/policy.mjs" sync "$role" --company "$co" >/dev/null 2>&1 && echo "   $co/$role synced" || echo "   $co/$role: sync skipped (offline?)"
  done
done
echo "   (configs are also regenerated on every launch)"
echo "3/4 slash commands"; bash "$here/sync-commands.sh" 2>&1 | tail -1 | sed 's/^/   /'
echo "4/4 Jira Listener"
lbl=com.agentsholding.jira-listener
if launchctl print "gui/$(id -u)/$lbl" >/dev/null 2>&1; then launchctl kickstart -k "gui/$(id -u)/$lbl" && echo "   restarted"; 
elif command -v systemctl >/dev/null && systemctl --user is-active -q agents-holding-listener 2>/dev/null; then systemctl --user restart agents-holding-listener && echo "   restarted";
else echo "   not installed as a service (start: holding jira listen)"; fi
echo "Done: client $before -> $(ver)"
