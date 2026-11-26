export const meta = {
  name: 'author-grammar',
  description: 'Author Persian grammar lessons for the official HSK grammar points, then independently review them',
  phases: [
    { title: 'Author', detail: 'one part (about 25-32 grammar points) per agent' },
    { title: 'Review', detail: 'independent bilingual review and correction' },
  ],
}

const ROOT = '/home/user/Mae-s-HSK'
const SUMMARY = {
  type: 'object',
  properties: {
    points: { type: 'number' },
    changed: { type: 'number' },
    check: { type: 'string', description: 'first status line printed by tools/check_grammar.py' },
    notes: { type: 'string', description: 'at most three short remarks' },
  },
  required: ['points', 'check'],
}

const authorPrompt = id => `Work in the repository at ${ROOT} (run commands from that directory).

Task: author the Persian grammar lessons for part "${id}".

1. Read tools/content/GRAMMAR_GUIDE.md and follow it exactly.
2. Read data/content/briefs/grammar-${id}.json.
3. Write data/content/grammar/parts/${id}.json (real UTF-8 characters, not escapes). You are the author: write the lessons yourself from your own knowledge of Mandarin grammar and of Persian. Write the file directly; do not draft it in your reasoning first.
4. Run:  python3 tools/check_grammar.py ${id}
   Fix every ERROR. Lines marked "~" are hints: fix the real problems (wrong pinyin, avoidable above-level words, missing half-space), ignore false alarms.

Be economical: read only the files named above, do not modify any other file, do not commit. Your final answer is only the structured summary.`

const reviewPrompt = id => `Work in the repository at ${ROOT} (run commands from that directory).

Task: independently review the Persian grammar lessons of part "${id}". Act as a meticulous bilingual editor: native-level Persian, an experienced teacher of Mandarin grammar to Persian speakers. Do not rubber-stamp.

1. Read tools/content/GRAMMAR_GUIDE.md (the author's rules are your checklist) and data/content/briefs/grammar-${id}.json.
2. Run:  python3 tools/check_grammar.py ${id}    and read data/content/grammar/parts/${id}.json.
3. For every lesson check: the explanation is linguistically correct (no wrong rule, no over-generalisation), covers what the syllabus point lists, and is clear and short for a Persian-speaking learner; any contrast with Persian is accurate; the pattern is right; the examples are correct, natural Chinese that really show the structure, within the level's word list, with matching pinyin; the Persian is natural and correctly spelled (ی ک، نیم‌فاصله، هٔ); the English is accurate. Decide what the point should say before reading the author's text, so you are not anchored by it.
4. Fix problems directly in data/content/grammar/parts/${id}.json (edit in place; keep ids, order and structure).
5. Run the checker again until it prints "ok".

Be economical: read only the files named above, do not modify any other file, do not commit. Your final answer is only the structured summary (changed = number of lessons you corrected, notes = the three most significant corrections).`

const parts = (args && args.parts) || []
const results = await pipeline(
  parts,
  id => ((args && args.authored) || []).includes(id)
    ? { points: 0, check: 'already authored' }
    : agent(authorPrompt(id), { label: `author:${id}`, phase: 'Author', schema: SUMMARY, agentType: 'general-purpose', effort: 'low' }),
  (authored, id) => {
    if (!authored) return { id, authored: null, reviewed: null }
    return agent(reviewPrompt(id), { label: `review:${id}`, phase: 'Review', schema: SUMMARY, agentType: 'general-purpose', effort: 'medium' })
      .then(reviewed => ({ id, authored, reviewed }))
  }
)
return results.map((r, i) => r || { id: parts[i], failed: true })
