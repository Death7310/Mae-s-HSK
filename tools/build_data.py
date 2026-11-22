#!/usr/bin/env python3
"""Build the app's static data from the raw sources.

Inputs
  data/raw/complete-hsk-vocabulary/complete.json   level tags, POS, frequency, CC-CEDICT forms
  data/content/words/*.jsonl                       curated per-word content (Persian glosses,
                                                   chosen reading, examples) - one JSON object per line
  data/content/dialogues/<std>-<level>.json        scripted dialogues (optional)
  data/content/grammar/<std>-<level>.json          grammar points (optional)
  data/audio/index.json                            {simplified: "relative/path.mp3"} (optional)
  app/node_modules/hanzi-writer-data/<char>.json   stroke-order data
  tools/credits.json                               attribution list shown on the About screen

Outputs (all under app/public/data/)
  manifest.json, <std>/words-<level>.json, <std>/dialogues-<level>.json,
  <std>/grammar-<level>.json, strokes/s<k>.json, credits.json

Run:  python3 tools/build_data.py            (from the repository root)
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "complete-hsk-vocabulary" / "complete.json"
CONTENT = ROOT / "data" / "content"
AUDIO_INDEX = ROOT / "data" / "audio" / "index.json"
STROKES_SRC = ROOT / "app" / "node_modules" / "hanzi-writer-data"
OUT = ROOT / "app" / "public" / "data"

# Standard id in the app -> level-tag prefix in the raw dataset.
#   hsk3 = "newest" = the Nov-2025 HSK 3.0 syllabus (examined from Dec 2026)
#   hsk2 = "old"    = legacy HSK 2.0 (2012 list)
STANDARDS = {"hsk3": "newest", "hsk2": "old"}
MAX_LEVEL = 6
STROKE_SHARDS = 32

TONE_MAP = {
    "a": "āáǎà", "e": "ēéěè", "i": "īíǐì", "o": "ōóǒò", "u": "ūúǔù", "ü": "ǖǘǚǜ",
}

# Glosses that mark a CC-CEDICT form as not the everyday reading of a word.
BAD_SENSE = re.compile(
    r"^(surname |variant of |old variant of |archaic variant of |japanese variant of |"
    r"erhua variant of |used in |see |\(archaic\)|\(literary\)|abbr\. for |unofficial variant of )",
    re.I,
)


def numeric_key(numeric: str) -> str:
    """'xue2 xi2' -> 'xue2xi2' (used inside word ids)."""
    return re.sub(r"[^a-z0-9:]", "", numeric.lower()).replace("u:", "v")


def word_id(simplified: str, numeric: str) -> str:
    return f"{simplified}|{numeric_key(numeric)}"


def form_score(form: dict) -> float:
    """Higher = more likely the reading a learner needs first."""
    meanings = form.get("meanings") or []
    if not meanings:
        return -100.0
    pinyin = form["transcriptions"]["pinyin"]
    bad = sum(1 for m in meanings if BAD_SENSE.match(m))
    score = float(len(meanings) - 2 * bad)
    if bad == len(meanings):
        score -= 50
    if pinyin[:1].isupper():  # proper-noun reading (surname, place name)
        score -= 5
    return score


def pick_form(entry: dict) -> dict:
    forms = entry["forms"]
    return max(forms, key=form_score)


def clean_en(meanings: list[str], limit: int = 4) -> list[str]:
    out: list[str] = []
    for m in meanings:
        if BAD_SENSE.match(m) and len(meanings) > 1:
            continue
        m = re.sub(r"\s*\(Taiwan pr\. \[[^\]]*\]\)", "", m)
        m = re.sub(r"\s*CL:[^;]*", "", m).strip(" ;")
        if m and m not in out:
            out.append(m)
        if len(out) >= limit:
            break
    return out or meanings[:limit]


def nfc(s: str) -> str:
    return unicodedata.normalize("NFC", s)


def load_curated() -> dict[str, dict]:
    """Curated content keyed by simplified word. Later files override earlier ones."""
    curated: dict[str, dict] = {}
    d = CONTENT / "words"
    if not d.is_dir():
        return curated
    for path in sorted(d.glob("*.jsonl")):
        for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError as e:
                sys.exit(f"{path}:{n}: {e}")
            key = row.get("s")
            if not key:
                sys.exit(f"{path}:{n}: missing 's'")
            curated[key] = row
    return curated


def build_word(entry: dict, levels: dict[str, int], curated: dict | None, audio: dict[str, str]) -> dict:
    simp = entry["simplified"]
    form = pick_form(entry)
    tr = form["transcriptions"]
    pinyin = nfc(tr["pinyin"])
    numeric = tr["numeric"]
    en = clean_en(form["meanings"])
    pos = [p for p in entry.get("pos", []) if p.islower()][:3]
    cl = [c for c in dict.fromkeys(form.get("classifiers") or [])]
    w: dict = {"id": "", "s": simp, "p": pinyin, "fa": [], "en": en}
    trad = form.get("traditional")

    if curated:
        # Curated content wins: it carries the reading and senses meant at this HSK level.
        if curated.get("p"):
            pinyin = nfc(curated["p"])
            w["p"] = pinyin
            numeric = curated.get("pn") or to_numeric(pinyin)
            # Take the traditional form from the CC-CEDICT form with that reading, if any.
            for f in entry["forms"]:
                if nfc(f["transcriptions"]["pinyin"]).lower() == pinyin.lower():
                    trad = f.get("traditional")
                    cl = list(dict.fromkeys(f.get("classifiers") or []))
                    break
        if curated.get("fa"):
            w["fa"] = [nfc(x).strip() for x in curated["fa"] if x and x.strip()]
        if curated.get("en"):
            w["en"] = curated["en"]
        if curated.get("pos"):
            pos = curated["pos"]
        if curated.get("cl") is not None:
            cl = curated["cl"]
        if curated.get("note"):
            w["note"] = nfc(curated["note"])
        if curated.get("ex"):
            w["ex"] = [{k: nfc(v) for k, v in ex.items() if v} for ex in curated["ex"]]
        w["q"] = int(curated.get("q", 0))

    w["id"] = word_id(simp, numeric)
    if trad and trad != simp:
        w["t"] = trad
    if pos:
        w["pos"] = pos
    if cl:
        w["cl"] = cl
    if simp in audio:
        w["a"] = audio[simp]
    w["lv"] = levels
    return w


def to_numeric(pinyin: str) -> str:
    """'xué xí' -> 'xue2 xi2' (neutral tone = 5)."""
    out = []
    for syl in pinyin.split():
        tone = 5
        base = ""
        for ch in unicodedata.normalize("NFC", syl.lower()):
            for plain, marked in TONE_MAP.items():
                if ch in marked:
                    tone = marked.index(ch) + 1
                    ch = plain
                    break
            base += ch
        out.append(f"{base.replace('ü', 'v')}{tone}")
    return " ".join(out)


def write_json(path: Path, obj) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    path.write_text(data, encoding="utf-8")
    return len(data.encode("utf-8"))


def build_strokes(chars: set[str]) -> tuple[int, list[str]]:
    shards: dict[int, dict[str, dict]] = defaultdict(dict)
    missing: list[str] = []
    for ch in sorted(chars):
        src = STROKES_SRC / f"{ch}.json"
        if not src.is_file():
            missing.append(ch)
            continue
        data = json.loads(src.read_text(encoding="utf-8"))
        # radStrokes marks the radical's strokes; keep it, drop nothing else.
        shards[ord(ch) % STROKE_SHARDS][ch] = data
    total = 0
    for k in range(STROKE_SHARDS):
        total += write_json(OUT / "strokes" / f"s{k}.json", shards.get(k, {}))
    return total, missing


def main() -> None:
    raw = json.loads(RAW.read_text(encoding="utf-8"))
    curated = load_curated()
    audio = json.loads(AUDIO_INDEX.read_text(encoding="utf-8")) if AUDIO_INDEX.is_file() else {}

    def levels_of(entry: dict) -> dict[str, int]:
        out: dict[str, int] = {}
        for std, prefix in STANDARDS.items():
            ls = [int(t.split("-")[1]) for t in entry["level"] if t.startswith(prefix + "-")]
            if ls:
                out[std] = min(ls)
        return out

    manifest: dict = {"version": "", "standards": {}}
    chars: set[str] = set()
    digest = hashlib.sha256()
    report: list[str] = []

    for std in STANDARDS:
        levels_info = []
        for level in range(1, MAX_LEVEL + 1):
            entries = [e for e in raw if levels_of(e).get(std) == level]
            # Most frequent words first: frequency-ordered introduction is the default sequence.
            entries.sort(key=lambda e: (e.get("frequency") or 10**9, e["simplified"]))
            words = [build_word(e, levels_of(e), curated.get(e["simplified"]), audio) for e in entries]
            ids = [w["id"] for w in words]
            assert len(ids) == len(set(ids)), f"duplicate ids in {std} {level}"
            for w in words:
                chars.update(c for c in w["s"] if "一" <= c <= "鿿" or "㐀" <= c <= "䶿")
            rel = f"{std}/words-{level}.json"
            size = write_json(OUT / rel, {"std": std, "level": level, "words": words})
            digest.update(json.dumps(words, ensure_ascii=False, sort_keys=True).encode())
            with_fa = sum(1 for w in words if w["fa"])
            with_audio = sum(1 for w in words if "a" in w)
            levels_info.append({"level": level, "count": len(words), "file": rel, "audio": with_audio})
            report.append(
                f"{std} L{level}: {len(words):5d} words  fa {with_fa:5d}  audio {with_audio:5d}  {size/1024:7.0f} KB"
            )
            for kind in ("dialogues", "grammar"):
                src = CONTENT / kind / f"{std}-{level}.json"
                if src.is_file():
                    items = json.loads(src.read_text(encoding="utf-8"))
                    write_json(OUT / std / f"{kind}-{level}.json", items)
                    digest.update(src.read_bytes())
                    report.append(f"{std} L{level}: {len(items)} {kind}")
        manifest["standards"][std] = {"levels": levels_info}

    stroke_bytes, missing = build_strokes(chars)
    report.append(f"strokes: {len(chars) - len(missing)} characters, {stroke_bytes/1024/1024:.1f} MB"
                  + (f", missing: {''.join(missing)}" if missing else ""))

    credits_src = ROOT / "tools" / "credits.json"
    if credits_src.is_file():
        write_json(OUT / "credits.json", json.loads(credits_src.read_text(encoding="utf-8")))

    manifest["version"] = digest.hexdigest()[:12]
    write_json(OUT / "manifest.json", manifest)
    print("\n".join(report))
    print(f"data version {manifest['version']} -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
