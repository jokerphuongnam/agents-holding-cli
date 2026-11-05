#!/bin/bash
# Arrow-key menus: bash helper (full/lib/menu.sh, embedded copies) + Node helper (menu.mjs), keys simulated through a pty.
f=0; here="$(cd "$(dirname "$0")/.." && pwd)"; cd "$here"; D="python3 tests/pty_drive.py"
M='source full/lib/menu.sh; ah_menu r 1 "Pick one" alpha beta gamma; echo "R=$r rc=$?"'
chk() { if printf '%s' "$2" | grep -qF -- "$3"; then echo "PASS $1"; else echo "FAIL $1"; printf '%s\n' "$2" | tail -3 | cat -v; f=$((f+1)); fi; }
chk "down down enter -> 3"      "$($D '\x1b[B|\x1b[B|\r' /bin/bash -c "$M")" "R=3"
chk "up wraps to last"          "$($D '\x1b[A|\r' /bin/bash -c "$M")" "R=3"
chk "j/k move"                  "$($D 'j|j|k|\r' /bin/bash -c "$M")" "R=2"
chk "SS3 arrows (ESC O B)"      "$($D '\x1bOB|\r' /bin/bash -c "$M")" "R=2"
chk "number shortcut"           "$($D '3' /bin/bash -c "$M")" "R=3"
chk "enter = default"           "$($D '\r' /bin/bash -c 'source full/lib/menu.sh; ah_menu r 2 T a b c; echo R=$r')" "R=2"
chk "highlight on current item" "$($D '\x1b[B|\r' /bin/bash -c "$M")" "❯ 2) beta"
chk "curl | bash (stdin is a pipe)" "$($D '\x1b[B|\r' /bin/bash -c "printf '%s\n' 'set -euo pipefail' '$M' | /bin/bash")" "R=2"
o="$($D '\x1b[B|\x03' python3 tests/ctrlc_wrap.py /bin/bash -c 'source full/lib/menu.sh; ah_menu r 1 T a b; echo NOTREACHED')"
chk "Ctrl-C exits 130" "$o" "rc=130"; chk "Ctrl-C restores the terminal" "$o" "STTY_RESTORED"
if printf '%s' "$o" | grep -q NOTREACHED; then echo "FAIL Ctrl-C cancels"; f=$((f+1)); else echo "PASS Ctrl-C cancels"; fi
chk "AH_NONINTERACTIVE=1 -> fallback (rc 2)" "$($D '' /bin/bash -c "AH_NONINTERACTIVE=1; $M")" "R= rc=2"
chk "no tty -> fallback (rc 2)" "$(python3 -c 'import subprocess,sys;print(subprocess.run(["/bin/bash","-c",sys.argv[1]],stdin=subprocess.DEVNULL,capture_output=True,text=True,start_new_session=True).stdout)' "$M")" "R= rc=2"
bash full/lib/embed-menu.sh --check && echo "PASS embedded copies in sync" || { echo "FAIL embedded copies in sync"; f=$((f+1)); }
for s in full/connect.sh full/install.sh full/client/scripts/ah-cli.sh; do /bin/bash -n "$s" && echo "PASS bash 3.2 parses $s" || { echo "FAIL parse $s"; f=$((f+1)); }; done
# connect.sh (Keychain shimmed) still honours AH_KEY_CHOICE (no menu): an invalid choice dies with the old message, not a menu
chk "connect.sh AH_KEY_CHOICE fallback" "$(PATH="$here/tests/shim:$PATH" AH_REPLACE_KEY=1 AH_KEY_CHOICE=9 AH_LANG=en /bin/bash full/connect.sh 2>&1 </dev/null)" "choose 1 (Generate key) or 2 (Import key)"
S="PATH=$here/tests/shim:$PATH"
o="$($D '\r' env "$S" SHIM_LICENSE=1 AH_LANG=en /bin/bash full/client/scripts/ah-cli.sh key generate; echo "rc=$?")"
chk "ah-cli replace-key menu shown" "$o" "❯ 1) No, keep the current key"; chk "ah-cli: Enter = No (exit 1)" "$o" "[exit 1]"
chk "ah-cli: AH_NONINTERACTIVE keeps [y/N]" "$(printf 'n\n' | env "$S" SHIM_LICENSE=1 AH_NONINTERACTIVE=1 AH_LANG=en /bin/bash full/client/scripts/ah-cli.sh key generate 2>&1; echo "rc=$?")" "rc=1"
T="$(mktemp -d)"
o="$($D '3' env "$S" HOME="$T" AH_INSTALL_DIR="$T/ah" AH_SRC="$here" /bin/bash full/install.sh --no-key)"
chk "install.sh agent menu" "$o" "Add the agents-holding MCP server to which agents?"
if [ -f "$T/.grok/config.toml" ]; then echo "FAIL install.sh menu: None configures nothing"; f=$((f+1)); else echo "PASS install.sh menu: None configures nothing"; fi
o="$(env "$S" HOME="$T" AH_INSTALL_DIR="$T/ah" AH_SRC="$here" /bin/bash full/install.sh --no-key --agent grok </dev/null 2>&1)"
chk "install.sh --agent: no menu, old behavior" "$o" "Grok: added agents-holding"; rm -rf "$T"
# Node helper
N=full/client/scripts
P="import('./$N/menu.mjs').then(async m=>{const i=await m.select('Pick',['a','b','c']);console.log('I='+i)})"
chk "node: down enter -> 1"   "$($D '\x1b[B|\r' node -e "$P")" "I=1"
chk "node: up wraps"           "$($D '\x1b[A|\r' node -e "$P")" "I=2"
chk "node: j/k + number"       "$($D 'j|k|3' node -e "$P")" "I=2"
o="$($D '\x1b[B|\x03' python3 tests/ctrlc_wrap.py node -e "$P")"
chk "node: Ctrl-C exits 130" "$o" "rc=130"; chk "node: Ctrl-C restores the terminal" "$o" "STTY_RESTORED"
chk "node: non-interactive -> null" "$(AH_NONINTERACTIVE=1 node -e "$P")" "I=null"
chk "node: no tty -> null" "$(node -e "$P" </dev/null | cat)" "I=null"
chk "staff presets: pick with arrows" "$($D '\x1b[B|\r' node $N/presets.mjs)" "--preset "
chk "staff presets: no tty keeps the list" "$(node $N/presets.mjs </dev/null | tail -1)" "Attach to a staff"
# holding provider set (bind-cli): Default/Custom + effort menus; non-tty keeps the remembered binding, no prompt
T="$(mktemp -d)"; mkdir -p "$T/.config/agents-holding"
chk "bind-cli: Custom + effort via arrows" "$($D '\x1b[B|\r|\r|\r|gpt-x\r|\x1b[B|\x1b[B|\x1b[B|\r' env HOME="$T" AH_LANG=en node $N/bind-cli.mjs engineer --company demo)" "engineer - grok/gpt-x - high"
chk "bind-cli: Enter = Default" "$($D '\r' env HOME="$T" AH_LANG=en node $N/bind-cli.mjs engineer --company demo)" "engineer - grok/gpt-x - high"
chk "bind-cli: no tty -> remembered, no menu" "$(HOME="$T" node $N/bind-cli.mjs engineer --company demo </dev/null 2>&1)" "engineer - grok/gpt-x - high"
rm -rf "$T"
echo "menu_test: $f failures"; exit $f
