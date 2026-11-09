#!/usr/bin/env bash
# Builds dist/udyam-digital.zip: a clean copy of the project for submission.
# Leaves out the virtualenv, local secrets (.env), runtime data, caches and the organiser's brief.
set -euo pipefail
cd "$(dirname "$0")/.."

NAME="udyam-digital"
STAGE="$(mktemp -d)/$NAME"
mkdir -p "$STAGE" dist

INCLUDE=(README.md requirements.txt requirements-dev.txt pytest.ini run.sh run.bat .env.example .gitignore
         backend frontend data docs tests scripts)
for item in "${INCLUDE[@]}"; do
  cp -R "$item" "$STAGE/"
done

find "$STAGE" \( -name "__pycache__" -o -name ".pytest_cache" -o -name ".DS_Store" \) -prune -exec rm -rf {} +

rm -f "dist/$NAME.zip"
(cd "$(dirname "$STAGE")" && zip -qr -X "$OLDPWD/dist/$NAME.zip" "$NAME")
rm -rf "$(dirname "$STAGE")"

echo "Created dist/$NAME.zip ($(du -h "dist/$NAME.zip" | cut -f1))"
