# Authoring guide: dialogues for conversation practice

You are writing short scripted conversations for an offline app that teaches
Chinese (HSK) to **Persian speakers**. Learners first read and listen, then
**role-play**: the app plays one speaker, and on the learner's turns shows the
Persian meaning and the learner types the Chinese line. So every line needs an
accurate Persian translation, and the learner's lines must be things a learner
at this level can actually produce.

## Input

`data/content/briefs/<std>-L<n>.json`: `level`, `topics` (one dialogue per
topic, in this order), `lines` (min and max lines per dialogue) and `allowed`
(every word the learner knows at this level, cumulative).

## Output

Write `data/content/dialogues/<std>-<n>.json`: a JSON array, one object per topic:

```json
{"id": "hsk3-1-01", "std": "hsk3", "level": 1,
 "title": {"fa": "آشنایی", "zh": "认识新朋友", "en": "Meeting someone new"},
 "scene": "دو دانشجو روز اول کلاس با هم آشنا می‌شوند.",
 "lines": [
  {"who": "A", "zh": "你好！你叫什么名字？", "py": "Nǐ hǎo! Nǐ jiào shénme míngzi?",
   "fa": "سلام! اسمت چیست؟", "en": "Hello! What's your name?"},
  {"who": "B", "zh": "我叫王明。你呢？", "py": "Wǒ jiào Wáng Míng. Nǐ ne?",
   "fa": "اسم من وانگ مینگ است. تو چطور؟", "en": "My name is Wang Ming. And you?",
   "alt": ["我叫王明，你呢？", "我是王明。你呢？"]}
 ]}
```

Rules

- `id`: `<std>-<level>-<two-digit number>`, numbered in topic order.
- Exactly two speakers, `A` and `B`, alternating. Stay within the `lines` range.
- **Vocabulary**: build every line from words in `allowed`. Chinese personal
  names (王明、李华、小张), place names (北京、上海) and numbers are fine. At most
  one or two other words per dialogue, only when the topic cannot do without them.
- **Natural**: what real people say in that situation — greetings, short answers,
  particles (吧、呢、啊) where natural — not textbook-stiff, not above level.
  Each dialogue should have a small point (a question answered, a plan made, a
  problem solved), not a list of unrelated sentences.
- Lines short enough to type: levels 1–2 at most 14 characters, levels 3–4 at most 24.
- `zh`: full-width Chinese punctuation. `py`: tone marks, syllables of a word
  joined, words separated by spaces, capital at sentence start and for names,
  ASCII punctuation; sandhi written only for 不 and 一 (bú shì, yí ge, yì tiān);
  neutral tone unmarked.
- `fa`: natural, idiomatic Persian a person would actually say in that situation
  (conversational but standard written forms: «می‌خواهم», not «می‌خوام»). Persian
  ی/ک, zero-width non-joiner (U+200C) where standard, «هٔ» for ezafe on silent he,
  Persian punctuation (، ؛ ؟). Transliterate Chinese names consistently
  (王明 → وانگ مینگ).
- `en`: natural English.
- `alt` (optional, on any line): up to three other fully natural ways to say the
  same thing with the same meaning, so a learner's correct-but-different answer
  is accepted. Only real alternatives; omit when there is no good one.
- `scene`: one Persian sentence setting the situation.
- `title.fa` short (1–4 words).

Before writing the file, re-read every line: correct, natural Chinese? pinyin
matches the characters? Persian accurate and natural? within the word list?
