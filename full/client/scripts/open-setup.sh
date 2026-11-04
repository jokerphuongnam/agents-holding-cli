#!/usr/bin/env bash
# Open the /jira setup setup page in your browser (the default Supabase domain serves it as plain text).
set -euo pipefail
URL="${1:?usage: $0 '<setup_url>'}"
OUT="${TMPDIR:-/tmp}/agents-holding-setup.html"
curl -fsS "$URL" -o "$OUT" || { echo "setup link invalid or expired; run /jira setup again"; exit 1; }
chmod 600 "$OUT"
if command -v open >/dev/null; then open "$OUT"; elif command -v xdg-open >/dev/null; then xdg-open "$OUT"; else echo "Open $OUT in a browser"; fi
echo "Opened setup page ($OUT)"
