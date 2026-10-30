#!/usr/bin/env python3
"""Validate site data for month 1 (CONTRACT.md, «Проверки»).

Usage: python3 tools/check_data.py [--partial]
--partial: do not require all 28 days (while weeks are still being written).
Exit code 1 when there are errors.
"""
import json
import re
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FIRST, LAST = date(2026, 11, 2), date(2026, 11, 29)
WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
STEP_TYPES = {"theory", "quiz", "oral", "practice", "anki", "words", "listen"}
QUESTION_TYPES = {"choice", "multi", "text", "de"}
# Skills each kind of day must cover (CONTRACT: reading/theory, listening, writing, speaking, words, cards).
NEEDS = {
    "study": ["theory", "listen", "practice", "oral", "words", "anki"],
    "exam": ["listen", "quiz", "practice", "oral"],
    "review": ["quiz", "anki"],
}
MINUTES = {"study": (100, 150), "exam": (100, 160), "review": (50, 100)}
STEP_ID = re.compile(r"^w(\d\d)-(mon|tue|wed|thu|fri|sat|sun)-(\d\d)$")
CARD_ID = re.compile(r"^[0-9a-f]{10}$")


def load(path, errors):
    try:
        return json.loads(path.read_text())
    except FileNotFoundError:
        errors.append(f"нет файла {path.relative_to(path.parent.parent)}")
    except json.JSONDecodeError as e:
        errors.append(f"{path.name}: неверный JSON: {e}")
    return None


def article_title(path):
    """Title from the front matter, or None when the article is missing or has no title."""
    if not path.exists():
        return None
    m = re.match(r"---\n(.*?)\n---\n", path.read_text(), re.S)
    if not m:
        return None
    t = re.search(r"^title:\s*(.+)$", m.group(1), re.M)
    return t.group(1).strip() if t else None


def check_link(where, src, errors):
    url = src.get("url", "")
    if not url:
        errors.append(f"{where}: у источника нет url")
    elif url.startswith("http") and not str(src.get("verified", "")).startswith("200"):
        errors.append(f"{where}: ссылка {url} без verified \"200 …\"")


def check_question(qid, i, q, errors):
    t = q.get("type")
    where = f"квиз {qid}, вопрос {i + 1}"
    if t not in QUESTION_TYPES:
        errors.append(f"{where}: неизвестный тип {t}")
        return
    if not str(q.get("q", "")).strip():
        errors.append(f"{where}: пустой текст вопроса")
    if t == "choice":
        opts = q.get("options") or []
        a = q.get("answer")
        if len(opts) < 2 or not isinstance(a, int) or not 0 <= a < len(opts):
            errors.append(f"{where}: answer должен быть индексом в options")
    elif t == "multi":
        opts = q.get("options") or []
        a = q.get("answers")
        if not a or not all(isinstance(x, int) and 0 <= x < len(opts) for x in a):
            errors.append(f"{where}: answers должны быть индексами в options")
    else:
        a = q.get("answer")
        vals = a if isinstance(a, list) else [a]
        if not vals or not all(isinstance(v, str) and v.strip() for v in vals):
            errors.append(f"{where}: пустой answer")


