"""Tests for tools/check_data.py and tools/build_plan.py. Run: python3 -m unittest tools/test_tools.py"""
import copy
import json
import sys
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import build_plan  # noqa: E402
import check_data  # noqa: E402

WD = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
OK = "200 2026-10-31"


def study_steps(w, d, iso):
    """A full study day: every skill, about 2 hours."""
    p = f"w{w:02d}-{WD[d - 1]}-"
    return [
        {"id": p + "01", "type": "theory", "title": "T", "minutes": 20,
         "source": {"title": "Конспект", "url": "#/read/art", "lang": "ru", "type": "article"},
         "alt": [{"title": "Wiki", "url": "https://de.wiktionary.org/wiki/sein", "lang": "de", "type": "article", "verified": OK}]},
        {"id": p + "02", "type": "quiz", "title": "Q", "minutes": 20, "quiz": "q-x"},
        {"id": p + "03", "type": "listen", "title": "L", "minutes": 15, "quiz": "q-x",
         "source": {"title": "Nicos Weg", "url": "https://www.youtube.com/watch?v=dC6ZGLzdaTs", "lang": "de", "type": "video", "verified": OK}},
        {"id": p + "04", "type": "practice", "title": "P", "minutes": 20, "items": [{"text": "t", "write": True, "sample": "s"}]},
        {"id": p + "05", "type": "oral", "title": "O", "minutes": 15, "quiz": "q-oral"},
        {"id": p + "06", "type": "words", "title": "W", "minutes": 20, "deck": f"w{w}d{d}"},
        {"id": p + "07", "type": "anki", "title": "A", "minutes": 10, "deck": f"Неделя {w}"},
    ]


def make_dataset(weeks=1):
    """A small valid dataset: plan, quizzes, anki, words, articles."""
    start = date(2026, 11, 2)
    plan = {"start": start.isoformat(), "github_user": "fafakaj", "weeks": []}
    words = {"decks": []}
    cards = []
    for w in range(1, weeks + 1):
        days = []
        for d in range(1, 8):
            iso = (start + timedelta(days=7 * (w - 1) + d - 1)).isoformat()
            if d < 7:
                steps = study_steps(w, d, iso)
                days.append({"date": iso, "weekday": WD[d - 1], "title": "D", "hours": 2, "kind": "study", "steps": steps})
                words["decks"].append({"id": f"w{w}d{d}", "week": w, "day": iso, "title": "x", "words": []})
                cards.append({"id": f"{w:02d}{d:02d}abcdef", "day": iso, "deck": f"Неделя {w}", "deck_full": f"DE::Неделя {w}",
                              "kind": "basic", "front": "ru", "back": "de"})
            else:
                p = f"w{w:02d}-sun-"
                steps = [{"id": p + "01", "type": "quiz", "title": "Mini", "minutes": 40, "quiz": "q-x"},
                         {"id": p + "02", "type": "anki", "title": "A", "minutes": 20, "deck": f"Неделя {w}"}]
                days.append({"date": iso, "weekday": "sun", "title": "R", "hours": 1, "kind": "review", "steps": steps})
        ids = lambda ds: [s["id"] for day in ds for s in day["steps"]]  # noqa: E731
        blocks = [
            {"id": f"w{w:02d}-b1", "n": 1, "title": "b1", "due": days[1]["date"], "steps": ids(days[0:2])},
            {"id": f"w{w:02d}-b2", "n": 2, "title": "b2", "due": days[3]["date"], "steps": ids(days[2:4])},
            {"id": f"w{w:02d}-b3", "n": 3, "title": "b3", "due": days[6]["date"], "steps": ids(days[4:7])},
        ]
        plan["weeks"].append({"n": w, "title": "W", "short": "W", "goal": "- я могу", "days": days, "blocks": blocks})
    quizzes = {
        "q-x": {"title": "X", "questions": [
            {"type": "choice", "q": "?", "options": ["a", "b"], "answer": 1},
            {"type": "de", "q": "Ich ___", "answer": ["bin", "Bin"]},
            {"type": "multi", "q": "?", "options": ["a", "b", "c"], "answers": [0, 2]},
        ]},
        "q-oral": {"title": "O", "questions": [{"type": "text", "q": "Скажите", "answer": "Hallo!"}]},
    }
    return {"plan": plan, "quizzes": quizzes, "anki": {"cards": cards}, "words": words,
            "articles": {"art": "---\ntitle: Статья\nkind: конспект\nsource: Goethe\n---\nтекст\n"}}


def write(root, ds):
    data = root / "data"
    (data / "articles").mkdir(parents=True, exist_ok=True)
    for name in ("plan", "quizzes", "anki", "words"):
        if ds.get(name) is not None:
            (data / f"{name}.json").write_text(json.dumps(ds[name], ensure_ascii=False))
    for slug, text in ds["articles"].items():
        (data / "articles" / f"{slug}.md").write_text(text)


