# Token economy

How to get the most verified work per token when building this app with Claude
Code, including with Ultracode (multi-agent workflows) switched on. This is a
living document: the rules below are the current best method, the ledger at the
end records what sessions actually cost, and the rules change when the ledger
contradicts them.

- The operative rules, in short form, are in [`CLAUDE.md`](../../CLAUDE.md), which
  every session and every agent loads.
- [`context_guard.py`](context_guard.py) measures a session from its transcript,
  warns when the conversation is too long, and writes the ledger.

Prices and product behaviour were last checked on 2026-11-26.

## The method in eight rules

1. **Spend the session's effort setting deliberately.** Ultracode as a standing
   setting plans a workflow for every substantive task. Keep the session at a
   normal effort level and type the word `ultracode` in the prompts that deserve
   a workflow; that runs one task as a workflow without changing the session.
2. **One task per conversation.** Finish, commit, start a new session. A new
   session costs nothing; a long one makes every later step and every cache
   miss more expensive, and reasoning gets worse as input grows.
3. **Size the fan-out to the task** (table below). Use the fewest agents that
   give independent coverage or an independent check. Say the plan in one line
   before spending: agents, tier, effort, why inline is not enough.
4. **Tier down only what a machine can check.** Search, extraction and anything
   a checker or test verifies go to a cheaper tier or lower effort. Work that
   only judgement can verify stays on the strong tier.
5. **Keep every context small.** What enters a context is paid for once at the
   write price and again on every later call. Read precisely, cap command
   output, and send bulk reading to an agent that returns a short result.
6. **Agents return summaries; results go to files.** Every agent gets a schema
   or a length limit and a list of the files it may read.
7. **Never throw the cache away by accident.** Do not switch model, effort or
   fast mode in the middle of a conversation, and do not resume a long
   conversation after a long break; start a new one from the checkpoint.
8. **Measure, record, revise.** Log each substantial session in the ledger and
   change these rules when the numbers disagree with them.

## What costs tokens

Relative to one fresh input token of the same model (API list prices):

| Token class | Price | What drives it |
| --- | --- | --- |
| Output, including thinking | 5× | effort level, length of answers, drafting in reasoning |
| New input written to the 1-hour cache | 2× | everything that enters the main conversation on a subscription |
| New input written to the 5-minute cache | 1.25× | everything that enters an agent's context (and the main one on an API key) |
| Input re-read from the cache | 0.025× on the top tier, 0.05× on the upper and mid tiers, 0.1× elsewhere | context size × number of model calls |
| Cache miss | the whole context again at the write price | a break longer than the cache lifetime; switching model, effort or fast mode; compaction |

Three consequences:

- **New input and output dominate while the cache is warm.** In the session that
  wrote this document the main conversation re-read 1.9M tokens, but its 220k
  of new input and 57k of output cost several times more.
- **A long conversation is a liability more than a running cost.** Its re-reads
  are cheap per call, but they multiply with every call (a task of *n* steps
  re-sends its first step *n* times), and one cache miss re-bills everything:
  a 300k-token conversation resumed after an hour costs 600k input-equivalents
  before it does anything, as much as 120k tokens of output.
- **Each context has a fixed start-up cost.** Here a main conversation starts at
  about 88k tokens (system prompt, tool and skill listings), a default workflow
  agent at about 65k, and a restricted read-only agent type at about 21k.

Tiers differ far more than any other lever: per token, top : upper : mid :
small tier is about 80 : 40 : 20 : 1 (the small tier costs five times more for
prompts above 100k tokens, which narrows this to 16 : 8 : 4 : 1). Price per
token is not cost per finished task, though; see "What this repository has
measured".

These are API prices. How a subscription meters each token class against its
usage limits is not published; treat the ratios as the best available proxy.

## Ultracode: what it buys and what it costs

Ultracode makes Claude plan a multi-agent workflow for each substantive task.
The documentation says plainly that each request then uses more tokens and
reaches session and weekly limits sooner. Anthropic reports that agents use
about 4× the tokens of a chat, multi-agent systems about 15×, and agent teams
about 7× a standard session; it also reports that multi-agent work pays for
high-value tasks that split into independent parts, and fits poorly where the
parts share context or depend on each other, which describes most coding.

So "the most exhaustive answer" and "the fewest tokens" pull in opposite
directions, and no setting gives both. What can be had is the best result per
token inside a workflow:

