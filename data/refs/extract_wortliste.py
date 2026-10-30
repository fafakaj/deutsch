"""Extract the alphabetical Wortliste from the Goethe A1 PDF into goethe-a1-wortliste.json.

Source: Goethe-Institut, "Goethe-Zertifikat A1 / Start Deutsch 1 — Wortliste" (excerpt of
"Prüfungsziele, Testbeschreibung"), https://www.goethe.de/pro/relaunch/prf/de/A1_SD1_Wortliste_02.pdf
Run: python3 data/refs/extract_wortliste.py  (needs pdftotext from poppler)
"""

import json
import re
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
PDF = HERE / "goethe-a1-wortliste.pdf"
OUT = HERE / "goethe-a1-wortliste.json"
URL = "https://www.goethe.de/pro/relaunch/prf/de/A1_SD1_Wortliste_02.pdf"

ARTICLE = re.compile(r"^(der|die|das)(?:/(?:der|die|das))*\s+(.+)$")
NOISE = re.compile(r"^(VS_[\d_]+|Seite \d+|Inventare|[A-ZÄÖÜ])$")

# Thematic groups of the Wortgruppenliste (pages 6-8); they have no alphabetical entries.
GROUPS = {
    "zeitmasse": ["die Sekunde, -n", "die Minute, -n", "die Stunde, -n", "der Tag, -e", "die Woche, -e", "das Jahr, -e"],
    "wochentage": ["der Wochentag, -e", "das Wochenende", "der Montag", "der Dienstag", "der Mittwoch",
                   "der Donnerstag", "der Freitag", "der Samstag", "der Sonnabend", "der Sonntag"],
    "tageszeiten": ["der Morgen", "der Vormittag, -e", "der Mittag", "der Nachmittag, -e", "der Abend, -e",
                    "die Nacht, ¨-e"],
    "monate": ["der Januar", "der Februar", "der März", "der April", "der Mai", "der Juni", "der Juli",
               "der August", "der September", "der Oktober", "der November", "der Dezember"],
    "jahreszeiten": ["der Frühling", "das Frühjahr", "der Sommer", "der Herbst", "der Winter"],
    "farben": ["schwarz", "weiß", "grau", "rot", "blau", "gelb", "grün", "braun"],
    "himmelsrichtungen": ["der Norden", "der Süden", "der Westen", "der Osten"],
    "laender": ["Deutschland", "Europa", "deutsch", "europäisch"],
    "uhrzeit": ["die Uhr", "das Viertel", "halb"],
    "masse": ["Meter", "Zentimeter", "Kilometer", "Quadratmeter", "Grad", "Prozent", "Liter", "Gramm", "Pfund",
              "Kilo"],
    "waehrungen": ["Euro", "Cent"],
    "zahlen": ["null", "eins", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun", "zehn",
               "elf", "zwölf", "zwanzig", "hundert", "tausend", "die Million, -en"],
}


def entry(head, group=None):
    """'die Adresse,-en' -> {lemma: 'Adresse', article: 'die', plural: '-en', raw: ...}."""
    raw = head.strip()
    text = re.sub(r"^\(sich\)\s*", "", raw)
    m = ARTICLE.match(text)
    article = m.group(1) if m else None
    body = m.group(2) if m else text
    lemma, _, plural = body.partition(",")
    e = {"lemma": lemma.strip(), "article": article, "plural": plural.strip() or None, "raw": raw}
    if group:
        e["group"] = group
    return e


def alphabetical(text):
    start = re.search(r"Alphabetische\s+A\n", text).start()  # the list itself, not the table of contents
    end = text.rindex("Literatur")
    entries = []
    for page in text[start:end].split("\f"):
        lines = []
        for line in page.splitlines():
            # The first page carries the side label "Alphabetische / Wortliste" left of the column.
            line = re.sub(r"^(\s*)(Alphabetische|Wortliste)(?=\s)", lambda m: " " * len(m.group(0)), line)
            if line.strip() and not NOISE.match(line.strip()):
                lines.append(line)
        if not lines:
            continue
        col = min(len(l) - len(l.lstrip()) for l in lines)
        for line in lines:
            indent = len(line) - len(line.lstrip())
            fields = re.split(r"\s{2,}", line.strip())
            if indent > col + 3:
                if entries:
                    entries[-1]["examples"].append(line.strip())  # the example sentence column
                continue
            head, examples = fields[0], fields[1:]
            prev = entries[-1] if entries else None
            # A noun broken over two lines: "der Anruf-" + "beantworter".
            if prev and prev["article"] and prev["raw"].endswith("-") and head[:1].islower():
                kept = prev["examples"]
                entries[-1] = entry(prev["raw"][:-1] + head)
                entries[-1]["examples"] = kept + examples
                continue
            if head == "Literatur":
                continue
            entries.append(entry(head))
            entries[-1]["examples"] = examples
    return entries


def main():
    text = subprocess.run(["pdftotext", "-layout", str(PDF), "-"], capture_output=True, text=True, check=True).stdout
    entries = alphabetical(text)
    for group, heads in GROUPS.items():
        entries += [entry(h, group) for h in heads]
    OUT.write_text(json.dumps({"source": URL, "verified": "200 2026-10-31", "entries": entries},
                              ensure_ascii=False, indent=1) + "\n")
    print(f"{len(entries)} entries -> {OUT.name}")


if __name__ == "__main__":
    main()
