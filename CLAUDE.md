# Mae's HSK — working rules

What the project is, its layout and its commands: `README.md`. Read the
sections a task needs, not the whole file.

## Token economy

Standing rules for every session. The method, the evidence and the ledger are
in `tools/economy/README.md`; read it before planning a workflow, not on every
task.

1. **Relay the context warning.** A `[context-guard]` note in context means the
   conversation is long. Start the reply with its `⚠` line, unchanged, every
   time the note appears. If there is no note but the conversation has clearly
   grown (many tool rounds, a large load), run
   `python3 tools/economy/context_guard.py --report` and tell the user what it
   shows.
2. **One task per conversation.** At a task boundary, or on a warning: commit
   and push, give the next step in two lines, and tell the user to continue in
   a new session. Do not rely on auto-compaction.
3. **Size the fan-out and say it first.** Before a Workflow or Agent call, state
   in one line how many agents, on which tier and effort, and why inline work
   is not enough. With Ultracode on, a substantive task still gets a workflow,
   sized to the task: the fewest agents that give independent coverage or an
   independent check. With it off, use a workflow only for independent batches,
   wide search, or a change that needs an independent check.
4. **Tier down only what a machine can check.** Search, extraction, format
   conversion and anything a checker or test verifies go to a cheaper tier or
   lower effort. Meaning, translation quality and design stay on the strong
   tier. Set tier and effort per agent; never switch model, effort or fast mode
   in the middle of a conversation, because that empties the cache.
5. **Keep contexts small.** Read with Grep and line ranges. Never read data
   JSON whole (`app/public/data`, `data/content`); extract with `jq` or Python.
   Cap command output. Send bulk reading, and any large skill or reference, to
   an agent that returns a short structured result.
6. **Agents return summaries; results go to files.** Give every agent a schema
   or a length limit and the list of files it may read. Reuse the scripts in
   `tools/workflows/` and `resumeFromRunId` rather than re-running finished
   work.
7. **Keep the record.** After a session that ran a workflow or reached a
   warning: `python3 tools/economy/context_guard.py --log "<task>" --note "<what was learned>"`,
   and correct the README's rules if the numbers contradict them.

For agents: rules 4–6 apply to you; rules 1–3 and 7 belong to the main
conversation.
