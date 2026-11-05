# >>> ah_menu (canonical: full/lib/menu.sh; embedded copies are checked by tests/menu_test.sh)
# ah_menu VAR DEFAULT "Title" "item 1" "item 2" ...  -> arrow-key selector on /dev/tty (works under curl | bash).
# Up/Down or k/j move, Enter chooses, 1-9 pick directly, Ctrl-C cancels (terminal restored, exit 130).
# Sets VAR to the chosen 1-based number and returns 0. Returns 2 (VAR untouched) when not interactive:
# AH_NONINTERACTIVE=1, CI set, or no usable /dev/tty -> callers keep their numeric/env fallback. bash 3.2 safe.
ah_menu() {
  local __v="$1" __d="${2:-1}" __t="$3"; shift 3
  local __n=$# __c __k __k2 __st __oi
  [ "${AH_NONINTERACTIVE:-0}" = 1 ] && return 2; [ -n "${CI:-}" ] && return 2
  [ "$__n" -gt 0 ] || return 2
  { exec 3</dev/tty; } 2>/dev/null || return 2
  __st="$(stty -g <&3 2>/dev/null)" || { exec 3<&-; return 2; }
  exec 4>/dev/tty
  __c=$((__d - 1)); [ "$__c" -ge 0 ] && [ "$__c" -lt "$__n" ] || __c=0
  __oi="$(trap -p INT)"
  # bash's read -n turns ISIG back on, so Ctrl-C can arrive as SIGINT inside read: restore the tty, then die of SIGINT (exit 130)
  trap 'stty "$__st" <&3 2>/dev/null; printf "\033[?25h\n" >&4; trap - INT; kill -INT $$' INT
  stty -echo -icanon -isig min 1 time 0 <&3 2>/dev/null   # -isig: Ctrl-C arrives as a byte, handled below
  printf '\033[?25l%s\n' "$__t" >&4
  __ah_menu_draw() { local j=0 s; for s in "$@"; do
      if [ "$j" -eq "$__c" ]; then printf '\033[2K  \033[1;36m❯ %d) %s\033[0m\n' $((j + 1)) "$s" >&4
      else printf '\033[2K    %d) %s\n' $((j + 1)) "$s" >&4; fi; j=$((j + 1)); done
    printf '\033[2K  \033[2m↑/↓ move · Enter choose · 1-%d shortcut · Ctrl-C cancel\033[0m\n' "$__n" >&4; }
  __ah_menu_draw "$@"
  while :; do
    __k=""; IFS= read -rsn1 __k <&3 || break
    case "$__k" in
      $'\e') __k2=""; IFS= read -rsn1 -t 1 __k2 <&3 || true
        if [ "$__k2" = "[" ] || [ "$__k2" = "O" ]; then IFS= read -rsn1 -t 1 __k2 <&3 || true
          case "$__k2" in A) __c=$(( (__c - 1 + __n) % __n ));; B) __c=$(( (__c + 1) % __n ));; esac; fi ;;
      k|K) __c=$(( (__c - 1 + __n) % __n ));;
      j|J) __c=$(( (__c + 1) % __n ));;
      [1-9]) [ "$__k" -le "$__n" ] && { __c=$((__k - 1)); printf '\033[%dA' $((__n + 1)) >&4; __ah_menu_draw "$@"; break; } ;;
      $'\003') stty "$__st" <&3 2>/dev/null; printf '\033[?25h\n' >&4; exit 130;;   # Ctrl-C: cancel cleanly
      ""|$'\r'|$'\n') break;;
    esac
    printf '\033[%dA' $((__n + 1)) >&4; __ah_menu_draw "$@"
  done
  stty "$__st" <&3 2>/dev/null; printf '\033[?25h' >&4
  exec 3<&- 4>&-
  if [ -n "$__oi" ]; then eval "$__oi"; else trap - INT; fi
  unset -f __ah_menu_draw
  printf -v "$__v" '%s' $((__c + 1)); return 0
}
# <<< ah_menu
