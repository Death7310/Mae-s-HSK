export const meta = {
  name: 'author-persian-words',
  description: 'Author Persian glosses and example sentences for HSK word batches, then independently review each batch',
  phases: [
    { title: 'Author', detail: 'write Persian entries for one batch of words' },
    { title: 'Review', detail: 'independent bilingual review; writes corrections only' },
  ],
}

const ROOT = '/home/user/Mae-s-HSK'

const SUMMARY = {
  type: 'object',
  properties: {
    entries: { type: 'number' },
    changed: { type: 'number' },
    check: { type: 'string', description: 'last status line printed by tools/check_content.py for this batch' },
    notes: { type: 'string', description: 'at most three short remarks' },
  },
  required: ['entries', 'check'],
}

const authorPrompt = id => `Work in the repository at ${ROOT} (run commands from that directory).

Task: author Persian dictionary entries for word batch "${id}".

1. Read tools/content/WORD_GUIDE.md and follow it exactly.
2. Read data/content/batches/${id}.json.
3. Write data/content/staging/${id}.gen.json: a JSON array with one entry per input word, in the same order, as the guide specifies. Write real UTF-8 characters (Persian, Chinese, the zero-width non-joiner U+200C), not escapes. You are the author: write the entries yourself from your own knowledge of Mandarin and Persian; do not script or machine-translate them. Write the file directly; do not draft the entries in your reasoning first.
4. Run:  python3 tools/check_content.py ${id}
   If it prints ERROR, repair the file and re-run until it prints "ok". Flags are hints: read data/content/staging/${id}.flags.json and fix only the ones that are real mistakes (wrong pinyin, above-level vocabulary you can avoid, a missing half-space); ignore false alarms.

Be economical: read only the two files named above (not the tools' source code or other files), do not modify any other file, do not commit. Your final answer is only the structured summary (entries = number of entries written, check = the last status line the checker printed).`

const reviewPrompt = id => `Work in the repository at ${ROOT} (run commands from that directory).

Task: independently review word batch "${id}".

1. Read tools/content/VERIFY_GUIDE.md and tools/content/WORD_GUIDE.md and follow them exactly.
2. Run:  python3 tools/check_content.py ${id}     (refreshes data/content/staging/${id}.flags.json)
3. Read data/content/batches/${id}.json, data/content/staging/${id}.gen.json and the flags file.
4. Review every entry as the guide describes. Write data/content/staging/${id}.ver.json containing ONLY the entries you corrected (complete entry objects with a "chg" field; "[]" if none), in real UTF-8 characters, not escapes.
5. Run:  python3 tools/check_content.py ${id} --stage ver
   Repair and re-run until it prints "ok".

Be economical: read only the files named above (not the tools' source code), do not modify any other file, do not commit. Your final answer is only the structured summary (entries = number of entries reviewed, changed = number you corrected, check = the last status line of the checker, notes = the three most significant corrections).`

const todo = (args && args.batches) || []
const authorOpts = (args && args.author) || {}
const reviewOpts = (args && args.review) || {}
log(`${todo.length} batches: ${todo.map(b => b.id).join(' ')}`)

const results = await pipeline(
  todo,
  b => b.gen
    ? agent(authorPrompt(b.id), { label: `author:${b.id}`, phase: 'Author', schema: SUMMARY, agentType: 'general-purpose', ...authorOpts })
    : { entries: 0, check: 'already authored' },
  (authored, b) => {
    if (!authored) { log(`author failed for ${b.id}`); return { id: b.id, authored: null, reviewed: null } }
    if (!b.ver) return { id: b.id, authored, reviewed: { entries: 0, check: 'already reviewed' } }
    return agent(reviewPrompt(b.id), { label: `review:${b.id}`, phase: 'Review', schema: SUMMARY, agentType: 'general-purpose', ...reviewOpts })
      .then(reviewed => ({ id: b.id, authored, reviewed }))
  }
)

return results.map((r, i) => r || { id: todo[i].id, failed: true })
