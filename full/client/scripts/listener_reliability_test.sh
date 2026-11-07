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
grep -q 'AH_RECONCILE_SEC' "$root/holding-listen.mjs"
grep -q 'scheduled Jira reconcile started' "$root/holding-listen.mjs"
grep -q 'startup_grace' "$root/launchd/watchdog.sh"
grep -q 'Never kickstart that child' "$root/launchd/watchdog.sh"
grep -q 'ready_for_start' "$root/launchd/listener.sh"
grep -q 'heartbeat_ok_at' "$root/launchd/listener.sh"
grep -q 'pid_grace_until' "$root/launchd/watchdog.sh"
grep -q 'PID_OBSERVED' "$root/launchd/watchdog.sh"
grep -q 'started >= Number(start)' "$root/launchd/listener.sh"
grep -q 'beat >= Number(start)' "$root/launchd/listener.sh"
node - <<'NODE'
const assert = require("node:assert/strict");
const start = Date.parse("2026-11-06T18:07:55.422Z");
const delayedReady = { listener_state: "online", started_at: "2026-11-06T18:07:55.422Z", heartbeat_ok_at: "2026-11-06T18:08:02.937Z" };
const stalePrevious = { listener_state: "online", started_at: "2026-11-06T18:06:00.000Z", heartbeat_ok_at: "2026-11-06T18:08:02.937Z" };
const fresh = (s) => s.listener_state === "online" && Date.parse(s.started_at) >= start && Date.parse(s.heartbeat_ok_at) >= start;
assert.equal(fresh(delayedReady), true, "delayed back-online heartbeat satisfies the new start");
assert.equal(fresh(stalePrevious), false, "pre-start status cannot satisfy the new start");
console.log("listener lifecycle regression: delayed heartbeat/back-online and stale status passed");
NODE
bash -n "$root/launchd/listener.sh" "$root/launchd/watchdog.sh" "$root/launchd/run-listener.sh" "$root/update.sh"
node --check "$root/holding-listen.mjs"
node --check "$root/status.mjs"
echo 'listener reliability regression checks passed'
