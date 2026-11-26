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

Prices and product behaviour were last checked on 2026-11-26. The current-tier
prices and cache multipliers were checked against the live pricing page; this
document uses nothing from older models.

## The method in nine rules

1. **Ask for Ultracode per task, not per session.** As a standing setting it
   plans a workflow for every substantive task. Keep the session at a normal
   effort level and type the word `ultracode` in the prompts that deserve a
   workflow; that runs one task as a workflow without changing the session.
2. **One task per conversation, and never resume a cold one.** A new session is
   not free (here about 25k tokens written and 62k re-read before any work),
   and while the cache is warm 100k of extra history costs only about 2.5k
   input-equivalents per call on the top tier. So do not switch in the middle
   of a task. Switch at a task boundary, and always rather than coming back
   after a long break: resuming 250k of cold history costs about 680k
   input-equivalents before anything is done. Long inputs also degrade
   reasoning, which no price shows.
3. **Size the fan-out to the task** (table below): the fewest agents that give
   independent coverage or an independent check. Say the plan in one line
   before spending: agents, tier, effort, why.
4. **Effort first, tier second.** Give every agent an explicit effort. Move to a
   cheaper tier only what a checker or test verifies; for work only judgement
   can verify, lower the effort before lowering the tier.
5. **Keep every context small.** New input is the largest cost: whatever enters
   a context is paid for at the write price and then re-read on every later
   call. Read precisely, cap command output, and send bulk reading to an agent
   that returns a short result.
6. **Write less.** Output costs five times input. Edit files instead of
   rewriting them, and do not paste file contents or agent results back.
7. **Agents return summaries; bulk results go to files.** Every agent gets a
   schema or a length limit and a list of the files it may read.
8. **Never throw the cache away by accident.** Do not switch model, effort or
   fast mode in the middle of a conversation, and do not leave a long one idle.
9. **Measure, record, revise.** Log each substantial session in the ledger and
   change these rules when the numbers disagree with them.

## What costs tokens

Relative to one fresh input token of the same model (API list prices):

| Token class | Price | What drives it |
| --- | --- | --- |
| Output, including thinking | 5× | effort level, length of answers, rewriting files |
| New input written to the 1-hour cache | 2× | everything that enters the main conversation on a subscription |
| New input written to the 5-minute cache | 1.25× | everything that enters an agent's context (and the main one on an API key) |
| Input re-read from the cache | 0.025× on the top tier, 0.05× on the upper and mid tiers, 0.1× elsewhere | context size × number of model calls |
| Cache miss | the whole context again at the write price | a break longer than the cache lifetime; switching model, effort or fast mode |

What this meant in the session that wrote this document (main conversation,
top tier, after 18 model calls): new input 530k input-equivalents (44%), output
534k (44%), re-reads 101k (8%). Three consequences:

- **New input and output dominate while the cache is warm.** Rules 5 and 6 act
  on about nine tenths of the cost; conversation length acts on the rest.
- **A long conversation is a liability more than a running cost.** Its re-reads
  are cheap per call, but one cache miss re-bills everything at once.
- **Each context has a fixed start.** Here a main conversation starts at about
  88k tokens (system prompt, tool and skill listings), a default workflow agent
  at about 65k, and a restricted read-only agent type at about 21k.

Per token of input or output, top : upper : mid : small tier is about
80 : 40 : 20 : 1; for cache re-reads it is about 20 : 20 : 10 : 1. The small
tier costs five times more for prompts above 100k tokens. Price per token is
not cost per finished task; see "What this repository has measured".

These are API prices. How a subscription meters each token class against its
usage limits was not found in the sources read; treat the ratios as a proxy.

## Ultracode: what it buys and what it costs

Ultracode makes Claude plan a multi-agent workflow for each substantive task.
The documentation says that each request then uses more tokens and reaches
session and weekly limits sooner. Anthropic's engineering post on its research
system reports that agents use about 4× the tokens of a chat and multi-agent
systems about 15×, that this pays for high-value tasks that split into
independent parts, and that it fits poorly where the parts share context or
depend on each other, which it says describes most coding. The costs page adds
that agent teams use about 7× a standard session when teammates plan first.

So "the most exhaustive answer" and "the fewest tokens" pull in opposite
directions, and no setting gives both. What can be had is the best result per
token inside a workflow:

