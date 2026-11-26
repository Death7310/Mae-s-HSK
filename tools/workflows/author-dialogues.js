export const meta = {
  name: 'author-dialogues',
  description: 'Author scripted Chinese-Persian dialogues for conversation practice per HSK level, then independently review them',
  phases: [
    { title: 'Author', detail: 'ten dialogues for one level' },
    { title: 'Review', detail: 'independent bilingual review and correction' },
  ],
}

const ROOT = '/home/user/Mae-s-HSK'
const SUMMARY = {
  type: 'object',
  properties: {
    dialogues: { type: 'number' },
    changed: { type: 'number' },
    check: { type: 'string', description: 'first status line printed by tools/check_dialogues.py' },
    notes: { type: 'string', description: 'at most three short remarks' },
  },
  required: ['dialogues', 'check'],
}

const authorPrompt = n => `Work in the repository at ${ROOT} (run commands from that directory).

Task: author the conversation-practice dialogues for HSK level ${n}.

1. Read tools/content/DIALOGUE_GUIDE.md and follow it exactly.
2. Read data/content/briefs/hsk3-L${n}.json.
3. Write data/content/dialogues/hsk3-${n}.json (real UTF-8 characters, not escapes). You are the author: write the dialogues yourself from your own knowledge of Mandarin and Persian. Write the file directly; do not draft it in your reasoning first.
4. Run:  python3 tools/check_dialogues.py hsk3-${n}
   Fix every ERROR. Lines marked "~" are hints: fix the real problems (wrong pinyin, avoidable above-level words, missing half-space, over-long lines), ignore false alarms (for example a correct reading that the checker does not expect).

Be economical: read only the files named above, do not modify any other file, do not commit. Your final answer is only the structured summary.`

const reviewPrompt = n => `Work in the repository at ${ROOT} (run commands from that directory).

Task: independently review the conversation-practice dialogues for HSK level ${n}. Act as a meticulous bilingual editor: native-level Persian, an experienced teacher of Mandarin. Do not rubber-stamp.

1. Read tools/content/DIALOGUE_GUIDE.md (the author's rules are your checklist) and data/content/briefs/hsk3-L${n}.json.
2. Run:  python3 tools/check_dialogues.py hsk3-${n}    and read data/content/dialogues/hsk3-${n}.json.
3. For every line check: the Chinese is correct and natural for the situation and within the level's word list; the dialogue flows as a real conversation; the pinyin matches the characters and follows the conventions; the Persian is accurate, natural and correctly spelled (ی ک، نیم‌فاصله، هٔ); the English is accurate; every "alt" is a genuinely natural equivalent with the same meaning (remove doubtful ones, add an obvious missing one). Decide what each line should mean before reading the author's translation, so you are not anchored by it.
4. Fix problems directly in data/content/dialogues/hsk3-${n}.json (edit in place; keep ids, order and structure).
5. Run the checker again until it prints "ok".

Be economical: read only the files named above, do not modify any other file, do not commit. Your final answer is only the structured summary (changed = number of lines you corrected, notes = the three most significant corrections).`

const levels = (args && args.levels) || [1, 2, 3, 4]
const results = await pipeline(
  levels,
  n => (args && args.reviewOnly)
    ? { dialogues: 10, check: 'already authored' }
    : agent(authorPrompt(n), { label: `author:L${n}`, phase: 'Author', schema: SUMMARY, agentType: 'general-purpose', effort: 'low' }),
  (authored, n) => {
    if (!authored) return { level: n, authored: null, reviewed: null }
    return agent(reviewPrompt(n), { label: `review:L${n}`, phase: 'Review', schema: SUMMARY, agentType: 'general-purpose', effort: 'medium' })
      .then(reviewed => ({ level: n, authored, reviewed }))
  }
)
return results.map((r, i) => r || { level: levels[i], failed: true })
