#!/usr/bin/env python3
"""Rewrite the content-status table in README.md from the built data manifest.

Run after tools/build_data.py:  python3 tools/status_md.py
"""
from __future__ import annotations

import json
import re

from hsklib import ROOT

START, END = "<!-- status:start -->", "<!-- status:end -->"


def main() -> None:
    manifest = json.loads((ROOT / "app" / "public" / "data" / "manifest.json").read_text(encoding="utf-8"))
    rows = []
    for std, name in (("hsk3", "New HSK"), ("hsk2", "Old HSK")):
        for lv in manifest["standards"][std]["levels"]:
            extra = ""
            if std == "hsk3":
                extra = f" {lv.get('dialogues', 0) or '–'} | {lv.get('grammar', 0) or '–'} |"
            else:
                extra = " | |"
            rows.append(
                f"| {name} {lv['level']} | {lv['count']:,} | {lv['fa']:,} | {lv.get('reviewed', 0):,} | {lv['audio']:,} |{extra}"
            )
    table = "\n".join(
        [
            "| Level | Words | With Persian | Reviewed | Human audio | Dialogues | Grammar lessons |",
            "| --- | --- | --- | --- | --- | --- | --- |",
            *rows,
        ]
    )
    readme = ROOT / "README.md"
    text = readme.read_text(encoding="utf-8")
    block = f"{START}\n{table}\n{END}"
    if START in text:
        text = re.sub(re.escape(START) + r".*?" + re.escape(END), lambda _: block, text, flags=re.S)
    readme.write_text(text, encoding="utf-8")
    print(table)


if __name__ == "__main__":
    main()