| Work | Shape | Agents | Tier and effort |
| --- | --- | --- | --- |
| Question, lookup, small edit, anything one context finishes in about ten tool calls | inline | 0 | the session's |
| Finding facts across documentation or many files | one read-only agent returning a short structured answer | 1 | small or mid tier, low |
| Independent batches (word, dialogue and grammar authoring) | pipeline per batch: author, then independent reviewer | 2 per batch | author low, reviewer medium; tier by how much judgement the content needs |
| A change that is costly to get wrong (data migration, scheduler, release) | implement inline, then one reviewer; more only for different lenses | 1–3 | mid tier for what can be reproduced, strong tier for judgement; high only for the hardest lens |
| Wide research | finders that each search a different way; synthesis in the main conversation | 3–5 | small or mid tier, low to medium |

Rules for workflow scripts (the scripts in [`tools/workflows/`](../workflows/)
follow them and are the pattern to copy):

- Return a schema, not prose: counts, a status line, at most three remarks.
- Name the files an agent may read, and tell it where to write its result.
- Use `pipeline()` so each item moves on as soon as its own stage is done.
- Set `effort` on every agent call, and `model` where a cheaper tier is safe.
- Skip finished work from status (`tools/content_status.py --pending`) and
  continue an interrupted run with `resumeFromRunId` instead of starting over.
- One independent reviewer per item is the default. A three-vote panel triples
  the review cost; use it only where a wrong result is expensive.
- Keep a small-tier agent below 100k tokens in total (restricted read-only
  type, narrow reading), or it pays the five-times step.
- Observed here, not documented: an agent started two minutes after another of
  the same kind read 54k of its 65k start from the cache.
- `workflowSizeGuideline` in `.claude/settings.json` (`small` is fewer than 5
  agents, `medium` fewer than 10, `large` fewer than 50) sets the size Claude
  aims for. It is advice, not a cap. Claude Code also shows a warning when a run
  schedules more than 25 agents or about 1.5M tokens.

## Conversation length

The guard computes two numbers from the transcript:

- **fresh start**: the smallest context any call in the session was sent, which
  is about what a new session starts with;
- **history**: what the next call will be sent, minus the fresh start. This is
  the part a new session would not carry.

| Level | History | Meaning |
| --- | --- | --- |
| (silent) | below 100k tokens | carry on |
| Long | 100k or more | fine to finish this task here; do not leave it idle; next task in a new session |
| Very long | 250k or more | save a checkpoint now and continue in a new session |

The warning is repeated on every reply while a level is active, and says what a
single idle break would cost, as tokens of written output. The thresholds are
judgement calls, not derived constants. Change them with `CONTEXT_GUARD_WARN`
and `CONTEXT_GUARD_CRITICAL` (tokens) in the `env` block of the settings file.

**Checkpoint, then start again.** Commit and push; state the next step in two
lines; start the next task in a new session (or `/clear`). The new session gets
the project from `CLAUDE.md`, this file and the repository, not from the old
conversation.

**Compaction is a backstop, not a plan.** It loses detail, which is why a
checkpoint and a new session is better. Left alone, a model with a 1M-token
window compacts only near its limit (about 967k by default according to the
documentation; 901,600 was the value observed in this environment).
`.claude/settings.json` therefore sets `"autoCompactWindow": 500000`, so a turn
that runs away unattended is cut back well before that. Delete the line to
return to the default.

**What fills a context fastest**, in the order met here:

- a skill or reference loaded whole: one settings skill added 99k tokens in a
  single call. Ask an agent for the three facts instead;
- whole-file reads of data (`app/public/data`, `data/content`): extract with
  `jq` or Python, or read a line range;
- unbounded command output: pipe through `head`, `tail` or `--quiet`;
- agent results without a schema.

`CLAUDE.md` is loaded into every session and every agent, so it stays short
(the documentation recommends under 200 lines; ours is far below). Detail
belongs here, where it costs nothing until someone reads it.

## The guard

```bash
python3 tools/economy/context_guard.py --report        # this session: main conversation and agents
python3 tools/economy/context_guard.py --log "task" --note "what was learned"   # write this session's ledger row
python3 -m unittest discover -s tools/economy          # its tests
```

With no arguments it is a hook, registered twice in
[`.claude/settings.json`](../../.claude/settings.json):

- on every prompt (`UserPromptSubmit`): when the history passes a threshold it
  emits one line as `systemMessage`, which Claude Code shows to the user, and
  as context for the model, which `CLAUDE.md` tells it to repeat at the top of
  its reply;
- after a skill load, an agent or a workflow (`PostToolUse`): the same note to
  the model only, with the size of the result estimated, so that growth inside
  one long turn is noticed before the turn ends.

Otherwise it prints nothing. It never fails a prompt; on any error it is silent.

