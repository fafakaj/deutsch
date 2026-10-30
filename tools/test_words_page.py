"""Browser test of the word trainer words/index.html (Playwright, Chromium).

Run with the site server:
  python3 ~/.claude-second/skills/webapp-testing/scripts/with_server.py \
    --server "python3 server.py --port 8812 --progress /tmp/claude-1000/de-claude2.json" --port 8812 \
    -- uv run --with playwright python tools/test_words_page.py
"""

import json
import sys
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://localhost:8812"
ROOT = Path(__file__).resolve().parent.parent
DATA = json.loads((ROOT / "data" / "words.json").read_text())
DECK = DATA["decks"][0]  # w1d1
STEP = "w01-mon-05"
USER = "wordtest"  # each screen size gets its own account: wordtest390, wordtest1440
SIZES = [(390, 844), (1440, 900)]

failures = []


def check(cond, msg):
    print(("ok   " if cond else "FAIL ") + msg)
    if not cond:
        failures.append(msg)


def full(w):
    return f"{w['article']} {w['de']}" if w["article"] else w["de"]


def no_hscroll(page, where):
    sw, cw = page.evaluate("[document.documentElement.scrollWidth, document.documentElement.clientWidth]")
    check(sw <= cw, f"{where}: нет горизонтальной прокрутки ({sw} ≤ {cw})")


def stored(page, user):
    # The copy the site server keeps (store.js saves it after a short delay).
    return page.evaluate(f"fetch('/api/progress?user={user}', {{cache: 'no-store'}}).then(r => r.json())")


def open_page(browser, size, hash_="", login=True):
    ctx = browser.new_context(viewport={"width": size[0], "height": size[1]})
    if login:
        session = {"user": f"{USER}{size[0]}", "owner": False, "token": None, "gist": None}
        ctx.add_init_script(f"localStorage.setItem('de-session', {json.dumps(json.dumps(session))})")
    # Speech goes to external TTS; answer it with silence so the test stays offline.
    ctx.route("**/translate_tts**", lambda r: r.fulfill(status=204, body=""))
    ctx.route("**/dictvoice**", lambda r: r.fulfill(status=204, body=""))
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))
    page.goto(f"{BASE}/words/{hash_}")
    page.wait_for_load_state("networkidle")
    return ctx, page, errors


def run_choice_mode(page, button, words):
    page.click(button)
    for i, w in enumerate(words):
        page.wait_for_selector(".art-btn")
        check(page.locator("h3").first.inner_text().strip() == w["de"], f"{button} карта {i + 1}: {w['de']}")
        page.click(f".art-btn[data-art='{w['article']}']")
        page.click("#nextCardBtn")
    page.wait_for_selector("#retryDeckBtn")


def run_test_mode(page, words, right):
    page.click("#startTestBtn")
    for i, w in enumerate(words):
        page.wait_for_selector("#testWordInput")
        page.fill("#testWordInput", full(w) if i < right else "falsch")
        page.press("#testWordInput", "Enter")
        page.click("#nextCardBtn")
    page.wait_for_selector("#retryDeckBtn")


def reset_progress(user):
    body = json.dumps({"version": 1, "steps": {}, "words": {}, "events": []}).encode()
    req = urllib.request.Request(f"{BASE}/api/progress?user={user}", data=body, method="POST",
                                 headers={"Content-Type": "application/json"})
    urllib.request.urlopen(req).close()


