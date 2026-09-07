#!/usr/bin/env bash
# ============================================================================
#  USD Reference Graph - launcher (macOS / Linux)
#
#  ./usd-refgraph.sh [file.usda]
#
#  The first run sets everything up; later runs go straight to the app.
# ============================================================================

set -euo pipefail
cd "$(dirname "$0")"

VENV_PY=".venv/bin/python"

printf '\n  USD Reference Graph\n  ===================\n\n'

if [ ! -x "$VENV_PY" ]; then
  printf '  First run - setting this up. It takes a minute, and only happens once.\n\n'

  if command -v python3 >/dev/null 2>&1; then
    BOOT=python3
  elif command -v python >/dev/null 2>&1; then
    BOOT=python
  else
    printf '  [X] Python was not found. Install Python 3.9 or newer.\n\n'
    exit 1
  fi

  echo '  - creating the Python environment'
  "$BOOT" -m venv .venv

  echo '  - installing OpenUSD (usd-core, about 50 MB)'
  "$VENV_PY" -m pip install --quiet --disable-pip-version-check -r requirements.txt
  echo
fi

if [ ! -f "dist/index.html" ]; then
  if ! command -v npm >/dev/null 2>&1; then
    printf '  [X] The viewer has not been built, and Node.js was not found.\n'
    printf '      Install Node.js from https://nodejs.org, or use a copy of\n'
    printf '      this folder that already contains "dist".\n\n'
    exit 1
  fi
  [ -d node_modules ] || { echo '  - installing web dependencies'; npm install --silent; }
  echo '  - building the viewer'
  npm run build
  echo
fi

printf '  Starting. Your browser will open in a moment.\n'
printf '  Press Ctrl+C to stop.\n\n'

cd server
exec "../$VENV_PY" -m usd_refgraph "$@"
