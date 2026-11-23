#!/usr/bin/env python3
"""Automatic checks on authored dialogues (data/content/dialogues/<std>-<n>.json).

Hard errors: wrong shape, wrong ids, speakers not alternating, line count out of range.
Flags (hints for the reviewer): pinyin disagreeing with the characters, characters
outside the level's word list, Persian orthography, over-long lines.

Run:  python3 tools/check_dialogues.py [hsk3-1 ...]
"""
from __future__ import annotations

import json
import sys

from check_content import ARABIC_ONLY, DETACHED, HAN, level_flags, pinyin_flags
from hsklib import ROOT

DIALOGUES = ROOT / "data" / "content" / "dialogues"
BRIEFS = ROOT / "data" / "content" / "briefs"
MAX_CHARS = {1: 14, 2: 14, 3: 24, 4: 24, 5: 30, 6: 30}


def check(name: str) -> tuple[list[str], list[str]]:
    std, lvl = name.rsplit("-", 1)
    level = int(lvl)
    try:
        items = json.loads((DIALOGUES / f"{name}.json").read_text(encoding="utf-8"))
        brief = json.loads((BRIEFS / f"{std}-L{level}.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        return [str(e)], []
    errors: list[str] = []
    flags: list[str] = []
    allowed = set(brief["allowed"])
    allowed_chars = {c for w in allowed for c in w}
    if not isinstance(items, list) or len(items) != len(brief["topics"]):
        return [f"expected {len(brief['topics'])} dialogues, got {len(items) if isinstance(items, list) else 'non-list'}"], []
    for i, d in enumerate(items, 1):
        did = f"{std}-{level}-{i:02d}"
        if d.get("id") != did or d.get("std") != std or d.get("level") != level:
            errors.append(f"{did}: wrong id/std/level ({d.get('id')})")
        title = d.get("title") or {}
        if not all(isinstance(title.get(k), str) and title[k].strip() for k in ("fa", "zh")):
            errors.append(f"{did}: title needs fa and zh")
        lines = d.get("lines") or []
        if not brief["lines"]["min"] <= len(lines) <= brief["lines"]["max"]:
            errors.append(f"{did}: {len(lines)} lines, expected {brief['lines']['min']}-{brief['lines']['max']}")
        for n, line in enumerate(lines, 1):
            where = f"{did} line {n}"
            if not all(isinstance(line.get(k), str) and line[k].strip() for k in ("who", "zh", "py", "fa", "en")):
                errors.append(f"{where}: needs who, zh, py, fa, en")
                continue
            if line["who"] != "AB"[(n - 1) % 2]:
                errors.append(f"{where}: speakers must alternate A, B")
            if not isinstance(line.get("alt", []), list) or len(line.get("alt", [])) > 3:
                errors.append(f"{where}: alt must be a list of at most 3 strings")
            if len(HAN.findall(line["zh"])) > MAX_CHARS[level]:
                flags.append(f"{where}: {len(HAN.findall(line['zh']))} characters (long to type)")
            flags += [f"{where}: {m}" for m in pinyin_flags(line["zh"], line["py"])]
            for text in [line["zh"], *line.get("alt", [])]:
                flags += [f"{where}: {m} in «{text}»" for m in level_flags(text, allowed, allowed_chars)]
            if ARABIC_ONLY.search(line["fa"]) or ARABIC_ONLY.search(d.get("scene", "")):
                flags.append(f"{where}: Arabic yeh/kaf in Persian text")
            if DETACHED.search(line["fa"]):
                flags.append(f"{where}: possible missing half-space")
    return errors, flags


def main() -> None:
    names = sys.argv[1:] or sorted(p.stem for p in DIALOGUES.glob("*.json"))
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
