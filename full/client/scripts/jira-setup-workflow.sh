#!/usr/bin/env bash
# Usage: jira-setup-workflow.sh <site-url> <email> <project-key> [--dry-run]
#   The API token is read from the macOS Keychain (service ${AH_KEYCHAIN_SERVICE:-agents-holding-atlassian}, set by
#   jira-keychain-setup.sh); it never appears on a command line. (Old form <site> <email> <token> <key> still works.)
# Ends by reading the board's columns and, if they are out of order (team-managed boards append new columns after Done
# and Jira has no public API to reorder them), printing the exact order to drag them into.
# Ensures the project's workflow has, in order (or the company flow from AH_FLOW_JSON):
#   To Do, In Progress, Product Work, BA Question, Planned, Pre Code, Coding, QC, In Review, Done
# with GLOBAL transitions (any status -> any status). Missing statuses are created
# (project-scoped for team-managed, global for company-managed). An unused
# "In Progress" status is dropped from the workflow (replaced by "Coding");
# if issues still use it, it is kept. Never changes issue statuses.
set -euo pipefail
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
SITE="${1:?site}"; EMAIL="${2:?email}"
if node "$(dirname "$0")/jira-setup-workflow-oauth.mjs" "$@"; then exit 0; fi
if [[ $# -ge 4 && "$4" != --dry-run ]]; then TOKEN="$3"; KEY="$4"; DRY="${5:-}"   # legacy form
else KEY="${3:?project key}"; DRY="${4:-}"
  TOKEN=$(security find-generic-password -s "${AH_KEYCHAIN_SERVICE:-agents-holding-atlassian}" -a "$EMAIL" -w 2>/dev/null) || { echo "no Jira token in Keychain: run scripts/jira-keychain-setup.sh $SITE $EMAIL first" >&2; exit 1; }
fi
SITE="${SITE%/}"
# credentials go to curl on stdin (-K -), never on its command line
api() { local m=$1 p=$2; shift 2; printf 'user = "%s:%s"\n' "$EMAIL" "$TOKEN" | curl -sS -K - -X "$m" -H 'Content-Type: application/json' -H 'Accept: application/json' "$SITE$p" "$@"; }
# Company flow: AH_FLOW_JSON=<file> with [{"name":"Verified on Develop","category":"IN_PROGRESS"}, ...] in board order
# (the statuses_json returned by set_company_flow / get_company_flow). Default: the built-in 10 columns.
if [[ -n "${AH_FLOW_JSON:-}" ]]; then
  WANT=(); while IFS= read -r l; do WANT+=("$l"); done < <(jq -r '.[].name' "$AH_FLOW_JSON")
  cat_of() { jq -r --arg n "$1" '[.[]|select(.name==$n)][0].category // "IN_PROGRESS"' "$AH_FLOW_JSON"; }
else
WANT=("To Do" "In Progress" "Product Work" "BA Question" "Planned" "Pre Code" "Coding" "QC" "In Review" "Done")
cat_of() { case "$1" in "To Do"|"Product Work"|"BA Question"|"Planned") echo TODO;; "Done") echo DONE;; *) echo IN_PROGRESS;; esac; }
fi

PROJ=$(api GET "/rest/api/3/project/$KEY"); PID=$(jq -r .id <<<"$PROJ"); STYLE=$(jq -r .style <<<"$PROJ")
[[ "$PID" != null ]] || { echo "project $KEY not found" >&2; exit 1; }
echo "Project $KEY id=$PID style=$STYLE"

WFS=$(api GET "/rest/api/3/workflows/search?projectId=$PID&expand=values.transitions")
NWF=$(jq '.values|length' <<<"$WFS")
[[ "$NWF" -ge 1 ]] || { echo "no workflow found" >&2; exit 1; }
if [[ "$STYLE" != next-gen ]]; then
  echo "NOTE: company-managed; updating every workflow returned for project (shared workflows affect other projects!)" >&2
fi
ALLST=$(api GET "/rest/api/3/statuses/search?projectId=$PID&maxResults=200" | jq '.values')
DUPLICATE_STATUS_IDS=$(jq -r '.[]|select(.name=="Pre Code (duplicate)" or .name=="Pre Coding")|.id' <<<"$ALLST" | tr '\n' ' ')

