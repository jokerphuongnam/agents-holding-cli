#!/bin/bash
# holding listener start|stop|status|logs|autostart on|off
#   on        : start now (launchd job, restarted if it crashes). Auto-start stays as it was (off after a fresh 'off').
#   off       : stop now AND force auto-start off.
#   autostart : on = also start at login (allowed only while running); off = don't start at login (keeps running now).
# Running = job loaded in launchd. Auto-start = plist present in ~/Library/LaunchAgents (launchd loads those at login).
set -euo pipefail
SERVER_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
LABEL=com.agentsholding.jira-listener
OLD_LABEL=com.agentsholding.listener   # pre-rename label, migrated automatically
DOMAIN="gui/$(id -u)"
BIN_DIR="$HOME/Library/Application Support/agents-holding"   # outside ~/Documents (TCC-protected for launchd jobs)
MASTER="$BIN_DIR/$LABEL.plist"
AUTO="$HOME/Library/LaunchAgents/$LABEL.plist"
AUTOSTART_DISABLED="$HOME/.config/agents-holding/autostart.disabled"
LOG_DIR="$HOME/Library/Logs/agents-holding"
LOG="$LOG_DIR/jira-listener.log"
ERR="$LOG_DIR/jira-listener.err.log"

WD_LABEL=com.agentsholding.listener-watchdog   # separate tiny job: notifies the moment the Jira Listener stops
WD_PLIST="$HOME/Library/LaunchAgents/$WD_LABEL.plist"
START_CMD="holding listener start && holding listener autostart on"
install_watchdog() { # always on (also at login), independent of the listener job; idempotent
  mkdir -p "$BIN_DIR" "$LOG_DIR" "$HOME/Library/LaunchAgents"
  install -m 755 "$SERVER_DIR/scripts/launchd/watchdog.sh" "$BIN_DIR/watchdog.sh"
  sed -e "s#__HOME__#$HOME#g" -e "s#__BIN_DIR__#$BIN_DIR#g" "$SERVER_DIR/scripts/launchd/$WD_LABEL.plist.template" > "$WD_PLIST.tmp"
  plutil -lint -s "$WD_PLIST.tmp" && mv "$WD_PLIST.tmp" "$WD_PLIST"
  if launchctl print "$DOMAIN/$WD_LABEL" >/dev/null 2>&1; then launchctl kickstart -k "$DOMAIN/$WD_LABEL" >/dev/null 2>&1 || true
  else launchctl bootstrap "$DOMAIN" "$WD_PLIST" 2>/dev/null || true; fi
}
running_pid() { launchctl print "$DOMAIN/$LABEL" 2>/dev/null | awk '/^\tpid = /{print $3; exit}'; }
loaded() { launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; }
process_ok() { local p="${1:-}"; [ -n "$p" ] && kill -0 "$p" 2>/dev/null && ps -p "$p" -o command= 2>/dev/null | grep -Eq 'run-listener|agents-holding-listener'; }
heartbeat_fresh() {
  curl -fsS --max-time 2 "http://${AH_LISTENER_HOST:-127.0.0.1}:${AH_LISTENER_PORT:-8787}/health" >/dev/null 2>&1
}
running() { local p; p="$(running_pid)"; process_ok "$p"; }
ready_for_start() {
  curl -fsS --max-time 2 "http://${AH_LISTENER_HOST:-127.0.0.1}:${AH_LISTENER_PORT:-8787}/health" >/dev/null 2>&1
}
plist_repo() { [ -f "$1" ] || return 0; /usr/libexec/PlistBuddy -c "Print :EnvironmentVariables:AH_REPO_DIR" "$1" 2>/dev/null || true; }

