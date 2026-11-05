#!/usr/bin/env bash
# Offline CI-style suite. No network, credentials, or live Jira events are required.
set -euo pipefail
cd "$(dirname "$0")/.."
count=0
for t in full/client/scripts/*_test.mjs tests/*_test.sh; do
  [ -f "$t" ] || continue
  printf '\n--- %s ---\n' "$t"
  case "$t" in
    *.mjs) node "$t" ;;
    *.sh) bash "$t" ;;
  esac
  count=$((count + 1))
done
printf '\nAll %d client test files passed.\n' "$count"
