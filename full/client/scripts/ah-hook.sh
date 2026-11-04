#!/usr/bin/env bash
# Grok UserPromptSubmit hook (~/.grok/hooks/agents-holding.json, installed by holding sync-commands): answers deterministic
# agents-holding slash commands (/staffs, /tokens, /jira-tasks ...) WITHOUT a model turn. It runs `holding <cmd>` and blocks
# the prompt (exit 2): Grok shows our stderr to the user and never sends the prompt to the model. Anything else: exit 0
# (untouched). /ceo always passes through: the CEO is the current chat session; it delegates with /run (holding run <staff>),
# which spawns that staff on its bound provider. Commands that need the agent (/ceo, /new-task, /flow edit ...) pass through. Disable: export AH_HOOK=0.
in="$(cat)"
[ "${AH_HOOK:-1}" = 0 ] && exit 0
case "$in" in *'"prompt":"/'*) ;; *) exit 0;; esac
here="$(cd "$(dirname "$0")" && pwd)"
IFS=$'\t' read -r prompt cwd < <(osascript -l JavaScript -e 'function run(a){const j=JSON.parse(a[0]);return String(j.prompt||"").replace(/[\t\n]+/g," ").trim()+"\t"+(j.cwd||"")}' "$in" 2>/dev/null) || exit 0
name="${prompt%% *}"; name="${name#/}"; args=""; [ "$prompt" != "/$name" ] && args="${prompt#/"$name" }"
case "$name" in ah-doctor|ah-help|ah-plan|ah-status|ah-usage|ah-history|ah-tasks) name="${name#ah-}";; esac
run=()
case "$name" in
  staffs) if [ -f "$here/holding" ] && [ -f "$here/staffs-local.mjs" ]; then run=(bash "$here/holding" staffs); else run=(bash "$here/ah-cli.sh" staffs); fi ;; # server tree + this machine's provider/model/effort per staff
  usage|tasks|history|sources|renew|plan|doctor|status|fire|assign|convention|auto-pr|custom-skills|help|tokens|token-add|token-revoke|token-renew|token-label|token-reset-device|token-show)
    run=(bash "$here/ah-cli.sh" "$name") ;;
  run) [ -d "$cwd" ] && cd "$cwd"; export AH_HOOK_RUN=1; run=(node "$here/run-cli.mjs") ;;
  hire) export AH_HOOK_RUN=1; run=(bash "$here/holding" hire) ;;  # /hire <role> [--agent P --model M --effort E]: hire + bind (no flags: remembered default)
  companies|use|current) run=(bash "$here/holding" "$name") ;;
  whoami) run=(bash "$here/holding" whoami) ;;
  bind|defaults) export AH_HOOK_RUN=1; run=(bash "$here/holding" "$name") ;;
  providers) run=(node "$here/providers-cli.mjs") ;;
  set-staff|unset-staff|set-lang) run=(node "$here/agent-cli.mjs" "$name") ;;
  flow) case "$args" in ""|show|list) run=(bash "$here/ah-cli.sh" flow) ;; *) exit 0;; esac ;;
  listener) run=(bash "$here/launchd/listener.sh"); [ -n "$args" ] || args="status" ;;
  jira-tasks|jira-task|jira-board|jira-new|jira-move|jira-comment)
    [ -f "$here/jira.mjs" ] && command -v node >/dev/null || { echo "/$name needs the full client (Node + install.sh): see SETUP.md" >&2; exit 2; }
    run=(node "$here/jira.mjs" "$name") ;;
  *) exit 0 ;;
esac
# args: shell-like split so "quoted text" stays one argument (no eval of user text: xargs only tokenizes)
A=(); if [ -n "$args" ]; then while IFS= read -r -d '' w; do A+=("$w"); done < <(printf '%s' "$args" | xargs printf '%s\0' 2>/dev/null || printf '%s\0' $args); fi
# @company mention -> --company X (exact local company); --all aggregates via holding (one session, every company)
B=(); for w in ${A[@]+"${A[@]}"}; do case "$w" in @?*) if [ -d "$HOME/.config/agents-holding/state/${w#@}" ] || grep -q "\"company\": *\"${w#@}\"" "$HOME/.config/agents-holding/projects.json" 2>/dev/null; then B+=(--company "${w#@}"); else B+=("$w"); fi ;; *) B+=("$w") ;; esac; done; A=(${B[@]+"${B[@]}"})
case " ${A[*]-} " in *" --all "*) case "$name" in status|tasks|jira-board|jira-tasks|usage|staffs|history) run=(bash "$here/holding" "$name") ;; esac ;; esac
[ -d "$cwd" ] && cd "$cwd"
out="$("${run[@]}" ${A[@]+"${A[@]}"} 2>&1)"; rc=$?
printf '%s\n%s\n' "$out" "$([ $rc = 0 ] && echo "(agents-holding: instant, no model)" || echo "(agents-holding: failed, exit $rc)")" >&2
exit 2
