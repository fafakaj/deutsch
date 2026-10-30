#!/usr/bin/env python3
"""Build data/plan.json, data/quizzes.json, data/anki.json from content/ (format: content/README.md).

Usage: python3 tools/build_plan.py
"""
import hashlib
import json
import re
from datetime import date, timedelta
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
START = date(2026, 11, 2)
WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
BLOCK_OF_DAY = [0, 0, 1, 1, 2, 2, 2]  # Mon–Tue, Wed–Thu, Fri–Sun


def article_title(root, slug):
    path = root / "data" / "articles" / f"{slug}.md"
    if not path.exists():
        raise ValueError(f"нет конспекта {path}")
    m = re.search(r"^title:\s*(.+)$", path.read_text().split("\n---", 1)[0], re.M)
    if not m:
        raise ValueError(f"{path}: нет title в front matter")
    return m.group(1).strip()


def card_id(deck, front):
    return hashlib.sha1(f"{deck}\n{front}".encode()).hexdigest()[:10]


def build(root=ROOT):
    """Return (plan, quizzes, anki) built from root/content."""
    root = Path(root)
    episodes = {e["n"]: e for e in json.loads((root / "data" / "refs" / "nicos-weg-a1.json").read_text())["episodes"]}
    plan = {"start": START.isoformat(), "github_user": "fafakaj", "weeks": []}
    quizzes, cards = {}, []
    for wdir in sorted((root / "content").glob("w*/"), key=lambda p: int(p.name[1:])):
        week = yaml.safe_load((wdir / "week.yaml").read_text())
        n = week["n"]
        deck = f"Неделя {n}"
        blocks = [{"id": f"w{n:02d}-b{i + 1}", "n": i + 1, "title": t, "due": None, "steps": []}
                  for i, t in enumerate(week["blocks"])]
        days = []
        for dpath in sorted(wdir.glob("[1-7]-*.yaml")):
            di = int(dpath.name[0])
            src = yaml.safe_load(dpath.read_text())
            iso = str(src["date"])
            want = (START + timedelta(days=7 * (n - 1) + di - 1)).isoformat()
            if iso != want:
                raise ValueError(f"{dpath}: date {iso}, ожидалась {want}")
            wd = WEEKDAYS[di - 1]
            day = {"date": iso, "weekday": wd, "title": src["title"], "hours": src["hours"], "kind": src["kind"],
                   "intro": src.get("intro", ""), "optional": src.get("optional", []), "steps": []}
            for k, s in enumerate(src["steps"], 1):
                step = {"id": f"w{n:02d}-{wd}-{k:02d}", **{key: v for key, v in s.items() if key not in ("cards", "article", "episode")}}
                if isinstance(step.get("quiz"), dict):
                    q = dict(step["quiz"])
                    qid = q.pop("id")
                    if qid in quizzes:
                        raise ValueError(f"{dpath}: повтор id квиза {qid}")
                    quizzes[qid] = q
                    step["quiz"] = qid
                if "article" in s:
                    step["source"] = {"title": article_title(root, s["article"]), "url": f"#/read/{s['article']}",
                                      "lang": "ru", "type": "article"}
                if "episode" in s:
                    e = episodes.get(s["episode"])
                    if not e or not e.get("youtube"):
                        raise ValueError(f"{dpath}: нет эпизода Nicos Weg {s['episode']} с YouTube")
                    step["source"] = {"title": f"DW «Nicos Weg» A1, Folge {e['n']}: {e['title']} (YouTube)", "url": e["youtube"],
                                      "lang": "de", "type": "video", "verified": e["youtube_verified"]}
                    step["alt"] = [{"title": f"DW Learn German: урок «{e['title']}» с упражнениями (может требовать VPN)",
                                    "url": e["url"], "lang": "de", "type": "video", "verified": e["verified"]}] + list(s.get("alt") or [])
                if step["type"] == "words":
                    step["deck"] = f"w{n}d{di}"
                if step["type"] == "anki":
                    step["deck"] = deck
                    for front, back in s.get("cards") or []:
                        cards.append({"id": card_id(deck, front), "day": iso, "deck": deck, "deck_full": f"DE::{deck}",
                                      "kind": "basic", "front": front, "back": back})
                day["steps"].append(step)
                blocks[BLOCK_OF_DAY[di - 1]]["steps"].append(step["id"])
                blocks[BLOCK_OF_DAY[di - 1]]["due"] = iso
            days.append(day)
        plan["weeks"].append({"n": n, "title": week["title"], "short": week["short"], "goal": week["goal"],
                              "days": days, "blocks": [b for b in blocks if b["steps"]]})
    return plan, quizzes, {"cards": cards}


def write(root, plan, quizzes, anki):
    data = Path(root) / "data"
    for name, obj in (("plan", plan), ("quizzes", quizzes), ("anki", anki)):
        (data / f"{name}.json").write_text(json.dumps(obj, ensure_ascii=False, indent=1) + "\n")


def main():
    plan, quizzes, anki = build(ROOT)
    write(ROOT, plan, quizzes, anki)
    days = sum(len(w["days"]) for w in plan["weeks"])
    print(f"plan.json: недель {len(plan['weeks'])}, дней {days}; квизов {len(quizzes)}; карточек {len(anki['cards'])}")


if __name__ == "__main__":
    main()
