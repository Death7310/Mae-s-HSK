# Mae's HSK — چینی برای فارسی‌زبانان

An offline, standalone app for learning Chinese (HSK levels 1–6) **through
Persian (Farsi)**, with English as an optional intermediary language. The
interface is Persian and right-to-left; every level is a separate pack, so a
learner can work on level 3 or level 4 alone.

It runs as an installable web app (PWA) and as an Android app (APK). After the
first load it needs no network: word lists, audio, stroke data and the Chinese
keyboard all ship with it.

## What is in the app

| Module | What it does |
| --- | --- |
| Flashcards | Spaced repetition (FSRS). Chinese → Persian and Persian → Chinese are separate cards with separate schedules; English can be shown alongside. |
| Word list | Every word of the level; search by characters, pinyin, Persian or English. |
| Word page | Recording, pinyin, Persian and English meaning, part of speech, usage note, example sentence, stroke-order animation and tracing practice. |
| Quiz | Meaning, word, listening, typing and sentence-building rounds. |
| Handwriting | The official per-level handwriting and recognition character lists with stroke-by-stroke practice. |
| Dialogues | Scripted conversations with audio; in role-play the learner types the Chinese line and is checked against accepted answers. |
| Pinyin keyboard | Built in: type `nihao`, pick 你好. No Chinese keyboard needed on the device. |
| Dictionary / phrase finder | Persian ⇄ Chinese lookup, word-by-word breakdown of Chinese sentences, example-sentence search. |
| Grammar | The official grammar points of the level explained in Persian for Persian speakers, with examples. |
| Backup | Export / import of all progress as a file. |

## Which HSK?

Two standards are selectable; the level packs are separate for each.

- **New HSK (3.0)** — the exam syllabus published in November 2025, examined from
  December 2026: 300 / 200 / 500 / 1,000 / 1,600 / 1,800 new words for levels 1–6
  (5,400 in total). This is the default. Levels 7–9 share one 5,600-word list in
  the syllabus and are not built yet.
- **Old HSK (2.0)** — the 2012 revision: 150 / 151 / 300 / 600 / 1,300 / 2,500
  words (5,000 in total), for learners using older textbooks.

A word that is in both standards is one entry with one review history.

## Content status

Run `python3 tools/content_status.py` for the current numbers.

| | New HSK 1 | 2 | 3 | 4 | 5 | 6 |
| --- | --- | --- | --- | --- | --- | --- |
| Words (official list, pinyin, part of speech) | 300 | 200 | 500 | 1,000 | 1,600 | 1,800 |
| Persian meaning, note, example sentence | all, reviewed | all, reviewed | all, reviewed | all, reviewed | not yet | not yet |
| Human recording | 278 | 175 | 455 | 836 | 1,355 | 1,374 |
| Dialogues (reviewed) | 10 | 10 | 10 | 10 | – | – |
| Grammar lessons (reviewed) | 70 | 78 | not yet | not yet | – | – |

- Levels 1-2 were written by the stronger model (about 5% of entries corrected in
  review); levels 3-4 by a cheaper model (about 22% corrected in review, some of
  them real sense errors). The review pass fixed what it found, but levels 3-4
  should get a second review pass and are where a native proofread matters most.
- Words not yet authored (levels 5-6, and the 1,820 words that exist only in old
  HSK 2.0) show their English gloss instead of Persian.
- Old HSK levels 1-4 are almost fully covered by the work above, because nearly
  all of their words are also in new HSK levels 1-4.
- Words without a human recording use the device's own Mandarin voice when one
  is installed.

### How the Persian content is made

There is no open Chinese–Persian HSK dictionary to build on, so the Persian
content is written for this app, by language models, in two independent passes:

1. an author writes glosses, notes and example sentences from the official
   reading and part of speech of each word (`tools/content/WORD_GUIDE.md`);
2. automatic checks flag orthography problems, pinyin that disagrees with the
   characters, and example sentences that use words above the level;
3. a second, independent reviewer checks every entry and writes corrections
   (`tools/content/VERIFY_GUIDE.md`); corrections are kept as patches under
   `data/content/staging/` with the reason for each change.

This catches most errors but **it is not a substitute for a native-speaker
proofread**. Entries carry a quality flag (`q`: 0 unreviewed, 1 reviewed by the
second pass, 2 confirmed by a human). Treat the content as a carefully checked
draft until a Persian-speaking Chinese teacher has gone through it.

