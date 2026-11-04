#!/bin/bash
# holding listener on|off|status|logs|autostart on|off
#   on        : start now (launchd job, restarted if it crashes). Auto-start stays as it was (off after a fresh 'off').
#   off       : stop now AND force auto-start off.
#   autostart : on = also start at login (allowed only while running); off = don't start at login (keeps running now).
# Running = job loaded in launchd. Auto-start = plist present in ~/Library/LaunchAgents (launchd loads those at login).
set -euo pipefail
SERVER_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
LABEL=com.agentsholding.listener
DOMAIN="gui/$(id -u)"
BIN_DIR="$HOME/Library/Application Support/agents-holding"   # outside ~/Documents (TCC-protected for launchd jobs)
MASTER="$BIN_DIR/$LABEL.plist"
AUTO="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs/agents-holding"
LOG="$LOG_DIR/listen.log"

running_pid() { launchctl print "$DOMAIN/$LABEL" 2>/dev/null | awk '/^\tpid = /{print $3; exit}'; }
loaded() { launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; }
plist_repo() { [ -f "$1" ] || return 0; /usr/libexec/PlistBuddy -c "Print :EnvironmentVariables:AH_REPO_DIR" "$1" 2>/dev/null || true; }

write_plist() { # $1 repo
  mkdir -p "$BIN_DIR" "$LOG_DIR" "$HOME/Library/LaunchAgents"
  install -m 755 "$SERVER_DIR/scripts/launchd/run-listener.sh" "$BIN_DIR/run-listener.sh"
  sed -e "s#__SERVER_DIR__#$SERVER_DIR#g" -e "s#__REPO_DIR__#$1#g" -e "s#__HOME__#$HOME#g" -e "s#__BIN_DIR__#$BIN_DIR#g" \
    "$SERVER_DIR/scripts/launchd/$LABEL.plist.template" > "$MASTER.tmp"
  plutil -lint -s "$MASTER.tmp" && mv "$MASTER.tmp" "$MASTER"
}

cmd_status() {
  local pid repo last
  repo="$(plist_repo "$MASTER")"; [ -z "$repo" ] && repo="$(plist_repo "$AUTO")"
  if loaded; then pid="$(running_pid)"; echo "listener : ON  (running${pid:+, PID $pid})"; else echo "listener : OFF (not running)"; fi
  if [ -f "$AUTO" ]; then echo "autostart: ON  (starts at login: $AUTO)"; else echo "autostart: OFF"; fi
  echo "repo     : ${repo:-<not installed; run: holding listener on --repo DIR>}"
  last="$(grep -E ' join ' "$LOG" 2>/dev/null | tail -1 || true)"
  echo "last join: ${last:-never}"
  grep -q "Operation not permitted" "$LOG_DIR/launchd.err.log" 2>/dev/null && \
    echo "WARNING  : macOS blocked file access (launchd.err.log). Allow node in System Settings > Privacy & Security > Files and Folders (Documents) or Full Disk Access, then: holding listener off && holding listener on" || true
}

cmd_on() {
  local repo=""
  while [ $# -gt 0 ]; do case "$1" in --repo) repo="$2"; shift 2 ;; *) echo "unknown option $1"; exit 2 ;; esac; done
  [ -z "$repo" ] && repo="$(plist_repo "$MASTER")"
  [ -z "$repo" ] && repo="$(plist_repo "$AUTO")"
  [ -z "$repo" ] && [ -f "$PWD/.agents/company.json" ] && repo="$PWD"
  [ -z "$repo" ] && { echo "error: which repo? run: holding listener on --repo /path/to/company-repo (the folder with .agents/company.json)"; exit 2; }
  repo="$(cd "$repo" && pwd)"
  [ -f "$repo/.agents/company.json" ] || { echo "error: $repo/.agents/company.json not found (run /holding-ceo in that repo first)"; exit 2; }
  write_plist "$repo"
  [ -f "$AUTO" ] && cp "$MASTER" "$AUTO"   # keep the login copy in sync
  if loaded; then echo "already running; restarting with current config"; launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true; sleep 1; fi
  launchctl bootstrap "$DOMAIN" "$MASTER"
  echo "listener ON for $repo; waiting for 'join ok'..."
  local start; start=$(date -u +%Y-%m-%dT%H:%M:%S)
  for _ in $(seq 1 20); do
    sleep 1
    if awk -v s="$start" '$1>=s && / join ok /' "$LOG" 2>/dev/null | grep -q .; then echo "join ok ✔"; cmd_status; return 0; fi
  done
  echo "no 'join ok' yet after 20s — check: holding listener logs   (macOS permission? see holding doctor)"; cmd_status; return 1
}

cmd_off() {
  rm -f "$AUTO"
  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
  sleep 1
  if loaded; then echo "error: still loaded"; exit 1; fi
  echo "listener OFF and autostart OFF."
}

poke() { local pid; pid="$(running_pid)"; [ -n "$pid" ] && kill -USR1 "$pid" 2>/dev/null || true; } # listener re-sends its heartbeat
cmd_autostart() {
  case "${1:-}" in
    on) loaded || { echo "error: the listener is off. Turn it on first: holding listener on   (then: holding listener autostart on)"; exit 1; }
        [ -f "$MASTER" ] || write_plist "$(plist_repo "$AUTO")"
        mkdir -p "$(dirname "$AUTO")"; cp "$MASTER" "$AUTO"; poke; echo "autostart ON (starts at login)." ;;
    off) rm -f "$AUTO"; poke; echo "autostart OFF (still running now: $(loaded && echo yes || echo no))." ;;
    *) echo "usage: holding listener autostart on|off"; exit 2 ;;
  esac
}

case "${1:-status}" in
  status) cmd_status ;;
  on) shift; cmd_on "$@" ;;
  off) cmd_off ;;
  autostart) shift; cmd_autostart "${1:-}" ;;
  logs) shift; if [ "${1:-}" = "-f" ]; then tail -f "$LOG"; else tail -n 30 "$LOG"; echo "--- launchd.err.log"; tail -n 10 "$LOG_DIR/launchd.err.log" 2>/dev/null || true; fi ;;
  *) echo "usage: holding listener on [--repo DIR] | off | autostart on|off | status | logs [-f]"; exit 2 ;;
esac