# resolve / create statuses
IDS=""; idget() { printf '%s\n' "$IDS" | awk -F'\t' -v n="$1" '$1==n{print $2; exit}'; }  # bash 3.2 (macOS): no associative arrays
for n in "${WANT[@]}"; do
  id=$(jq -r --arg n "$n" '[.[]|select((.name|ascii_downcase)==($n|ascii_downcase))][0].id // empty' <<<"$ALLST")
  [[ -z "$id" ]] && id=$(jq -r --arg n "$n" '[.values[].statuses[]?|select(.name? and (.name|ascii_downcase)==($n|ascii_downcase))][0].statusReference // empty' <<<"$WFS" 2>/dev/null || true)
  # global statuses already in the workflow (e.g. In Progress id 3) carry no name in workflows/search: look them up
  [[ -z "$id" ]] && for r in $(jq -r '.values[].statuses[]?.statusReference' <<<"$WFS" | sort -u); do
    [[ "$(api GET "/rest/api/3/status/$r" | jq -r '.name|ascii_downcase')" == "$(tr '[:upper:]' '[:lower:]' <<<"$n")" ]] && { id=$r; break; }; done
  if [[ -z "$id" ]]; then
    if [[ "$DRY" == --dry-run ]]; then echo "would create status $n"; id="NEW-$n"; else
      if [[ "$STYLE" == next-gen ]]; then SC="{\"type\":\"PROJECT\",\"project\":{\"id\":\"$PID\"}}"; else SC='{"type":"GLOBAL"}'; fi
      R=$(api POST /rest/api/3/statuses -d "$(jq -n --arg n "$n" --arg c "$(cat_of "$n")" --argjson sc "$SC" '{scope:$sc,statuses:[{name:$n,statusCategory:$c}]}')")
      id=$(jq -r '.[0].id // empty' <<<"$R"); [[ -n "$id" ]] || { echo "create $n failed: $R" >&2; exit 1; }
      echo "created status $n id=$id"
    fi
  fi
  IDS="$IDS"$'\n'"$n"$'\t'"$id"
done
[[ "$DRY" == --dry-run ]] && { echo "dry run done"; exit 0; }
ALLST=$(api GET "/rest/api/3/statuses/search?projectId=$PID&maxResults=200" | jq '.values')

