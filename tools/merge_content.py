#!/usr/bin/env python3
"""Promote authored batches from staging into data/content/words/<batch>.jsonl.

A batch is taken from its reviewed file (<batch>.ver.json, quality 1) when that
passes the structural checks, otherwise from the author's file (<batch>.gen.json,
quality 0). Persian text is normalised (Arabic yeh/kaf -> Persian) on the way.

Run:  python3 tools/merge_content.py
"""
from __future__ import annotations

import json
import sys

from check_content import BATCHES, STAGING, check_batch, load_rows
from hsklib import ROOT, nfc

OUT = ROOT / "data" / "content" / "words"
FIX = str.maketrans({"ي": "ی", "ك": "ک"})


def fa_norm(s: str) -> str:
    return nfc(s).translate(FIX).strip()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    index = json.loads((BATCHES / "index.json").read_text(encoding="utf-8"))
    totals = {0: 0, 1: 0}
    pending = []
    for b in index:
        bid = b["id"]
        chosen = None
        for stage, q in (("ver", 1), ("gen", 0)):
            if (STAGING / f"{bid}.{stage}.json").is_file():
                errors, _ = check_batch(bid, stage)
                if errors:
                    print(f"skip {bid}.{stage}: {errors[0]}", file=sys.stderr)
                    continue
                chosen = (stage, q)
                break
        if not chosen:
            pending.append(bid)
            continue
        stage, q = chosen
        rows = load_rows(bid, stage)
        lines = []
        for r in rows:
            out: dict = {"id": r["id"], "fa": [fa_norm(x) for x in r["fa"]], "en": [x.strip() for x in r["en"]]}
            if r.get("pos"):
                out["pos"] = r["pos"]
            if r.get("note"):
                out["note"] = fa_norm(r["note"])
            out["ex"] = [
                {"zh": nfc(x["zh"]).strip(), "py": nfc(x["py"]).strip(), "fa": fa_norm(x["fa"]), "en": x["en"].strip()}
                for x in r["ex"]
            ]
            out["q"] = q
            lines.append(json.dumps(out, ensure_ascii=False))
        (OUT / f"{bid}.jsonl").write_text("\n".join(lines) + "\n", encoding="utf-8")
        totals[q] += len(rows)
    print(f"merged: {totals[1]} reviewed, {totals[0]} unreviewed; {len(pending)} batches pending")
    if pending:
        print("pending:", " ".join(pending[:40]), "..." if len(pending) > 40 else "")


if __name__ == "__main__":
    main()
