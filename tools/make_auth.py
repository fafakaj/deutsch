"""Add or update one account in data/auth.json: the site's logins.

Each account keeps its own payload {token, gist}, encrypted with a key derived from that account's
password (PBKDF2-SHA256, 600 000 rounds, AES-256-GCM). Only salt, iv and ciphertext go to the repo;
the password and the token never do. js/auth.js decrypts it in the browser.

An account without --token-file has no sync: its progress stays in the browser it is used in.
Never give the token to an account with a short password: auth.json is public, so a guessable
password makes the token public too. The first account is the owner (server.py uses progress.json
for it).

Run (password is asked, not passed on the command line):
    uv run --no-project --with cryptography python tools/make_auth.py --user fafakaj \
        --token-file ~/.config/claude/ml-site-token --gist <gist id>
    uv run --no-project --with cryptography python tools/make_auth.py --user neighbour
"""

import argparse
import base64
import getpass
import json
import os
from pathlib import Path

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

ITER = 600_000
OUT = Path(__file__).resolve().parents[1] / "data" / "auth.json"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--user", required=True)
    ap.add_argument("--token-file", type=Path, help="без токена вход работает, но прогресс не синхронизируется между устройствами")
    ap.add_argument("--gist", help="the account's secret gist with progress.json (needed with a token)")
    ap.add_argument("--password-env", help="read the password from this environment variable instead of a prompt")
    opts = ap.parse_args()
    if opts.token_file and not opts.gist:
        ap.error("--token-file needs --gist")

    token = opts.token_file.expanduser().read_text().strip() if opts.token_file else None
    password = os.environ[opts.password_env] if opts.password_env else getpass.getpass("Пароль для сайта: ")
    salt, iv = os.urandom(16), os.urandom(12)
    key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITER).derive(password.encode())
    payload = json.dumps({"token": token, "gist": opts.gist}).encode()
    ct = AESGCM(key).encrypt(iv, payload, None)
    b64 = lambda b: base64.b64encode(b).decode()  # noqa: E731
    entry = {"user": opts.user, "iter": ITER, "salt": b64(salt), "iv": b64(iv), "ct": b64(ct)}
    accounts = []
    if OUT.exists():
        old = json.loads(OUT.read_text())
        accounts = old.get("accounts", [old] if "user" in old else [])
    same = [i for i, a in enumerate(accounts) if a["user"].lower() == opts.user.lower()]
    if same:
        accounts[same[0]] = entry
    else:
        accounts.append(entry)
    OUT.write_text(json.dumps({"accounts": accounts}, indent=1) + "\n")
    print(f"Записано: {OUT}. Аккаунты: {', '.join(a['user'] for a in accounts)}"
          f"{'' if token else f'. У {opts.user} нет синхронизации'}")


if __name__ == "__main__":
    main()
