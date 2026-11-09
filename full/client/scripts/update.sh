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
  local dest="${AH_INSTALL_DIR:-$HOME/.agents-holding}" url tag tmp endpoint asset_url
  url="${AH_FREE_REPO:-https://github.com/jokerphuongnam/agents-holding-cli.git}"
  if [ -n "${AH_VERSION:-}" ]; then
    tag="${AH_VERSION#v}"
    [[ "$tag" =~ ^[0-9]{10}$ ]] || { echo "   invalid AH_VERSION: $AH_VERSION (expected YYYYMMDDNN)" >&2; return 2; }
  else
    tag="latest"
  fi
  echo "   resolved published release: $tag"
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/ah-update.XXXXXX")"
  endpoint="https://api.github.com/repos/jokerphuongnam/agents-holding-cli/releases/latest"
  [ "$tag" != latest ] && endpoint="https://api.github.com/repos/jokerphuongnam/agents-holding-cli/releases/tags/$tag"
  asset_url="$(curl -fsSL -H 'Accept: application/vnd.github+json' "$endpoint" 2>/dev/null | awk -F'"' '$2=="browser_download_url" && $4 ~ /agents-holding-cli-.*\.tar\.gz$/ {print $4; exit}')" || true
  # Do not trust GitHub's `latest` pointer: older numeric releases may remain
  # marked latest. Always compare against the newest non-future tag when Git is
  # available, then download that exact release asset.
  if command -v git >/dev/null 2>&1; then
    today="$(date -u +%Y%m%d)"
    newest="$(git ls-remote --tags --refs "$url" 2>/dev/null | awk -F/ -v today="$today" '$NF ~ /^(v)?[0-9]{10}$/ {v=$NF; sub(/^v/,"",v); if (substr(v,1,8) <= today) print v}' | sort -n | tail -1)"
    if [ -n "$newest" ] && { [ "$tag" = latest ] || [ "$newest" -gt "${tag#v}" ] 2>/dev/null; }; then
      tag="$newest"
      asset_url="https://github.com/jokerphuongnam/agents-holding-cli/releases/download/$tag/agents-holding-cli-$tag.tar.gz"
      echo "   resolved newest non-future tag from Git: $tag"
    fi
  fi
  # GitHub's unauthenticated API is rate-limited. Resolve a published tag
  # directly instead of treating a 403 as "no release". Ignore future-dated
  # tags so a clock/build mistake cannot make clients jump into the future.
  if [ -z "$asset_url" ] && command -v git >/dev/null 2>&1; then
    today="$(date -u +%Y%m%d)"
    if [ "$tag" = latest ]; then
      tag="$(git ls-remote --tags --refs "$url" 2>/dev/null | awk -F/ -v today="$today" '$NF ~ /^(v)?[0-9]{10}$/ {v=$NF; sub(/^v/,"",v); if (substr(v,1,8) <= today) print v}' | sort -n | tail -1)"
      [ -n "$tag" ] && echo "   API unavailable; resolved tag directly: $tag"
    fi
    [ -n "$tag" ] && asset_url="https://github.com/jokerphuongnam/agents-holding-cli/releases/download/$tag/agents-holding-cli-$tag.tar.gz"
  fi
  [ -n "$asset_url" ] || { echo "   no published client artifact found; keeping current scripts" >&2; rm -rf "$tmp"; return 1; }
  if ! curl -fsSL "$asset_url" -o "$tmp/client.tar.gz"; then
    # Older releases used a v-prefixed tag and asset name; retain compatibility.
    compat="${asset_url/$tag/v$tag}"
    compat="${compat/agents-holding-cli-$tag.tar.gz/agents-holding-cli-v$tag.tar.gz}"
    curl -fsSL "$compat" -o "$tmp/client.tar.gz" || { echo "   package download failed; keeping current scripts" >&2; rm -rf "$tmp"; return 1; }
  fi
  mkdir -p "$tmp/src" && tar xzf "$tmp/client.tar.gz" -C "$tmp/src"
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
listener_was_active=0; listener_was_autostart=0; listener_repo=""
if command -v launchctl >/dev/null 2>&1; then
  lbl=com.agentsholding.jira-listener; domain="gui/$(id -u)"
  launchctl print "$domain/$lbl" >/dev/null 2>&1 && listener_was_active=1
  [ -f "$HOME/Library/LaunchAgents/$lbl.plist" ] && listener_was_autostart=1
  if [ "$listener_was_active" = 1 ] || [ "$listener_was_autostart" = 1 ]; then
    listener_repo="$(/usr/libexec/PlistBuddy -c 'Print :EnvironmentVariables:AH_REPO_DIR' "$HOME/Library/Application Support/agents-holding/$lbl.plist" 2>/dev/null || true)"
    echo "   listener active before update; stopping it for an atomic replace"
    # The update owns the stop/start window. Preserve the login plist so an
    # interrupted update cannot silently turn a previously enabled autostart off.
    bash "$here/launchd/listener.sh" stop --preserve-autostart >/dev/null 2>&1 || { echo "ERROR: could not stop the Jira Listener safely; update aborted" >&2; exit 1; }
  fi