def main():
    nouns = [w for w in DECK["words"] if w["article"]]
    for size in SIZES:
        reset_progress(f"{USER}{size[0]}")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # No site session: only a link to the site login.
        ctx, page, errors = open_page(browser, SIZES[0], login=False)
        link = page.locator("a#loginLink")
        check(link.count() == 1, "без сессии: ссылка «Войти»")
        check(link.get_attribute("href") == "../#/login", "«Войти» ведёт на ../#/login")
        check(page.locator("#loginForm, input[type=password]").count() == 0, "своего экрана входа нет")
        check(not errors, f"без сессии: 0 ошибок JS {errors}")
        ctx.close()

        for size in SIZES:
            tag, user = f"{size[0]}px", f"{USER}{size[0]}"
            ctx, page, errors = open_page(browser, size)
            text = page.inner_text("#app")
            check("Неделя 1" in text and "Неделя 4" in text, f"{tag}: колоды курса по неделям")
            check("Дополнительно" in text, f"{tag}: раздел «Дополнительно»")
            first, extra = text.find(DATA["decks"][0]["title"]), text.find(DATA["extra"][0]["title"])
            check(0 <= first < extra, f"{tag}: курс выше extra")
            check(page.locator(".deck-card").count() == 74, f"{tag}: 24 + 50 колод")
            check(page.locator("a#pathLink").get_attribute("href") == "../#/", f"{tag}: «← Дорожка» на ../#/")
            no_hscroll(page, f"{tag} главный экран")

            page.fill("#searchInput", "Семья")
            check(page.locator(".deck-card").count() >= 2, f"{tag}: поиск находит колоды")
            page.fill("#searchInput", "")

            # Opening a deck from the step link; article modes show only nouns.
            ctx.close()
            ctx, page, errors = open_page(browser, size, f"#deck={DECK['id']}&step={STEP}")
            check(page.locator("#startStudyBtn").count() == 1, f"{tag}: #deck открывает колоду сразу")
            check(DECK["title"] in page.inner_text("#app"), f"{tag}: заголовок колоды")
            no_hscroll(page, f"{tag} выбор режима")

            run_choice_mode(page, "#startStudyBtn", nouns)
            no_hscroll(page, f"{tag} итог изучения")
            page.click("#toCategoriesBtn")
            page.click(f".deck-card[data-deck-id='{DECK['id']}']")
            run_choice_mode(page, "#startArticleQuizBtn", nouns)
            page.click("#toCategoriesBtn")
            page.click(f".deck-card[data-deck-id='{DECK['id']}']")

            # Test below 80 %: the step stays open.
            right = int(len(DECK["words"]) * 0.8) - 1
            run_test_mode(page, DECK["words"], right)
            check(stored(page, user).get("steps", {}).get(STEP, {}).get("status") != "done", f"{tag}: тест < 80 % не засчитан")
            page.click("#retryDeckBtn")
            page.wait_for_selector("#testWordInput")
            page.click("#exitSessionBtn")
            page.click(f".deck-card[data-deck-id='{DECK['id']}']")

            # Test ≥ 80 %: markDone(step) and the deck record in progress.words.
            page.click("#startTestBtn")
            page.wait_for_selector("#testWordInput")
            page.click("#exitSessionBtn")
            page.click(f".deck-card[data-deck-id='{DECK['id']}']")
            run_test_mode(page, DECK["words"], len(DECK["words"]))
            no_hscroll(page, f"{tag} итог проверки")
            page.wait_for_timeout(1200)  # scheduleSave debounce
            saved = stored(page, user)
            check(saved.get("steps", {}).get(STEP, {}).get("status") == "done", f"{tag}: тест ≥ 80 % → markDone")
            rec = saved.get("words", {}).get(DECK["id"], {})
            check(len(rec.get("learnedIds", [])) == len(DECK["words"]), f"{tag}: progress.words[{DECK['id']}] сохранён")

            # The check of all learned words goes to the end.
            page.click("#toCategoriesBtn")
            page.click("#startAllLearnedQuizBtn")
            pool = page.evaluate("document.querySelector('#app').innerText")
            check("Слово 1/" in pool, f"{tag}: проверка изученных слов открылась")
            for _ in range(len(DECK["words"])):
                page.wait_for_selector("#testWordInput")
                page.fill("#testWordInput", "x")
                page.press("#testWordInput", "Enter")
                page.click("#nextCardBtn")
            page.wait_for_selector("#retryDeckBtn")
            check("Проверка изученных слов" in page.inner_text("#app"), f"{tag}: итог проверки изученных")

            # An extra deck works as before.
            page.click("#toCategoriesBtn")
            page.click(".deck-card[data-deck-id='x01']")
            page.click("#startArticleQuizBtn")
            page.wait_for_selector(".art-btn")
            check(page.locator("h3").first.inner_text().strip() == DATA["extra"][0]["words"][0]["de"], f"{tag}: extra x01 открылась")
            no_hscroll(page, f"{tag} карточка")

            # A deck without nouns: the article modes are off, the test still goes to the end.
            verbs = next(d for d in DATA["decks"] if not any(w["article"] for w in d["words"]))
            page.goto(f"{BASE}/words/#deck={verbs['id']}")
            page.wait_for_selector("#startTestBtn")
            check(page.locator("#startStudyBtn").is_disabled(), f"{tag}: {verbs['id']} без существительных — режимы артикля выключены")
            run_test_mode(page, verbs["words"], len(verbs["words"]))
            check("100%" in page.inner_text("#app"), f"{tag}: {verbs['id']} проверка до конца, 100 %")
            page.goto(f"{BASE}/words/")
            page.wait_for_selector(".deck-card")

            # Progress survives a reload (store.js copy).
            page.reload()
            page.wait_for_load_state("networkidle")
            check(f"{len(DECK['words'])}/{len(DECK['words'])}" in page.inner_text("#app"), f"{tag}: прогресс после перезагрузки")
            check(not errors, f"{tag}: 0 ошибок JS {errors}")
            ctx.close()
        browser.close()
    print(f"\n{len(failures)} FAIL" if failures else "\nALL OK")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