**Optional: hold a cold conversation.** Add `"env": {"CONTEXT_GUARD_HOLD_COLD": "1"}`
to the settings file and the first message sent to a long conversation after
its cache has expired is held once, with the cost and the cheaper alternative;
sending it again continues. This is the only point where the guard can prevent
a cost instead of reporting it. It is off because how a held message appears in
the phone app has not been tested, and the message may have to be typed again.

Limits worth knowing:

- It measures; apart from the optional hold it cannot stop anything. The rules
  in `CLAUDE.md` are followed by the model, not enforced.
- New cloud sessions start from the repository's default branch. The rules and
  the hook apply only once this work is merged there.
- Project hooks run in a cloud session with this one repository attached. In
  the session that added the hook it began firing on the next prompt; the
  after-tool note was tested only by piping input to the script.
- "What the next call will be sent" is an estimate (the last call's input plus
  its output).
- `--report` gives costs as a range and does not convert between tiers, because
  the script does not know prices per model.

**Using this in another repository.** Copy `tools/economy/`, the "Token economy"
section of `CLAUDE.md` and `.claude/settings.json`. Nothing in the script is
specific to this project. Settings in a user's own `~/.claude` do not reach
cloud sessions, so each repository carries its copy.

## What this repository has measured

- **A cheaper author is not automatically a cheaper result.** Levels 1–2 of the
  Persian content were written by the strongest model and about 5% of entries
  were corrected in review. From level 3 a cheaper model wrote and a stronger
  one reviewed: 20–30% of entries were corrected, some for real errors of
  sense, and those levels still carry the higher residual risk (see the main
  README). The automatic checkers verify form (orthography, pinyin, level of
  vocabulary), not meaning, so nothing but the reviewer could catch what the
  cheaper author got wrong. Hence rule 4.
- **Tiering down checkable work cut its cost by an order of magnitude.** In the
  session that wrote this document, converted to top-tier input tokens: three
  top-tier agents cost about 730k (330k new input, 1.8M re-read, 55k output);
  two mid-tier reviewers, whose findings could be reproduced, about 97k
  together; the small-tier agent that did the largest reading job (154k new
  input, 926k re-read) about 17k. The main conversation cost about 1.2M.
- **Loading a large skill in the main conversation was the single most
  expensive step of that session** (99k tokens written at 2×, then re-read on
  every later call), and rewriting whole files made output as large a cost as
  all new input.
- **The first version of this method was wrong about what a long conversation
  costs.** It assumed re-reads at 0.1× and advised a new session at 100k of
  history; at the top tier's 0.025× that loses money in the middle of a task.
  An independent review caught it. Rule 2 is the corrected form.

## Ledger

One row per substantial session, written by `context_guard.py --log` (logging a
session again replaces its row). Token counts are "new input / re-read from
cache / output". The newest 30 rows are kept; older ones are in the file's
history.

<!-- ledger:start -->
| Session | Date | Task | Main calls | Fresh start | Peak context | Main: new in / re-read / out | Agents | Agents: new in / re-read / out | Lesson |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ebd5a4d8 | 2026-11-26 | Token-economy method, context guard and session rules | 21 | 88k | 359k | 296k / 5.1M / 118k | 6 | 659k / 3.8M / 99k | New input and output were about 9/10 of main-conversation cost; re-reads 8%. One skill load added 99k. Mid- and small-tier agents did checkable work at a fraction of top-tier cost. Independent review corrected the first cost model. |
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
- Chen, Zaharia and Zou, "FrugalGPT: How to Use Large Language Models While
  Reducing Cost and Improving Performance", arXiv:2305.05176, 2023 (journal
  publication in *TMLR* reported, not confirmed) — a cascade of models matched
  the best single model at up to 98% lower cost in the best case. Rule 4's
  condition, that something reliable must decide when to escalate, is this
  document's reading of it, not a quotation.
- Ong et al., "RouteLLM: Learning to Route LLMs from Preference Data", ICLR 2025
  (arXiv:2406.18665, under a slightly different title) — routing between a
  strong and a weak model.

Industry report (not peer-reviewed): Hong, Troynikov and Huber, "Context Rot",
Chroma, 2025 — performance becomes less reliable as input grows.

## Keeping this current

- In a session that ran a workflow or reached a warning, write its ledger row
  before the last commit and commit this file with it.
- When a row contradicts a rule, change the rule and say why in the commit.
- When the model line-up or prices change, re-check "What costs tokens" and the
  date at the top. The weights in `context_guard.py` are the same numbers.
- Keep `CLAUDE.md` to rules; put reasons and numbers here.
