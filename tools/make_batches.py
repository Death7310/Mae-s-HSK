#!/usr/bin/env python3
"""Split the unified HSK word list into batches for Persian content authoring.

Each data/content/batches/<id>.json carries what an author needs for ~60 words:
official pinyin and part of speech, later-level senses, the HSK 2.0 definition,
CC-CEDICT readings for reference and - for levels 1-4 - the cumulative word list
of the level, so example sentences can stay inside the learner's vocabulary.

Authors write data/content/staging/<id>.gen.json (see tools/content/WORD_GUIDE.md).

Run:  python3 tools/make_batches.py [--size 60]
"""
from __future__ import annotations

import argparse
import json

from hsklib import MAX_LEVEL, ROOT, freq_order, load_entries, std_level

OUT = ROOT / "data" / "content" / "batches"
ALLOWED_UP_TO = 4  # levels whose batches carry the cumulative word list


def dump_batch(doc: dict) -> str:
    """Compact JSON with one word per line: easy to read, cheap to feed to an author."""
    j = lambda x: json.dumps(x, ensure_ascii=False, separators=(",", ":"))  # noqa: E731
    head = {k: v for k, v in doc.items() if k != "words"}
    lines = ",\n".join(j(w) for w in doc["words"])
    return j(head)[:-1] + ',"words":[\n' + lines + "\n]}\n"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--size", type=int, default=60)
    args = ap.parse_args()

    entries = load_entries()
    cumulative: dict[int, list[str]] = {}
    for lvl in range(1, MAX_LEVEL + 1):
        words = {e.s for e in entries if (std_level(e, "hsk3") or 99) <= lvl}
        cumulative[lvl] = sorted(words)

    groups: dict[tuple[str, int], list] = {}
    for e in entries:
        h3 = std_level(e, "hsk3")
        key = ("hsk3", h3) if h3 else ("hsk2", std_level(e, "hsk2"))
        groups.setdefault(key, []).append(e)

    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.json"):
        old.unlink()
    index = []
    for (std, lvl) in sorted(groups):
        words = sorted(groups[(std, lvl)], key=freq_order)
        n = -(-len(words) // args.size)
        size = -(-len(words) // n)
        for i in range(n):
            chunk = words[i * size : (i + 1) * size]
            bid = f"{std}-L{lvl}-b{i + 1:02d}"
            doc: dict = {"batch": bid, "std": std, "level": lvl}
            if std == "hsk3" and lvl <= ALLOWED_UP_TO:
                doc["allowed"] = cumulative[lvl]
            doc["words"] = []
            for e in chunk:
                w: dict = {"id": e.id, "s": e.s, "p": e.p, "pos": e.pos}
                if e.hsk3_later or e.pos_later:
                    w["later"] = {"levels": e.hsk3_later, "pos": e.pos_later}
                if e.en2:
                    w["en2"] = e.en2
                w["cedict"] = [
                    {"p": f["p"], "en": f["en"][:6], **({"cl": f["cl"]} if f["cl"] else {})} for f in e.cedict[:5]
                ]
                doc["words"].append(w)
            (OUT / f"{bid}.json").write_text(dump_batch(doc), encoding="utf-8")
            index.append({"id": bid, "std": std, "level": lvl, "count": len(chunk)})
    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
    for (std, lvl) in sorted(groups):
        bs = [b for b in index if b["std"] == std and b["level"] == lvl]
        print(f"{std} L{lvl}: {sum(b['count'] for b in bs):5d} words in {len(bs):2d} batches")
    print(f"total {sum(b['count'] for b in index)} words in {len(index)} batches")


if __name__ == "__main__":
    main()
