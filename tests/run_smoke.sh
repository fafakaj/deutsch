#!/usr/bin/env bash
# Smoke test of the site shell on fixture data (tests/fixtures): every step type renders and works,
# no JS errors, no sideways scroll on a phone. Real data is checked by tools/check_*.py.
# Run: bash tests/run_smoke.sh   (DATA=data: the real data; DATA=data DATA_DIR=dir: data from another folder)
set -euo pipefail
APP="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'kill $SERVER 2>/dev/null; rm -rf "$TMP"' EXIT
cp -r "$APP"/{index.html,js,css,vendor,words,server.py} "$TMP"/
mkdir -p "$TMP/data/articles"
if [ -n "${DATA_DIR:-}" ]; then
  cp -r "$DATA_DIR"/* "$TMP/data/"
elif [ "${DATA:-}" = data ]; then
  cp -r "$APP"/data/{plan,quizzes,anki,words}.json "$APP"/data/articles "$TMP/data/"
else
  cp "$APP"/tests/fixtures/*.json "$TMP/data/" && cp "$APP"/tests/fixtures/*.md "$TMP/data/articles/"
fi
echo '{}' >"$TMP/progress.json"
PORT=${PORT:-8797}
python3 "$TMP/server.py" --port "$PORT" --progress "$TMP/progress.json" >"$TMP/server.log" 2>&1 &
SERVER=$!
PW="$(dirname "$(find ~/.npm/_npx -maxdepth 3 -type d -path '*node_modules/playwright' | head -1)")"
for _ in $(seq 30); do curl -fs "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break; sleep 0.2; done
NODE_PATH="$PW" BASE="http://127.0.0.1:$PORT" REAL="${DATA:-}" node "$APP/tests/smoke.cjs"
