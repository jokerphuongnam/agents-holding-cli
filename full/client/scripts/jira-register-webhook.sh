#!/usr/bin/env bash
# Register the agents-holding webhook in YOUR Jira site (admin webhooks REST), using your own API token.
# Usage: scripts/jira-register-webhook.sh '<setup_url from /connect-jira>'
# Needs: ATLASSIAN_EMAIL (your Atlassian login email) and an API token from
#   env ATLASSIAN_API_TOKEN, or macOS Keychain:  security add-generic-password -s agents-holding-atlassian -a "$ATLASSIAN_EMAIL" -w
# The token is only sent to your own Jira site. It is never printed, stored elsewhere or sent to agents-holding.
# Note: /rest/webhooks/1.0/webhook needs a Jira site admin. Without admin rights, use the setup page (manual steps).
set -euo pipefail
SETUP_URL="${1:?usage: $0 '<setup_url>'}"
command -v python3 >/dev/null || { echo "python3 required"; exit 1; }
: "${ATLASSIAN_EMAIL:?set ATLASSIAN_EMAIL to your Atlassian account email}"
TOKEN="${ATLASSIAN_API_TOKEN:-}"
if [ -z "$TOKEN" ] && command -v security >/dev/null; then
  TOKEN="$(security find-generic-password -s agents-holding-atlassian -a "$ATLASSIAN_EMAIL" -w 2>/dev/null || true)"
fi
[ -n "$TOKEN" ] || { echo "NO_TOKEN: no Atlassian API token in ATLASSIAN_API_TOKEN or Keychain (service agents-holding-atlassian). Finish on the setup page instead."; exit 2; }

STATUS_JSON="$(curl -fsS "${SETUP_URL}&format=json")" || { echo "setup link invalid or expired; run /connect-jira again"; exit 3; }
read -r SITE HOOK JQL KEY < <(python3 -c 'import json,sys;s=json.load(sys.stdin);print(s["site"],s["webhook_url"],s["jql"].replace(" ","\u00a0"),s["project_key"])' <<<"$STATUS_JSON")
JQL="${JQL//$'\u00a0'/ }"
case "$HOOK" in *"/functions/v1/jira-webhook?s="*"&token="*) ;; *) echo "BAD_WEBHOOK_URL: setup JSON did not return a jira-webhook URL with &token="; exit 6;; esac
SRC="${HOOK#*\?s=}"; SRC="${SRC%%&*}"

# Skip if a webhook with this exact URL exists; if one exists for this source with a stale/missing token, update it (PUT).
EXIST="$(curl -fsS -u "$ATLASSIAN_EMAIL:$TOKEN" "https://$SITE/rest/webhooks/1.0/webhook" 2>/dev/null || echo '[]')"
if python3 -c 'import json,sys;u=sys.argv[1];sys.exit(0 if any(w.get("url")==u for w in json.load(sys.stdin)) else 1)' "$HOOK" <<<"$EXIST"; then
  echo "ALREADY_REGISTERED on $SITE for $KEY"; exit 0
fi
STALE="$(python3 -c 'import json,sys;s=sys.argv[1];print(next((w["self"] for w in json.load(sys.stdin) if "jira-webhook?s="+s in w.get("url","")),""))' "$SRC" <<<"$EXIST")"
BODY="$(python3 -c 'import json,sys;print(json.dumps({"name":"agents-holding "+sys.argv[3],"url":sys.argv[1],"events":["jira:issue_created","jira:issue_updated","comment_created"],"filters":{"issue-related-events-section":sys.argv[2]},"excludeBody":False}))' "$HOOK" "$JQL" "$KEY")"
if [ -n "$STALE" ]; then METHOD=PUT; TARGET="$STALE"; else METHOD=POST; TARGET="https://$SITE/rest/webhooks/1.0/webhook"; fi
CODE="$(curl -sS -o /tmp/ah-webhook-resp.$$ -w '%{http_code}' -u "$ATLASSIAN_EMAIL:$TOKEN" -H 'Content-Type: application/json' -X "$METHOD" --data "$BODY" "$TARGET")"
rm -f /tmp/ah-webhook-resp.$$
case "$CODE" in
  201|200) echo "REGISTERED ($METHOD) webhook on $SITE for $KEY (move an issue to see the setup page tick)";;
  401|403) echo "FORBIDDEN ($CODE): the token's account is not a Jira site admin. Use the setup page (manual webhook)."; exit 4;;
  *) echo "FAILED ($CODE). Use the setup page (manual webhook)."; exit 5;;
esac
