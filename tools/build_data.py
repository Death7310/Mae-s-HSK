#!/usr/bin/env python3
"""Build the app's static data from the raw sources and the authored content.

Inputs
  data/raw/...                                     word lists (see tools/hsklib.py, tools/fetch_sources.py)
  data/content/words/*.jsonl                       authored per-word content keyed by id: Persian glosses,
                                                   concise English, notes, example sentences, quality flag
  data/content/dialogues/<std>-<level>.json        scripted dialogues (optional)
  data/content/grammar/<std>-<level>.json          grammar points (optional)
  data/audio/index.json                            {word id or simplified: "relative/path.mp3"} (optional)
  app/node_modules/hanzi-writer-data/<char>.json   stroke-order data
  tools/credits.json                               attribution list shown on the About screen

Outputs (all under app/public/data/)
  manifest.json, <std>/words-<level>.json, hsk3/chars-<level>.json,
  <std>/dialogues-<level>.json, <std>/grammar-<level>.json, strokes/s<k>.json, credits.json

Run:  python3 tools/build_data.py            (from the repository root)
"""
from __future__ import annotations

import csv
import hashlib
import json
import shutil
import sys
from collections import defaultdict
from pathlib import Path

from hsklib import MAX_LEVEL, RAW, ROOT, ZH_NUM, Entry, freq_order, load_entries, std_level

CONTENT = ROOT / "data" / "content"
AUDIO_INDEX = ROOT / "data" / "audio" / "index.json"
STROKES_SRC = ROOT / "app" / "node_modules" / "hanzi-writer-data"
OUT = ROOT / "app" / "public" / "data"
STANDARDS = ("hsk3", "hsk2")
STROKE_SHARDS = 32  # must match SHARDS in app/src/ui/StrokeOrder.tsx


def load_authored() -> dict[str, dict]:
    """Authored content keyed by word id. Later files override earlier ones."""
    authored: dict[str, dict] = {}
    d = CONTENT / "words"
    if not d.is_dir():
        return authored
    for path in sorted(d.glob("*.jsonl")):
        for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError as e:
                sys.exit(f"{path}:{n}: {e}")
            authored[row["id"]] = row
    return authored


def build_word(e: Entry, authored: dict | None, audio: dict[str, str]) -> dict:
    w: dict = {"id": e.id, "s": e.s, "p": e.p, "fa": [], "en": e.en_ref or ([e.en2] if e.en2 else [])}
    pos = e.pos
    if e.trad:
        w["t"] = e.trad
    if authored:
        w["fa"] = authored["fa"]
        w["en"] = authored["en"]
        pos = pos or authored.get("pos") or []
        if authored.get("note"):
            w["note"] = authored["note"]
        if authored.get("ex"):
            w["ex"] = authored["ex"]
        w["q"] = int(authored.get("q", 0))
    if pos:
        w["pos"] = pos
    if e.cl:
        w["cl"] = e.cl
    a = audio.get(e.id) or audio.get(e.s)
    if a:
        w["a"] = a
    w["lv"] = {std: lvl for std in STANDARDS if (lvl := std_level(e, std))}
    return w


def write_json(path: Path, obj) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    path.write_text(data, encoding="utf-8")
    return len(data.encode("utf-8"))


def is_han(c: str) -> bool:
    return "一" <= c <= "鿿" or "㐀" <= c <= "䶿"


def build_strokes(chars: set[str]) -> tuple[int, list[str]]:
    shards: dict[int, dict[str, dict]] = defaultdict(dict)
    missing: list[str] = []
    for ch in sorted(chars):
        src = STROKES_SRC / f"{ch}.json"
        if not src.is_file():
            missing.append(ch)
            continue
        shards[ord(ch) % STROKE_SHARDS][ch] = json.loads(src.read_text(encoding="utf-8"))
    total = 0
    for k in range(STROKE_SHARDS):
        total += write_json(OUT / "strokes" / f"s{k}.json", shards.get(k, {}))
    return total, missing


