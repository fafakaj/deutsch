# Контракт: «Немецкий: дорожка» (месяц 1, A1.1)

Сайт для интенсивного немецкого. Ученик знает A0. Сайт для ноутбука повторяет
референс `fafakaj/machine-learning-data-science` (копия кода уже в этом репо).
Тренажёр слов — отдельная страница `words/` для телефона (код
`ssmetanka/deu`, вёрстку не менять). Публикация — GitHub Pages, репо `fafakaj/deutsch`.
Старт: понедельник 2026-11-02. Прогресс — аккаунт + секретный gist, как в референсе.

## Кто что делает (свои файлы — только свои)

| Сессия | Файлы |
|---|---|
| claude3 (лид) | `index.html`, `js/**`, `css/**`, `server.py`, `tools/make_auth.py`, `data/auth.json`, `tests/**`, git, деплой |
| claude | `data/plan.json`, `data/quizzes.json`, `data/anki.json`, `data/articles/*.md`, `content/**` (исходники, если нужны), `tools/build_plan.py`, `tools/check_data.py` |
| claude2 | `words/index.html`, `data/words.json`, `data/refs/**`, `tools/check_words.py` |

- Не коммитить и не пушить: коммитит только лид.
- Чужие файлы не править. Нужно изменение — напишите в `.team/MAILBOX.md`.
- Статус: дописывайте строку в `.team/MAILBOX.md`: `HH:MM [имя] текст`.
- Готово = ваш валидатор проходит + строка `DONE` в MAILBOX.

## Нагрузка

- Пн–Сб: около 2 ч в день. Вс: 1–1,5 ч, повторение недели.
- Новых слов: около 15 в учебный день, всего за месяц ≥ 350.
- Каждый учебный день даёт 4 навыка: чтение/теория, аудирование, письмо, говорение,
  плюс «Слова» и карточки.

## Темы дней (общие для claude и claude2)

Колода тренажёра на день: `w{неделя}d{день}`, день 1 = понедельник.

| Колода | Дата | Тема дня (лексика) | Грамматика дня |
|---|---|---|---|
| w1d1 | 11-02 | Знакомство: люди, приветствия | входной тест A0; Personalpronomen, sein |
| w1d2 | 11-03 | Страны, города, языки | Präsens правильных глаголов (kommen, wohnen, heißen) |
| w1d3 | 11-04 | Числа 0–1000, возраст, контакты | W-Fragen, Ja/Nein-Fragen, порядок слов |
| w1d4 | 11-05 | Семья | haben; mein/dein/sein/ihr |
| w1d5 | 11-06 | Профессии и работа | der/ein/kein в Nominativ |
| w1d6 | 11-07 | Предметы вокруг: в классе и в сумке | Plural (основные типы) |
| — | 11-08 (Вс) | повторение недели 1 | мини-тест недели |
| w2d1 | 11-09 | Продукты | Akkusativ: den/einen |
| w2d2 | 11-10 | Еда и напитки, вкусы | mögen, möchten |
| w2d3 | 11-11 | Магазин, цены, количество | kein vs nicht |
| w2d4 | 11-12 | Кухня и посуда | глаголы с Vokalwechsel (essen, nehmen, sprechen) |
| w2d5 | 11-13 | Кафе и ресторан | вежливые фразы, заказ |
| w2d6 | 11-14 | Одежда и цвета | Akkusativ местоимений (mich, dich, ihn…) |
| — | 11-15 (Вс) | повторение недели 2 | мини-тест недели |
| w3d1 | 11-16 | Квартира и мебель | прилагательные после sein |
| w3d2 | 11-17 | Время, части дня | Uhrzeit: offiziell / inoffiziell |
| w3d3 | 11-18 | Распорядок дня | trennbare Verben |
| w3d4 | 11-19 | Дни, месяцы, времена года | am / um / im |
| w3d5 | 11-20 | Хобби и свободное время | können; Satzklammer |
| w3d6 | 11-21 | Дела по дому | gern / lieber / am liebsten |
| — | 11-22 (Вс) | повторение недели 3 | мини-тест недели |
| w4d1 | 11-23 | Город: места | in/an/bei + Dativ (только ответ «где?») |
| w4d2 | 11-24 | Транспорт и дорога | mit + Dativ; как пройти |
| w4d3 | 11-25 | Учёба и работа: правила | müssen, wollen, dürfen |
| w4d4 | 11-26 | Тело и здоровье | Imperativ (Sie, du, ihr) |
| w4d5 | 11-27 | Встречи и приглашения | Perfekt с haben (знакомство) |
| w4d6 | 11-28 | Погода и природа | пробный экзамен A1 (Hören, Lesen, Schreiben, Sprechen) |
| — | 11-29 (Вс) | итог месяца | повторение, что дальше |

Блоки (3 в неделю, как в референсе): Пн–Вт, Ср–Чт, Пт–Вс. `due` = последний день блока.

## Первоисточники

- Goethe-Institut, «Start Deutsch 1 / Goethe-Zertifikat A1: Prüfungsziele, Testbeschreibung»
  (PDF с Wortliste) — список слов A1 и умения A1.
- Goethe A1 Modellsatz (официальный пробный экзамен) — пробный экзамен недели 4.
- DW «Nicos Weg» A1 (learngerman.dw.com) — аудирование.
- Род и множественное число — Wiktionary (de.wiktionary.org) или Duden, не по памяти.
- Каждую внешнюю ссылку проверить `curl -sIL` (код 200). В поле `verified` записать `"200 2026-10-31"`.

