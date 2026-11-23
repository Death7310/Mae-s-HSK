# Authoring guide: grammar notes in Persian

You are writing short grammar lessons for an offline app that teaches Chinese
(HSK) to **Persian speakers** (Iran). Each lesson explains one grammar point of
the official HSK syllabus **in Persian, for a Persian speaker**: say what the
structure does, how to build it, and — where it helps — how it differs from
Persian (verb-final word order, ezafe versus 的, verb conjugation and tense
versus particles, «آیا/مگر» versus 吗, counting without measure words, «را», …).

## Input

`data/content/briefs/grammar-<std>-L<n>-g<k>.json`: `level`, `allowed` (every
word the learner knows at this level) and `points[]`, each with `no` (syllabus
number), `category` (the syllabus's category path, in Chinese) and `content`
(the structure or the words it covers, as the syllabus lists them).

## Output

Write `data/content/grammar/parts/<std>-L<n>-g<k>.json`: a JSON array, one
object per input point, same order:

```json
{"id": "hsk3-g0004", "std": "hsk3", "level": 1, "no": 4,
 "pattern": "会 / 能 + فعل",
 "title": {"fa": "توانستن: 会 و 能", "en": "Can: 会 and 能"},
 "body": "«会» یعنی کاری را یاد گرفته‌ای و بلدی؛ «能» یعنی شرایط یا اجازهٔ انجامش را داری.\nهر دو پیش از فعل می‌آیند و فعل هیچ تغییری نمی‌کند. منفی هر دو با 不 ساخته می‌شود: 不会، 不能.",
 "examples": [
  {"zh": "我会说汉语。", "py": "Wǒ huì shuō Hànyǔ.", "fa": "من بلدم چینی حرف بزنم.", "en": "I can speak Chinese."},
  {"zh": "他今天不能来。", "py": "Tā jīntiān bù néng lái.", "fa": "او امروز نمی‌تواند بیاید.", "en": "He can't come today."}
 ]}
```

Rules

- `id`: `<std>-g` + the syllabus number padded to four digits. `no`: the number.
- `pattern`: the structure as a learner would note it down: Chinese function
  words kept in Chinese, slots named in Persian (فاعل، فعل، مفعول، صفت، اسم، عدد،
  واحد شمارش، مکان، زمان). Keep it short.
- `title.fa`: what the structure is *for*, in plain Persian, plus the key Chinese
  word(s) — not a translation of the linguistic term. `title.en`: the same in English.
- `body`: 2–4 short Persian sentences, separated by `\n` when there are distinct
  ideas. Plain language; use a technical term only with a gloss. Mention the
  negative or question form when the learner needs it. Add a contrast with
  Persian when it prevents a typical mistake. No Latin letters except pinyin.
- `examples`: 2–3 sentences of **your own** that show the structure clearly, in
  the natural range of the level; build them from words in `allowed` (common
  Chinese names and place names are fine). `zh` with full-width punctuation;
  `py` with tone marks, syllables of a word joined, words separated by spaces,
  capital at sentence start and for names, ASCII punctuation, sandhi only for
  不 and 一, neutral tone unmarked; `fa` natural Persian; `en` natural English.
- Persian orthography: ی and ک (never ي ك), zero-width non-joiner (U+200C) where
  standard («می‌شود», «واژه‌ها»), «هٔ» for ezafe on silent he, Persian punctuation.
- When a point lists several words or sub-patterns, cover each briefly and give
  an example for the most important ones.

Before writing the file, re-read each lesson as a Persian-speaking beginner:
is it clear, correct and short? Do the examples really show the structure?
