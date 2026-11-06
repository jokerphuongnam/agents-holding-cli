#!/usr/bin/env bash
# holding update [--check] [--yes]: safe, idempotent client update.
#  1) refresh client scripts (git ff-only if a checkout; else re-download the free package)
#  2) regenerate native agent configs + sandbox profiles (policy cache sync per staff)
#  3) re-sync slash commands   4) restart the Jira Listener if it is installed
# --check: only compare the local build with the server's required build; outdated -> arrow menu (AH_AUTO_UPDATE=1 = update without asking).
# Version: YYYYMMDDNN (build NN that day). Old 8-digit YYYYMMDD = YYYYMMDD00 for compare.
set -uo pipefail

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

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
norm_ver() { local v="${1:-0}"; v="${v//[^0-9]/}"; [ ${#v} -eq 8 ] && v="${v}00"; echo "${v:-0}"; }
ver() { norm_ver "$(cat "$here/VERSION" 2>/dev/null || echo 0)"; }
ver_raw() { cat "$here/VERSION" 2>/dev/null || echo 0; }
behind() {
  # YYYYMMDDNN integer delta. Same-day builds → NN span (01→10 = 9). Cross-day can be large; callers may label it.
  local a b; a=$(norm_ver "$1"); b=$(norm_ver "$2"); echo $(( 10#$b - 10#$a ));
}
behind_label() {
  local n; n=$(behind "$1" "$2")
  if [ "$n" -le 0 ] 2>/dev/null; then echo ""
  elif [ "$n" -le 99 ] 2>/dev/null; then echo " ($n updates behind)"
  else echo " (newer build available)"
  fi
}

ah_refresh_package() {
  local dest="${AH_INSTALL_DIR:-$HOME/.agents-holding}" url tag tmp tags
  url="${AH_FREE_REPO:-https://github.com/jokerphuongnam/agents-holding-free.git}"
  if [ -n "${AH_VERSION:-}" ]; then
    tag="${AH_VERSION#v}"
    [[ "$tag" =~ ^[0-9]{10}$ ]] || { echo "   invalid AH_VERSION: $AH_VERSION (expected YYYYMMDDNN)" >&2; return 2; }
  else
    tags="$(git ls-remote --tags --refs "$url" 2>/dev/null | awk '{t=$2; sub("refs/tags/", "", t); if (t ~ /^v?[0-9]{10}$/) print substr(t,1,1)=="v" ? substr(t,2)"\t"t : t"\t"t}' | sort -k1,1V)"
    tag="$(printf '%s\n' "$tags" | tail -n 1 | cut -f2)"
    [ -n "$tag" ] || { echo "   no release tags found in $url (expected YYYYMMDDNN)" >&2; return 1; }
  fi
  echo "   resolved release tag: $tag"
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/ah-update.XXXXXX")"
  if ! git clone -q --depth 1 --branch "$tag" "$url" "$tmp/src" 2>/dev/null; then
    echo "   package download failed (network?); keeping current scripts" >&2
    rm -rf "$tmp"; return 1
  fi
  mkdir -p "$dest"
  rm -rf "$tmp/stage"; mkdir -p "$tmp/stage"
  cp -R "$tmp/src/full/client/scripts/." "$tmp/stage/"
  if command -v rsync >/dev/null; then rsync -a --delete "$tmp/stage/" "$dest/scripts/"
  else rm -rf "$dest/scripts"; mkdir -p "$dest/scripts"; cp -R "$tmp/stage/." "$dest/scripts/"; fi
  chmod -R a+rX "$dest/scripts" 2>/dev/null || true
  find "$dest/scripts" -type f \( -name '*.sh' -o -name 'holding' -o -name '*.mjs' \) -exec chmod a+x {} \; 2>/dev/null || true
  rm -rf "$tmp"
  here="$dest/scripts"
  return 0
}

if [ "${1:-}" = "--check" ]; then
  stamp="$HOME/.config/agents-holding/cache/update-check"; mkdir -p "$(dirname "$stamp")"
  [ -f "$stamp" ] && [ $(( $(date +%s) - $(stat -f %m "$stamp" 2>/dev/null || stat -c %Y "$stamp" 2>/dev/null || echo 0) )) -lt 86400 ] && exit 0
  touch "$stamp"
  req="$(bash "$here/ah-cli.sh" client version 2>/dev/null | sed -nE 's/.*required[^0-9]*([0-9]{8,10}).*/\1/p' | head -1)"
  [ -n "$req" ] || exit 0
  cur="$(ver)"; rn="$(norm_ver "$req")"
  [ "$cur" -lt "$rn" ] 2>/dev/null || exit 0
  echo "agents-holding client $(ver_raw) -> $req$(behind_label "$cur" "$rn")."
  if [ "${AH_AUTO_UPDATE:-}" = 1 ]; then exec bash "$here/update.sh" --yes; fi
  [ -t 0 ] || { echo "Run: holding update"; exit 0; }
  pick="$(node -e 'import("'"$here"'/menu.mjs").then(async m=>{const i=await m.select("Update now?",["Update now","Later"]);console.log(i)}).catch(()=>console.log(1))')"
  [ "$pick" = 0 ] && exec bash "$here/update.sh" --yes; exit 0
fi

before_raw="$(ver_raw)"; before="$(ver)"
root="$(git -C "$here" rev-parse --show-toplevel 2>/dev/null || true)"
echo "1/4 client scripts ($before_raw)"
if [ -n "$root" ] && [ -d "$root/.git" ] && git -C "$root" rev-parse --is-inside-work-tree >/dev/null 2>&1 \
   && [ "$(cd "$here/.." && pwd 2>/dev/null)" != "$(cd "${AH_INSTALL_DIR:-$HOME/.agents-holding}" && pwd 2>/dev/null)" ]; then
  # Dev checkout only (not the ~/.agents-holding package install)
  if [ -n "$(git -C "$root" status --porcelain -- "$here" 2>/dev/null)" ]; then echo "   local edits in $here: not pulling (commit or stash them, then rerun)";
  else git -C "$root" pull --ff-only -q 2>&1 | sed 's/^/   /' || echo "   pull failed (network?); continuing with the current scripts"; fi
else
  echo "   package install: downloading latest agents-holding-free (tag ${AH_VERSION:-latest})"
  ah_refresh_package || true
fi
echo "   now $(ver_raw)"

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
ah_ensure_holding_path "$here/holding"
after_raw="$(ver_raw)"; after="$(ver)"; n="$(behind "$before" "$after")"
if [ "$before" -eq "$after" ] 2>/dev/null; then
  echo "Done: client $after_raw already up to date  (holding on PATH: $(command -v holding 2>/dev/null || echo ~/.local/bin/holding))"
else
  echo "Done: client $before_raw -> $after_raw$(behind_label "$before" "$after")  (holding on PATH: $(command -v holding 2>/dev/null || echo ~/.local/bin/holding))"
fi
