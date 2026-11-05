#!/usr/bin/env bash
# Copy the canonical ah_menu (full/lib/menu.sh) into every script that must work standalone (curl | bash, installed client).
# usage: bash full/lib/embed-menu.sh [--check]   (--check: exit 1 if any copy differs)
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"; src="$root/full/lib/menu.sh"; bad=0
for f in full/connect.sh full/install.sh full/client/scripts/ah-cli.sh; do
  p="$root/$f"; new="$(awk -v src="$src" '/^# >>> ah_menu/{while((getline l < src)>0) print l; skip=1; next} /^# <<< ah_menu/{skip=0; next} !skip' "$p")"
  if [ "${1:-}" = --check ]; then [ "$new" = "$(cat "$p")" ] || { echo "out of sync: $f"; bad=1; }
  else printf '%s\n' "$new" > "$p.tmp" && cat "$p.tmp" > "$p" && rm "$p.tmp"; fi
done; exit $bad
