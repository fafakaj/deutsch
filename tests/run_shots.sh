#!/usr/bin/env bash
# Screenshots of every screen (desktop and phone, light and dark) on the fixture data, or on the real
# data with DATA=data. Run: bash tests/run_shots.sh OUT_DIR
set -euo pipefail
APP="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$(realpath -m "${1:-$APP/tests/shots/ui}")"
TMP="$(mktemp -d)"
trap 'kill $SERVER 2>/dev/null; rm -rf "$TMP"' EXIT
cp -r "$APP"/{index.html,js,css,vendor,words,server.py} "$TMP"/
mkdir -p "$TMP/data/articles"
if [ "${DATA:-}" = data ]; then
  cp -r "$APP"/data/{plan,quizzes,anki,words}.json "$APP"/data/articles "$TMP/data/"
else
  cp "$APP"/tests/fixtures/*.json "$TMP/data/" && cp "$APP"/tests/fixtures/*.md "$TMP/data/articles/"
fi
echo '{"version": 1, "saved_at": "2026-11-02T09:00:00.000Z", "steps": {"w01-mon-01": {"status": "done"}}}' >"$TMP/progress.json"
PORT=${PORT:-8798}
python3 "$TMP/server.py" --port "$PORT" --progress "$TMP/progress.json" >"$TMP/server.log" 2>&1 &
SERVER=$!
PW="$(dirname "$(find ~/.npm/_npx -maxdepth 3 -type d -path '*node_modules/playwright' | head -1)")"
for _ in $(seq 30); do curl -fs "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break; sleep 0.2; done
NODE_PATH="$PW" BASE="http://127.0.0.1:$PORT" OUT="$OUT" node "$APP/tests/shots.cjs"
