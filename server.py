"""Local server for the study app.

Serves the site as static files and keeps progress in logs/progress.json (ignored by git).
Other site accounts (api/progress?user=NAME) get their own progress-NAME.json next to it;
the owner (the first account in data/auth.json) and a session without login share progress.json.
Run: python3 app/server.py [--port 8765] [--open] [--progress FILE]  (tests pass their own FILE)
"""

import argparse
import json
import os
import re
import tempfile
import threading
import webbrowser
from datetime import UTC, datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

APP = Path(__file__).resolve().parent
PROGRESS = APP / "logs" / "progress.json"
BACKUPS = APP / "logs" / "progress_backups"
MAX_BODY = 5 * 1024 * 1024
LOCK = threading.Lock()


def owner():
    try:
        accounts = json.loads((APP / "data" / "auth.json").read_text())["accounts"]
        return accounts[0]["user"].lower()
    except (OSError, KeyError, IndexError, json.JSONDecodeError):
        return ""


def progress_file(user):
    """None for a user name that is not a plain identifier."""
    user = (user or "").lower()
    if not user or user == owner():
        return PROGRESS
    if not re.fullmatch(r"[a-z0-9_-]{1,40}", user):
        return None
    return PROGRESS.with_name(f"{PROGRESS.stem}-{user}.json")


def read_progress(path):
    if path.exists():
        return json.loads(path.read_text())
    return {"version": 1, "steps": {}, "code": {}, "events": []}


def write_progress(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    # Atomic replace: a crash mid-write never leaves a broken file.
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".progress-", suffix=".json")
    with os.fdopen(fd, "w") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)
    # One backup per day, so a bad save can be undone.
    BACKUPS.mkdir(exist_ok=True)
    daily = BACKUPS / f"{path.stem}-{datetime.now():%Y-%m-%d}.json"
    daily.write_text(path.read_text())


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".mjs": "text/javascript",
        ".js": "text/javascript",
        ".wasm": "application/wasm",
        ".json": "application/json",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(APP), **kwargs)

    def end_headers(self):
        # Data files change while the app is open; never serve them stale.
        if self.path.startswith(("/data/", "/api/", "/js/", "/css/", "/words/", "/index.html")) or self.path == "/":
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        if "/api/" in self.path:
            super().log_message(fmt, *args)

    def _json(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _progress_path(self):
        """The progress file for api/progress[?user=NAME]; False for another path, None for a bad name."""
        url = urlsplit(self.path)
        if url.path != "/api/progress":
            return False
        return progress_file(parse_qs(url.query).get("user", [""])[0])

    def do_GET(self):
        path = self._progress_path()
        if path is None:
            return self._json(400, {"error": "bad user"})
        if path:
            with LOCK:
                return self._json(200, read_progress(path))
        if self.path.startswith("/api/"):
            return self._json(404, {"error": "unknown endpoint"})
        return super().do_GET()

    def do_POST(self):
        path = self._progress_path()
        if path is False:
            return self._json(404, {"error": "unknown endpoint"})
        if path is None:
            return self._json(400, {"error": "bad user"})
        length = int(self.headers.get("Content-Length", 0))
        if length > MAX_BODY:
            return self._json(413, {"error": "too large"})
        try:
            data = json.loads(self.rfile.read(length))
        except json.JSONDecodeError:
            return self._json(400, {"error": "bad json"})
        if not isinstance(data, dict) or "steps" not in data:
            return self._json(400, {"error": "bad shape"})
        # Keep the client's stamp: the gist copy carries the same one, so "newest wins" compares like with like.
        data.setdefault("saved_at", datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z"))
        with LOCK:
            write_progress(path, data)
        return self._json(200, {"ok": True, "saved_at": data["saved_at"]})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--open", action="store_true")
    ap.add_argument("--progress", type=Path, help="progress file (default: logs/progress.json)")
    opts = ap.parse_args()
    global PROGRESS, BACKUPS
    if opts.progress:
        PROGRESS = opts.progress.resolve()
        BACKUPS = PROGRESS.parent / "progress_backups"
    server = ThreadingHTTPServer(("127.0.0.1", opts.port), Handler)
    url = f"http://127.0.0.1:{opts.port}/"
    print(f"Дорожка: {url}  (прогресс: {PROGRESS})")
    if opts.open:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
