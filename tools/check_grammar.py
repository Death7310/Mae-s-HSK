#!/usr/bin/env python3
"""Automatic checks on authored grammar parts (data/content/grammar/parts/).

Hard errors: wrong shape, ids or numbers not matching the brief.
Flags: pinyin disagreeing with the characters, characters outside the level's
word list, Persian orthography.

Run:  python3 tools/check_grammar.py [hsk3-L1-g1 ...]
"""
from __future__ import annotations

import json
import sys

from check_content import ARABIC_ONLY, DETACHED, level_flags, pinyin_flags
from hsklib import ROOT

PARTS = ROOT / "data" / "content" / "grammar" / "parts"
BRIEFS = ROOT / "data" / "content" / "briefs"


def check(name: str) -> tuple[list[str], list[str]]:
    try:
        items = json.loads((PARTS / f"{name}.json").read_text(encoding="utf-8"))
        brief = json.loads((BRIEFS / f"grammar-{name}.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        return [str(e)], []
    errors: list[str] = []
    flags: list[str] = []
    allowed = set(brief["allowed"])
    allowed_chars = {c for w in allowed for c in w}
    want = [p["no"] for p in brief["points"]]
    if not isinstance(items, list) or [it.get("no") for it in items if isinstance(it, dict)] != want:
        return [f"points differ from the brief: expected numbers {want[:6]}... ({len(want)} points)"], []
    for it in items:
        where = f"point {it['no']}"
        if it.get("id") != f"{brief['std']}-g{it['no']:04d}" or it.get("level") != brief["level"] or it.get("std") != brief["std"]:
            errors.append(f"{where}: wrong id/std/level ({it.get('id')})")
        title = it.get("title") or {}
        if not all(isinstance(x, str) and x.strip() for x in (it.get("pattern"), it.get("body"), title.get("fa"))):
            errors.append(f"{where}: needs pattern, body and title.fa")
            continue
        examples = it.get("examples") or []
        if not 2 <= len(examples) <= 4:
            errors.append(f"{where}: needs 2-3 examples, has {len(examples)}")
        persian = [it["body"], title["fa"]]
        for n, ex in enumerate(examples, 1):
            if not all(isinstance(ex.get(k), str) and ex[k].strip() for k in ("zh", "py", "fa", "en")):
                errors.append(f"{where} example {n}: needs zh, py, fa, en")
                continue
            persian.append(ex["fa"])
            flags += [f"{where} example {n}: {m}" for m in pinyin_flags(ex["zh"], ex["py"])]
            flags += [f"{where} example {n}: {m}" for m in level_flags(ex["zh"], allowed, allowed_chars)]
        if any(ARABIC_ONLY.search(t) for t in persian):
            flags.append(f"{where}: Arabic yeh/kaf in Persian text")
        if any(DETACHED.search(t) for t in persian):
            flags.append(f"{where}: possible missing half-space")
    return errors, flags


def main() -> None:
    names = sys.argv[1:] or sorted(p.stem for p in PARTS.glob("*.json"))
    bad = 0
    for name in names:
        errors, flags = check(name)
        print(f"{name}: {'ERROR' if errors else 'ok'}  {len(flags)} flags")
        for e in errors[:12]:
            print("   !!", e)
        for f in flags[:40]:
            print("   ~", f)
        bad += bool(errors)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
