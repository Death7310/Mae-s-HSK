#!/usr/bin/env python3
"""Download the open source datasets the build pipeline needs into data/raw/.

Every file here is redistributable (licence noted per source) and small enough
to keep in git, so the app can be rebuilt without network access.

Run:  python3 tools/fetch_sources.py [--force]
"""
from __future__ import annotations

import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
GH = "https://raw.githubusercontent.com/"

# (target directory, base url, [(remote path, local name)])
SOURCES = [
    # 2025 HSK 3.0 exam syllabus, mirrored row-for-row from the official query system. MIT.
    ("ofou-hsk", GH + "ofou/hsk/main/", [
        ("词汇.csv", "vocabulary.csv"),
        ("汉字.csv", "characters.csv"),
        ("手写汉字.csv", "handwriting.csv"),
        ("语法.csv", "grammar.csv"),
        ("LICENSE", "LICENSE"),
        ("README.md", "README.md"),
    ]),
    # HSK 2.0 official lists, 2012 revision, with pinyin and English definitions. MIT.
    ("hskhsk", GH + "glxxyz/hskhsk.com/main/", [
        *[(f"data/lists/HSK Official With Definitions 2012 L{n}.txt", f"hsk2012-L{n}.txt") for n in range(1, 7)],
        ("LICENSE", "LICENSE"),
    ]),
    # HSK lists with CC-CEDICT readings/definitions, POS tags and frequency ranks. MIT (+ CC-CEDICT CC BY-SA 4.0).
    ("complete-hsk-vocabulary", GH + "drkameleon/complete-hsk-vocabulary/main/", [
        ("complete.json", "complete.json"),
        ("LICENSE", "LICENSE"),
        ("README.md", "README.md"),
    ]),
]


def fetch(url: str, dest: Path) -> int:
    req = urllib.request.Request(url, headers={"User-Agent": "hsk-data-fetch"})
    with urllib.request.urlopen(req, timeout=120) as r:
        data = r.read()
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    return len(data)


def main() -> None:
    force = "--force" in sys.argv
    failed = 0
    for folder, base, files in SOURCES:
        for remote, local in files:
            dest = RAW / folder / local
            if dest.is_file() and not force:
                print(f"have   {dest.relative_to(ROOT)}")
                continue
            url = base + urllib.parse.quote(remote)
            try:
                print(f"fetch  {dest.relative_to(ROOT)}  {fetch(url, dest):>9} bytes")
            except Exception as e:  # noqa: BLE001 - report and continue with the other files
                failed += 1
                print(f"FAILED {url}: {e}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
