#!/usr/bin/env bash
set -euo pipefail

# Listener binaries are optional public distribution artifacts. The Rust source
# stays in the private server repo; end users only download a Release asset.
base="${AH_RUST_RELEASE_BASE_URL:-https://github.com/jokerphuongnam/agents-holding-cli/releases/latest/download}"
os="$(uname -s | tr '[:upper:]' '[:lower:]')"
arch="$(uname -m)"
case "$os:$arch" in
  darwin:arm64) target="aarch64-apple-darwin" ;;
  darwin:x86_64) target="x86_64-apple-darwin" ;;
  linux:x86_64) target="x86_64-unknown-linux-gnu" ;;
  linux:aarch64|linux:arm64) target="aarch64-unknown-linux-gnu" ;;
  msys_nt*:x86_64|mingw*:x86_64) target="x86_64-pc-windows-msvc.exe" ;;
  *) echo "unsupported platform: $os/$arch" >&2; exit 2 ;;
esac

install_dir="${AH_INSTALL_DIR:-$HOME/.agents-holding}/bin"
mkdir -p "$install_dir"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
archive="$tmp/agents-holding-listener-$target"
curl -fsSL "$base/agents-holding-listener-$target" -o "$archive"
if curl -fsSL "$base/agents-holding-listener-$target.sha256" -o "$archive.sha256"; then
  (cd "$tmp" && sha256sum -c "$(basename "$archive.sha256")")
fi
install -m 755 "$archive" "$install_dir/agents-holding-listener"
echo "installed Rust Jira Listener: $install_dir/agents-holding-listener"
