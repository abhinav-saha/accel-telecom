#!/usr/bin/env bash
# One-command start (macOS / Linux): creates the virtualenv on first run, then serves the app.
#   ./run.sh                -> http://localhost:8000
#   PORT=8001 ./run.sh      -> different port
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d .venv ]; then
  # The OCR engine (onnxruntime) supports Python 3.9-3.12, so pick a matching interpreter.
  PY=""
  for cand in python3.12 python3.11 python3.10 python3.9 python3; do
    if command -v "$cand" >/dev/null 2>&1 &&
       "$cand" -c 'import sys; sys.exit(0 if (3, 9) <= sys.version_info[:2] <= (3, 12) else 1)' 2>/dev/null; then
      PY="$cand"; break
    fi
  done
  if [ -z "$PY" ]; then
    echo "Python 3.9-3.12 is required (found: $(python3 --version 2>&1 || echo none))."
    echo "Install Python 3.12 from https://www.python.org/downloads/ and run ./run.sh again."
    exit 1
  fi
  echo "First run: creating .venv with $($PY --version) and installing packages (2-5 minutes)..."
  "$PY" -m venv .venv
  .venv/bin/python -m pip install --upgrade pip
  .venv/bin/pip install -r requirements.txt
fi

[ -f .env ] || cp .env.example .env
echo ""
echo "Customer app : http://localhost:${PORT:-8000}"
echo "Back-office  : http://localhost:${PORT:-8000}/admin   (PIN 2026)"
echo "Stop         : Ctrl+C"
echo ""
exec .venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port "${PORT:-8000}" --no-access-log