fi
restore_listener() {
  [ "$listener_was_active" = 1 ] || return 0
  local script="$here/launchd/listener.sh"
  [ -x "$script" ] || script="${AH_INSTALL_DIR:-$HOME/.agents-holding}/scripts/launchd/listener.sh"
  echo "   restoring Jira Listener after update" >&2
  if ! bash "$script" start --repo "$listener_repo" >/dev/null 2>&1; then
    echo "ERROR: holding update could not restore a healthy Jira Listener" >&2
    return 1
  fi
  if [ "$listener_was_autostart" = 1 ]; then bash "$script" autostart on >/dev/null 2>&1 || return 1; fi
}
if [ "$listener_was_active" = 1 ]; then
  update_rc=0
  trap 'rc=$?; trap - EXIT; if [ "$rc" -ne 0 ]; then restore_listener || rc=1; fi; exit "$rc"' EXIT
fi
root="$(git -C "$here" rev-parse --show-toplevel 2>/dev/null || true)"
echo "1/4 client scripts ($before_raw)"
echo "   package install: downloading latest published agents-holding-cli release (${AH_VERSION:-latest})"
if ! ah_refresh_package; then
  echo "ERROR: client update failed; keeping client $before_raw. The published release must contain a downloadable agents-holding-cli-<version>.tar.gz artifact." >&2
  exit 1
fi
echo "   now $(ver_raw)"

# Keep an already-installed native Jira Listener aligned with the latest
# public release. The listener is optional; missing platform assets must not
# make the CLI update fail.
if [ -x "$HOME/.agents-holding/bin/agents-holding-listener" ] && [ -x "$here/install-rust-listener.sh" ]; then
  bash "$here/install-rust-listener.sh" >/dev/null 2>&1 || echo "   native Jira Listener update skipped (asset unavailable)"
fi

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
if [ "$listener_was_active" = 1 ]; then
  [ -n "$listener_repo" ] || listener_repo="$PWD"
  if bash "$here/launchd/listener.sh" start --repo "$listener_repo"; then
    [ "$listener_was_autostart" = 1 ] && bash "$here/launchd/listener.sh" autostart on >/dev/null || true
    echo "   restarted and ready"
  else
    echo "ERROR: listener update completed but restart/readiness failed; autostart was $([ "$listener_was_autostart" = 1 ] && echo on || echo off). Run: holding listener start --repo '$listener_repo'" >&2
    exit 1
  fi
elif command -v systemctl >/dev/null && systemctl --user is-active -q agents-holding-listener 2>/dev/null; then systemctl --user restart agents-holding-listener && echo "   restarted";
else echo "   not installed as a service (start: holding jira listen)"; fi
ah_ensure_holding_path "$here/holding"
after_raw="$(ver_raw)"; after="$(ver)"; n="$(behind "$before" "$after")"
if [ "$before" -eq "$after" ] 2>/dev/null; then
  echo "Done: client $after_raw already up to date  (holding on PATH: $(command -v holding 2>/dev/null || echo ~/.local/bin/holding))"
else
  echo "Done: client $before_raw -> $after_raw$(behind_label "$before" "$after")  (holding on PATH: $(command -v holding 2>/dev/null || echo ~/.local/bin/holding))"
fi