# keep In Progress if any issue uses it
EXTRA=()
IPC=$(api GET "/rest/api/3/search/jql?jql=$(jq -rn --arg k "$KEY" '"project=\"\($k)\" AND status=\"In Progress\""|@uri')&maxResults=1&fields=status" | jq '.issues|length' 2>/dev/null || echo 1)
for i in $(seq 0 $((NWF-1))); do
  WF=$(jq ".values[$i]" <<<"$WFS")
  # statuses currently in workflow that aren't wanted -> keep if In Progress in use (or any other unknown)
  CUR=$(jq -r '.statuses[].statusReference' <<<"$WF")
  DROPPED=()
  REFS=(); for n in "${WANT[@]}"; do REFS+=("$(idget "$n")"); done
  for r in $CUR; do
    if ! printf '%s\n' "${REFS[@]}" | grep -qx "$r"; then
      nm=$(jq -r --arg r "$r" '.[]|select(.id==$r).name' <<<"$ALLST")
      [[ -z "$nm" ]] && nm=$(api GET "/rest/api/3/status/$r" | jq -r .name)
      if [[ "$nm" == "Pre Code (duplicate)" || "$nm" == "Pre Coding" ]]; then
        echo "dropping legacy/duplicate '$nm' ($r) from workflow"; DROPPED+=("$r")
      elif [[ "${DROP_IN_PROGRESS:-0}" == 1 && "$nm" == "In Progress" && "$IPC" == 0 ]]; then
        echo "dropping unused '$nm' ($r) from workflow"; DROPPED+=("$r")
      else
        echo "keeping extra status '$nm' ($r)"; REFS+=("$r")
      fi
    fi
  done
  REFJSON=$(printf '%s\n' "${REFS[@]}" | jq -R . | jq -s .)
  NAMES=$(for r in "${REFS[@]}"; do jq -nr --arg r "$r" --argjson a "$ALLST" '$a[]|select(.id==$r)|{id,name,statusCategory,statusReference:.id}' ; done | jq -s .)
  # fill in status objects for globals not in project search
  for r in "${REFS[@]}"; do jq -e --arg r "$r" 'any(.[];.id==$r)' <<<"$NAMES" >/dev/null || NAMES=$(jq --argjson s "$(api GET /rest/api/3/status/$r | jq '{id,name,statusCategory:.statusCategory.key|ascii_upcase|sub("NEW";"TODO")|sub("INDETERMINATE";"IN_PROGRESS"),statusReference:.id}')" '.+[$s]' <<<"$NAMES"); done
  DJ=$( ((${#DROPPED[@]})) && printf '%s\n' "${DROPPED[@]}" | jq -R . | jq -s . || echo '[]')
  ITS=$(api GET "/rest/api/3/project/$KEY/statuses" | jq '[.[].id]')
  MAP=$(jq -n --argjson d "$DJ" --argjson its "$ITS" --arg p "$PID" --arg to "$(idget Coding)" 'if ($d|length)==0 then [] else [$its[]|{issueTypeId:., projectId:$p, statusMigrations:[]}] end')
  INIT=$(jq '[.transitions[]|select(.type=="INITIAL")]' <<<"$WF")
  BODY=$(jq -n --argjson wf "$WF" --argjson refs "$REFJSON" --argjson st "$NAMES" --argjson init "$INIT" --argjson map "$MAP" '
    {statuses:$st,
     workflows:[{id:$wf.id, version:$wf.version, statusMappings:(if env.NOMAP=="1" then [] else $map end),
       statuses:[ $refs|to_entries[]|{statusReference:.value, properties:{}, layout:{x:(.key*200),y:0}} ],
       transitions: ($init + ( [$wf.transitions[]|select(.type!="INITIAL")|{(.toStatusReference):.id}]|add // {} ) as $ex | ([$wf.transitions[].id|tonumber]|max // 1) as $mx | [ $refs|to_entries[]|{id:($ex[.value] // ((($mx/10|floor)+.key+1)*10+1|tostring)), name:(.value as $v|$st[]|select(.id==$v).name), type:"GLOBAL", toStatusReference:.value, links:[], properties:{}, actions:[], validators:[], triggers:[]} ])
     }]}')
  V=$(api POST /rest/api/3/workflows/update/validation -d "$(jq '{payload:.,validationOptions:{levels:["ERROR"]}}' <<<"$BODY")")
  if [[ $(jq '.errors|length' <<<"$V") != 0 ]]; then echo "validation errors: $V" >&2; exit 1; fi
  R=$(api POST /rest/api/3/workflows/update -d "$BODY")
  jq -e '.workflows' <<<"$R" >/dev/null || { echo "update failed: $R" >&2; exit 1; }
  echo "workflow $(jq -r .name <<<"$WF") updated"
done
# Delete legacy duplicate statuses only after every workflow has stopped referencing them.
for sid in $DUPLICATE_STATUS_IDS; do
  if [[ "$DRY" != --dry-run ]]; then
    DEL=$(api DELETE "/rest/api/3/statuses?id=$sid" || true)
    if [[ -z "$DEL" ]]; then echo "removed legacy status id=$sid"; else echo "legacy status id=$sid retained: $DEL"; fi
  fi
done
# ---- column order: Jira has no public API to reorder board columns (team-managed boards append new ones after Done),
# so read the board and print the exact order to drag into.
BID=$(api GET "/rest/agile/1.0/board?projectKeyOrId=$KEY&maxResults=1" | jq -r '.values[0].id // empty' 2>/dev/null || true)
HAVE=(); [[ -n "$BID" ]] && while IFS= read -r l; do HAVE+=("$l"); done < <(api GET "/rest/agile/1.0/board/$BID/configuration" | jq -r '.columnConfig.columns[].name' 2>/dev/null || true)  # bash 3.2 (macOS): no mapfile
norm() { tr '[:upper:]' '[:lower:]' <<<"$1"; }
GOT=(); for h in "${HAVE[@]}"; do for w in "${WANT[@]}"; do [[ $(norm "$h") == $(norm "$w") ]] && GOT+=("$w"); done; done
EXP=(); for w in "${WANT[@]}"; do for g in "${GOT[@]}"; do [[ "$g" == "$w" ]] && { EXP+=("$w"); break; }; done; done
echo "Done. Workflow ready."
if [[ -z "$BID" ]]; then echo "Could not read the board; make sure its columns are in this order (Done last):"; ORDER_BAD=1
elif [[ "${GOT[*]}" != "${EXP[*]}" || ${#GOT[@]} -lt ${#WANT[@]} ]]; then echo "Board $BID columns now: ${HAVE[*]/%/,}"; ORDER_BAD=1; else ORDER_BAD=0; echo "Board $BID columns are in the right order."; fi
if [[ "$ORDER_BAD" == 1 ]]; then
  echo
  echo "LAST STEP (by hand, Jira has no API for this): open the board > ... (top right) > Configure board / Board settings > Columns"
  echo "  $SITE/jira/software/projects/$KEY/boards/${BID:-<id>}"
  echo "and drag the columns into exactly this order, left to right (Done LAST):"
  i=1; for w in "${WANT[@]}"; do echo "  $i. $w"; i=$((i+1)); done
  echo "Company-managed boards: also map each status to its column. Then run /doctor."
fi