## Схемы данных

### `data/plan.json` (формат референса)

```json
{"start": "2026-11-02", "github_user": "fafakaj",
 "weeks": [{"n": 1, "title": "…", "short": "…", "goal": "markdown",
   "days": [{"date": "2026-11-02", "weekday": "mon", "title": "…", "hours": 2, "kind": "study",
             "intro": "markdown", "optional": [], "steps": [ /* шаги */ ]}],
   "blocks": [{"id": "w01-b1", "n": 1, "title": "…", "due": "2026-11-03", "steps": ["w01-mon-01", "…"]}]}]}
```

Каждый шаг входит ровно в один блок. id шага: `w01-mon-01`.
Общие поля шага: `id`, `type`, `title`, `minutes`, необязательные `why` (md), `intro` (md), `optional` (bool).

| type | Поля | Что видит ученик |
|---|---|---|
| `theory` | `source {title,url,section?,lang:"ru"\|"de",type:"article"\|"video"}`, `alt?[]`, `goals?[]`, `do?` (md) | карточка источника; «Прочитал» после открытия. Свой конспект: `url: "#/read/<slug>"` |
| `quiz` | `quiz: "q-…"` | вопросы с автопроверкой |
| `oral` | `quiz: "q-…"` (вопросы `text`) | говорит вслух, сверяет с образцом |
| `practice` | `items: [{text, write?: true, sample?: "образец (md)"}]` | пишет текст; после ответа видит образец |
| `anki` | `deck: "Неделя 1"` | карточки из `anki.json` этой колоды (SRS) |
| `words` | `deck: "w1d1"`, `mode?: "study"\|"test"\|"word_study"\|"word_test"` | кнопка «Открыть колоду» → `words/#deck=w1d1&step=<id>` |
| `listen` | `source {…, type:"video"}`, `quiz: "q-…"` | видео/аудио + вопросы по нему |

### `data/quizzes.json`

`{"q-w1-sein": {"title": "…", "questions": [ … ]}}`. Типы вопросов:

- `choice`: `{q, options: [..], answer: <индекс>, explain?}`
- `multi`: `{q, options, answers: [индексы], explain?}`
- `text`: `{q, answer: "образец (md)"}` — самопроверка (для `oral` и свободных ответов)
- `de` (новый): `{q, answer: "Ich bin" | ["Ich bin", "ich bin"], explain?}` — автопроверка
  одной строки. Без учёта регистра, пробелов по краям и `.!?` в конце; `ae/oe/ue/ss`
  принимаются вместо `ä/ö/ü/ß`. Под полем есть кнопки ä ö ü ß.

### `data/anki.json`

`{"cards": [{"id": "<10 hex, стабильный>", "day": "2026-11-02", "deck": "Неделя 1",
"deck_full": "DE::Неделя 1", "kind": "basic", "front": "RU (html)", "back": "DE (html)"}]}`.
Карточка появляется с даты `day`. Карточки — фразы и грамматика (слова учит тренажёр).

### `data/articles/<slug>.md`

```
---
title: Глагол sein
kind: конспект
source: Goethe A1 Prüfungsziele; DW Nicos Weg, эпизод 1
original: https://…   (необязательно)
---
markdown на русском, примеры на немецком
```

### `data/words.json` (claude2)

```json
{"decks": [{"id": "w1d1", "week": 1, "day": "2026-11-02", "title": "Знакомство", "icon": "👋",
            "words": [{"de": "Name", "ru": "имя", "emoji": "🪪", "article": "der",
                       "plural": "die Namen", "pos": "noun"}]}],
 "extra": [ /* 50 старых категорий тренажёра в том же формате, id "x01".."x50" */ ]}
```

`article`: `"der"|"die"|"das"|null` (null — не существительное). `pos`:
`noun|verb|adj|adv|num|phrase|other`. В режимах про артикль участвуют только слова с `article`.
Обычные слова (без `article`) учатся в двух режимах: `word_study` — вписать пропущенные
буквы, `word_test` — написать слово целиком. Режим `test` проверяет всю колоду письменно.

## Тренажёр ↔ сайт

- `words/index.html` — ES-модуль. Импорт: `import { session } from "../js/auth.js"`,
  `import { loadProgress, progress, scheduleSave, markDone } from "../js/store.js"`.
- Перед работой: `await loadProgress()`. Прогресс тренажёра: `progress.words[deckId]`
  (объект тренажёра), после изменения — `scheduleSave()`. Синхронизация через gist — как у сайта.
- Нет сессии → экран со ссылкой «Войти» на `../#/login`. Свой экран входа тренажёра убрать.
- URL `words/#deck=w1d1&step=w01-mon-05`: сразу открыть колоду. Тест этой колоды
  с результатом ≥ 80 % → `markDone("w01-mon-05")`, и шаг на сайте засчитан.
- Ссылка «← Дорожка» ведёт на `../#/`.

## Проверки (внешние)

- `tools/check_data.py`: все ссылки шагов существуют (quiz, deck, article, words deck),
  каждый шаг в одном блоке, даты месяца 1, у каждого учебного дня есть 4 навыка.
- `tools/check_words.py`: артикль и plural каждого существительного = Wiktionary
  (0 расхождений); покрытие Goethe A1 Wortliste по темам месяца ≥ 90 %; ≥ 350 слов.
- Лид: Playwright на 1440 px и 390 px, 0 ошибок JS; у `words/` на 390 px нет
  горизонтальной прокрутки; живой URL GitHub Pages.