| Work | Shape | Agents | Tier and effort |
| --- | --- | --- | --- |
| Question, small edit, anything one context finishes in about ten tool calls | inline | 0 | the session's |
| Finding facts across documentation or many files | one read-only agent returning a short structured answer | 1 | small or mid tier, low to medium |
| Independent batches (word, dialogue and grammar authoring) | pipeline per batch: author, then independent reviewer | 2 per batch | author by how much judgement the content needs; reviewer strong tier, medium |
| A change that is costly to get wrong (data migration, scheduler, release) | implement inline, then reviewers with different lenses | 2–3 | strong tier; high effort only for the hardest lens |
| Wide research | finders that each search a different way; synthesis in the main conversation | 3–5 | finders small or mid tier |

Rules for workflow scripts (the scripts in [`tools/workflows/`](../workflows/)
follow them and are the pattern to copy):

- Return a schema, not prose: counts, a status line, at most three remarks.
- Name the files an agent may read, and tell it to write its result to a file.
- Use `pipeline()` so each item moves on as soon as its own stage is done.
- Set `effort`, and where it is safe `model`, per stage rather than for the run.
- Skip finished work from status (`tools/content_status.py --pending`) and
  continue an interrupted run with `resumeFromRunId` instead of starting over.
- One independent reviewer per item is the default. A three-vote panel triples
  the review cost; use it only where a wrong result is expensive.
- Agents of the same type started within five minutes share the cached start:
  the second such agent here read 54k of its 65k start from the cache. Start a
  batch together rather than one by one.
- `workflowSizeGuideline` in `.claude/settings.json` (`small` is fewer than 5
  agents, `medium` fewer than 10, `large` fewer than 50) sets the size Claude
  aims for. It is advice, not a cap. Claude Code also shows a warning when a run
  schedules more than 25 agents or about 1.5M tokens.

## Conversation length

The guard runs on every prompt and computes, from the transcript:

- **fresh start**: the smallest context any call in the session was sent, which
  is what a new session would start with;
- **history**: what the next call will be sent, minus the fresh start. This is
  the part a new session would not carry.

| Level | History | What to do |
| --- | --- | --- |
| (silent) | below 100k tokens | carry on |
| WARN | 100k or more | finish the current task, commit, continue in a new session |
| CRITICAL | 250k or more | checkpoint now; do not start anything new here |

While a level is active the warning is repeated on every reply. It also says
when the cache has already expired (the session sat idle for longer than the
cache lifetime), because that message is the expensive one.

The thresholds are judgement calls, not derived constants: they sit where a
single cache miss costs as much as a sizeable piece of real work. Change them
with `CONTEXT_GUARD_WARN` and `CONTEXT_GUARD_CRITICAL` (tokens).

**Checkpoint, then start again.** Commit and push; state the next step in two
lines; start a new session (or `/clear`). The new session gets the project
from `CLAUDE.md`, this file and the repository, not from the old conversation.

**Do not wait for auto-compaction.** On a model with a 1M-token window it
starts above 900k tokens (901,600 in this environment). Compaction is itself a
large request, it empties the cache, and it loses detail. To make it a
backstop, add `"autoCompactWindow": 400000` to `.claude/settings.json`; this is
not set, because it changes how every session here behaves.

**What fills a context fastest**, in the order met here:

- a skill or reference loaded whole: one settings skill added 99k tokens in a
  single call. Ask an agent for the three facts instead;
- whole-file reads of data (`app/public/data`, `data/content`): extract with
  `jq` or Python, or read a line range;
- unbounded command output: pipe through `head`, `tail` or `--quiet`;
- agent results without a schema.

