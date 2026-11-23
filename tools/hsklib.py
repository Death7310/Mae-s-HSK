"""Unified HSK word list shared by the build tools.

Sources (see tools/fetch_sources.py):
  * data/raw/ofou-hsk/vocabulary.csv   2025 HSK 3.0 exam syllabus: entry number, level band(s),
                                       word, official pinyin, official part of speech
  * data/raw/hskhsk/hsk2012-L<n>.txt   HSK 2.0 lists, 2012 revision
  * data/raw/complete-hsk-vocabulary   CC-CEDICT readings/definitions, classifiers, frequency rank

Standards exposed to the app:
  hsk3 = the 2025 syllabus (levels 1-6; the shared 7-9 band is not built yet)
  hsk2 = HSK 2.0, 2012 revision (levels 1-6)

Word ids are stable and human-readable: the simplified word itself, or
"<word>~<n>" for the n-th homograph (n >= 2) in syllabus order, e.g.
好 (hǎo, level 1) and 好~2 (hào, level 5).
"""
from __future__ import annotations

import csv
import json
import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
MAX_LEVEL = 6

ZH_NUM = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7}

# Official part-of-speech abbreviations -> short tags used in the app (see i18n pos.*).
POS_MAP = {
    "名": "n", "动": "v", "形": "a", "副": "d", "代": "r", "数": "m", "量": "q", "数量": "mq",
    "介": "p", "连": "c", "助": "u", "叹": "e", "拟声": "o", "前缀": "h", "后缀": "k",
}

TONES = {
    "ā": "a1", "á": "a2", "ǎ": "a3", "à": "a4", "ē": "e1", "é": "e2", "ě": "e3", "è": "e4",
    "ī": "i1", "í": "i2", "ǐ": "i3", "ì": "i4", "ō": "o1", "ó": "o2", "ǒ": "o3", "ò": "o4",
    "ū": "u1", "ú": "u2", "ǔ": "u3", "ù": "u4", "ǖ": "v1", "ǘ": "v2", "ǚ": "v3", "ǜ": "v4",
    "ü": "v", "ń": "n2", "ň": "n3", "ǹ": "n4", "ḿ": "m2",
}

# HSK 2.0 lists a few homographs twice without telling the readings apart. For these words the
# n-th HSK 2.0 row belongs to the homograph with this index in syllabus order.
HSK2_PAIRING = {"得": [0, 2]}  # level 2: de (particle), level 4: děi (must)

BAD_SENSE = re.compile(
    r"^(surname |variant of |old variant of |archaic variant of |japanese variant of |"
    r"erhua variant of |used in |see |\(archaic\)|\(literary\)|abbr\. for |unofficial variant of )",
    re.I,
)


def nfc(s: str) -> str:
    return unicodedata.normalize("NFC", s)


def pinyin_key(p: str, tones: bool = True) -> str:
    """Comparable form of a pinyin string: lowercase letters with inline tone digits.

    'Bàba' -> 'ba4ba', 'bú kèqi' -> 'bu2ke4qi', 'ba4ba5' -> 'ba4ba'.
    """
    out = []
    for ch in nfc(p).lower().replace("u:", "ü"):
        if ch in TONES:
            out.append(TONES[ch] if tones else TONES[ch][0])
        elif "a" <= ch <= "z":
            out.append(ch)
        elif ch.isdigit() and tones and ch != "5":
            out.append(ch)
    return "".join(out)


def parse_band(band: str) -> tuple[int, list[int]]:
    """'一级（二级）（四级）' -> (1, [2, 4]);  '七-九级' -> (7, [])."""
    levels = [ZH_NUM[m] for m in re.findall(r"([一二三四五六七])(?:-九)?级", band)]
    return levels[0], levels[1:]


def parse_pos(pos: str) -> tuple[list[str], list[str], str]:
    """'形、介、（动、量）' -> (['a', 'p'], ['v', 'q'], raw). Parenthesised tags belong to a later band."""
    main: list[str] = []
    later: list[str] = []
    depth = 0
    for tok in re.split(r"[、，,]", pos):
        tok = tok.strip()
        if not tok:
            continue
        opens = tok.count("（")
        closes = tok.count("）")
        name = tok.strip("（）")
        tag = POS_MAP.get(name)
        if tag:
            (later if depth > 0 or opens else main).append(tag)
        depth += opens - closes
    return main, later, pos


