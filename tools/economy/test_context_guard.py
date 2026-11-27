"""Tests for context_guard.py:  python3 -m unittest discover -s tools/economy"""
from __future__ import annotations

import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import context_guard as guard  # noqa: E402

SCRIPT = Path(guard.__file__)
T0 = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)


def line(mid, read=0, write_1h=0, write_5m=0, out=0, minute=0, **extra):
    entry = {
        "type": "assistant",
        "timestamp": (T0 + timedelta(minutes=minute)).isoformat().replace("+00:00", "Z"),
        "message": {
            "id": mid,
            "model": "some-model",
            "usage": {
                "input_tokens": 2,
                "cache_read_input_tokens": read,
                "cache_creation_input_tokens": write_1h + write_5m,
                "cache_creation": {"ephemeral_1h_input_tokens": write_1h, "ephemeral_5m_input_tokens": write_5m},
                "output_tokens": out,
            },
        },
    }
    entry.update(extra)
    return json.dumps(entry)


class GuardTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        self.path = Path(self.dir.name) / "session.jsonl"

    def write(self, *lines):
        self.path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        return self.path

    def run_hook(self, stdin, **env):
        done = subprocess.run(
            [sys.executable, str(SCRIPT)], input=stdin, capture_output=True, text=True, timeout=30, env={**os.environ, **env}
        )
        self.assertEqual(done.returncode, 0, done.stderr)
        return done.stdout

    def hook_on(self, *lines):
        return self.run_hook(json.dumps({"transcript_path": str(self.write(*lines))}))

    def test_short_conversation_is_silent(self):
        self.assertEqual(self.hook_on(line("a", write_1h=20_000), line("b", read=20_000, write_1h=30_000)), "")

    def test_warn_output_is_valid_hook_json(self):
        out = json.loads(self.hook_on(line("a", write_1h=20_000), line("b", read=20_000, write_1h=110_000, out=500)))
        self.assertIn("⚠ Long conversation: 110k", out["systemMessage"])
        self.assertEqual(out["hookSpecificOutput"]["hookEventName"], "UserPromptSubmit")
        self.assertIn(out["systemMessage"], out["hookSpecificOutput"]["additionalContext"])

    def test_critical(self):
        out = json.loads(self.hook_on(line("a", write_1h=20_000), line("b", read=20_000, write_1h=260_000)))
        self.assertIn("⚠ Very long conversation", out["systemMessage"])

    def test_repeated_lines_sidechain_and_synthetic_are_not_counted(self):
        synthetic = json.loads(line("s", read=900_000))
        synthetic["message"]["model"] = "<synthetic>"
        calls = guard.read_calls(
            self.write(
                line("a", write_1h=20_000),
                line("a", write_1h=20_000),
                line("agent", read=900_000, isSidechain=True),
                json.dumps(synthetic),
                '{"type": "user", "message": {"content": "has the word usage and assistant in it"}}',
                "not json at all with usage and assistant",
                line("b", read=20_000, write_1h=1_000, out=10),
            )
        )
        self.assertEqual([c.context for c in calls], [20_002, 21_002])
        m = guard.measure(calls)
        self.assertEqual((m.calls, m.baseline, m.now, m.cache_minutes), (2, 20_002, 21_012, 60))
        self.assertEqual(len(guard.read_calls(self.path, sidechain=True)), 1)

    def test_five_minute_cache_is_detected(self):
        m = guard.measure(guard.read_calls(self.write(line("a", write_5m=20_000), line("b", read=20_000, write_5m=5))))
        self.assertEqual(m.cache_minutes, 5)

    def test_expired_cache_is_reported_only_after_its_lifetime(self):
        m = guard.measure(guard.read_calls(self.write(line("a", write_1h=20_000), line("b", read=20_000, write_1h=150_000))))
        self.assertNotIn("sat idle", guard.warning(m, now=T0 + timedelta(minutes=59))[1])
        self.assertIn("sat idle for 61 minutes", guard.warning(m, now=T0 + timedelta(minutes=61))[1])
        self.assertEqual(round(m.miss_as_output), round(m.now * 2 / 5))

    def test_bad_input_never_fails_or_prints(self):
        for stdin in ("", "{}", "garbage", "[1, 2]", '{"transcript_path": "/no/such/file"}', '{"transcript_path": 7}'):
            self.assertEqual(self.run_hook(stdin), "", stdin)
        self.assertEqual(self.hook_on("", "{", '{"type": "assistant", "message": {"usage": "assistant"}}'), "")

    def test_side_calls_do_not_move_the_fresh_start_or_hide_the_history(self):
        calls = guard.read_calls(
            self.write(
                line("title", read=3_000),
                line("a", write_1h=20_000),
                line("b", read=20_000, write_1h=130_000),
                line("summary", read=7_500),
            )
        )
        m = guard.measure(calls)
        self.assertEqual((m.calls, m.baseline, m.history), (2, 20_002, 130_000))

    def test_bad_settings_fall_back_to_the_defaults(self):
        lines = (line("a", write_1h=20_000), line("b", read=20_000, write_1h=110_000))
        for value in ("abc", "", "1e5", "0", "-5"):
            env = {"CONTEXT_GUARD_WARN": value, "CONTEXT_GUARD_CRITICAL": value, "CONTEXT_GUARD_CACHE_TTL_MIN": value}
            out = self.run_hook(json.dumps({"transcript_path": str(self.write(*lines))}), **env)
            self.assertIn("more than 60 minutes", json.loads(out)["systemMessage"], value)

    def test_after_a_tool_call_the_result_is_counted_and_only_the_model_is_told(self):
        path = self.write(line("a", write_1h=20_000), line("b", read=20_000, write_1h=50_000))
        payload = {"transcript_path": str(path), "hook_event_name": "PostToolUse", "tool_response": "x" * 400_000}
        out = json.loads(self.run_hook(json.dumps(payload)))
        self.assertEqual(out["hookSpecificOutput"]["hookEventName"], "PostToolUse")
        self.assertIn("150k tokens more", out["hookSpecificOutput"]["additionalContext"])
        self.assertNotIn("systemMessage", out)
        self.assertEqual(self.run_hook(json.dumps({**payload, "tool_response": "small"})), "")

    def test_cold_long_conversation_is_held_once_when_asked(self):
        path = self.write(line("a", write_1h=20_000), line("b", read=20_000, write_1h=150_000))
        stdin = json.dumps({"transcript_path": str(path), "session_id": "held-" + Path(self.dir.name).name})
        self.assertNotIn("decision", json.loads(self.run_hook(stdin)))
        first = json.loads(self.run_hook(stdin, CONTEXT_GUARD_HOLD_COLD="1"))
        self.assertEqual(first["decision"], "block")
        self.assertIn("send your message again", first["reason"])
        self.assertIn("systemMessage", json.loads(self.run_hook(stdin, CONTEXT_GUARD_HOLD_COLD="1")))

    def test_log_keeps_one_row_per_session_and_the_newest_rows(self):
        ledger = Path(self.dir.name) / "README.md"
        ledger.write_text(
            f"before\n{guard.LEDGER_START}\n{guard.LEDGER_HEADER}\n  | hand | 2025-01-01 | by hand |\n{guard.LEDGER_END}\nafter\n",
            encoding="utf-8",
        )
        old = guard.LEDGER_FILE, guard.LEDGER_MAX_ROWS
        guard.LEDGER_FILE, guard.LEDGER_MAX_ROWS = ledger, 3
        self.addCleanup(lambda: (setattr(guard, "LEDGER_FILE", old[0]), setattr(guard, "LEDGER_MAX_ROWS", old[1])))
        content = "\n".join((line("a", write_1h=20_000), line("b", read=20_000, write_1h=5_000, out=100))) + "\n"
        with redirect_stdout(io.StringIO()):
            for name, task in (("aaaaaaaa", "one"), ("bbbbbbbb", "two | <!-- ledger:end --> pipe"), ("aaaaaaaa", "one again")):
                path = Path(self.dir.name) / f"{name}-rest-of-id.jsonl"
                path.write_text(content, encoding="utf-8")
                guard.log(path, task, "a\nnote")
        text = ledger.read_text(encoding="utf-8")
        self.assertTrue(text.startswith("before\n") and text.endswith("\nafter\n"))
        self.assertEqual(text.count(guard.LEDGER_END), 1)
        rows = [r for r in text.splitlines() if r.startswith("| ") and "---" not in r and "Session" not in r]
        self.assertEqual([r.split("|")[1].strip() for r in rows], ["hand", "bbbbbbbb", "aaaaaaaa"])
        self.assertIn("| two / ledger:end pipe |", rows[1])
        self.assertIn("| 2026-01-01 | one again | 2 | 20k | 25k | 25k / 20k / 100 | 0 | – | a note |", rows[2])
        with redirect_stdout(io.StringIO()):
            for name in ("cccccccc", "dddddddd"):
                path = Path(self.dir.name) / f"{name}.jsonl"
                path.write_text(content, encoding="utf-8")
                guard.log(path, "more", "")
        self.assertEqual(ledger.read_text(encoding="utf-8").count("\n| "), 2 + 3)


if __name__ == "__main__":
    unittest.main()
