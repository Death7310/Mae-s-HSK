#!/usr/bin/env python3
"""Report authoring progress per batch, and print the pending work as JSON.

Run:  python3 tools/content_status.py                      human-readable summary
      python3 tools/content_status.py --pending hsk3-L1    JSON list of batches of that
                                                           group still needing gen/ver
"""
from __future__ import annotations

import json
import sys

from check_content import BATCHES, STAGING, check_batch


def state(bid: str) -> dict:
    out = {"id": bid, "gen": True, "ver": True}
    for stage in ("gen", "ver"):
        if (STAGING / f"{bid}.{stage}.json").is_file() and not check_batch(bid, stage)[0]:
            out[stage] = False  # done
    if not out["ver"]:
        out["gen"] = False
    return out


def main() -> None:
    index = json.loads((BATCHES / "index.json").read_text(encoding="utf-8"))
    if "--pending" in sys.argv:
        prefixes = [a for a in sys.argv[1:] if not a.startswith("--")]
        todo = [s for b in index if (not prefixes or any(b["id"].startswith(p) for p in prefixes))
                and ((s := state(b["id"]))["gen"] or s["ver"])]
        print(json.dumps(todo))
        return
    groups: dict[str, list[int]] = {}
    for b in index:
        s = state(b["id"])
        g = groups.setdefault(f"{b['std']} L{b['level']}", [0, 0, 0, 0])
        g[0] += 1
        g[1] += not s["gen"]
        g[2] += not s["ver"]
        g[3] += b["count"]
    for name, (n, gen, ver, words) in groups.items():
        print(f"{name}: {words:5d} words  {n:2d} batches  authored {gen:2d}  reviewed {ver:2d}")


if __name__ == "__main__":
    main()
