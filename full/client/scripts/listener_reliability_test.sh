#!/usr/bin/env bash
# Regression checks for listener lifecycle invariants. These are portable (they do not need launchd).
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
grep -q 'process_ok' "$root/launchd/listener.sh"
grep -q 'listener readiness online' "$root/launchd/listener.sh"
grep -q 'readiness online' "$root/holding-listen.mjs"
grep -q 'realtime_ready' "$root/holding-listen.mjs"
grep -q 'listener_was_active' "$root/update.sh"
grep -q 'restart/readiness failed' "$root/update.sh"
grep -q 'KICKSTART attempt' "$root/launchd/watchdog.sh"
grep -q 'heartbeat_ok_at' "$root/launchd/watchdog.sh"
grep -q 'process_ok' "$root/launchd/watchdog.sh"
grep -q 'restore_listener' "$root/update.sh"
grep -q 'listener_state' "$root/holding-listen.mjs"
bash -n "$root/launchd/listener.sh" "$root/launchd/watchdog.sh" "$root/launchd/run-listener.sh" "$root/update.sh"
node --check "$root/holding-listen.mjs"
node --check "$root/status.mjs"
echo 'listener reliability regression checks passed'
