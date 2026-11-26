"""Tests for context_guard.py:  python3 -m unittest discover -s tools/economy"""
from __future__ import annotations

import io
import json
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

    def run_hook(self, stdin):
        done = subprocess.run([sys.executable, str(SCRIPT)], input=stdin, capture_output=True, text=True, timeout=30)
        self.assertEqual(done.returncode, 0, done.stderr)
        return done.stdout

    def hook_on(self, *lines):
        return self.run_hook(json.dumps({"transcript_path": str(self.write(*lines))}))

    def test_short_conversation_is_silent(self):
        self.assertEqual(self.hook_on(line("a", write_1h=20_000), line("b", read=20_000, write_1h=30_000)), "")

    def test_warn_output_is_valid_hook_json(self):
        out = json.loads(self.hook_on(line("a", write_1h=20_000), line("b", read=20_000, write_1h=110_000, out=500)))
        self.assertIn("[WARN]", out["systemMessage"])
        self.assertEqual(out["hookSpecificOutput"]["hookEventName"], "UserPromptSubmit")
        self.assertIn(out["systemMessage"], out["hookSpecificOutput"]["additionalContext"])

    def test_critical(self):
        out = json.loads(self.hook_on(line("a", write_1h=20_000), line("b", read=20_000, write_1h=260_000)))
        self.assertIn("[CRITICAL]", out["systemMessage"])

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
        self.assertNotIn("expired", guard.warning(m, now=T0 + timedelta(minutes=59))[1])
        self.assertIn("expired", guard.warning(m, now=T0 + timedelta(minutes=61))[1])

    def test_bad_input_never_fails_or_prints(self):
        for stdin in ("", "{}", "garbage", "[1, 2]", '{"transcript_path": "/no/such/file"}', '{"transcript_path": 7}'):
            self.assertEqual(self.run_hook(stdin), "", stdin)
        self.assertEqual(self.hook_on("", "{", '{"type": "assistant", "message": {"usage": "assistant"}}'), "")

    def test_log_appends_and_keeps_the_newest_rows(self):
        self.write(line("a", write_1h=20_000), line("b", read=20_000, write_1h=5_000, out=100))
        ledger = Path(self.dir.name) / "README.md"
        ledger.write_text(f"before\n{guard.LEDGER_START}\n{guard.LEDGER_HEADER}\n{guard.LEDGER_END}\nafter\n", encoding="utf-8")
        old = guard.LEDGER_FILE, guard.LEDGER_MAX_ROWS
        guard.LEDGER_FILE, guard.LEDGER_MAX_ROWS = ledger, 2
        self.addCleanup(lambda: (setattr(guard, "LEDGER_FILE", old[0]), setattr(guard, "LEDGER_MAX_ROWS", old[1])))
        with redirect_stdout(io.StringIO()):
            for task in ("one", "two | with a pipe", "three"):
                guard.log(self.path, task, "a\nnote")
        text = ledger.read_text(encoding="utf-8")
        self.assertTrue(text.startswith("before\n") and text.endswith("\nafter\n"))
        rows = [r for r in text.splitlines() if r.startswith("| 2026")]
        self.assertEqual(len(rows), 2)
        self.assertIn("two / with a pipe", rows[0])
        self.assertIn("| 2 | 20k | 25k | 25k / 20k / 100 | 0 | – | a note |", rows[1])


if __name__ == "__main__":
    unittest.main()
