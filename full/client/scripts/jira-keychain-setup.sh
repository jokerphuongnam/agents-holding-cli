#!/bin/bash
# Store your Atlassian API token in the macOS Keychain for the agents-holding listener (deterministic Jira reads,
# comments and card moves without AI tokens). The token never goes on a command line, into a file, or into a log.
# Usage: scripts/jira-keychain-setup.sh <site-url> <email>      (then paste the token at the hidden prompt)
#   or:  ATLASSIAN_API_TOKEN=... scripts/jira-keychain-setup.sh <site-url> <email>   (non-interactive; env only)
# Writes ~/.config/agents-holding/jira.json (chmod 600) with site, email and keychain_service only (NO token).
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
SITE="${1:?site url, e.g. https://you.atlassian.net}"; EMAIL="${2:?atlassian email}"; SVC="${AH_KEYCHAIN_SERVICE:-agents-holding-atlassian}"
TOKEN="${ATLASSIAN_API_TOKEN:-}"
if [ -z "$TOKEN" ]; then read -r -s -p "Atlassian API token (hidden): " TOKEN; echo; fi
[ -n "$TOKEN" ] || { echo "no token"; exit 2; }
case "$TOKEN" in *'"'*|*'\'*) echo "unexpected characters in token"; exit 2;; esac
# security -i reads the command from stdin, so the token is not visible in ps
printf 'add-generic-password -U -s %s -a "%s" -l "agents-holding Jira API token" -w "%s"\n' "$SVC" "$EMAIL" "$TOKEN" | security -i >/dev/null
unset TOKEN
CFG="$HOME/.config/agents-holding"; mkdir -p "$CFG"; chmod 700 "$CFG"; umask 077
printf '{"site":"%s","email":"%s","keychain_service":"%s"}\n' "${SITE%/}" "$EMAIL" "$SVC" > "$CFG/jira.json"; chmod 600 "$CFG/jira.json"
code=$(T=$(security find-generic-password -s "$SVC" -a "$EMAIL" -w) && curl -s -o /dev/null -w '%{http_code}' -u "$EMAIL:$T" "${SITE%/}/rest/api/3/myself")
echo "Keychain item '$SVC' saved; $CFG/jira.json written (no token). Jira check: HTTP $code"
