#!/usr/bin/env python3
"""Collect word recordings for the app from the audio-cmn repository.

Source: https://github.com/hugolpz/audio-cmn (CC BY-SA) - a sparse clone with
64k/hsk and 64k/syllabs is enough:

  git clone --depth 1 --filter=blob:none --sparse https://github.com/hugolpz/audio-cmn
  git -C audio-cmn sparse-checkout set 64k/hsk 64k/syllabs

Rules
  * multi-character words use the word recording (speaker: Yue Tan, Shtooka);
  * single-character words use the syllable recording that matches the official
    pinyin exactly (speaker: Chen Wang), because a character-level recording may
    be a different reading of the character (长 cháng / zhǎng);
  * neutral-tone single characters (的, 了, 吗 ...) use the word recording unless
    the character has several entries, in which case no file is assigned and the
    app falls back to the device's speech synthesis.

Writes app/public/audio/{w,s}/*.mp3 and data/audio/index.json {word id: path}.

Run:  python3 tools/build_audio.py [path/to/audio-cmn/64k]
"""
from __future__ import annotations

import json
import re
import shutil
import sys
from collections import Counter
from pathlib import Path

from hsklib import ROOT, load_entries, pinyin_key

SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/home/user/hugolpz/audio-cmn/64k")
OUT = ROOT / "app" / "public" / "audio"
INDEX = ROOT / "data" / "audio" / "index.json"


def word_name(s: str) -> str:
    """ASCII-safe file name: code points in hex joined by '-'."""
    return "-".join(f"{ord(c):x}" for c in s)


def syllable_file(p: str) -> Path | None:
    key = pinyin_key(p)  # e.g. 'ha3o', 'lv4', 'de'
    tone = re.search(r"\d", key)
    if not tone:
        return None
    base = re.sub(r"\d", "", key)
    for cand in (base, base.replace("v", "u:"), base.replace("v", "ü")):
        f = SRC / "syllabs" / f"cmn-{cand}{tone.group()}.mp3"
        if f.is_file():
            return f
    return None


def main() -> None:
    entries = load_entries()
    per_word = Counter(e.s for e in entries)
    index: dict[str, str] = {}
    stats = Counter()
    for sub in ("w", "s"):
        shutil.rmtree(OUT / sub, ignore_errors=True)
        (OUT / sub).mkdir(parents=True, exist_ok=True)

    for e in entries:
        word_file = SRC / "hsk" / f"cmn-{e.s}.mp3"
        src: Path | None = None
        rel = ""
        if len(e.s) == 1:
            syl = syllable_file(e.p)
            if syl:
                src, rel = syl, f"s/{syl.stem[4:].replace(':', 'v').replace('ü', 'v')}.mp3"
            elif per_word[e.s] == 1 and word_file.is_file():
                src, rel = word_file, f"w/{word_name(e.s)}.mp3"
        elif word_file.is_file():
            src, rel = word_file, f"w/{word_name(e.s)}.mp3"
        if not src:
            stats["missing"] += 1
            continue
        dest = OUT / rel
        if not dest.is_file():
            shutil.copyfile(src, dest)
        index[e.id] = rel
        stats[rel[0]] += 1

    INDEX.parent.mkdir(parents=True, exist_ok=True)
    INDEX.write_text(json.dumps(index, ensure_ascii=False, sort_keys=True, indent=0), encoding="utf-8")
    size = sum(f.stat().st_size for f in OUT.rglob("*.mp3"))
    print(f"word recordings {stats['w']}, syllable recordings {stats['s']}, without audio {stats['missing']}")
    print(f"{sum(1 for _ in OUT.rglob('*.mp3'))} files, {size / 1e6:.1f} MB -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