## Installing

**Android** — every build on GitHub Actions ("Build app" workflow) produces
`mae-hsk-<n>.apk` as a downloadable artifact. Copy it to the phone and open it
(allow "install unknown apps"). It is a debug-signed build: see *Known limits*.

**Web / iPhone / desktop** — the same workflow produces `mae-hsk-web`, a folder
of static files. Host it on any static web server (GitHub Pages works), open it
once, then "Add to Home Screen" / "Install". In *Settings → Offline use*,
download the audio of your level.

## Repository layout

```
app/                 the app (Preact + TypeScript + Vite; PWA; Capacitor for Android)
  src/               code: pages/, ui/, lib/, store/, i18n/
  public/data/       generated data packs (built by tools/build_data.py)
  public/audio/      recordings (built by tools/build_audio.py)
  tests/             unit tests (vitest) and an end-to-end smoke test (Playwright)
data/
  raw/               downloaded open datasets (tools/fetch_sources.py)
  content/           authored content: words/, dialogues/, grammar/, staging/
tools/               the data pipeline (Python) and authoring guides
```

## Working on it

```bash
cd app
npm ci
npm run dev            # development server
npm test               # unit tests
npm run build          # production PWA in app/dist
node tests/e2e/smoke.mjs   # end-to-end test against the build (needs Playwright)
npm run build:native   # bundle for the Android app
```

Rebuilding data (Python 3.11+, `pip install pypinyin`):

```bash
python3 tools/fetch_sources.py     # download the open datasets into data/raw
python3 tools/make_batches.py      # split the word list into authoring batches
python3 tools/check_content.py     # automatic checks on authored batches
python3 tools/merge_content.py     # staging -> data/content/words
python3 tools/build_audio.py PATH/TO/audio-cmn/64k
python3 tools/build_data.py        # everything -> app/public/data
```

## Sources and licences

| Source | Used for | Licence |
| --- | --- | --- |
| [ofou/hsk](https://github.com/ofou/hsk) | 2025 HSK syllabus: words, official pinyin and parts of speech, character lists | MIT (data mirror of the official query system) |
| [glxxyz/hskhsk.com](https://github.com/glxxyz/hskhsk.com) | HSK 2.0 lists, 2012 revision | MIT |
| [drkameleon/complete-hsk-vocabulary](https://github.com/drkameleon/complete-hsk-vocabulary) | frequency ranks, classifiers, CC-CEDICT readings | MIT |
| [CC-CEDICT](https://www.mdbg.net/chinese/dictionary?page=cc-cedict) | English reference glosses | CC BY-SA 4.0 |
| [hugolpz/audio-cmn](https://github.com/hugolpz/audio-cmn) | word recordings (Yue Tan, Shtooka) and syllable recordings (Chen Wang) | CC BY-SA |
| [Make Me a Hanzi](https://github.com/skishore/makemeahanzi) via hanzi-writer-data | stroke-order data | Arphic Public License |
| [Hanzi Writer](https://github.com/chanind/hanzi-writer), [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs), [Preact](https://preactjs.com) | stroke animation, scheduling, UI | MIT |
| [Vazirmatn](https://github.com/rastikerdar/vazirmatn) | Persian typeface | SIL OFL 1.1 |

Because CC BY-SA material is bundled (CC-CEDICT, audio-cmn), the app's data
must stay under a compatible share-alike licence and keep the attributions
shown on the About screen.

**Deliberately not included:** commercial textbooks and their audio (e.g. *HSK
Standard Course*), and the official sample papers — they are copyrighted and
not redistributable, even though copies circulate online.

## Known limits

- **Persian content needs a native proofread** (see above).
- **No machine translation.** The "translator" is an offline dictionary and
  phrase finder. Real Persian ⇄ Chinese sentence translation needs a
  translation model pack (hundreds of megabytes) that has not been evaluated or
  bundled yet.
- **About 18% of words have no human recording** (mostly modern vocabulary:
  手机, 超市 …). They fall back to the device voice.
- **The APK is debug-signed.** Each CI build is signed with a throw-away key,
  so installing a newer build over an older one can fail until the old one is
  uninstalled — export a backup first (*Settings → Back up progress*). A fixed
  signing key fixes this.
- Levels 7–9 and a tone-pair listening trainer are not built yet.
