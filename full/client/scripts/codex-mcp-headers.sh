#!/usr/bin/env bash
# Codex HTTP header helper; read credentials at request startup from Keychain.
set -euo pipefail
key="$(security find-generic-password -s agents-holding-license -a "$USER" -w 2>/dev/null)"
device="$(security find-generic-password -s agents-holding-device -a "$USER" -w 2>/dev/null)"
[ -n "$key" ] && [ -n "$device" ] || exit 1
name="$(scutil --get LocalHostName 2>/dev/null || hostname -s)"
name="$(printf '%s' "$name" | LC_ALL=C tr -cd 'A-Za-z0-9 ._-')"
printf '{"Authorization":"Bearer %s","X-AH-Device":"%s","X-AH-Device-Name":"%s"}\n' "$key" "$device" "$name"