@dataclass
class Entry:
    id: str = ""
    s: str = ""
    p: str = ""
    pos: list[str] = field(default_factory=list)
    pos_later: list[str] = field(default_factory=list)
    hsk3: int | None = None
    hsk3_later: list[int] = field(default_factory=list)
    no3: int | None = None  # entry number in the 2025 syllabus
    hom: int | None = None  # official homograph index (本1 / 本2)
    hsk2: int | None = None
    en2: str | None = None  # HSK 2.0 list definition (hskhsk.com)
    trad: str | None = None
    cl: list[str] = field(default_factory=list)
    freq: int | None = None
    cedict: list[dict] = field(default_factory=list)  # every CC-CEDICT reading: {p, t, en, cl}
    en_ref: list[str] = field(default_factory=list)  # glosses of the reading matching `p`


def _cedict_index() -> dict[str, dict]:
    path = RAW / "complete-hsk-vocabulary" / "complete.json"
    return {e["simplified"]: e for e in json.loads(path.read_text(encoding="utf-8"))}


def _form_score(form: dict) -> float:
    meanings = form.get("meanings") or []
    if not meanings:
        return -100.0
    bad = sum(1 for m in meanings if BAD_SENSE.match(m))
    score = float(len(meanings) - 2 * bad)
    if bad == len(meanings):
        score -= 50
    if form["transcriptions"]["pinyin"][:1].isupper():
        score -= 5
    return score


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


def _attach_cedict(e: Entry, ced: dict | None) -> None:
    if not ced:
        return
    e.freq = ced.get("frequency")
    forms = ced["forms"]
    e.cedict = [
        {
            "p": nfc(f["transcriptions"]["pinyin"]),
            "t": f.get("traditional"),
            "en": (f.get("meanings") or [])[:8],
            "cl": f.get("classifiers") or [],
        }
        for f in forms
    ]
    want = pinyin_key(e.p)
    want_flat = pinyin_key(e.p, tones=False)
    exact = [f for f in forms if pinyin_key(f["transcriptions"]["pinyin"]) == want]
    # Official pinyin applies tone sandhi to 不/一 and writes neutral tones, so fall back to letters only.
    loose = [f for f in forms if pinyin_key(f["transcriptions"]["pinyin"], tones=False) == want_flat]
    pool = exact or loose or forms
    best = max(pool, key=_form_score)
    e.en_ref = clean_en(best.get("meanings") or [])
    trad = best.get("traditional")
    if trad and trad != e.s:
        e.trad = trad
    e.cl = list(dict.fromkeys(best.get("classifiers") or []))
    if not e.pos:
        e.pos = [p for p in ced.get("pos", []) if p in set(POS_MAP.values())][:2]


