#!/bin/bash
# Jira Listener watchdog (launchd job com.agentsholding.listener-watchdog, tiny bash loop, no network, no secrets).
# Every AH_WATCHDOG_SEC (default 5s) it checks that the Jira Listener launchd job is loaded,
# has the expected live process, and has reported a successful online heartbeat recently.
# running -> stopped (crash, kill, launchctl bootout/unload): macOS notification at once, reminder every 15 min while off.
# stopped -> running: "running again" notification. State: ~/.config/agents-holding/watchdog.json (read by holding status).
LABEL=com.agentsholding.jira-listener
DOMAIN="gui/$(id -u)"
STATE="$HOME/.config/agents-holding/watchdog.json"
LOG="$HOME/Library/Logs/agents-holding/watchdog.log"
CMD="holding listener start && holding listener autostart on"
EVERY="${AH_WATCHDOG_SEC:-5}"; REMIND=900
STALE="${AH_STALE_HEARTBEAT_SEC:-150}"
STARTUP="${AH_LISTENER_STARTUP_GRACE_SEC:-60}"
export PATH="$HOME/.grok/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
NODE_BIN="$(command -v node || true)"
mkdir -p "$(dirname "$STATE")" "$(dirname "$LOG")"
notify() { /usr/bin/osascript -e "display notification \"$2\" with title \"$1\" sound name \"Basso\"" >/dev/null 2>&1 || true; }
now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
PID=""
process_ok() { local p="${1:-}"; [ -n "$p" ] && kill -0 "$p" 2>/dev/null && ps -p "$p" -o command= 2>/dev/null | grep -Eq 'run-listener|holding-listen|node'; }
heartbeat_ok() {
  [ -f "$HOME/.config/agents-holding/listener-status.json" ] || return 1
  [ -n "$NODE_BIN" ] || return 1
  "$NODE_BIN" - "$HOME/.config/agents-holding/listener-status.json" "$STALE" <<'NODE'
const fs = require("fs");
try { const [file, max] = process.argv.slice(2); const s = JSON.parse(fs.readFileSync(file, "utf8"));
  const times = [s.heartbeat_ok_at, ...Object.values(s.companies || {}).map(v => v.heartbeat_at)].map(x => Date.parse(x || "")).filter(Number.isFinite);
  const t = times.length ? Math.max(...times) : NaN;
  process.exit(s.listener_state === "online" && Number.isFinite(t) && Date.now() - t <= Number(max) * 1000 ? 0 : 1);
} catch { process.exit(1); }
NODE
}
startup_grace() {
  [ -f "$HOME/.config/agents-holding/listener-status.json" ] || return 1
  [ -n "$NODE_BIN" ] || return 1
  "$NODE_BIN" - "$HOME/.config/agents-holding/listener-status.json" "$STARTUP" <<'NODE'
const fs = require("fs");
try { const [file, max] = process.argv.slice(2); const s = JSON.parse(fs.readFileSync(file, "utf8"));
  const t = Date.parse(s.started_at || "");
  process.exit(s.listener_state !== "online" && Number.isFinite(t) && Date.now() - t <= Number(max) * 1000 ? 0 : 1);
} catch { process.exit(1); }
NODE
}
up() { local pid; pid="$(launchctl print "$DOMAIN/$LABEL" 2>/dev/null | awk '/^\tpid = /{print $3; exit}')"; PID="$pid"; process_ok "$pid" && heartbeat_ok; }
prev=""; down_since=""; last_remind=0; misses=0; lastpid=""; restart_window=0; restart_count=0
seen_pid=""; pid_grace_until=0
while true; do
  if up; then cur=running; misses=0; else misses=$((misses+1)); cur=stopped; fi
  # launchd can retain a loaded job with no child after SIGTERM, or a process can hang
  # after its last successful heartbeat. Kick it with a bounded budget; KeepAlive is
  # still the normal crash path.
  if [ "$cur" = stopped ]; then
    loaded=1; launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1 || loaded=0
    now_s=$(date +%s)
    if [ "$loaded" = 1 ] && [ -n "$PID" ] && [ "$PID" != "$seen_pid" ]; then
      seen_pid="$PID"; pid_grace_until=$((now_s + STARTUP))
      echo "$(now) PID_OBSERVED pid=$PID grace_until=$pid_grace_until" >> "$LOG"
    fi
    [ "$restart_window" = 0 ] || [ $((now_s - restart_window)) -ge 300 ] && { restart_window=$now_s; restart_count=0; }
    # A fresh launch is expected to be process-live but heartbeat-not-ready while
    # it joins every company. Never kickstart that child; kickstart only after the
    # explicit startup grace expires, otherwise launchd sends it SIGTERM mid-start.
    if [ "$loaded" = 1 ] && [ "$now_s" -ge "$pid_grace_until" ] && ! startup_grace && [ "$restart_count" -lt 3 ]; then
      restart_count=$((restart_count+1)); echo "$(now) KICKSTART attempt=$restart_count" >> "$LOG"
      launchctl kickstart -k "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
    fi
  fi
  # crashed and restarted by launchd between two checks (PID changed while we saw it running): warn, runs resume from checkpoints
  if [ "$cur" = running ] && [ "$prev" = running ] && [ -n "$lastpid" ] && [ "$PID" != "$lastpid" ]; then
    notify "⚠️ Jira Listener restarted" "The Jira Listener crashed and was restarted automatically; Jira automation is running again (unfinished runs resume from their checkpoint)."
    echo "$(now) RESTARTED $lastpid -> $PID" >> "$LOG"
  fi
  [ "$cur" = running ] && lastpid="$PID"
  # KeepAlive restarts a crashed listener within ~30s; still warn at once (first miss) so the user knows automation paused.
  # at login/boot give the listener 60s to come up before the first "off" warning
  if [ -z "$prev" ] && [ "$cur" = stopped ] && [ "$misses" -lt $((60 / EVERY)) ]; then sleep "$EVERY"; continue; fi
  if [ "$cur" != "$prev" ]; then
    if [ "$cur" = stopped ]; then
      down_since="$(now)"; last_remind=$(date +%s)

      notify "🔴 Jira Listener is off" "Jira Listener is off — all Jira automation is stopped until you start it: $CMD"
      echo "$(now) STOPPED" >> "$LOG"
    else
      [ "$prev" = stopped ] && notify "Jira Listener is running again" "Jira automation resumed; missed Jira changes are replayed now."
      down_since=""; echo "$(now) RUNNING" >> "$LOG"
    fi
    printf '{"state":"%s","since":"%s","down_since":"%s","checked_at":"%s"}\n' "$cur" "$(now)" "$down_since" "$(now)" > "$STATE.tmp" && mv "$STATE.tmp" "$STATE"
    prev="$cur"
  elif [ "$cur" = stopped ] && [ $(( $(date +%s) - last_remind )) -ge $REMIND ]; then
    last_remind=$(date +%s); notify "🔴 Jira Listener is still off" "Jira Listener is off — all Jira automation is stopped until you start it: $CMD"
  fi
  sleep "$EVERY"
done
