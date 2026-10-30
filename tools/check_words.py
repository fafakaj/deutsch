"""Check data/words.json: the word decks of the trainer (words/).

1. Schema: 24 course decks w1d1…w4d6 and 50 extra decks x01…x50 (docs/CONTRACT.md).
2. Article and plural of every course noun = de.wiktionary.org (0 mismatches). Answers are cached
   in data/refs/wiktionary-cache.json; --offline uses only the cache.
3. Goethe A1 Wortliste (data/refs/goethe-a1-wortliste.json):
   - ≥ 90 % of the course words are Wortliste entries. Female forms (Lehrerin) count with the
     listed noun, as the Wortliste preface says; a phrase counts if a Wortliste example has it.
   - ≥ 90 % of the Wortgruppenliste groups of the month themes (days, months, seasons, times of
     day, time units, colours, compass points) are in the course decks.
4. ≥ 350 course words, each deck 10–25 words.
Run: python3 tools/check_words.py [--offline]
"""

import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORDS = ROOT / "data" / "words.json"
WORTLISTE = ROOT / "data" / "refs" / "goethe-a1-wortliste.json"
CACHE = ROOT / "data" / "refs" / "wiktionary-cache.json"
API = "https://de.wiktionary.org/w/api.php"
AGENT = "deutsch-words-check/1.0 (study site fafakaj/deutsch)"

ARTICLES = {"m": "der", "f": "die", "n": "das", "0": "die"}  # 0 = plurale tantum (die Eltern)
POS = {"noun", "verb", "adj", "adv", "num", "phrase", "other"}
DECK_IDS = [f"w{w}d{d}" for w in range(1, 5) for d in range(1, 7)]
EXTRA_IDS = [f"x{i:02d}" for i in range(1, 51)]
MONTH_GROUPS = ["zeitmasse", "wochentage", "tageszeiten", "monate", "jahreszeiten", "farben", "himmelsrichtungen"]
TEMPLATE = re.compile(r"\{\{Deutsch Substantiv Übersicht(.*?)\n\}\}", re.S)
NO_FORM = {"", "—", "-", "–"}


# ---------------------------------------------------------------- Wiktionary

def parse_nouns(wikitext):
    """Every German noun table of a page: [{genus: ['m'], plurals: ['Namen']}]."""
    nouns = []
    for m in TEMPLATE.finditer(wikitext):
        genus, plurals = [], []
        for line in m.group(1).splitlines():
            key, _, value = line.lstrip("|").partition("=")
            key, value = key.strip(), value.strip()
            if re.fullmatch(r"Genus( \d)?", key) and value:
                genus.append(value)
            elif re.fullmatch(r"Nominativ Plural( \d|\*)?", key) and value not in NO_FORM:
                plurals.append(value)
        nouns.append({"genus": genus, "plurals": plurals})
    return nouns


def noun_errors(word, nouns):
    """Why the word's article or plural differs from Wiktionary ([] when it matches)."""
    de, article, plural = word["de"], word.get("article"), word.get("plural")
    if not nouns:
        return [f"{de}: нет существительного на Wiktionary"]
    senses = [n for n in nouns if article in {ARTICLES.get(g) for g in n["genus"]}]
    if not senses:
        wiki = sorted({ARTICLES.get(g, g) for n in nouns for g in n["genus"]})
        return [f"{de}: артикль {article} ≠ Wiktionary {'/'.join(wiki)}"]
    forms = sorted({p for n in senses for p in n["plurals"]})
    if plural is None:
        if all(n["plurals"] for n in senses):
            return [f"{de}: plural null, а Wiktionary: {', '.join(forms)}"]
        return []
    if not plural.startswith("die ") or plural[4:] not in forms:
        return [f"{de}: plural «{plural}» ≠ Wiktionary {', '.join('die ' + f for f in forms) or '—'}"]
    return []


def wiktionary_lookup(titles, cache_path=CACHE, offline=False):
    """{title: nouns or None}; fetches what the cache lacks, 50 titles per request."""
    cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}
    todo = sorted(t for t in set(titles) if t not in cache)
    if todo and offline:
        raise SystemExit(f"--offline: нет в кэше {len(todo)} слов: {', '.join(todo[:10])}")
    for i in range(0, len(todo), 50):
        batch = todo[i:i + 50]
        q = urllib.parse.urlencode({"action": "query", "prop": "revisions", "rvprop": "content", "rvslots": "main",
                                    "format": "json", "formatversion": 2, "redirects": 1, "titles": "|".join(batch)})
        req = urllib.request.Request(f"{API}?{q}", headers={"User-Agent": AGENT})
        with urllib.request.urlopen(req, timeout=30) as r:
            res = json.load(r)["query"]
        alias = {t: t for t in batch}
        for step in res.get("normalized", []) + res.get("redirects", []):
            for t, a in alias.items():
                if a == step["from"]:
                    alias[t] = step["to"]
        pages = {p["title"]: p for p in res["pages"]}
        for t in batch:
            page = pages.get(alias[t], {})
            text = page["revisions"][0]["slots"]["main"]["content"] if "revisions" in page else ""
            cache[t] = {"nouns": parse_nouns(text) if text else None, "fetched": date.today().isoformat()}
        cache_path.write_text(json.dumps(dict(sorted(cache.items())), ensure_ascii=False, indent=1) + "\n")
        time.sleep(0.5)
    return {t: cache[t]["nouns"] for t in titles}


# ---------------------------------------------------------------- Goethe Wortliste

def norm(s):
    s = s.casefold().replace("’", "'").replace("ß", "ss")
    s = re.sub(r"[.,!?;:–„“\"()]", " ", s)
    return " ".join(s.split())


