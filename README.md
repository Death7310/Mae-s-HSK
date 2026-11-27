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

This table is generated from the built data (`python3 tools/status_md.py`).
"With Persian" counts words that have a Persian meaning, note and example
sentence; "Reviewed" counts those that also passed the independent second pass.

<!-- status:start -->
| Level | Words | With Persian | Reviewed | Human audio | Dialogues | Grammar lessons |
| --- | --- | --- | --- | --- | --- | --- |
| New HSK 1 | 300 | 300 | 300 | 278 | 10 | 70 |
| New HSK 2 | 200 | 200 | 200 | 175 | 10 | 78 |
| New HSK 3 | 500 | 500 | 500 | 455 | 10 | 96 |
| New HSK 4 | 1,000 | 1,000 | 1,000 | 836 | 10 | 95 |
| New HSK 5 | 1,600 | 1,600 | 1,600 | 1,355 | 10 | 70 |
| New HSK 6 | 1,800 | 1,800 | 1,800 | 1,374 | 10 | 50 |
| Old HSK 1 | 150 | 150 | 150 | 143 | | |
| Old HSK 2 | 151 | 151 | 151 | 139 | | |
| Old HSK 3 | 300 | 300 | 300 | 285 | | |
| Old HSK 4 | 600 | 600 | 600 | 560 | | |
| Old HSK 5 | 1,300 | 1,183 | 1,183 | 1,186 | | |
| Old HSK 6 | 2,500 | 837 | 837 | 2,123 | | |
<!-- status:end -->

- Old HSK dialogues and grammar reuse the new-HSK content of the same level number.
- Levels 1-2 and level 6 were written by the strongest model (about 5% and 8% of
  entries corrected in review). Levels 3-5 were written by a cheaper model and
  reviewed by a stronger one, which corrected 20-30% of entries, some of them
  real sense errors. The review fixed what it found, but levels 3-5 deserve a
  second review pass and are where a native proofread matters most.
- No entry has been checked by a person yet. `data/content/NATIVE_CHECK.md`
  lists the items the authors and reviewers were least sure of.
- Words without Persian yet show their English gloss instead.
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
(allow "install unknown apps"). How builds are signed, and what that means for
updating: *Signing the Android app*.

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
  economy/           token-economy method, context guard and usage ledger
CLAUDE.md            standing rules for Claude Code sessions on this repository
.claude/             Claude Code settings (the context-warning hook)
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

### Continuing the Persian content

Authoring is resumable at any time; nothing depends on a particular session.

1. `python3 tools/content_status.py` shows what is authored and reviewed;
   `python3 tools/content_status.py --pending hsk3-L6` prints the batches of a
   group that still need work, as JSON.
2. Authors follow `tools/content/WORD_GUIDE.md` and write
   `data/content/staging/<batch>.gen.json`; reviewers follow
   `tools/content/VERIFY_GUIDE.md` and write `<batch>.ver.json` (corrections only).
   `tools/workflows/` holds the orchestration scripts used to run these two
   passes with language-model agents (one author and one independent reviewer per
   batch), and the equivalents for dialogues and grammar.
3. `python3 tools/merge_content.py && python3 tools/build_data.py && python3 tools/status_md.py`
   publishes the result into the app and refreshes the table above.

### Working on it with Claude Code

The repository carries its own rules for AI-assisted sessions, so they apply in
every session without being repeated:

- [`CLAUDE.md`](CLAUDE.md) holds the standing rules, including the token-economy
  rules. Claude Code loads it at the start of every session.
- [`tools/economy/README.md`](tools/economy/README.md) is the method behind those
  rules: what costs tokens, how to size multi-agent workflows (Ultracode), when
  a conversation is too long, and a ledger of what sessions actually cost.
- A hook in `.claude/settings.json` runs `tools/economy/context_guard.py` on
  every prompt and warns when the conversation has grown long enough that a new
  session is cheaper.

### Signing the Android app

Android installs an update over an app only when both are signed with the same
key. CI signs every APK with the project key, `app/signing/mae-hsk.p12`
(`app/signing/sign-apk.sh`), and checks the result against
`app/signing/cert-sha256.txt`.

- The key file is encrypted (AES-256) with a 32-character random password. The
  password is not in the repository: it is the repository secret
  `ANDROID_KEYSTORE_PASSWORD` (*Settings → Secrets and variables → Actions*).
- Without the secret (a fork, or before it is set) the build still succeeds and
  shows a warning; that APK is signed with a key made for that one build and
  does not install over other builds.
- Keep a copy of the password outside GitHub, because a secret cannot be read
  back. If it is lost, a new key has to be made and every user reinstalls once.
- The first build signed with the project key does not install over an older
  build: back up (*Settings → Back up progress*), uninstall, install, restore.

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
- **Updating needs the signing secret.** Until the repository secret
  `ANDROID_KEYSTORE_PASSWORD` is set, each build is signed with a throw-away
  key and does not install over another build (see *Signing the Android app*).
  The APK is a debug build and is not on an app store.
- Levels 7–9 and a tone-pair listening trainer are not built yet.
