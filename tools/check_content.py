#!/usr/bin/env python3
"""Automatic checks on authored Persian content.

For every batch with a staging file, verifies structure and flags likely
problems for the human/model reviewer:
  * wrong shape, missing or reordered ids                     (hard errors)
  * Persian orthography: Arabic yeh/kaf, Latin letters, detached mi-/-ha
  * example sentence does not contain the headword
  * example pinyin disagrees with the characters (pypinyin cross-check)
  * levels 1-4: example uses characters outside the level's word list

Writes data/content/staging/<batch>.flags.json and prints a summary.

Run:  python3 tools/check_content.py [batch-id ...] [--stage gen|ver]
"""
from __future__ import annotations

import json
import re
import sys

from hsklib import ROOT, pinyin_key

BATCHES = ROOT / "data" / "content" / "batches"
STAGING = ROOT / "data" / "content" / "staging"

HAN = re.compile(r"[㐀-䶿一-鿿]")
ARABIC_ONLY = re.compile(r"[يكى]")  # ي ك ى
LATIN = re.compile(r"[A-Za-z]{2,}")
# "می" / "نمی" written with a space instead of a zero-width non-joiner, and detached plural "ها".
DETACHED = re.compile(r"(^|\s)(ن?می)\s+[؀-ۿ]|[؀-ۿ]\s+ها(ی)?(\s|$|[،.؟!])")
# Names and words that may appear in examples at any level.
ALWAYS_OK = set("小王李张刘陈老师明红丽华美东西南北京上海中国汉语英")

try:
    from pypinyin import Style, lazy_pinyin
except ImportError:  # the pinyin cross-check is optional
    lazy_pinyin = None


def pinyin_flags(zh: str, py: str) -> list[str]:
    if lazy_pinyin is None:
        return []
    chars = HAN.findall(zh)
    expect = lazy_pinyin("".join(chars), style=Style.TONE3, neutral_tone_with_five=True, v_to_u=False)
    key = pinyin_key(py)
    letters = re.sub(r"\d", "", key)
    want_letters = "".join(re.sub(r"\d", "", s).replace("ü", "v") for s in expect)
    if letters != want_letters:
        # Erhua (花儿 huār) legitimately drops a vowel; tolerate when only "er" vs "r" differs.
        if letters.replace("er", "r") != want_letters.replace("er", "r"):
            return [f"pinyin letters differ: expected ~{want_letters}, got {letters}"]
        return []
    out = []
    pos = 0
    for ch, syl in zip(chars, expect):
        base = re.sub(r"\d", "", syl).replace("ü", "v")
        want_tone = syl[-1] if syl[-1].isdigit() else "5"
        got_tone = "5"
        n = 0
        while pos < len(key) and (n < len(base) or key[pos].isdigit()):
            if key[pos].isdigit():
                got_tone = key[pos]
            else:
                n += 1
            pos += 1
        if got_tone != want_tone and ch not in "不一" and got_tone != "5" and want_tone != "5":
            out.append(f"tone of {ch}: expected {want_tone}, got {got_tone}")
    return out


def level_flags(zh: str, allowed: set[str], allowed_chars: set[str]) -> list[str]:
    text = "".join(HAN.findall(zh))
    longest = max((len(w) for w in allowed), default=1)
    unknown = []
    i = 0
    while i < len(text):
        for n in range(min(longest, len(text) - i), 0, -1):
            if text[i : i + n] in allowed:
                i += n
                break
        else:
            if text[i] not in allowed_chars and text[i] not in ALWAYS_OK:
                unknown.append(text[i])
            i += 1
    return [f"above level: {''.join(dict.fromkeys(unknown))}"] if unknown else []


def contains_in_order(zh: str, word: str) -> bool:
    """True if the headword's characters occur in order (covers separable verbs: 见面 in 见过面)."""
    i = 0
    for ch in zh:
        if i < len(word) and ch == word[i]:
            i += 1
    return i == len(word)


