#!/usr/bin/env bash
# Linux TPM 2.0 P-256 device key via tpm2-tools. The private part is sealed to this TPM (blob useless elsewhere).
# usage: tpm2.sh available|pubkey|sign <file>   (pubkey/sign print base64; signature is DER ECDSA-SHA256)
set -euo pipefail
D="${XDG_CONFIG_HOME:-$HOME/.config}/agents-holding/device-key/tpm"; umask 077
have() { command -v tpm2_createprimary >/dev/null && { [ -e /dev/tpmrm0 ] || [ -e /dev/tpm0 ]; }; }
ensure() {
  [ -f "$D/key.ctx" ] && return; mkdir -p "$D"
  tpm2_createprimary -Q -C o -g sha256 -G ecc256 -c "$D/primary.ctx"
  tpm2_create -Q -C "$D/primary.ctx" -G ecc256:ecdsa-sha256 -u "$D/key.pub" -r "$D/key.priv" -a 'fixedtpm|fixedparent|sensitivedataorigin|userwithauth|sign'
  tpm2_load -Q -C "$D/primary.ctx" -u "$D/key.pub" -r "$D/key.priv" -c "$D/key.ctx"
}
case "${1:-}" in
  available) have ;;
  pubkey) have || exit 2; ensure; tpm2_readpublic -Q -c "$D/key.ctx" -f der -o "$D/pub.der"; base64 < "$D/pub.der" | tr -d '\n'; echo ;;
  sign) have || exit 2; ensure; f="${2:--}"; [ "$f" = - ] && { f="$D/in.bin"; cat > "$f"; }
        tpm2_sign -Q -c "$D/key.ctx" -g sha256 -f der -o "$D/sig.der" "$f"; base64 < "$D/sig.der" | tr -d '\n'; echo ;;
  *) echo "usage: tpm2.sh available|pubkey|sign <file>" >&2; exit 64 ;;
esac
