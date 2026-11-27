#!/usr/bin/env python3
"""Context guard for Claude Code sessions.

Every model call re-sends the whole conversation, so a long conversation makes
each further call, and above all each cache miss, more expensive. This script
measures that from the session transcript and does three things:

  (no arguments)            hook: reads the hook JSON on stdin and prints a
                            warning when the conversation is long
  --report [TRANSCRIPT]     usage summary of a session and its agents
  --log TASK [TRANSCRIPT]   write this session's row in the ledger in README.md
                            (add --note "what was learned")

The method, the thresholds and the ledger are in the README.md next to this
file. The script has no dependencies and never fails a prompt: on any error
the hook prints nothing and exits 0.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
LEDGER_FILE = HERE / "README.md"
LEDGER_START, LEDGER_END = "<!-- ledger:start -->", "<!-- ledger:end -->"
LEDGER_HEADER = (
    "| Session | Date | Task | Main calls | Fresh start | Peak context | Main: new in / re-read / out "
    "| Agents | Agents: new in / re-read / out | Lesson |\n"
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"
)
LEDGER_MAX_ROWS = 30  # older rows stay in git history


def _env_int(name: str, default: int | None) -> int | None:
    try:
        value = int(os.environ[name])
    except (KeyError, ValueError):
        return default
    return value if value > 0 else default


# Tokens of conversation history, above what a fresh session starts with, that
# are re-sent on every model call. Override with environment variables.
WARN = _env_int("CONTEXT_GUARD_WARN", 100_000)
CRITICAL = _env_int("CONTEXT_GUARD_CRITICAL", 250_000)

# Price of each token class relative to one uncached input token of the same
# model (see "What costs tokens" in the README for the sources). The cache-read
# price depends on the model tier, so costs are reported as a range.
W_WRITE_5M, W_WRITE_1H, W_OUT = 1.25, 2.0, 5.0
W_READ_LOW, W_READ_HIGH = 0.025, 0.1

# Claude Code's own system prompt and tools are well above this, so a smaller
# call (a title, a summary) is not a turn of the conversation.
MIN_CONTEXT = 8_000


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
        if not path.is_file():  # not a pipe or a device, which would never end
            return []
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
    write_weight: float

    @property
    def history(self) -> int:
        return max(0, self.now - self.baseline)

    @property
    def miss_as_output(self) -> float:
        """A cache miss now, expressed as tokens of written output."""
        return self.now * self.write_weight / W_OUT


def measure(calls: list[Call]) -> Measure | None:
    real = [c for c in calls if c.context >= MIN_CONTEXT]
    if not real:
        return None
    baseline = min(c.context for c in real)
    last = real[-1]
    hour = any(c.write_1h for c in real[-20:])
    return Measure(
        calls=len(real),
        baseline=baseline,
        now=last.context + last.out,
        peak=max(c.context for c in real),
        reread=sum(c.context - baseline for c in real),
        last_ts=last.ts,
        cache_minutes=_env_int("CONTEXT_GUARD_CACHE_TTL_MIN", None) or (60 if hour else 5),
        write_weight=W_WRITE_1H if hour else W_WRITE_5M,
    )


def short(n: float) -> str:
    n = float(n)
    if n >= 999_500:
        return f"{n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n / 1_000:.0f}k"
    return f"{n:.0f}"


# --- hook -------------------------------------------------------------------


def idle_minutes(m: Measure, now: datetime | None = None) -> float:
    if m.last_ts is None:
        return 0.0
    return ((now or datetime.now(timezone.utc)) - m.last_ts).total_seconds() / 60


def warning(m: Measure, now: datetime | None = None) -> tuple[str, str] | None:
    """(level, one-line warning) when the conversation is long, else None."""
    cost = f"about as much as writing {short(m.miss_as_output)} tokens of output"
    if m.history >= CRITICAL:
        level = "CRITICAL"
        line = (
            f"⚠ Very long conversation: {short(m.history)} tokens more than a fresh one. Ask me to save a "
            f"checkpoint now and continue in a new session. One idle break of {m.cache_minutes} minutes here "
            f"costs {cost}."
        )
    elif m.history >= WARN:
        level = "WARN"
        line = (
            f"⚠ Long conversation: {short(m.history)} tokens more than a fresh one. Fine to finish this task "
            f"here, but do not leave it idle for more than {m.cache_minutes} minutes and do not change the model "
            f"or effort setting: either makes the next message re-process everything, {cost}. Start your next "
            "task in a new session."
        )
    else:
        return None
    idle = idle_minutes(m, now)
    if idle > m.cache_minutes:
        line += f" (It sat idle for {idle:.0f} minutes, so this message has already paid that.)"
    return level, line


def hold(m: Measure, payload: dict) -> str | None:
    """Reason to hold a prompt once before a cold, long conversation is re-processed (opt-in)."""
    if os.environ.get("CONTEXT_GUARD_HOLD_COLD") != "1" or m.history < WARN or m.last_ts is None:
        return None
    idle = idle_minutes(m)
    if idle <= m.cache_minutes:
        return None
    session = re.sub(r"[^A-Za-z0-9_-]", "", str(payload.get("session_id") or "session"))[:64]
    marker = Path(tempfile.gettempdir()) / f"context-guard-{session}-{int(m.last_ts.timestamp())}"
    if marker.exists():
        return None
    marker.touch()
    return (
        f"⚠ Not sent yet. This conversation sat idle for {idle:.0f} minutes, so continuing here re-processes all "
        f"of it, about as much as writing {short(m.miss_as_output)} tokens of output. Cheaper: start a new session "
        "and ask it to continue from the last commit. To continue here anyway, send your message again."
    )


def hook() -> None:
    raw = sys.stdin.read()
    payload = json.loads(raw) if raw.strip() else {}
    if not isinstance(payload, dict) or not isinstance(payload.get("transcript_path"), str):
        return
    m = measure(read_calls(Path(payload["transcript_path"])))
    if not m:
        return
    event = payload.get("hook_event_name")
    event = event if isinstance(event, str) and event else "UserPromptSubmit"
    if event == "UserPromptSubmit":
        reason = hold(m, payload)
        if reason:
            json.dump({"decision": "block", "reason": reason}, sys.stdout, ensure_ascii=False)
            return
    else:  # after a tool call: its result is not in the transcript's usage yet, so estimate it
        m.now += len(json.dumps(payload.get("tool_response", ""), ensure_ascii=False)) // 4
    found = warning(m)
    if not found:
        return
    _, line = found
    out: dict = {
        "hookSpecificOutput": {
            "hookEventName": event,
            "additionalContext": (
                f"[context-guard] {line}\n"
                "Start your next reply to the user with that ⚠ line, unchanged. Keep the rest of this turn "
                "lean (small tool outputs, bulk reading in agents). When the current task is done: commit, "
                "give the next step in two lines, and tell the user to start the next task in a new session. "
                "Method: tools/economy/README.md"
            ),
        }
    }
    if event == "UserPromptSubmit":
        out["systemMessage"] = line
    json.dump(out, sys.stdout, ensure_ascii=False)


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


def _cell(text: str) -> str:
    text = text.replace("|", "/").replace("<!--", "").replace("-->", "")
    return " ".join(text.split())


def ledger_row(transcript: Path, task: str, note: str) -> str:
    main = read_calls(transcript)
    m = measure(main)
    if not m:
        raise SystemExit("no model calls in " + str(transcript))
    agents = agent_calls(transcript)
    flat = [c for calls in agents.values() for c in calls]
    day = (m.last_ts or datetime.now(timezone.utc)).strftime("%Y-%m-%d")
    return (
        f"| {_cell(transcript.stem)[:8]} | {day} | {_cell(task)} | {m.calls} | {short(m.baseline)} | {short(m.peak)} | "
        f"{triple(main)} | {len(agents)} | {triple(flat) if flat else '–'} | {_cell(note)} |"
    )


def log(transcript: Path, task: str, note: str) -> None:
    """Write the session's row; logging the same session again replaces its row."""
    row = ledger_row(transcript, task, note)
    text = LEDGER_FILE.read_text(encoding="utf-8")
    if LEDGER_START not in text or LEDGER_END not in text:
        raise SystemExit(f"{LEDGER_FILE} has no {LEDGER_START} … {LEDGER_END} block")
    head, rest = text.split(LEDGER_START, 1)
    body, tail = rest.rsplit(LEDGER_END, 1)
    session = row.split("|")[1]
    rows = []
    for line in body.splitlines():
        line = line.strip()
        if not line.startswith("|") or line.startswith("| Session |") or re.fullmatch(r"\|[\s\-:|]+", line):
            continue
        if line.split("|")[1] != session:
            rows.append(line)
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
    parser.add_argument("--log", metavar="TASK", help="write this session's row in the ledger in README.md")
    parser.add_argument("--note", default="", help="lesson to record with --log")
    parser.add_argument("transcript", nargs="?", type=Path, help="session transcript (default: this session)")
    args = parser.parse_args()
    if args.log is not None and not args.log.strip():
        parser.error("--log needs a task description")
    transcript = args.transcript or find_transcript()
    if not transcript or not transcript.is_file():
        raise SystemExit("no transcript found; pass its path")
    if args.log is not None:
        log(transcript, args.log, args.note)
    else:
        report(transcript)


if __name__ == "__main__":
    main()