def load_entries() -> list[Entry]:
    """Every word of hsk3 levels 1-6 and hsk2 levels 1-6, one Entry per syllabus entry."""
    ced = _cedict_index()

    # --- HSK 3.0 (2025 syllabus) ---
    entries: list[Entry] = []
    by_word: dict[str, list[Entry]] = {}
    later_band: dict[str, list[Entry]] = {}  # 7-9 band entries, used to enrich hsk2-only words
    with open(RAW / "ofou-hsk" / "vocabulary.csv", encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            first, later = parse_band(row["级别"])
            m = re.fullmatch(r"(.*?)(\d)?", row["词语"].strip())
            assert m
            main, later_pos, _ = parse_pos(row["词性"])
            e = Entry(
                s=m.group(1),
                p=nfc(row["拼音"].strip()),
                pos=main,
                pos_later=later_pos,
                hsk3=first,
                hsk3_later=[x for x in later if x <= MAX_LEVEL],
                no3=int(row["No."]),
                hom=int(m.group(2)) if m.group(2) else None,
            )
            if first > MAX_LEVEL:
                later_band.setdefault(e.s, []).append(e)
                continue
            entries.append(e)
            by_word.setdefault(e.s, []).append(e)

    # --- HSK 2.0 (2012 revision) ---
    h2: dict[str, list[tuple[int, str, str]]] = {}
    for n in range(1, MAX_LEVEL + 1):
        for line in (RAW / "hskhsk" / f"hsk2012-L{n}.txt").read_text(encoding="utf-8-sig").splitlines():
            f = line.split("\t")
            if len(f) >= 5 and (n, f[3], f[4]) not in h2.get(f[0], []):
                h2.setdefault(f[0], []).append((n, nfc(f[3]), f[4]))

    for word, rows in h2.items():
        rows = sorted(rows)
        targets = by_word.get(word)
        if targets:
            if len(rows) >= len(targets):
                # One HSK 2.0 row per homograph (长 L2 cháng / L3 zhǎng): pair them in order.
                for t, (lvl, _p, en) in zip(targets, rows):
                    t.hsk2, t.en2 = lvl, en
            elif word in HSK2_PAIRING:
                for idx, (lvl, _p, en) in zip(HSK2_PAIRING[word], rows):
                    targets[idx].hsk2, targets[idx].en2 = lvl, en
            else:
                lvl, p, en = rows[0]
                first_reading = pinyin_key(p.split(",")[0])
                match = next((t for t in targets if pinyin_key(t.p) == first_reading), None)
                match = match or next(
                    (t for t in targets if pinyin_key(t.p, False) == pinyin_key(p.split(",")[0], False)), targets[0]
                )
                match.hsk2, match.en2 = lvl, en
            continue
        # Not in hsk3 levels 1-6: an HSK 2.0-only entry (it may still be in the 7-9 band).
        lvl, p, en = rows[0]
        e = Entry(s=word, p=p.split(",")[0].strip(), hsk2=lvl, en2=en)
        band = later_band.get(word)
        if band:
            same = next((b for b in band if pinyin_key(b.p, False) == pinyin_key(e.p, False)), band[0])
            e.p, e.pos, e.no3 = same.p, same.pos, same.no3
            e.hsk3 = 7
        entries.append(e)
        by_word.setdefault(word, []).append(e)

    # --- ids, CC-CEDICT enrichment ---
    for word, group in by_word.items():
        for i, e in enumerate(group):
            e.id = word if i == 0 else f"{word}~{i + 1}"
            _attach_cedict(e, ced.get(word))
    ids = [e.id for e in entries]
    assert len(ids) == len(set(ids)), "duplicate ids"
    return entries


def std_level(e: Entry, std: str) -> int | None:
    lvl = e.hsk3 if std == "hsk3" else e.hsk2
    return lvl if lvl is not None and lvl <= MAX_LEVEL else None


GRAMMATICAL = {"u", "h", "k", "e", "o"}  # particles, affixes, interjections, onomatopoeia


def freq_order(e: Entry) -> tuple:
    """Order in which a level introduces its words: most frequent first.

    Purely grammatical words (的, 了, 吗 ...) are the most frequent of all but mean
    little without sentences around them, so they are held back until the learner
    has a few dozen content words. Words without a frequency rank keep syllabus
    order at the end.
    """
    rank = e.freq or 10**9
    if e.pos and set(e.pos) <= GRAMMATICAL and rank < 10**9:
        rank += 250
    return (rank, e.no3 or 10**9, e.s)


if __name__ == "__main__":
    es = load_entries()
    from collections import Counter

    print("entries", len(es))
    for std in ("hsk3", "hsk2"):
        print(std, sorted(Counter(std_level(e, std) for e in es if std_level(e, std)).items()))
    print("hsk2-only", sum(1 for e in es if std_level(e, "hsk3") is None))
    print("no pos", sum(1 for e in es if not e.pos), "no cedict", sum(1 for e in es if not e.cedict),
          "no freq", sum(1 for e in es if not e.freq))
    for w in ("好", "好~2", "长", "长~2", "本", "本~2", "不客气", "半", "得", "得~2", "得~3", "喂", "花", "花~2"):
        e = next((x for x in es if x.id == w), None)
        if e:
            print(e.id, e.p, e.pos, e.pos_later, "h3", e.hsk3, e.hsk3_later, "h2", e.hsk2, e.en_ref[:2], e.trad)
