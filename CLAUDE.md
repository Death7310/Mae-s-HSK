# Mae's HSK — working rules

What the project is, its layout and its commands: `README.md`. Read the
sections a task needs, not the whole file.

## Token economy

The owner's standing instruction for every session: get the most verified work
per token. Method, evidence and ledger: `tools/economy/README.md` (read it
before planning a workflow, not on every task).

1. **Relay the context warning.** A `[context-guard]` note means the
   conversation is long. Start the next reply to the user with its `⚠` line,
   unchanged, every time a note appears. If a long session has shown no note,
   the hook may not be loaded: run
   `python3 tools/economy/context_guard.py --report` and say what it shows.
2. **One task per conversation; never resume a cold one.** Finish the current
   task where it started, then commit and push, give the next step in two
   lines, and tell the user to start the next task in a new session. A new
   session starts from the repository's default branch: if the work is not
   merged there yet, say so and name the branch. Do not switch model, effort or
   fast mode in the middle of a conversation.
3. **Size the fan-out and say it first.** This is the owner's instruction on how
   to apply Ultracode, and it takes precedence where the Ultracode text says
   cost is not a constraint. A question, a lookup, or an edit that one context
   finishes in about ten tool calls is done inline, with Ultracode on or off.
   Any other task under Ultracode gets the smallest workflow that provides an
   independent check: by default the work done once plus one reviewer; more
   agents only for independent batches or genuinely different review lenses.
   Before a Workflow or Agent call, state in one line how many agents, on which
   tier and effort, and why.
4. **Tier and effort per agent.** Every agent gets an explicit effort: `low` for
   search and extraction, `medium` for checked authoring and for review, `high`
   only for work that judgement alone can verify. Move to a cheaper tier only
   what a checker or test verifies; for judgement work (meaning, translation
   quality, design) lower the effort before lowering the tier.
5. **Keep contexts small.** Read with Grep and line ranges. Never read data
   JSON whole (`app/public/data`, `data/content`); extract with `jq` or Python.
   Cap command output. Send bulk reading, and any large skill or reference, to
   an agent that returns a short structured result. Output costs five times
   input: do not paste file contents or agent results back, and edit files
   rather than rewriting them.
6. **Agents return summaries; bulk results go to the files the task names.**
   Give every agent a schema or a length limit and the list of files it may
   read. Reuse the scripts in `tools/workflows/` and `resumeFromRunId` rather
   than re-running finished work.
7. **Keep the record.** In a session that ran a workflow or reached a warning,
   before its last commit run
   `python3 tools/economy/context_guard.py --log "<task>" --note "<what was learned>"`
   and commit `tools/economy/README.md` with it. If the row contradicts a rule
   in that README, correct the rule in the same commit.

## Current state and next steps

Update this when it changes. Figures: the status table in `README.md`.

- New HSK 1–6 is complete: words, dialogues and grammar, written and reviewed by
  models. No entry is checked by a person yet.
- Next: the native-speaker check, starting with `data/content/NATIVE_CHECK.md`
  and levels 3–5. After it: old-HSK-only words
  (`tools/content_status.py --pending hsk2-L5`, `hsk2-L6`), levels 7–9, a
  tone-pair trainer, sentence translation.
- Before content or data work in a new container: `pip install pypinyin` and
  `npm ci` in `app/`. The checkers and `tools/build_data.py` stop without them.
- After a data rebuild: `cd app && npm test && npm run build && node tests/e2e/smoke.mjs`.

If you are a subagent: your task prompt outranks the "Token economy" section. Read only the
files it names; do not load a skill unless the task names it; do not start
further agents; return exactly the schema or length asked for; write files only
where the task says. Rules 1–3 and 7 are for the main conversation.