write_plist() { # $1 repo
  mkdir -p "$BIN_DIR" "$LOG_DIR" "$HOME/Library/LaunchAgents"
  install -m 755 "$SERVER_DIR/scripts/launchd/run-listener.sh" "$BIN_DIR/run-listener.sh"
  sed -e "s#__SERVER_DIR__#$SERVER_DIR#g" -e "s#__REPO_DIR__#$1#g" -e "s#__HOME__#$HOME#g" -e "s#__BIN_DIR__#$BIN_DIR#g" \
    "$SERVER_DIR/scripts/launchd/$LABEL.plist.template" > "$MASTER.tmp"
  plutil -lint -s "$MASTER.tmp" && mv "$MASTER.tmp" "$MASTER"
}

# one-time migration from the old "listener" launchd job: stop + remove it, keep autostart as it was (returns 0 if it was auto-starting)
migrate_old() {
  local old_auto="$HOME/Library/LaunchAgents/$OLD_LABEL.plist" was=1
  [ -f "$old_auto" ] && was=0
  if launchctl print "$DOMAIN/$OLD_LABEL" >/dev/null 2>&1 || [ -f "$old_auto" ] || [ -f "$BIN_DIR/$OLD_LABEL.plist" ]; then
    MIG_REPO="$(plist_repo "$BIN_DIR/$OLD_LABEL.plist")"; [ -z "$MIG_REPO" ] && MIG_REPO="$(plist_repo "$old_auto")"
    launchctl bootout "$DOMAIN/$OLD_LABEL" 2>/dev/null || true
    rm -f "$old_auto" "$BIN_DIR/$OLD_LABEL.plist"; MIGRATED=1
    echo "migrated: old 'listener' job removed; it is now the Jira Listener ($LABEL)"
  fi
  return $was
}
MIGRATED=0; MIG_REPO=""; OLD_AUTO=0
case "${1:-status}" in start|status|autostart) if migrate_old; then OLD_AUTO=1; fi ;; esac
if [ "$MIGRATED" = 1 ] && [ "${1:-status}" = status ]; then # keep it running + autostart as before
  "$0" start ${MIG_REPO:+--repo "$MIG_REPO"} >/dev/null 2>&1 || true
  [ "$OLD_AUTO" = 1 ] && "$0" autostart on >/dev/null 2>&1 || true
fi

cmd_status() {
  local pid repo last
  repo="$(plist_repo "$MASTER")"; [ -z "$repo" ] && repo="$(plist_repo "$AUTO")"
  pid="$(running_pid)"; if process_ok "$pid" && heartbeat_fresh; then echo "Jira Listener: ON  (running and heartbeat fresh, PID $pid)"; elif loaded; then echo "Jira Listener: DEGRADED (launchd loaded but listener process/heartbeat is not healthy${pid:+, PID $pid})"; else printf '\033[1;31m🔴 Jira Listener is off — all Jira automation is stopped until you start it:\n   %s\033[0m\n   (Jira Listener keeps all Jira automation running.)\n' "$START_CMD"; fi
  if launchctl print "$DOMAIN/$WD_LABEL" >/dev/null 2>&1; then echo "watchdog     : ON  (notifies at once if the Jira Listener stops)"; else echo "watchdog     : OFF (holding listener start installs it)"; fi
  if [ -f "$AUTO" ]; then echo "autostart    : ON  (starts at login: $AUTO)"; else echo "autostart    : OFF"; fi
  echo "repo         : ${repo:-<not installed; run: holding listener start --repo DIR>}"
  last="$(grep -E ' join ' "$LOG" 2>/dev/null | tail -1 || true)"
  echo "last join    : ${last:-never}"
  grep -q "Operation not permitted" "$ERR" 2>/dev/null && \
    echo "WARNING  : macOS blocked file access (jira-listener.err.log). Allow the native Rust listener in System Settings > Privacy & Security > Files and Folders (Documents) or Full Disk Access, then: holding listener stop && holding listener start" || true
}