def char_lists() -> dict[int, dict[str, list[str]]]:
    """Official 2025-syllabus character lists per level: recognition and handwriting."""
    out: dict[int, dict[str, list[str]]] = {n: {"read": [], "write": []} for n in range(1, MAX_LEVEL + 1)}
    for file, key in (("characters.csv", "read"), ("handwriting.csv", "write")):
        with open(RAW / "ofou-hsk" / file, encoding="utf-8-sig", newline="") as fh:
            for row in csv.DictReader(fh):
                lvl = ZH_NUM.get(row["级别"][0], 99)
                if lvl <= MAX_LEVEL:
                    out[lvl][key].append(row["汉字"])
    # The syllabus has one handwriting list for levels 1-2 (labelled level 2). Level 1 learners
    # start on the part of it they can already read.
    read1 = set(out[1]["read"])
    shared = out[2]["write"]
    out[1]["write"] = [c for c in shared if c in read1]
    out[2]["write"] = [c for c in shared if c not in read1]
    return out


def main() -> None:
    entries = load_entries()
    authored = load_authored()
    audio = json.loads(AUDIO_INDEX.read_text(encoding="utf-8")) if AUDIO_INDEX.is_file() else {}
    unknown = set(authored) - {e.id for e in entries}
    if unknown:
        print(f"warning: authored content for unknown ids: {sorted(unknown)[:10]}", file=sys.stderr)

    for std in STANDARDS:  # drop stale level files from earlier builds
        shutil.rmtree(OUT / std, ignore_errors=True)

    manifest: dict = {"version": "", "standards": {}}
    chars: set[str] = set()
    digest = hashlib.sha256()
    report: list[str] = []
    chars_by_level = char_lists()

    for std in STANDARDS:
        levels_info = []
        for level in range(1, MAX_LEVEL + 1):
            group = sorted((e for e in entries if std_level(e, std) == level), key=freq_order)
            words = [build_word(e, authored.get(e.id), audio) for e in group]
            for w in words:
                chars.update(c for c in w["s"] if is_han(c))
            rel = f"{std}/words-{level}.json"
            size = write_json(OUT / rel, {"std": std, "level": level, "words": words})
            digest.update(json.dumps(words, ensure_ascii=False, sort_keys=True).encode())
            with_fa = sum(1 for w in words if w["fa"])
            reviewed = sum(1 for w in words if w.get("q", 0) >= 1)
            with_audio = sum(1 for w in words if "a" in w)
            info = {"level": level, "count": len(words), "file": rel, "fa": with_fa, "audio": with_audio}
            report.append(
                f"{std} L{level}: {len(words):5d} words  fa {with_fa:5d} (reviewed {reviewed:5d})"
                f"  audio {with_audio:5d}  {size / 1024:7.0f} KB"
            )
            if std == "hsk3":
                cl = chars_by_level[level]
                write_json(OUT / std / f"chars-{level}.json", cl)
                chars.update(cl["read"])
                info["chars"] = len(cl["read"])
                info["write"] = len(cl["write"])
            for kind in ("dialogues", "grammar"):
                src = CONTENT / kind / f"{std}-{level}.json"
                if src.is_file():
                    items = json.loads(src.read_text(encoding="utf-8"))
                    write_json(OUT / std / f"{kind}-{level}.json", items)
                    digest.update(src.read_bytes())
                    info[kind] = len(items)
                    report.append(f"{std} L{level}: {len(items)} {kind}")
            levels_info.append(info)
        manifest["standards"][std] = {"levels": levels_info}

    stroke_bytes, missing = build_strokes(chars)
    report.append(
        f"strokes: {len(chars) - len(missing)} characters, {stroke_bytes / 1024 / 1024:.1f} MB"
        + (f", missing: {''.join(missing)}" if missing else "")
    )

    credits_src = ROOT / "tools" / "credits.json"
    if credits_src.is_file():
        write_json(OUT / "credits.json", json.loads(credits_src.read_text(encoding="utf-8")))

    manifest["version"] = digest.hexdigest()[:12]
    write_json(OUT / "manifest.json", manifest)
    print("\n".join(report))
    print(f"data version {manifest['version']} -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