`CLAUDE.md` is loaded into every session and every agent, so it stays short
(the documentation's ceiling is 200 lines; ours is far below it). Detail
belongs here, where it costs nothing until someone reads it.

## The guard

```bash
python3 tools/economy/context_guard.py --report        # this session: main conversation and agents
python3 tools/economy/context_guard.py --log "task" --note "what was learned"   # append a ledger row
python3 -m unittest discover -s tools/economy          # its tests
```

With no arguments it is the `UserPromptSubmit` hook registered in
[`.claude/settings.json`](../../.claude/settings.json). When the history passes
a threshold it emits one line twice: as `systemMessage`, which Claude Code
shows to the user, and as context for the model, which `CLAUDE.md` tells it to
repeat at the top of its reply. Otherwise it prints nothing. It never blocks a
prompt, and on any error it stays silent.

Limits worth knowing:

- It measures; it cannot stop anything. The rules in `CLAUDE.md` are followed by
  the model, not enforced.
- The hook runs where project settings load: in a cloud session with this one
  repository attached, and locally once the folder is trusted. A hook added
  during a session starts working in the next one.
- "What the next call will be sent" is an estimate (the last call's input plus
  its output).
- Costs are printed as a range because the cache-read price depends on the tier.

**Using this in another repository.** Copy `tools/economy/`, the "Token economy"
section of `CLAUDE.md` and the `hooks` block of `.claude/settings.json`. Nothing
in the script is specific to this project. Settings in a user's own
`~/.claude` do not reach cloud sessions, so each repository carries its copy.

## What this repository has measured

- **A cheaper author is not automatically a cheaper result.** Levels 1–2 of the
  Persian content were written by the strongest model and about 5% of entries
  were corrected in review. From level 3 a cheaper model wrote and a stronger
  one reviewed: 20–30% of entries were corrected, some for real errors of
  sense, and those levels still carry the higher residual risk (see the main
  README). The automatic checkers verify form (orthography, pinyin, level of
  vocabulary), not meaning, so nothing but the reviewer could catch what the
  cheaper author got wrong. Hence rule 4.
- **Three research agents cost about as much as the conversation that used
  them** (336k new input, 2.0M re-read, 43k output over 22 calls, against 220k,
  1.9M and 57k in the main conversation at that point). They returned about 110
  sourced facts and kept three 80–150k-token reading contexts out of the main
  conversation. The one that ran on the small tier did the largest share of
  the reading for a small fraction of the cost; the extraction-only agent could
  have run a tier lower as well.
- **Loading a large skill in the main conversation was the single most
  expensive step of that session** (99k tokens written at 2×, then re-read on
  every later call).

## Ledger

One row per substantial session, appended by `context_guard.py --log`. Token
counts are "new input / re-read from cache / output". The newest 30 rows are
kept; older ones are in the file's history.

<!-- ledger:start -->
| Date | Task | Main calls | Fresh start | Peak context | Main: new in / re-read / out | Agents | Agents: new in / re-read / out | Lesson |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
<!-- ledger:end -->

## Sources

Product documentation (Anthropic), read 2026-11-26:

- Costs: <https://code.claude.com/docs/en/costs> — clearing between tasks,
  model choice, subagents, `CLAUDE.md` size, agent-team token use, why usage
  climbs in a long session.
- Prompt caching in Claude Code: <https://code.claude.com/docs/en/prompt-caching>
  — cache lifetimes (one hour for the main conversation on a subscription, five
  minutes for agents and on API keys), what empties the cache.
- Workflows and Ultracode: <https://code.claude.com/docs/en/workflows> — cost,
  the size guideline, the `ultracode` keyword.
- Context window and compaction: <https://code.claude.com/docs/en/context-window>,
  <https://code.claude.com/docs/en/model-config>.
- Hooks: <https://code.claude.com/docs/en/hooks>; cloud sessions:
  <https://code.claude.com/docs/en/cloud-environments>.
- API pricing: <https://platform.claude.com/docs/en/about-claude/pricing> —
  cache write and read multipliers, tier prices, long-context pricing.

Vendor engineering posts (not peer-reviewed):

- Anthropic, "How we built our multi-agent research system", 2025:
  <https://www.anthropic.com/engineering/multi-agent-research-system> — the 4×
  and 15× token multipliers; where multi-agent work pays.
- Anthropic, "Effective context engineering for AI agents", 2025:
  <https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents>
  — context as a finite resource; sub-agents returning condensed summaries.

Peer-reviewed research. The papers' own pages could not be opened from this
environment, so the citations were confirmed through search indexes only, and
they study earlier models: the direction of the findings carries over, the
magnitudes do not.

- Liu et al., "Lost in the Middle: How Language Models Use Long Contexts",
  *Transactions of the ACL* 12, 2024, doi:10.1162/tacl_a_00638 — accuracy
  depends on where information sits in a long input.
- Levy, Jacoby and Goldberg, "Same Task, More Tokens: the Impact of Input Length
  on the Reasoning Performance of Large Language Models", ACL 2024,
  doi:10.18653/v1/2024.acl-long.818 — reasoning degrades at input lengths far
  below the model's maximum.
- Chen, Zaharia and Zou, "FrugalGPT", *Transactions on Machine Learning
  Research*, 2024, arXiv:2305.05176 — cascades (cheap model first, stronger one
  when needed) cut cost at matched accuracy when a reliable signal decides the
  escalation.
- Ong et al., "RouteLLM", ICLR 2025, arXiv:2406.18665 — routing between a
  strong and a weak model.

Industry report (not peer-reviewed): Hong, Troynikov and Huber, "Context Rot",
Chroma, 2025 — performance becomes less reliable as input grows.

## Keeping this current

- After a session that ran a workflow or reached a WARN, add a ledger row.
- When a row contradicts a rule, change the rule and say why in the commit.
- When the model line-up or prices change, re-check "What costs tokens" and the
  date at the top. The weights in `context_guard.py` are the same numbers.
- Keep `CLAUDE.md` to rules; put reasons and numbers here.