cmd_on() {
  local repo=""
  while [ $# -gt 0 ]; do case "$1" in --repo) repo="$2"; shift 2 ;; *) echo "unknown option $1"; exit 2 ;; esac; done
  [ -z "$repo" ] && repo="$(plist_repo "$MASTER")"
  [ -z "$repo" ] && repo="$(plist_repo "$AUTO")"
  [ -z "$repo" ] && [ -f "$PWD/.agents/company.json" ] && repo="$PWD"
  [ -z "$repo" ] && { echo "error: which repo? run: holding listener start --repo /path/to/company-repo (the folder with .agents/company.json)"; exit 2; }
  repo="$(cd "$repo" && pwd)"
  [ -f "$repo/.agents/company.json" ] || { echo "error: $repo/.agents/company.json not found (run /ceo in that repo first)"; exit 2; }
  write_plist "$repo"
  install_watchdog
  [ "$OLD_AUTO" = 1 ] && cp "$MASTER" "$AUTO"   # migrated: keep autostart ON
  [ -f "$AUTO" ] && cp "$MASTER" "$AUTO"   # keep the login copy in sync
  if [ ! -f "$AUTO" ] && [ ! -f "$AUTOSTART_DISABLED" ]; then
    mkdir -p "$(dirname "$AUTO")"; cp "$MASTER" "$AUTO"; install_watchdog
  fi
  if loaded; then echo "replacing existing listener"; launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true; for _ in $(seq 1 15); do running || break; sleep 1; done; loaded && { echo "error: old listener job did not stop cleanly" >&2; return 1; }; fi
  launchctl bootstrap "$DOMAIN" "$MASTER"
  echo "Jira Listener started for $repo; waiting for process, realtime join, and heartbeat readiness..."
  local start start_ms; start=$(date -u +%Y-%m-%dT%H:%M:%S); start_ms=$(date +%s000)
  for _ in $(seq 1 45); do
    sleep 1
    # The health endpoint is authoritative. Log timestamps can lag or be shared
    # with a previous launch, which used to report failure even when the new
    # listener was already healthy.
    if process_ok "$(running_pid)" && ready_for_start "$start_ms"; then echo "listener readiness online ✔"; cmd_status; return 0; fi
  done
  echo "listener failed readiness within 45s (process/realtime/server heartbeat not all ready) — check: holding listener logs" >&2; cmd_status; return 1
}

cmd_off() {
  rm -f "$AUTO"
  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
  sleep 1
  if loaded; then echo "error: still loaded"; exit 1; fi
  echo "Jira Listener OFF and autostart OFF."
}

poke() { local pid; pid="$(running_pid)"; [ -n "$pid" ] && kill -USR1 "$pid" 2>/dev/null || true; } # Jira Listener re-sends its heartbeat
cmd_autostart() {
  case "${1:-}" in
    on) loaded || { echo "error: the Jira Listener is off. Turn it on first: holding listener start   (then: holding listener autostart on)"; exit 1; }
        rm -f "$AUTOSTART_DISABLED"
        [ -f "$MASTER" ] || write_plist "$(plist_repo "$AUTO")"
        mkdir -p "$(dirname "$AUTO")"; cp "$MASTER" "$AUTO"; install_watchdog; poke; echo "autostart ON (starts at login)." ;;
    off) mkdir -p "$(dirname "$AUTOSTART_DISABLED")"; : > "$AUTOSTART_DISABLED"; rm -f "$AUTO"; poke; echo "autostart OFF (still running now: $(loaded && echo yes || echo no))." ;;
    *) echo "usage: holding listener autostart on|off"; exit 2 ;;
  esac
}

case "${1:-status}" in
  status) cmd_status ;;
  start) shift; cmd_on "$@" ;;
  stop) cmd_off ;;
  autostart) shift; cmd_autostart "${1:-}" ;;
  logs) shift; mkdir -p "$(dirname "$LOG")"; [ -f "$LOG" ] || { echo "no listener logs yet ($LOG); start it with: holding listener start"; exit 0; }; if [ "${1:-}" = "-f" ]; then tail -f "$LOG"; else tail -n 30 "$LOG"; echo "--- jira-listener.err.log"; tail -n 10 "$ERR" 2>/dev/null || true; fi ;;
  *) echo "usage: holding listener start [--repo DIR] | stop | autostart on|off | status | logs [-f]"; exit 2 ;;
esac
