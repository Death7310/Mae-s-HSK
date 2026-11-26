#!/usr/bin/env python3
"""Context guard for Claude Code sessions.

Every model call re-sends the whole conversation, so a long conversation makes
each further call more expensive. This script measures that from the session
transcript and does three things:

  (no arguments)            UserPromptSubmit hook: reads the hook JSON on stdin
                            and prints a warning when the conversation is long
  --report [TRANSCRIPT]     usage summary of a session and its subagents
  --log TASK [TRANSCRIPT]   append one measured row to the ledger in README.md
                            (add --note "what was learned")

The method, the thresholds and the ledger are in the README.md next to this
file. The script has no dependencies and never blocks a prompt: on any error
the hook prints nothing and exits 0.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
LEDGER_FILE = HERE / "README.md"
LEDGER_START, LEDGER_END = "<!-- ledger:start -->", "<!-- ledger:end -->"
LEDGER_HEADER = (
    "| Date | Task | Main calls | Fresh start | Peak context | Main: new in / re-read / out | Agents | Agents: new in / re-read / out | Lesson |\n"
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |"
)
LEDGER_MAX_ROWS = 30  # older rows stay in git history

# Tokens of conversation history, above what a fresh session starts with, that
# are re-sent on every model call. Override with environment variables.
WARN = int(os.environ.get("CONTEXT_GUARD_WARN", 100_000))
CRITICAL = int(os.environ.get("CONTEXT_GUARD_CRITICAL", 250_000))

# Price of each token class relative to one uncached input token of the same
# model (see "What costs tokens" in the README for the sources). The cache-read
# price depends on the model tier, so costs are reported as a range.
W_WRITE_5M, W_WRITE_1H, W_OUT = 1.25, 2.0, 5.0
W_READ_LOW, W_READ_HIGH = 0.025, 0.1

MIN_CONTEXT = 2_000  # smaller "calls" are not real conversation turns


@dataclass
class Call:
    ts: datetime | None
    model: str
    fresh: int  # uncached input tokens
    write_5m: int  # written to the 5-minute cache
    write_1h: int  # written to the 1-hour cache
    read: int  # read from the cache
    out: int

    @property
    def context(self) -> int:
        """Tokens the model was sent on this call."""
        return self.fresh + self.write_5m + self.write_1h + self.read

    @property
    def new_input(self) -> int:
        """Input tokens that were not served from the cache."""
        return self.fresh + self.write_5m + self.write_1h

    def cost(self, read_weight: float) -> float:
        """Input-token equivalents, at this model's own input price."""
        return (
            self.fresh
            + W_WRITE_5M * self.write_5m
            + W_WRITE_1H * self.write_1h
            + read_weight * self.read
            + W_OUT * self.out
        )


def _int(value) -> int:
    return value if isinstance(value, int) and value > 0 else 0


def _timestamp(value) -> datetime | None:
    try:
        ts = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)


def read_calls(path: Path, sidechain: bool | None = False) -> list[Call]:
    """Model calls recorded in a transcript, in order.

    A response is written as several lines (one per content block) that repeat
    the same usage, so lines are merged by message id. `sidechain` selects the
    main conversation (False), subagent entries (True) or both (None).
    """
    calls: dict[str, Call] = {}
    try:
        handle = open(path, encoding="utf-8", errors="replace")
    except OSError:
        return []
    with handle:
        for number, line in enumerate(handle):
            if '"usage"' not in line or '"assistant"' not in line:
                continue
            try:
                entry = json.loads(line)
            except ValueError:
                continue
            if not isinstance(entry, dict) or entry.get("type") != "assistant":
                continue
            if sidechain is not None and bool(entry.get("isSidechain")) != sidechain:
                continue
            message = entry.get("message")
            if not isinstance(message, dict) or message.get("model") == "<synthetic>":
                continue
            usage = message.get("usage")
            if not isinstance(usage, dict):
                continue
            written = _int(usage.get("cache_creation_input_tokens"))
            split = usage.get("cache_creation")
            write_1h = min(written, _int(split.get("ephemeral_1h_input_tokens"))) if isinstance(split, dict) else 0
            key = str(message.get("id") or entry.get("uuid") or number)
            calls.pop(key, None)  # keep the position of the latest line
            calls[key] = Call(
                ts=_timestamp(entry.get("timestamp")),
                model=str(message.get("model") or "?"),
                fresh=_int(usage.get("input_tokens")),
                write_5m=written - write_1h,
                write_1h=write_1h,
                read=_int(usage.get("cache_read_input_tokens")),
                out=_int(usage.get("output_tokens")),
            )
    return list(calls.values())


