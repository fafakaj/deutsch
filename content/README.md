# Исходники контента

`tools/build_plan.py` собирает из этой папки `data/plan.json`, `data/quizzes.json`, `data/anki.json`.
Сайт читает только `data/`. После правки запустите:

```bash
python3 tools/build_plan.py && python3 tools/check_data.py
```

## Файлы

```
content/
  w1/week.yaml        # неделя: n, title, short, goal, blocks (3 названия блоков)
  w1/1-mon.yaml       # день: имя файла = номер дня (1–7) + день недели
  w1/2-tue.yaml
  …
  w1/7-sun.yaml
data/articles/<slug>.md   # конспекты (пишутся сразу в data/, см. CONTRACT.md)
data/refs/nicos-weg-a1.json  # эпизоды Nicos Weg: номер → YouTube DW, урок DW
```

## week.yaml

```yaml
n: 1
title: "Знакомство, страны, числа, семья, работа"
short: "Знакомство"
blocks: ["Знакомство и страны", "Числа и семья", "Работа, предметы, повторение"]
goal: |
  - Я могу поздороваться, представиться и попрощаться.
```

Блоки строятся сами: Пн–Вт → блок 1, Ср–Чт → блок 2, Пт–Вс → блок 3; `due` = последний день блока.

## День

```yaml
date: 2026-11-02
title: "Знакомство"
hours: 2            # Пн–Сб ≈ 2, Вс 1–1.5
kind: study         # study | review (Вс) | exam (пробный экзамен)
intro: |
  markdown
steps:              # порядок = порядок на сайте; id (w01-mon-01) ставит сборщик
  - type: theory
    title: "…"
    minutes: 20
    article: personalpronomen-sein   # → source {url: "#/read/personalpronomen-sein", title из front matter}
    alt: [{title, url, lang, type, verified: "200 2026-10-31"}]
    goals: ["…"]
  - type: quiz        # вопросы прямо здесь; id квиза обязателен и уникален
    title: "…"
    minutes: 15
    quiz:
      id: q-w1d1-sein
      title: "…"
      questions:
        - {type: de, q: "Ich ___ Anna.", answer: bin}
        - {type: choice, q: "…", options: [a, b, c], answer: 0, explain: "…"}
  - type: listen
    title: "…"
    minutes: 20
    episode: 1        # Nicos Weg A1, Folge 1 → source = YouTube DW, alt = урок DW (сборщик)
    quiz: {id: q-w1d1-listen, title: "…", questions: […]}
  - type: practice
    title: "…"
    minutes: 15
    items:
      - {text: "задание (md)", write: true, sample: "образец (md)"}
  - type: oral        # вопросы type: text, answer = образец
    title: "…"
    minutes: 10
    quiz: {id: q-w1d1-oral, title: "…", questions: [{type: text, q: "…", answer: "…"}]}
  - type: words       # колода w{неделя}d{день} — сама; mode: study | test
    title: "Слова дня"
    minutes: 20
  - type: anki        # колода «Неделя N», day = дата дня, id = sha1(front)[:10]
    title: "Карточки"
    minutes: 10
    cards:
      - ["Доброе утро!", "Guten Morgen!"]
```

Внешнюю ссылку проверяйте Python `urllib` (не curl) и пишите `verified: "200 YYYY-MM-DD"`.
Немецкий проверяйте по Wiktionary или Duden.
