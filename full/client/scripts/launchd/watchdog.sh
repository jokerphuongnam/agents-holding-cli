#!/bin/bash
# Jira Listener watchdog (launchd job com.agentsholding.listener-watchdog, tiny bash loop, no network, no secrets).
# Every AH_WATCHDOG_SEC (default 5s) it checks that the Jira Listener launchd job is loaded and has a live PID.
# running -> stopped (crash, kill, launchctl bootout/unload): macOS notification at once, reminder every 15 min while off.
# stopped -> running: "running again" notification. State: ~/.config/agents-holding/watchdog.json (read by holding status).
LABEL=com.agentsholding.jira-listener
DOMAIN="gui/$(id -u)"
STATE="$HOME/.config/agents-holding/watchdog.json"
LOG="$HOME/Library/Logs/agents-holding/watchdog.log"
CMD="holding listener start && holding listener autostart on"
EVERY="${AH_WATCHDOG_SEC:-5}"; REMIND=900
mkdir -p "$(dirname "$STATE")" "$(dirname "$LOG")"
notify() { /usr/bin/osascript -e "display notification \"$2\" with title \"$1\" sound name \"Basso\"" >/dev/null 2>&1 || true; }
now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
PID=""
up() { local pid; pid="$(launchctl print "$DOMAIN/$LABEL" 2>/dev/null | awk '/^\tpid = /{print $3; exit}')"; PID="$pid"; [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; }
prev=""; down_since=""; last_remind=0; misses=0; lastpid=""
while true; do
  if up; then cur=running; misses=0; else misses=$((misses+1)); cur=stopped; fi
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