class CheckDataTest(unittest.TestCase):
    def errors(self, mutate=None, weeks=1, full=False):
        ds = make_dataset(weeks)
        if mutate:
            mutate(ds)
        with tempfile.TemporaryDirectory() as tmp:
            write(Path(tmp), ds)
            return check_data.check(Path(tmp), full=full)

    def assertError(self, errs, *parts):
        hit = [e for e in errs if all(p in e for p in parts)]
        self.assertTrue(hit, f"no error with {parts}; got: {errs}")

    def test_valid_dataset_has_no_errors(self):
        self.assertEqual(self.errors(), [])

    def test_full_month_requires_28_days(self):
        self.assertError(self.errors(full=True), "28")

    def test_full_month_of_4_weeks_passes(self):
        self.assertEqual(self.errors(weeks=4, full=True), [])

    def test_partial_allows_gap_between_weeks(self):
        def m(ds):
            del ds["plan"]["weeks"][1]
        self.assertEqual(self.errors(m, weeks=3), [])

    def test_full_month_with_gap_fails(self):
        def m(ds):
            del ds["plan"]["weeks"][1]
        self.assertError(self.errors(m, weeks=4, full=True), "28")

    def test_step_in_two_blocks(self):
        def m(ds):
            ds["plan"]["weeks"][0]["blocks"][1]["steps"].append("w01-mon-01")
        self.assertError(self.errors(m), "w01-mon-01", "блок")

    def test_step_in_no_block(self):
        def m(ds):
            ds["plan"]["weeks"][0]["blocks"][0]["steps"].remove("w01-tue-03")
        self.assertError(self.errors(m), "w01-tue-03", "блок")

    def test_block_lists_unknown_step(self):
        def m(ds):
            ds["plan"]["weeks"][0]["blocks"][0]["steps"].append("w01-mon-99")
        self.assertError(self.errors(m), "w01-mon-99")

    def test_block_due_is_last_day_of_block(self):
        def m(ds):
            ds["plan"]["weeks"][0]["blocks"][0]["due"] = "2026-11-02"
        self.assertError(self.errors(m), "w01-b1", "due")

    def test_duplicate_step_id(self):
        def m(ds):
            ds["plan"]["weeks"][0]["days"][1]["steps"][0]["id"] = "w01-mon-01"
        self.assertError(self.errors(m), "w01-mon-01")

    def test_bad_step_id_format(self):
        def m(ds):
            day = ds["plan"]["weeks"][0]["days"][0]
            day["steps"][0]["id"] = "mon-1"
            ds["plan"]["weeks"][0]["blocks"][0]["steps"][0] = "mon-1"
        self.assertError(self.errors(m), "mon-1", "id")

    def test_missing_quiz(self):
        def m(ds):
            ds["plan"]["weeks"][0]["days"][0]["steps"][1]["quiz"] = "q-none"
        self.assertError(self.errors(m), "q-none")

    def test_missing_article(self):
        def m(ds):
            ds["articles"] = {}
        self.assertError(self.errors(m), "art")

    def test_missing_words_deck(self):
        def m(ds):
            ds["words"]["decks"].pop(0)
        self.assertError(self.errors(m), "w1d1")

    def test_words_deck_must_match_day(self):
        def m(ds):
            ds["plan"]["weeks"][0]["days"][0]["steps"][5]["deck"] = "w1d2"
        self.assertError(self.errors(m), "w1d2", "w1d1")

    def test_missing_words_file_is_an_error(self):
        def m(ds):
            ds["words"] = None
        self.assertError(self.errors(m), "words.json")

    def test_anki_deck_without_cards(self):
        def m(ds):
            ds["anki"]["cards"] = []
        self.assertError(self.errors(m), "Неделя 1")

    def test_anki_card_bad_id(self):
        def m(ds):
            ds["anki"]["cards"][0]["id"] = "xyz"
        self.assertError(self.errors(m), "xyz")

    def test_anki_card_duplicate_id(self):
        def m(ds):
            ds["anki"]["cards"][1]["id"] = ds["anki"]["cards"][0]["id"]
        self.assertError(self.errors(m), ds_first_card_id())

    def test_study_day_needs_four_skills(self):
        def m(ds):
            day = ds["plan"]["weeks"][0]["days"][2]
            day["steps"] = [s for s in day["steps"] if s["type"] != "listen"]
            ds["plan"]["weeks"][0]["blocks"][1]["steps"].remove("w01-wed-03")
        self.assertError(self.errors(m), "2026-11-04", "listen")

    def test_practice_needs_sample(self):
        def m(ds):
            del ds["plan"]["weeks"][0]["days"][0]["steps"][3]["items"][0]["sample"]
        self.assertError(self.errors(m), "w01-mon-04", "sample")

    def test_date_outside_month_1(self):
        def m(ds):
            ds["plan"]["weeks"][0]["days"][0]["date"] = "2026-10-26"
        self.assertError(self.errors(m), "2026-10-26")

    def test_weekday_matches_date(self):
        def m(ds):
            ds["plan"]["weeks"][0]["days"][0]["weekday"] = "tue"
        self.assertError(self.errors(m), "2026-11-02", "weekday")

    def test_external_link_needs_verified(self):
        def m(ds):
            del ds["plan"]["weeks"][0]["days"][0]["steps"][2]["source"]["verified"]
        self.assertError(self.errors(m), "w01-mon-03", "verified")

    def test_alt_link_needs_verified_200(self):
        def m(ds):
            ds["plan"]["weeks"][0]["days"][0]["steps"][0]["alt"][0]["verified"] = "404 2026-10-31"
        self.assertError(self.errors(m), "w01-mon-01", "verified")

    def test_choice_answer_in_range(self):
        def m(ds):
            ds["quizzes"]["q-x"]["questions"][0]["answer"] = 5
        self.assertError(self.errors(m), "q-x", "answer")

    def test_de_question_needs_answer(self):
        def m(ds):
            ds["quizzes"]["q-x"]["questions"][1]["answer"] = ""
        self.assertError(self.errors(m), "q-x")

    def test_oral_needs_text_questions(self):
        def m(ds):
            ds["quizzes"]["q-oral"]["questions"][0]["type"] = "choice"
        self.assertError(self.errors(m), "q-oral")

    def test_unknown_question_type(self):
        def m(ds):
            ds["quizzes"]["q-x"]["questions"][0]["type"] = "essay"
        self.assertError(self.errors(m), "essay")

    def test_study_day_minutes_about_two_hours(self):
        def m(ds):
            ds["plan"]["weeks"][0]["days"][0]["steps"][1]["minutes"] = 200
        self.assertError(self.errors(m), "2026-11-02", "мин")

    def test_sunday_minutes_one_to_one_and_half_hours(self):
        def m(ds):
            ds["plan"]["weeks"][0]["days"][6]["steps"][0]["minutes"] = 150
        self.assertError(self.errors(m), "2026-11-08", "мин")

    def test_unknown_step_type(self):
        def m(ds):
            ds["plan"]["weeks"][0]["days"][0]["steps"][1]["type"] = "leetcode"
        self.assertError(self.errors(m), "leetcode")


