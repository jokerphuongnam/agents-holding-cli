#!/bin/bash
# Usage: scripts/launchd/install.sh /path/to/company-repo   (= holding listener start --repo DIR && holding listener autostart on)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
bash "$here/listener.sh" on --repo "${1:?usage: install.sh <company-repo-dir>}"
bash "$here/listener.sh" autostart on
