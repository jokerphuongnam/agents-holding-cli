#!/usr/bin/env bash
# Lazy permission runtime. The policy hook/sandbox is already shipped in the
# client artifact; this marker makes installation explicit and idempotent only
# after a company/staff deny rule is created.
set -euo pipefail
dest="${AH_INSTALL_DIR:-$HOME/.agents-holding}/runtime"
mkdir -p "$dest"
printf 'enabled_at=%s\nmode=deny-interceptor\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$dest/permission-listener"
chmod 600 "$dest/permission-listener"
echo "permission listener enabled: $dest/permission-listener"