def ds_first_card_id():
    return make_dataset()["anki"]["cards"][0]["id"]


EPISODES = {"episodes": [{"n": 1, "title": "Hallo!", "url": "https://learngerman.dw.com/en/hallo/l-37250531", "verified": OK,
                          "youtube": "https://www.youtube.com/watch?v=dC6ZGLzdaTs", "youtube_verified": OK, "minutes": 1.4}]}

WEEK = "n: 1\ntitle: W\nshort: S\nblocks: [a, b, c]\ngoal: |\n  - я могу\n"


def day_yaml(iso, sunday=False):
    if sunday:
        return f"""date: {iso}
title: R
hours: 1
kind: review
steps:
  - {{type: quiz, title: M, minutes: 40, quiz: {{id: q-rev-{iso}, title: M, questions: [{{type: de, q: x, answer: bin}}]}}}}
  - {{type: anki, title: A, minutes: 20}}
"""
    return f"""date: {iso}
title: D
hours: 2
kind: study
steps:
  - {{type: theory, title: T, minutes: 20, article: art}}
  - type: listen
    title: L
    minutes: 15
    episode: 1
    quiz: {{id: q-l-{iso}, title: L, questions: [{{type: choice, q: x, options: [a, b], answer: 0}}]}}
  - {{type: practice, title: P, minutes: 20, items: [{{text: t, write: true, sample: s}}]}}
  - {{type: oral, title: O, minutes: 15, quiz: {{id: q-o-{iso}, title: O, questions: [{{type: text, q: x, answer: y}}]}}}}
  - {{type: words, title: W, minutes: 20}}
  - type: anki
    title: A
    minutes: 10
    cards: [["Привет {iso}", "Hallo"], ["Пока {iso}", "Tschüss"]]
"""


def make_content(root):
    c = root / "content" / "w1"
    c.mkdir(parents=True)
    (c / "week.yaml").write_text(WEEK)
    start = date(2026, 11, 2)
    for d in range(1, 8):
        iso = (start + timedelta(days=d - 1)).isoformat()
        (c / f"{d}-{WD[d - 1]}.yaml").write_text(day_yaml(iso, sunday=d == 7))
    (root / "data" / "articles").mkdir(parents=True)
    (root / "data" / "articles" / "art.md").write_text("---\ntitle: Статья про sein\nkind: конспект\nsource: x\n---\nтекст\n")
    (root / "data" / "refs").mkdir(parents=True)
    (root / "data" / "refs" / "nicos-weg-a1.json").write_text(json.dumps(EPISODES))