@dataclass
class Measure:
    calls: int
    baseline: int  # what a fresh session sends: system prompt, tools, first prompt
    now: int  # what the next call will send, approximately
    peak: int
    reread: int  # history above the baseline, summed over all calls so far
    last_ts: datetime | None
    cache_minutes: int

    @property
    def history(self) -> int:
        return max(0, self.now - self.baseline)


def measure(calls: list[Call]) -> Measure | None:
    real = [c for c in calls if c.context >= MIN_CONTEXT]
    if not real:
        return None
    baseline = min(c.context for c in real)
    last = real[-1]
    ttl = os.environ.get("CONTEXT_GUARD_CACHE_TTL_MIN")
    return Measure(
        calls=len(real),
        baseline=baseline,
        now=last.context + last.out,
        peak=max(c.context for c in real),
        reread=sum(c.context - baseline for c in real),
        last_ts=last.ts,
        cache_minutes=int(ttl) if ttl and ttl.isdigit() else (60 if any(c.write_1h for c in real[-20:]) else 5),
    )


def short(n: float) -> str:
    n = float(n)
    if n >= 999_500:
        return f"{n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n / 1_000:.0f}k"
    return f"{n:.0f}"


# --- hook -------------------------------------------------------------------


def warning(m: Measure, now: datetime | None = None) -> tuple[str, str] | None:
    """(level, one-line warning) when the conversation is long, else None."""
    if m.history >= CRITICAL:
        level, advice = "CRITICAL", "Checkpoint now and continue in a new session."
    elif m.history >= WARN:
        level, advice = "WARN", "Wrap up the current task, then continue in a new session."
    else:
        return None
    line = (
        f"⚠ Context economy [{level}]: this conversation now carries ≈{short(m.history)} tokens of history "
        f"on top of the ≈{short(m.baseline)} a new session starts with. Every model call re-reads all "
        f"≈{short(m.now)}, and a cache miss (a break over {m.cache_minutes} min, a model or effort switch) "
        f"re-bills all of it at the cache-write price. {advice}"
    )
    if m.last_ts is not None:
        idle = ((now or datetime.now(timezone.utc)) - m.last_ts).total_seconds() / 60
        if idle > m.cache_minutes:
            line += f" The cache has in fact expired (idle {idle:.0f} min): this message pays that price."
    return level, line


def hook() -> None:
    raw = sys.stdin.read()
    payload = json.loads(raw) if raw.strip() else {}
    path = payload.get("transcript_path") if isinstance(payload, dict) else None
    if not path:
        return
    m = measure(read_calls(Path(path)))
    found = warning(m) if m else None
    if not found:
        return
    _, line = found
    context = (
        f"[context-guard] {line}\n"
        "Start your reply with that ⚠ line, unchanged. Keep this turn lean (small tool outputs, bulk "
        "reading in subagents). When the current task is done: commit, write the next step in two "
        "lines, and tell the user to continue in a new session. Method: tools/economy/README.md"
    )
    json.dump(
        {
            "systemMessage": line,
            "hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": context},
        },
        sys.stdout,
        ensure_ascii=False,
    )


# --- report and ledger ------------------------------------------------------


def find_transcript() -> Path | None:
    """The current session's transcript, else the most recent one."""
    projects = Path(os.environ.get("CLAUDE_CONFIG_DIR") or Path.home() / ".claude") / "projects"
    session = os.environ.get("CLAUDE_CODE_SESSION_ID")
    if session:
        named = sorted(projects.glob(f"*/{session}.jsonl"))
        if named:
            return named[0]
    files = [p for p in projects.glob("*/*.jsonl") if p.is_file()]
    return max(files, key=lambda p: p.stat().st_mtime) if files else None


def agent_calls(transcript: Path) -> dict[str, list[Call]]:
    """Calls of every subagent of a session, by agent."""
    agents: dict[str, list[Call]] = {}
    for path in sorted(transcript.with_suffix("").glob("subagents/**/*.jsonl")):
        if path.name == "journal.jsonl":
            continue
        calls = read_calls(path, sidechain=None)
        if calls:
            agents[str(path.relative_to(transcript.parent))] = calls
    inline = read_calls(transcript, sidechain=True)  # older layout: subagents inside the main file
    if inline:
        agents["(in main transcript)"] = inline
    return agents


