# Authoring guide: Persian word entries

You are writing dictionary entries for an offline app that teaches Chinese (HSK)
to **Persian speakers** (Iran). Learners see your Persian gloss on flashcards in
both directions (Chinese → Persian and Persian → Chinese), so every gloss must
be accurate, natural and unambiguous enough to recall the Chinese word from it.

## Input

A batch file `data/content/batches/<batch>.json`:

- `level`: the HSK level of the batch; `allowed` (levels 1–4 only): every word
  the learner knows at this level (cumulative list).
- `words[]`, each with:
  - `id`, `s` (simplified), `p` (official pinyin), `pos` (official part of speech:
    n noun, v verb, a adjective, d adverb, r pronoun, m numeral, q measure word,
    mq numeral-measure, p preposition, c conjunction, u particle, e interjection,
    o onomatopoeia, h prefix, k suffix);
  - `later`: senses the syllabus adds at a higher level, e.g. `{"levels":[4],"pos":["d"]}`;
  - `en2`: the HSK 2.0 list's English definition (when the word was in HSK 2.0);
  - `cedict`: every CC-CEDICT reading with English glosses. **Reference only**: it
    mixes rare senses, surnames and variants. Use the reading that matches `p`.

The official `p` and `pos` define which word you are describing. 花 (`huā`, v) is
"to spend", not "flower"; 本 (q) is the measure word for books.

## Output

Write a JSON array to `data/content/staging/<batch>.gen.json`, one object per
input word, same order, nothing omitted:

```json
{"id": "学习", "fa": ["یاد گرفتن", "درس خواندن"], "en": ["to study", "to learn"],
 "ex": [{"zh": "我在学校学习汉语。", "py": "Wǒ zài xuéxiào xuéxí Hànyǔ.",
         "fa": "من در مدرسه چینی یاد می‌گیرم.", "en": "I study Chinese at school."}]}
```

Optional fields: `note` (Persian), and `pos` (only when the input `pos` is empty).

### `fa` — Persian glosses

- 1–3 glosses (4 only for genuinely distinct core senses), most common first,
  each short (ideally ≤ 4 words). Cover the senses of the official `pos`.
- Translate the **Chinese word**, not the English gloss.
- Citation forms: verbs as infinitive («خوردن»), nouns singular without
  indefinite ‑ی («کتاب»), adjectives bare («بزرگ»).
- Function words get a brief functional description plus the nearest Persian
  equivalent: 的 → «نشانهٔ مالکیت و وابستگی (مانند کسرهٔ اضافه)»; 吗 → «ادات پرسشی (آیا)»;
  measure words → «واحد شمارش برای کتاب و دفتر (جلد)».
- If a Persian gloss is ambiguous, disambiguate in parentheses: 老 → «پیر»، «قدیمی (کهنه)»;
  打 → «زدن»، «بازی کردن (ورزش با دست)».
- Culture-bound items: transliteration plus a short explanation: 饺子 → «جیائوزی (دامپلینگ چینی)».
- Contemporary standard Iranian Persian, neutral register. No slang unless the
  Chinese word is itself colloquial. No Latin letters except established
  abbreviations.

### Persian orthography (strict)

- Persian letters **ی** and **ک** only — never Arabic ي or ك. Persian digits are not needed.
- Zero-width non-joiner (U+200C) where standard: «می‌خواهم»، «کتاب‌ها»، «خانه‌ای»، «بی‌ادب».
- Ezafe on silent he as «هٔ»: «خانهٔ من».
- Persian punctuation: «،» «؛» «؟». No diacritics unless needed to disambiguate («گُل / گِل»).

### `en` — English glosses

1–3 concise learner glosses (≤ 5 words each), same senses and order as `fa`
("to study", not CC-CEDICT prose).

### `note` — optional, Persian, ≤ 25 words

Only when it truly helps: a later-level sense from `later` («در سطح ۴ قید هم هست: …»),
another reading the learner will meet, a separable verb («فعل جداشدنی: 见面 ← 见过面»),
the usual measure word, a classic confusion (二 / 两). Most words need no note.

### `ex` — example sentences

- Exactly **one** sentence; **two** for particles, measure words, prepositions and
  conjunctions (usage is the whole point of those).
- Must contain the headword, used in the glossed sense.
- Natural — something a native speaker would actually say. Length: levels 1–2:
  4–12 characters; levels 3–4: 6–18; levels 5–6: 8–26.
- Levels 1–4: build the sentence from words in `allowed`. Common proper names
  (小王、李老师、北京、中国) are fine. At most one other out-of-list word, only if unavoidable.
- `zh`: full-width Chinese punctuation (。？！，).
- `py`: tone marks; **syllables of one word joined, words separated by spaces**
  («Wǒ zài túshūguǎn xuéxí Hànyǔ.»); capital at sentence start and for proper
  nouns; ASCII punctuation. Apply the textbook sandhi for 不 and 一 only
  (bú shì, yí ge, yì tiān); write other syllables in citation tone (nǐ hǎo);
  neutral tone unmarked (xièxie, péngyou, de, le).
- `fa`: natural Persian (not word-for-word), full sentence with final punctuation.
- `en`: natural English.

## Before you write the file

Re-read each entry once: Does the gloss match the official reading and part of
speech? Could a learner produce the Chinese word from the Persian gloss alone?
Is the example correct Chinese with matching pinyin? Any ي/ك or missing ZWNJ?
