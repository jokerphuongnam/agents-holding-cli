#!/usr/bin/env bash
# Lazy Jira Listener setup. Idempotent. Pass --repo DIR (company repo with .agents/company.json).
# Does nothing destructive if already running.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo=""
while [ $# -gt 0 ]; do case "$1" in --repo) repo="$2"; shift 2 ;; *) shift ;; esac; done
if launchctl print "gui/$(id -u)/com.agentsholding.jira-listener" >/dev/null 2>&1; then
  echo "Jira Listener already running"; bash "$here/launchd/listener.sh" status; exit 0
fi
if [ -z "$repo" ]; then
  echo "usage: listener-ensure.sh --repo /path/to/company-repo"
  echo "Ask the user which product repo to watch, then rerun with --repo."
  exit 2
fi
echo "Starting Jira Listener for $repo ..."
bash "$here/launchd/listener.sh" start --repo "$repo"
bash "$here/launchd/listener.sh" status