def check(root=ROOT, full=True):
    """Return a list of error strings; an empty list means the data is valid."""
    root = Path(root)
    data = root / "data"
    errors = []
    plan = load(data / "plan.json", errors)
    quizzes = load(data / "quizzes.json", errors) or {}
    anki = load(data / "anki.json", errors) or {"cards": []}
    words = load(data / "words.json", errors)
    if plan is None:
        return errors
    word_decks = {d["id"] for d in (words or {}).get("decks", [])}

    for qid, quiz in quizzes.items():
        for i, q in enumerate(quiz.get("questions") or []):
            check_question(qid, i, q, errors)
        if not quiz.get("questions"):
            errors.append(f"квиз {qid}: нет вопросов")

    anki_decks = {}
    seen_cards = set()
    for c in anki.get("cards", []):
        cid = c.get("id", "")
        if not CARD_ID.match(cid):
            errors.append(f"карточка {cid}: id должен быть 10 hex")
        if cid in seen_cards:
            errors.append(f"карточка {cid}: повтор id")
        seen_cards.add(cid)
        if not FIRST.isoformat() <= c.get("day", "") <= LAST.isoformat():
            errors.append(f"карточка {cid}: day {c.get('day')} вне месяца 1")
        if c.get("deck_full") != f"DE::{c.get('deck')}":
            errors.append(f"карточка {cid}: deck_full должен быть DE::{c.get('deck')}")
        if not c.get("front") or not c.get("back"):
            errors.append(f"карточка {cid}: пустая сторона")
        anki_decks[c.get("deck")] = anki_decks.get(c.get("deck"), 0) + 1

    step_date = {}
    all_days = []
    numbers = [w.get("n") for w in plan.get("weeks", [])]
    if numbers != sorted(set(numbers)) or not all(n in (1, 2, 3, 4) for n in numbers):
        errors.append(f"номера недель {numbers}: нужны 1–4 по порядку без повторов")
    for week in plan.get("weeks", []):
        wi = week.get("n") if week.get("n") in (1, 2, 3, 4) else 1
        if not week.get("goal"):
            errors.append(f"неделя {wi}: нет goal")
        for di, day in enumerate(week.get("days", []), 1):
            iso = day.get("date", "")
            all_days.append(iso)
            expected = FIRST + timedelta(days=7 * (wi - 1) + di - 1)
            if iso != expected.isoformat():
                errors.append(f"день {iso}: ожидалась дата {expected} (месяц 1: {FIRST}…{LAST})")
            if not FIRST.isoformat() <= iso <= LAST.isoformat():
                errors.append(f"день {iso}: вне месяца 1")
            try:
                wd = WEEKDAYS[date.fromisoformat(iso).weekday()]
            except ValueError:
                wd = None
            if day.get("weekday") != wd:
                errors.append(f"день {iso}: weekday {day.get('weekday')}, а по дате {wd}")
            kind = day.get("kind")
            if kind not in NEEDS:
                errors.append(f"день {iso}: неизвестный kind {kind}")
                continue
            steps = day.get("steps", [])
            types = {s.get("type") for s in steps}
            missing = [t for t in NEEDS[kind] if t not in types]
            if missing:
                errors.append(f"день {iso} ({kind}): нет навыков {', '.join(missing)}")
            mins = sum(s.get("minutes", 0) for s in steps if not s.get("optional"))
            lo, hi = MINUTES[kind]
            if not lo <= mins <= hi:
                errors.append(f"день {iso}: {mins} мин, нужно {lo}–{hi} мин")
            for s in steps:
                check_step(s, wi, di, wd, iso, quizzes, anki_decks, word_decks, words is not None, data, step_date, errors)

    if full and len(all_days) != 28:
        errors.append(f"месяц 1: {len(all_days)} дней, нужно 28 (4 недели)")

    in_block = {}
    for week in plan.get("weeks", []):
        for b in week.get("blocks", []):
            bid = b.get("id")
            dates = []
            for sid in b.get("steps", []):
                if sid not in step_date:
                    errors.append(f"блок {bid}: неизвестный шаг {sid}")
                    continue
                in_block.setdefault(sid, []).append(bid)
                dates.append(step_date[sid])
            if dates and b.get("due") != max(dates):
                errors.append(f"блок {bid}: due {b.get('due')}, а последний день блока {max(dates)}")
    for sid in step_date:
        n = len(in_block.get(sid, []))
        if n != 1:
            errors.append(f"шаг {sid}: входит в {n} блок(ов), нужно ровно в 1")
    return errors


def check_step(s, wi, di, wd, iso, quizzes, anki_decks, word_decks, have_words, data, step_date, errors):
    sid = s.get("id", "")
    m = STEP_ID.match(sid)
    if not m or int(m.group(1)) != wi or m.group(2) != wd:
        errors.append(f"шаг {sid}: id должен быть w{wi:02d}-{wd}-NN")
    if sid in step_date:
        errors.append(f"шаг {sid}: повтор id")
    step_date[sid] = iso
    t = s.get("type")
    if t not in STEP_TYPES:
        errors.append(f"шаг {sid}: неизвестный type {t}")
        return
    if not s.get("title"):
        errors.append(f"шаг {sid}: нет title")
    if t in ("quiz", "oral", "listen"):
        qid = s.get("quiz")
        if qid not in quizzes:
            errors.append(f"шаг {sid}: нет квиза {qid}")
        elif t == "oral" and any(q.get("type") != "text" for q in quizzes[qid]["questions"]):
            errors.append(f"шаг {sid}: квиз {qid} для oral — только вопросы text")
    if t in ("theory", "listen"):
        src = s.get("source") or {}
        url = src.get("url", "")
        if url.startswith("#/read/"):
            slug = url[len("#/read/"):]
            if not article_title(data / "articles" / f"{slug}.md"):
                errors.append(f"шаг {sid}: нет конспекта data/articles/{slug}.md с title")
        else:
            check_link(f"шаг {sid}", src, errors)
        if t == "listen" and src.get("type") != "video":
            errors.append(f"шаг {sid}: у listen source.type должен быть video")
    for a in s.get("alt") or []:
        check_link(f"шаг {sid} (alt)", a, errors)
    if t == "practice":
        items = s.get("items") or []
        if not items:
            errors.append(f"шаг {sid}: нет items")
        for i, it in enumerate(items):
            if it.get("write") and not it.get("sample"):
                errors.append(f"шаг {sid}: пункт {i + 1} без sample")
    if t == "words":
        want = f"w{wi}d{di}"
        deck = s.get("deck")
        if deck != want:
            errors.append(f"шаг {sid}: колода {deck}, для этого дня нужна {want}")
        if have_words and deck not in word_decks:
            errors.append(f"шаг {sid}: колоды {deck} нет в data/words.json")
        if s.get("mode") not in (None, "study", "test"):
            errors.append(f"шаг {sid}: mode {s.get('mode')}")
    if t == "anki" and not anki_decks.get(s.get("deck")):
        errors.append(f"шаг {sid}: в anki.json нет карточек колоды {s.get('deck')}")


def main():
    errors = check(ROOT, full="--partial" not in sys.argv)
    plan = json.loads((ROOT / "data" / "plan.json").read_text()) if (ROOT / "data" / "plan.json").exists() else {"weeks": []}
    days = [d for w in plan["weeks"] for d in w["days"]]
    steps = [s for d in days for s in d["steps"]]
    for e in errors:
        print("ОШИБКА:", e)
    print(f"недель {len(plan['weeks'])}, дней {len(days)}, шагов {len(steps)}; ошибок: {len(errors)}")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