def check_batch(bid: str, stage: str) -> tuple[list[str], list[dict]]:
    """Returns (hard errors, flags)."""
    batch = json.loads((BATCHES / f"{bid}.json").read_text(encoding="utf-8"))
    path = STAGING / f"{bid}.{stage}.json"
    try:
        rows = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        return [f"{path.name}: {e}"], []
    words = batch["words"]
    errors: list[str] = []
    flags: list[dict] = []
    if not isinstance(rows, list) or [r.get("id") for r in rows if isinstance(r, dict)] != [w["id"] for w in words]:
        got = [r.get("id") for r in rows] if isinstance(rows, list) else []
        want = [w["id"] for w in words]
        missing = [x for x in want if x not in got]
        extra = [x for x in got if x not in want]
        return [f"{path.name}: ids differ from batch (missing {missing[:8]}, unexpected {extra[:8]}, "
                f"{len(got)} rows vs {len(want)})"], []
    allowed = set(batch.get("allowed") or [])
    allowed_chars = {c for w in allowed for c in w}
    particle_pos = {"u", "q", "p", "c", "mq"}

    def flag(wid: str, msg: str) -> None:
        flags.append({"id": wid, "issue": msg})

    for w, r in zip(words, rows):
        wid = w["id"]
        fa, en, ex = r.get("fa"), r.get("en"), r.get("ex")
        if not (isinstance(fa, list) and 1 <= len(fa) <= 4 and all(isinstance(x, str) and x.strip() for x in fa)):
            errors.append(f"{wid}: fa must be 1-4 non-empty strings")
            continue
        if not (isinstance(en, list) and 1 <= len(en) <= 4 and all(isinstance(x, str) and x.strip() for x in en)):
            errors.append(f"{wid}: en must be 1-4 non-empty strings")
            continue
        if not (isinstance(ex, list) and 1 <= len(ex) <= 3):
            errors.append(f"{wid}: ex must hold 1-3 examples")
            continue
        if not w["pos"] and not r.get("pos"):
            flag(wid, "no part of speech given (input had none)")
        persian = fa + [x.get("fa", "") for x in ex] + [r.get("note", "")]
        if any(ARABIC_ONLY.search(t) for t in persian):
            flag(wid, "Arabic yeh/kaf in Persian text")
        if any(LATIN.search(t) for t in fa):
            flag(wid, "Latin letters in Persian gloss")
        if any(DETACHED.search(t) for t in persian):
            flag(wid, "possible missing half-space (می‌ / ‌ها)")
        if any(not re.search(r"[؀-ۿ]", t) for t in fa):
            flag(wid, "Persian gloss without Persian letters")
        if set(w["pos"]) & particle_pos and len(ex) < 2:
            flag(wid, "function word with a single example (guide asks for two)")
        for i, x in enumerate(ex):
            if not all(isinstance(x.get(k), str) and x.get(k).strip() for k in ("zh", "py", "fa", "en")):
                errors.append(f"{wid}: example {i + 1} needs zh, py, fa, en")
                continue
            if not contains_in_order(x["zh"], w["s"]):
                flag(wid, f"example {i + 1} does not contain the headword")
            for msg in pinyin_flags(x["zh"], x["py"]):
                flag(wid, f"example {i + 1}: {msg}")
            if allowed:
                for msg in level_flags(x["zh"], allowed | {w["s"]}, allowed_chars):
                    flag(wid, f"example {i + 1}: {msg}")
    return errors, flags


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    stage = "gen"
    if "--stage" in sys.argv:
        stage = sys.argv[sys.argv.index("--stage") + 1]
        args = [a for a in args if a != stage]
    ids = args or sorted(p.name.split(".")[0] for p in STAGING.glob(f"*.{stage}.json"))
    bad = 0
    for bid in ids:
        errors, flags = check_batch(bid, stage)
        if stage == "gen":
            (STAGING / f"{bid}.flags.json").write_text(json.dumps(flags, ensure_ascii=False, indent=1), encoding="utf-8")
        status = "ERROR" if errors else "ok"
        print(f"{bid}.{stage}: {status}  {len(flags)} flags")
        for e in errors[:10]:
            print("   !!", e)
        bad += bool(errors)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