def triple(calls: list[Call]) -> str:
    """new input / re-read from cache / output"""
    return f"{short(sum(c.new_input for c in calls))} / {short(sum(c.read for c in calls))} / {short(sum(c.out for c in calls))}"


def cost_range(calls: list[Call]) -> str:
    low, high = (sum(c.cost(w) for c in calls) for w in (W_READ_LOW, W_READ_HIGH))
    return f"≈{short(low)}–{short(high)} input-equivalents"


def report(transcript: Path) -> None:
    main = read_calls(transcript)
    m = measure(main)
    print(f"session   {transcript.stem}")
    if not m:
        print("main      no model calls recorded yet")
    else:
        print(f"main      {m.calls} model calls · fresh start {short(m.baseline)} · now ≈{short(m.now)} · peak {short(m.peak)}")
        print(f"          new in / re-read / out: {triple(main)} · cost {cost_range(main)}")
        print(f"          history re-read so far (context above the fresh start, summed over calls): {short(m.reread)}")
        found = warning(m)
        print(f"          {found[1] if found else 'below the warning threshold (' + short(WARN) + ' of history)'}")
    agents = agent_calls(transcript)
    if agents:
        flat = [c for calls in agents.values() for c in calls]
        print(f"agents    {len(agents)} agents · {len(flat)} model calls")
        print(f"          new in / re-read / out: {triple(flat)} · cost {cost_range(flat)}")
        for name, calls in agents.items():
            print(
                f"          {Path(name).stem[:24]:<24} {calls[-1].model:<20} {len(calls):>3} calls · "
                f"start {short(min(c.context for c in calls)):>4} · peak {short(max(c.context for c in calls)):>4} · {triple(calls)}"
            )
    print("cost = new input (cache writes at 1.25× for 5 min, 2× for 1 h) + re-read at 0.025×–0.1× + 5× output,")
    print("       counted in input tokens of the model that ran; tiers are not converted into each other.")


def ledger_row(transcript: Path, task: str, note: str) -> str:
    main = read_calls(transcript)
    m = measure(main)
    if not m:
        raise SystemExit("no model calls in " + str(transcript))
    agents = agent_calls(transcript)
    flat = [c for calls in agents.values() for c in calls]
    day = (m.last_ts or datetime.now(timezone.utc)).strftime("%Y-%m-%d")
    cell = lambda s: " ".join(s.replace("|", "/").split())  # noqa: E731
    return (
        f"| {day} | {cell(task)} | {m.calls} | {short(m.baseline)} | {short(m.peak)} | {triple(main)} | "
        f"{len(agents)} | {triple(flat) if flat else '–'} | {cell(note)} |"
    )


def log(transcript: Path, task: str, note: str) -> None:
    row = ledger_row(transcript, task, note)
    text = LEDGER_FILE.read_text(encoding="utf-8")
    if LEDGER_START not in text or LEDGER_END not in text:
        raise SystemExit(f"{LEDGER_FILE} has no {LEDGER_START} … {LEDGER_END} block")
    head, rest = text.split(LEDGER_START, 1)
    body, tail = rest.split(LEDGER_END, 1)
    rows = [r for r in body.strip().splitlines() if r.startswith("|")][2:]  # drop the header
    rows = (rows + [row])[-LEDGER_MAX_ROWS:]
    block = "\n".join([LEDGER_START, LEDGER_HEADER, *rows, LEDGER_END])
    LEDGER_FILE.write_text(head + block + tail, encoding="utf-8")
    print(row)


def main() -> None:
    if len(sys.argv) == 1:
        try:
            hook()
        except Exception:  # never block a prompt on a guard failure
            pass
        return
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--report", action="store_true", help="print a usage summary")
    parser.add_argument("--log", metavar="TASK", help="append a row to the ledger in README.md")
    parser.add_argument("--note", default="", help="lesson to record with --log")
    parser.add_argument("transcript", nargs="?", type=Path, help="session transcript (default: this session)")
    args = parser.parse_args()
    transcript = args.transcript or find_transcript()
    if not transcript or not transcript.is_file():
        raise SystemExit("no transcript found; pass its path")
    if args.log:
        log(transcript, args.log, args.note)
    else:
        report(transcript)


if __name__ == "__main__":
    main()