class Wortliste:
    def __init__(self, entries):
        self.lemmas = set()
        for e in entries:
            for part in e["lemma"].split("/"):
                part = re.sub(r"\((pl\.|sich)\)", "", part)
                self.lemmas.add(norm(part))
                self.lemmas.add(norm(re.sub(r"\(.*?\)", "", part)))
        self.examples = " " + " | ".join(norm(x) for e in entries for x in e.get("examples", [])) + " "

    def covers(self, word):
        w = norm(word["de"])
        if w in self.lemmas:
            return True
        if word.get("pos") == "noun" and w.endswith("in"):
            base = w[:-2]
            plain = base.translate(str.maketrans("äöü", "aou"))
            return base in self.lemmas or plain in self.lemmas
        return word.get("pos") == "phrase" and f" {w} " in self.examples


def month_groups(entries):
    groups = {}
    for e in entries:
        if e.get("group") in MONTH_GROUPS:
            groups.setdefault(e["group"], []).append(e["lemma"])
    return groups


# ---------------------------------------------------------------- check

def word_errors(where, w):
    errors = []
    for key in ("de", "ru", "emoji"):
        if not isinstance(w.get(key), str) or not w[key].strip():
            errors.append(f"{where}: нет поля {key}")
    if w.get("pos") not in POS:
        errors.append(f"{where}: pos {w.get('pos')!r} не из {sorted(POS)}")
    if w.get("article") not in ("der", "die", "das", None):
        errors.append(f"{where}: article {w.get('article')!r}")
    if (w.get("pos") == "noun") != (w.get("article") is not None):
        errors.append(f"{where}: article есть только у pos noun")
    if w.get("plural") is not None and not isinstance(w["plural"], str):
        errors.append(f"{where}: plural не строка")
    return errors


def deck_errors(decks, ids, label, deck_size=None):
    errors = []
    got = [d.get("id") for d in decks]
    if got != ids:
        missing = [i for i in ids if i not in got]
        errors.append(f"{label}: нужно {len(ids)} колод {ids[0]}…{ids[-1]}; нет {', '.join(missing) or '—'}, "
                      f"лишние {', '.join(str(i) for i in got if i not in ids) or '—'}")
    for d in decks:
        for key in ("title", "icon"):
            if not d.get(key):
                errors.append(f"{d.get('id')}: нет поля {key}")
        words = d.get("words") or []
        if deck_size and not deck_size[0] <= len(words) <= deck_size[1]:
            errors.append(f"{d.get('id')}: {len(words)} слов, нужно {deck_size[0]}–{deck_size[1]}")
        seen = set()
        for w in words:
            errors += word_errors(f"{d.get('id')} {w.get('de')}", w)
            if w.get("de") in seen:
                errors.append(f"{d.get('id')} {w.get('de')}: повтор в колоде")
            seen.add(w.get("de"))
    return errors


def check(data, wortliste, lookup, min_words=350, groups=None, min_coverage=0.9, deck_size=(10, 25)):
    """(errors, stats) for words.json data."""
    decks, extra = data.get("decks", []), data.get("extra", [])
    errors = deck_errors(decks, DECK_IDS, "decks", deck_size) + deck_errors(extra, EXTRA_IDS, "extra")
    for d in decks:
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(d.get("day", ""))) or not isinstance(d.get("week"), int):
            errors.append(f"{d.get('id')}: нужны week (число) и day (YYYY-MM-DD)")
    course = [(d["id"], w) for d in decks for w in d.get("words", [])]
    if len(course) < min_words:
        errors.append(f"слов в колодах курса {len(course)} < {min_words}")

    nouns = [(i, w) for i, w in course if w.get("article")]
    pages = lookup(sorted({w["de"] for _, w in nouns}))
    for i, w in nouns:
        errors += [f"{i} {e}" for e in noun_errors(w, pages.get(w["de"]))]

    covered = [w for _, w in course if wortliste.covers(w)]
    coverage = len(covered) / len(course) if course else 0.0
    if coverage < min_coverage:
        outside = sorted({w["de"] for _, w in course if not wortliste.covers(w)})
        errors.append(f"покрытие Wortliste {coverage:.0%} < {min_coverage:.0%}; вне списка: {', '.join(outside)}")

    have = {norm(w["de"]) for _, w in course}
    wanted = [(g, x) for g, xs in (groups or {}).items() for x in xs]
    found = [(g, x) for g, x in wanted if norm(x) in have]
    group_share = len(found) / len(wanted) if wanted else 1.0
    if group_share < min_coverage:
        lost = [x for g, x in wanted if (g, x) not in found]
        errors.append(f"покрытие групп Wortgruppenliste {group_share:.0%} < {min_coverage:.0%}; нет: {', '.join(lost)}")

    stats = {"words": len(course), "nouns": len(nouns), "coverage": coverage, "groups": group_share,
             "extra_words": sum(len(d.get("words", [])) for d in extra)}
    return errors, stats


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--offline", action="store_true", help="only the Wiktionary cache, no network")
    args = ap.parse_args()
    data = json.loads(WORDS.read_text())
    entries = json.loads(WORTLISTE.read_text())["entries"]
    errors, stats = check(data, Wortliste(entries), lambda t: wiktionary_lookup(t, offline=args.offline),
                          groups=month_groups(entries))
    print(f"слов в курсе: {stats['words']} (существительных {stats['nouns']}), extra: {stats['extra_words']}")
    print(f"покрытие Wortliste: {stats['coverage']:.1%}; группы месяца: {stats['groups']:.1%}")
    for e in errors:
        print("ОШИБКА", e)
    print("OK" if not errors else f"{len(errors)} ошибок")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
