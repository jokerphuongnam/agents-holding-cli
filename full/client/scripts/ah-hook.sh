#!/usr/bin/env bash
# Grok / Claude Code / Codex UserPromptSubmit hook (~/.grok/hooks/agents-holding.json, installed by holding setup sync): answers deterministic
# agents-holding slash commands (/staff list, /key list, /jira list ...) WITHOUT a model turn. It runs `holding <cmd>` and blocks
# the prompt (exit 2): Grok shows our stderr to the user and never sends the prompt to the model. Anything else: exit 0
# (untouched). /ceo always passes through: the CEO is the current chat session; it delegates with /staff run (holding staff run <staff>),
# which spawns that staff on its bound provider. Commands that need the agent (/ceo, /task add, /flow edit ...) pass through. Disable: export AH_HOOK=0.
# >>> ah_kc_guard (canonical: full/lib/kc-guard.sh): macOS `security` resolves the default keychain from $HOME; under a
# temporary/fake HOME it finds none and pops "keychain not found / restore keychain" dialogs. Pin every *-generic-password
# call to the REAL user's login keychain (passwd home, not $HOME); AH_SKIP_KEYCHAIN=1 = no keychain access (not found).
security() {
  case "${1:-}" in find-generic-password|add-generic-password|delete-generic-password)
    [ "${AH_SKIP_KEYCHAIN:-}" = 1 ] && return 44
    local rh kc; rh="$(dscl . -read "/Users/$(id -un)" NFSHomeDirectory 2>/dev/null | awk '{print $2}')"; [ -n "$rh" ] || rh="$(eval echo "~$(id -un)")"
    kc="$rh/Library/Keychains/login.keychain-db"; [ -f "$kc" ] || kc="$rh/Library/Keychains/login.keychain"; [ -f "$kc" ] || return 44
    command security "$@" "$kc"; return $? ;;
  esac
  command security "$@"
}
# <<< ah_kc_guard
in="$(cat)"
[ "${AH_HOOK:-1}" = 0 ] && exit 0
export AH_NO_UPDATE_CHECK=1 AH_HOOK_RUN=1 AH_CLI_TIMEOUT="${AH_CLI_TIMEOUT:-8}"
case "$in" in *'"prompt"'*) ;; *) exit 0;; esac  # Grok and Claude Code send {"prompt": ...}; non-slash prompts exit below
here="$(cd "$(dirname "$0")" && pwd)"
IFS=$'\t' read -r prompt cwd < <(osascript -l JavaScript -e 'function run(a){const j=JSON.parse(a[0]);return String(j.prompt||"").replace(/[\t\n]+/g," ").trim()+"\t"+(j.cwd||"")}' "$in" 2>/dev/null) || exit 0
# Update notice: once per session, one line, never blocks (cache read only; refresh runs detached, capped).
ah_update_notice() {
  [ "${AH_UPDATE_NOTICE:-1}" = 0 ] && return 0
  local c="$HOME/.config/agents-holding/cache" sid cur req age
  mkdir -p "$c/sessions" 2>/dev/null || return 0
  age=$(( $(date +%s) - $(stat -f %m "$c/latest-version" 2>/dev/null || stat -c %Y "$c/latest-version" 2>/dev/null || echo 0) ))
  if [ "$age" -gt 3600 ]; then touch "$c/latest-version"
    ( AH_CLI_TIMEOUT=8 bash "$here/ah-cli.sh" client version 2>/dev/null | sed -nE 's/.*required[^0-9]*([0-9]{8,10}).*/\1/p' | head -1 > "$c/latest-version.tmp" \
      && [ -s "$c/latest-version.tmp" ] && mv "$c/latest-version.tmp" "$c/latest-version" ) </dev/null >/dev/null 2>&1 &
    disown 2>/dev/null || true; fi
  req="$(tr -dc 0-9 < "$c/latest-version" 2>/dev/null)"; cur="$(tr -dc 0-9 < "$here/VERSION" 2>/dev/null)"
  [ ${#req} -eq 8 ] && req="${req}00"; [ ${#cur} -eq 8 ] && cur="${cur}00"
  [ -n "$req" ] && [ -n "$cur" ] && [ "$cur" -lt "$req" ] 2>/dev/null || return 0
  sid="$(printf '%s' "$in" | sed -nE 's/.*"session_id" *: *"([^"]+)".*/\1/p' | tr -dc 'A-Za-z0-9_-' | head -c 80)"; [ -n "$sid" ] || sid="ppid-$PPID"
  [ -f "$c/sessions/$sid-$req" ] && return 0
  touch "$c/sessions/$sid-$req"; find "$c/sessions" -type f -mtime +7 -delete 2>/dev/null
  local n=$(( 10#$req - 10#$cur )); [ "${req:0:8}" != "${cur:0:8}" ] && n=$(( 10#${req:8:2} + 1 ))
  echo "agents-holding update available: $cur -> $req ($n behind), run holding update"
}
case "$prompt" in /holding\ update*|/update*) ;; *) ah_update_notice ;; esac
case "$prompt" in /*) ;; *) exit 0;; esac
name="${prompt%% *}"; name="${name#/}"; args=""; [ "$prompt" != "/$name" ] && args="${prompt#/"$name" }"
# /holding <noun> <verb> ... == /<noun> <verb> ... ; /holding update == holding update
if [ "$name" = holding ] && [ -n "$args" ]; then name="${args%% *}"; [ "$args" = "$name" ] && args="" || args="${args#"$name" }"; fi
verb="${args%% *}"
# full client (holding + Node) answers every local noun; the lite install (ah-hook.sh + ah-cli.sh only) answers the server ones
H=""; [ -f "$here/holding" ] && command -v node >/dev/null && H=1
run=()
case "$name $verb" in
  "task add"*|"task split"*|"skill add"*|"jira setup"*|"flow edit"*|"flow "[A-Z]*|"flow default"*) exit 0 ;;  # need the agent
esac
# /ceo companies | /ceo company <verb>: instant company list/overview (no model)
if [ "$name" = ceo ] && { [ "$verb" = companies ] || [ "$verb" = company ]; } && [ -n "$H" ]; then
  rest="${args#"$verb"}"; rest="${rest# }"; [ "$verb" = companies ] && rest="list${rest:+ $rest}"; name=company; args="$rest"; verb="${args%% *}"; fi
case "$name" in
  staff|task|provider|skill|project|company|create|listener|jira|inbox|key|credit|billing|status|doctor|notify|setup|habit|flow|report|usage|team|enterprise|security|figma|confluence|atlassian|codegraph|update|upgrade|client|whoami|plan|history|sources|owner)
    if [ -n "$H" ]; then export AH_HOOK_RUN=1; run=(bash "$here/holding" "$name")
    else case "$name $verb" in
        "staff list"|"staff "|"staff remove"|"task "*|"skill list"|"skill "|"skill private "*|"skill public "*|"jira sources"|"key "*|"credit "*|"billing "*|"status "*|"doctor "*|"flow "*|"report "*|"usage "*|"team "*|"enterprise "*|"security "*|"notify "*|"client "*|"whoami "*|"plan "*|"owner "*) run=(bash "$here/ah-cli.sh" "$name") ;;
        *) echo "/$name $verb needs the full client (Node + install.sh): see SETUP.md" >&2; exit 2 ;;
      esac; fi ;;
  help) run=(bash "$here/ah-cli.sh" help) ;;
  *) exit 0 ;;
esac
# args: shell-like split so "quoted text" stays one argument (no eval of user text: xargs only tokenizes)
A=(); if [ -n "$args" ]; then while IFS= read -r -d '' w; do A+=("$w"); done < <(printf '%s' "$args" | xargs printf '%s\0' 2>/dev/null || printf '%s\0' $args); fi
# @company mention -> --company X (exact local company); --all aggregates via holding (one session, every company)
B=(); for w in ${A[@]+"${A[@]}"}; do case "$w" in @?*) if [ -d "$HOME/.config/agents-holding/state/${w#@}" ] || grep -q "\"company\": *\"${w#@}\"" "$HOME/.config/agents-holding/projects.json" 2>/dev/null; then B+=(--company "${w#@}"); else B+=("$w"); fi ;; *) B+=("$w") ;; esac; done; A=(${B[@]+"${B[@]}"})
[ -d "$cwd" ] && cd "$cwd"
# Never hang the host hook (Grok times out at 30s and prints a scary error). Hard cap ~8s.
ah_run_cap() {
  local cap="${AH_HOOK_TIMEOUT:-8}" outf rc
  outf="$(mktemp -t ah-hook.XXXXXX)"
  ( "${run[@]}" ${A[@]+"${A[@]}"} >"$outf" 2>&1 ) & local pid=$!
  ( sleep "$cap"; kill "$pid" 2>/dev/null ) & local w=$!
  wait "$pid" 2>/dev/null; rc=$?
  kill "$w" 2>/dev/null; wait "$w" 2>/dev/null
  if [ "$rc" -gt 128 ] 2>/dev/null; then
    printf "%s\n(agents-holding: timed out after %ss — try holding %s in a terminal)\n" "$(cat "$outf" 2>/dev/null)" "$cap" "$name" >&2
    rm -f "$outf"; exit 2
  fi
  printf "%s\n%s\n" "$(cat "$outf")" "$([ $rc = 0 ] && echo "(agents-holding: instant, no model)" || echo "(agents-holding: failed, exit $rc)")" >&2
  rm -f "$outf"; exit 2
}
# holding update can take longer than the host hook limit: run it detached, show what finished within ~20s.
if [ "$name" = update ] || [ "$name" = upgrade ]; then
  log="$HOME/Library/Logs/agents-holding/update.log"; mkdir -p "$(dirname "$log")" 2>/dev/null || log="${TMPDIR:-/tmp}/ah-update.log"
  nohup bash "$here/update.sh" --yes ${A[@]+"${A[@]}"} </dev/null >"$log" 2>&1 & disown 2>/dev/null || true
  for _ in $(seq 1 40); do grep -q '^Done:' "$log" 2>/dev/null && break; sleep 0.5; done
  cat "$log" >&2
  grep -q '^Done:' "$log" 2>/dev/null || echo "(agents-holding: update still running in the background; log: $log)" >&2
  rm -f "$HOME/.config/agents-holding/cache/latest-version"; exit 2
fi
ah_run_cap
