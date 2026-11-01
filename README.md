# Deutsch: дорожка

Интенсивный немецкий от A0 к A1. Подробно расписан месяц 1 (2–29 ноября 2026, уровень A1.1).
Сайт: https://fafakaj.github.io/deutsch/

- План разбит на недели и блоки. Сайт показывает один шаг «сейчас». Сделан для ноутбука.
- Каждый день: теория, квиз с автопроверкой, аудирование (DW «Nicos Weg»), письмо, говорение, слова, карточки.
- Тренажёр слов (`words/`) сделан для телефона: колоды по темам дней, артикли der/die/das,
  обычные слова (пропущенные буквы и письменная проверка), озвучка.
- Прогресс хранится в аккаунте (секретный gist) и общий для ноутбука и телефона. Вход по паролю.

## Запуск у себя

```
python3 server.py --open
```

## Проверки

```
bash tests/run_smoke.sh            # каркас на тестовых данных (Playwright)
DATA=data bash tests/run_smoke.sh  # все шаги реального плана
python3 tools/check_data.py        # ссылки плана, блоки, 4 навыка в день
python3 tools/check_words.py       # артикли по Wiktionary, покрытие Goethe A1 Wortliste
```

## Аккаунты

```
uv run --no-project --with cryptography python tools/make_auth.py --user NAME \
    --token-file ~/.config/claude/ml-site-token --gist <gist id>
```
