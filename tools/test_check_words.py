"""Tests for tools/check_words.py. Run: python3 -m unittest tools/test_check_words.py"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_words as cw  # noqa: E402

# Real de.wiktionary.org templates (abridged to the lines the checker reads).
WIKI = {
    "Name": "{{Deutsch Substantiv Übersicht\n|Genus=m\n|Nominativ Singular=Name\n|Nominativ Plural=Namen\n}}",
    "Bank": ("{{Deutsch Substantiv Übersicht\n|Genus=f\n|Nominativ Singular=Bank\n|Nominativ Plural=Bänke\n}}\n"
             "{{Deutsch Substantiv Übersicht\n|Genus=f\n|Nominativ Singular=Bank\n|Nominativ Plural=Banken\n}}"),
    "Eltern": "{{Deutsch Substantiv Übersicht\n|Genus=0\n|Nominativ Singular=—\n|Nominativ Plural=Eltern\n}}",
    "Joghurt": ("{{Deutsch Substantiv Übersicht\n|Genus 1=m\n|Genus 2=f\n|Genus 3=n\n"
                "|Nominativ Singular 1=Joghurt\n|Nominativ Plural=Joghurts\n}}"),
    "Milch": ("{{Deutsch Substantiv Übersicht\n|Genus=f\n|Nominativ Singular=Milch\n"
              "|Nominativ Plural 1=Milche\n|Nominativ Plural 2=Milchen\n}}"),
    "Obst": "{{Deutsch Substantiv Übersicht\n|Genus=n\n|Nominativ Singular=Obst\n|Nominativ Plural=—\n}}",
    "Kino": "{{Deutsch Substantiv Übersicht\n|Genus=n\n|Nominativ Singular=Kino\n|Nominativ Plural=Kinos\n}}",
}


def noun(de, article, plural):
    return {"de": de, "ru": "x", "emoji": "🙂", "article": article, "plural": plural, "pos": "noun"}


class ParseTemplates(unittest.TestCase):
    def test_single_noun(self):
        self.assertEqual(cw.parse_nouns(WIKI["Name"]), [{"genus": ["m"], "plurals": ["Namen"]}])

    def test_two_senses_give_two_entries(self):
        self.assertEqual([e["plurals"] for e in cw.parse_nouns(WIKI["Bank"])], [["Bänke"], ["Banken"]])

    def test_numbered_genus_and_plural(self):
        self.assertEqual(cw.parse_nouns(WIKI["Joghurt"])[0]["genus"], ["m", "f", "n"])
        self.assertEqual(cw.parse_nouns(WIKI["Milch"])[0]["plurals"], ["Milche", "Milchen"])

    def test_dash_means_no_plural(self):
        self.assertEqual(cw.parse_nouns(WIKI["Obst"])[0]["plurals"], [])

    def test_page_without_noun_template(self):
        self.assertEqual(cw.parse_nouns("== gehen ({{Sprache|Deutsch}}) ==\n{{Deutsch Verb Übersicht}}"), [])


class NounErrors(unittest.TestCase):
    def errors(self, word, page):
        return cw.noun_errors(word, cw.parse_nouns(WIKI[page]) if page else [])

    def test_correct_noun(self):
        self.assertEqual(self.errors(noun("Name", "der", "die Namen"), "Name"), [])

    def test_wrong_article(self):
        self.assertTrue(any("артикль" in e for e in self.errors(noun("Name", "das", "die Namen"), "Name")))

    def test_wrong_plural(self):
        self.assertTrue(any("plural" in e for e in self.errors(noun("Name", "der", "die Names"), "Name")))

    def test_plural_needs_die(self):
        self.assertTrue(self.errors(noun("Name", "der", "Namen"), "Name"))

    def test_any_sense_matches(self):
        self.assertEqual(self.errors(noun("Bank", "die", "die Banken"), "Bank"), [])

    def test_any_genus_matches(self):
        self.assertEqual(self.errors(noun("Joghurt", "der", "die Joghurts"), "Joghurt"), [])

    def test_null_plural_ok_when_none_exists(self):
        self.assertEqual(self.errors(noun("Obst", "das", None), "Obst"), [])

    def test_null_plural_wrong_when_one_exists(self):
        self.assertTrue(self.errors(noun("Kino", "das", None), "Kino"))

    def test_plurale_tantum(self):
        self.assertEqual(self.errors(noun("Eltern", "die", "die Eltern"), "Eltern"), [])
        self.assertTrue(self.errors(noun("Eltern", "der", "die Eltern"), "Eltern"))

    def test_missing_page(self):
        self.assertTrue(any("Wiktionary" in e for e in self.errors(noun("Quatschwort", "der", None), None)))


class Wortliste(unittest.TestCase):
    ENTRIES = [
        {"lemma": "Lehrer", "article": "der", "raw": "der Lehrer, –", "examples": []},
        {"lemma": "anmelden", "article": None, "raw": "(sich) anmelden", "examples": []},
        {"lemma": "Eltern (pl.)", "article": "die", "raw": "die Eltern (pl.)", "examples": []},
        {"lemma": "hallo", "article": None, "raw": "hallo", "examples": ["Hallo Inge! Wie geht’s?"]},
        {"lemma": "Tag", "article": "der", "raw": "der Tag, -e", "examples": ["Guten Tag!"]},
    ]

    def setUp(self):
        self.wl = cw.Wortliste(self.ENTRIES)

    def test_plain_lemma(self):
        self.assertTrue(self.wl.covers({"de": "anmelden", "pos": "verb"}))

    def test_plurale_tantum_mark_dropped(self):
        self.assertTrue(self.wl.covers({"de": "Eltern", "pos": "noun"}))

    def test_female_form_of_listed_noun(self):
        self.assertTrue(self.wl.covers({"de": "Lehrerin", "pos": "noun"}))

    def test_phrase_from_examples(self):
        self.assertTrue(self.wl.covers({"de": "Wie geht's?", "pos": "phrase"}))
        self.assertTrue(self.wl.covers({"de": "Guten Tag!", "pos": "phrase"}))

    def test_unlisted_word(self):
        self.assertFalse(self.wl.covers({"de": "Raumschiff", "pos": "noun"}))


def deck(i, words):
    week, day = divmod(i, 6)
    return {"id": f"w{week + 1}d{day + 1}", "week": week + 1, "day": "2026-11-02", "title": "t", "icon": "🙂",
            "words": words}


class CheckAll(unittest.TestCase):
    WL = cw.Wortliste([{"lemma": "Name", "article": "der", "raw": "der Name", "examples": []},
                       {"lemma": "Kino", "article": "das", "raw": "das Kino", "examples": []}])

    def run_check(self, data, **kw):
        pages = {k: cw.parse_nouns(v) for k, v in WIKI.items()}
        kw.setdefault("deck_size", (1, 99))
        return cw.check(data, self.WL, lookup=lambda titles: {t: pages.get(t) for t in titles}, **kw)

    def good(self):
        words = [noun("Name", "der", "die Namen"), noun("Kino", "das", "die Kinos")]
        extra = [dict(deck(0, words), id=f"x{i:02d}") for i in range(1, 51)]
        return {"decks": [deck(i, list(words)) for i in range(24)], "extra": extra}

    def test_good_data_passes(self):
        errors, stats = self.run_check(self.good(), min_words=48, groups={})
        self.assertEqual(errors, [])
        self.assertEqual(stats["words"], 48)
        self.assertEqual(stats["coverage"], 1.0)

    def test_too_few_words(self):
        errors, _ = self.run_check(self.good(), min_words=350, groups={})
        self.assertTrue(any("350" in e for e in errors))

    def test_wrong_deck_ids(self):
        data = self.good()
        data["decks"][5]["id"] = "w1d9"
        errors, _ = self.run_check(data, min_words=48, groups={})
        self.assertTrue(any("w1d6" in e for e in errors))

    def test_extra_needs_50(self):
        data = self.good()
        data["extra"].pop()
        errors, _ = self.run_check(data, min_words=48, groups={})
        self.assertTrue(any("extra" in e for e in errors))

    def test_wiktionary_mismatch_reported_with_deck(self):
        data = self.good()
        data["decks"][3]["words"][0]["article"] = "die"
        errors, _ = self.run_check(data, min_words=48, groups={})
        self.assertTrue(any(e.startswith("w1d4") and "Name" in e for e in errors))

    def test_low_coverage(self):
        data = self.good()
        for d in data["decks"]:
            d["words"].append(noun("Milch", "die", "die Milchen"))
        errors, stats = self.run_check(data, min_words=48, groups={})
        self.assertAlmostEqual(stats["coverage"], 2 / 3)
        self.assertTrue(any("покрытие" in e for e in errors))

    def test_group_coverage(self):
        groups = {"kino": ["Kino", "Name", "Obst"]}
        errors, stats = self.run_check(self.good(), min_words=48, groups=groups)
        self.assertAlmostEqual(stats["groups"], 2 / 3)
        self.assertTrue(any("групп" in e for e in errors))

    def test_deck_size(self):
        errors, _ = self.run_check(self.good(), min_words=48, groups={}, deck_size=(10, 25))
        self.assertTrue(any(e.startswith("w1d1") and "10" in e for e in errors))

    def test_bad_schema(self):
        data = self.good()
        data["decks"][0]["words"][0]["pos"] = "Substantiv"
        data["decks"][0]["words"][1]["article"] = None  # a noun without an article
        errors, _ = self.run_check(data, min_words=48, groups={})
        self.assertTrue(any("pos" in e for e in errors))
        self.assertTrue(any("article" in e for e in errors))


if __name__ == "__main__":
    unittest.main()
