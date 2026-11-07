#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
scripts="$root/scripts"
test -x "$scripts/holding"
test -f "$scripts/holding-listen.mjs"
test -f "$scripts/launchd/watchdog.sh"
test -f "$scripts/launchd/listener.sh"
grep -q 'heartbeat_ok_at' "$scripts/holding-listen.mjs"
grep -q 'heartbeat_at' "$scripts/launchd/watchdog.sh"
grep -q 'listener_state' "$scripts/launchd/watchdog.sh"
grep -q 'https://' "$scripts/registry.mjs" || true
bash -n "$scripts/launchd/watchdog.sh" "$scripts/launchd/listener.sh" "$scripts/update.sh"
node --check "$scripts/holding-listen.mjs"
node --check "$scripts/registry.mjs"
echo 'fresh install static smoke test passed'
