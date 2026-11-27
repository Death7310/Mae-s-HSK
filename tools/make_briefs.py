#!/usr/bin/env python3
"""Write the per-level briefs for dialogue authoring (data/content/briefs/).

Topics are our own selection of everyday situations suited to each level.

Run:  python3 tools/make_briefs.py
"""
from __future__ import annotations

import json

from hsklib import ROOT, load_entries, std_level

OUT = ROOT / "data" / "content" / "briefs"

TOPICS = {
    1: [
        "greeting and introducing yourself (name, nationality)",
        "talking about family members",
        "asking the time and the date; making a simple appointment",
        "buying something in a shop and asking the price",
        "ordering food and drinks",
        "at school: classes, teacher, classmates",
        "asking where something is (nearby places, simple directions)",
        "a short phone call",
        "talking about the weather",
        "what you like to do; inviting a friend",
    ],
    2: [
        "daily routine and what you did yesterday",
        "taking a bus, taxi or the subway; asking how to get somewhere",
        "making plans for the weekend",
        "at a restaurant: choosing dishes and paying",
        "feeling unwell and seeing a doctor",
        "sports and exercise",
        "shopping for clothes: colour, size, trying on",
        "buying tickets and travelling",
        "a birthday: gift and party",
        "asking for help and thanking someone",
    ],
    3: [
        "looking for and renting a flat",
        "at the bank or the post office",
        "planning a trip and booking a hotel room",
        "talking about work or study and how it is going",
        "describing a person's appearance and character",
        "at the hospital: explaining symptoms",
        "a traditional festival and how people celebrate it",
        "online shopping and a delivery problem",
        "changes in the weather and the seasons",
        "a hobby you take seriously and why",
    ],
    4: [
        "a job interview",
        "a problem at work and how to solve it",
        "opinions about phones, the internet and technology",
        "differences in customs between two countries",
        "friendship and getting along with others",
        "choosing what to study; pressure of exams",
        "healthy habits: sleep, food, exercise",
        "making a complaint to customer service",
        "discussing a piece of news or an event",
        "planning a trip: weighing advantages and disadvantages",
    ],
    5: [
        "negotiating a price and delivery terms with a business partner",
        "renting or buying a home: cost and quality of life in a big city",
        "an environmental problem in the city and what residents can do",
        "discussing treatment options for a long-term health problem with a doctor",
        "a misunderstanding between colleagues and clearing it up",
        "parents and grown-up children: expectations and independence",
        "a stable job or starting your own business",
        "reporting a lost item or a minor accident and dealing with insurance",
        "a film, book or exhibition: giving an opinion and defending it",
        "preparing a group presentation and dividing the work",
    ],
    6: [
        "how new technology is changing jobs and what people should learn",
        "differences in values and lifestyle between generations",
        "developing a city or protecting its old neighbourhoods",
        "interviewing a specialist (scientist, doctor or artist) about their work",
        "a consumer or tenancy dispute: asking for advice about rights and next steps",
        "pressure at work, mental well-being and finding a balance",
        "traditional culture in modern life: what stays and what changes",
        "prices, saving and investing: weighing return against risk",
        "studying or working abroad: culture shock and adapting",
        "a formal meeting: making a proposal, objecting politely, reaching a compromise",
    ],
}
LINES = {1: (6, 8), 2: (6, 9), 3: (8, 10), 4: (8, 12), 5: (10, 12), 6: (10, 14)}


GRAMMAR_PART = 33  # grammar points per authoring part


def grammar_briefs(entries) -> None:
    """Split each level's official grammar points into parts for authoring.

    Only the factual structure is passed on (number, category, the structure
    itself); the syllabus's own example sentences are left out, so the app's
    explanations and examples are written from scratch.
    """
    import csv

    from hsklib import RAW, ZH_NUM

    with open(RAW / "ofou-hsk" / "grammar.csv", encoding="utf-8-sig", newline="") as fh:
        rows = list(csv.DictReader(fh))
    for level in sorted(TOPICS):
        allowed = sorted({e.s for e in entries if (std_level(e, "hsk3") or 99) <= level})
        points = [
            {
                "no": int(r["No."]),
                "category": " > ".join(x for x in (r["类别"], r["类别名称"], r["细目"]) if x.strip()),
                "content": r["语法内容"].strip(),
            }
            for r in rows
            if ZH_NUM.get(r["级别"][0]) == level and not r["级别"].startswith("七")
        ]
        n = -(-len(points) // GRAMMAR_PART)
        size = -(-len(points) // n)
        for k in range(n):
            part = points[k * size : (k + 1) * size]
            path = OUT / f"grammar-hsk3-L{level}-g{k + 1}.json"
            path.write_text(
                json.dumps({"std": "hsk3", "level": level, "points": part, "allowed": allowed}, ensure_ascii=False),
                encoding="utf-8",
            )
            print(f"{path.relative_to(ROOT)}: {len(part)} grammar points")


def main() -> None:
    entries = load_entries()
    OUT.mkdir(parents=True, exist_ok=True)
    grammar_briefs(entries)
    for level, topics in TOPICS.items():
        allowed = sorted({e.s for e in entries if (std_level(e, "hsk3") or 99) <= level})
        brief = {
            "std": "hsk3",
            "level": level,
            "lines": {"min": LINES[level][0], "max": LINES[level][1]},
            "topics": topics,
            "allowed": allowed,
        }
        path = OUT / f"hsk3-L{level}.json"
        path.write_text(json.dumps(brief, ensure_ascii=False), encoding="utf-8")
        print(f"{path.relative_to(ROOT)}: {len(topics)} topics, {len(allowed)} allowed words")


if __name__ == "__main__":
    main()
