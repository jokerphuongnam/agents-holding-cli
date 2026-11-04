#!/usr/bin/env bash
# Grok UserPromptSubmit hook (~/.grok/hooks/agents-holding.json, installed by holding sync-commands): answers deterministic
# agents-holding slash commands (/staffs, /tokens, /jira-tasks ...) WITHOUT a model turn. It runs `holding <cmd>` and blocks
# the prompt (exit 2): Grok shows our stderr to the user and never sends the prompt to the model. Anything else: exit 0
# (untouched). Commands that need the agent (/ceo, /new-task, /flow edit ...) pass through. Disable: export AH_HOOK=0.
in="$(cat)"
[ "${AH_HOOK:-1}" = 0 ] && exit 0
case "$in" in *'"prompt":"/'*) ;; *) exit 0;; esac
here="$(cd "$(dirname "$0")" && pwd)"
IFS=$'\t' read -r prompt cwd < <(osascript -l JavaScript -e 'function run(a){const j=JSON.parse(a[0]);return String(j.prompt||"").replace(/[\t\n]+/g," ").trim()+"\t"+(j.cwd||"")}' "$in" 2>/dev/null) || exit 0
name="${prompt%% *}"; name="${name#/}"; args=""; [ "$prompt" != "/$name" ] && args="${prompt#/"$name" }"
case "$name" in ah-doctor|ah-help|ah-plan|ah-status|ah-usage|ah-history|ah-tasks) name="${name#ah-}";; esac
run=()
case "$name" in
  staffs|whoami|usage|tasks|history|sources|renew|plan|doctor|status|hire|fire|assign|convention|auto-pr|custom-skills|help|tokens|token-add|token-revoke|token-renew|token-label|token-reset-device)
    run=(bash "$here/ah-cli.sh" "$name") ;;
  flow) case "$args" in ""|show|list) run=(bash "$here/ah-cli.sh" flow) ;; *) exit 0;; esac ;;
  listener) run=(bash "$here/launchd/listener.sh"); [ -n "$args" ] || args="status" ;;
  jira-tasks|jira-task|jira-board|jira-new|jira-move|jira-comment)
    [ -f "$here/jira.mjs" ] && command -v node >/dev/null || { echo "/$name needs the full client (Node + install.sh): see SETUP.md" >&2; exit 2; }
    run=(node "$here/jira.mjs" "$name") ;;
  *) exit 0 ;;
esac
# args: shell-like split so "quoted text" stays one argument (no eval of user text: xargs only tokenizes)
A=(); if [ -n "$args" ]; then while IFS= read -r -d '' w; do A+=("$w"); done < <(printf '%s' "$args" | xargs printf '%s\0' 2>/dev/null || printf '%s\0' $args); fi
[ -d "$cwd" ] && cd "$cwd"
out="$("${run[@]}" ${A[@]+"${A[@]}"} 2>&1)"; rc=$?
printf '%s\n%s\n' "$out" "$([ $rc = 0 ] && echo "(agents-holding: instant, no model)" || echo "(agents-holding: failed, exit $rc)")" >&2
exit 2