class BuildPlanTest(unittest.TestCase):
    def build(self, edit=None):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        root = Path(tmp.name)
        make_content(root)
        if edit:
            edit(root)
        return root, build_plan.build(root)

    def test_step_ids_follow_day_and_order(self):
        _, (plan, _, _) = self.build()
        mon = plan["weeks"][0]["days"][0]
        self.assertEqual([s["id"] for s in mon["steps"]][:2], ["w01-mon-01", "w01-mon-02"])
        self.assertEqual(mon["weekday"], "mon")
        self.assertEqual(plan["start"], "2026-11-02")

    def test_blocks_mon_tue_wed_thu_fri_sun(self):
        _, (plan, _, _) = self.build()
        b = plan["weeks"][0]["blocks"]
        self.assertEqual([x["due"] for x in b], ["2026-11-03", "2026-11-05", "2026-11-08"])
        self.assertEqual([x["title"] for x in b], ["a", "b", "c"])
        self.assertIn("w01-sun-02", b[2]["steps"])
        self.assertIn("w01-tue-06", b[0]["steps"])

    def test_quizzes_moved_out_of_steps(self):
        _, (plan, quizzes, _) = self.build()
        listen = plan["weeks"][0]["days"][0]["steps"][1]
        self.assertEqual(listen["quiz"], "q-l-2026-11-02")
        self.assertEqual(quizzes["q-l-2026-11-02"]["questions"][0]["answer"], 0)
        self.assertNotIn("id", quizzes["q-l-2026-11-02"])

    def test_listen_episode_becomes_youtube_source_with_dw_alt(self):
        _, (plan, _, _) = self.build()
        listen = plan["weeks"][0]["days"][0]["steps"][1]
        self.assertEqual(listen["source"]["url"], "https://www.youtube.com/watch?v=dC6ZGLzdaTs")
        self.assertEqual(listen["source"]["type"], "video")
        self.assertEqual(listen["source"]["verified"], OK)
        self.assertEqual(listen["alt"][0]["url"], "https://learngerman.dw.com/en/hallo/l-37250531")
        self.assertNotIn("episode", listen)

    def test_theory_article_becomes_read_source(self):
        _, (plan, _, _) = self.build()
        th = plan["weeks"][0]["days"][0]["steps"][0]
        self.assertEqual(th["source"], {"title": "Статья про sein", "url": "#/read/art", "lang": "ru", "type": "article"})
        self.assertNotIn("article", th)

    def test_words_deck_is_week_and_day(self):
        _, (plan, _, _) = self.build()
        wed = plan["weeks"][0]["days"][2]
        self.assertEqual([s["deck"] for s in wed["steps"] if s["type"] == "words"], ["w1d3"])

    def test_anki_cards_get_stable_ids_and_deck(self):
        _, (plan, _, anki) = self.build()
        _, (_, _, again) = self.build()
        mon = [c for c in anki["cards"] if c["day"] == "2026-11-02"]
        self.assertEqual(len(mon), 2)
        self.assertEqual(mon[0]["deck"], "Неделя 1")
        self.assertEqual(mon[0]["deck_full"], "DE::Неделя 1")
        self.assertEqual(mon[0]["front"], "Привет 2026-11-02")
        self.assertRegex(mon[0]["id"], r"^[0-9a-f]{10}$")
        self.assertEqual([c["id"] for c in anki["cards"]], [c["id"] for c in again["cards"]])
        step = plan["weeks"][0]["days"][0]["steps"][5]
        self.assertEqual(step["deck"], "Неделя 1")
        self.assertNotIn("cards", step)

    def test_duplicate_quiz_id_fails(self):
        def edit(root):
            p = root / "content" / "w1" / "2-tue.yaml"
            p.write_text(p.read_text().replace("q-l-2026-11-03", "q-l-2026-11-02"))
        with self.assertRaisesRegex(ValueError, "q-l-2026-11-02"):
            self.build(edit)

    def test_unknown_episode_fails(self):
        def edit(root):
            p = root / "content" / "w1" / "1-mon.yaml"
            p.write_text(p.read_text().replace("episode: 1", "episode: 99"))
        with self.assertRaisesRegex(ValueError, "99"):
            self.build(edit)

    def test_built_data_passes_check(self):
        root, (plan, quizzes, anki) = self.build()
        build_plan.write(root, plan, quizzes, anki)
        words = {"decks": [{"id": f"w1d{d}", "words": []} for d in range(1, 7)]}
        (root / "data" / "words.json").write_text(json.dumps(words))
        self.assertEqual(check_data.check(root, full=False), [])


if __name__ == "__main__":
    unittest.main()
