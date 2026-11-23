import { useEffect, useMemo, useState } from 'preact/hooks';
import { loadLevel, loadUpTo } from '../data/loader';
import type { Word } from '../data/types';
import { defineStrings, digits, t } from '../i18n';
import { playZh, stopAudio } from '../lib/audio';
import { indexBySimplified } from '../lib/lookup';
import { go, href, route } from '../lib/router';
import { normZh, shuffled } from '../lib/text';
import { settings } from '../store/settings';
import { Icon } from '../ui/Icon';
import { AudioButton, BottomNav, En, ErrorBox, Fa, Py, Segmented, Spinner, TopBar, useAsync, Zh } from '../ui/kit';
import { enGloss, faGloss } from '../ui/WordFace';
import { ZhComposer } from '../ui/ZhComposer';
import { buildItems, BuildRound } from './SentenceBuild';

const tr = defineStrings({
  fa: {
    zf: 'معنی',
    fz: 'واژه',
    listen: 'شنیداری',
    type: 'تایپ',
    build: 'جمله‌سازی',
    noSentences: 'برای این سطح هنوز نمونه‌جمله‌ای آماده نشده است.',
    'q.zf': 'معنی این واژه کدام است؟',
    'q.fz': 'کدام واژه این معنی را دارد؟',
    'q.listen': 'گوش کنید. کدام واژه را شنیدید؟',
    'q.type': 'این را به چینی بنویسید:',
    check: 'بررسی',
    next: 'بعدی',
    right: 'درست!',
    wrong: 'پاسخ درست:',
    score: '{n} از {m} درست',
    again: 'دور بعد',
    done: 'پایان آزمونک',
    few: 'برای این آزمونک واژهٔ کافی در این سطح نیست.',
    replay: 'پخش دوباره',
    progress: 'پرسش {n} از {m}',
  },
  en: {
    zf: 'Meaning',
    fz: 'Word',
    listen: 'Listening',
    type: 'Typing',
    build: 'Sentences',
    noSentences: 'No example sentences are available for this level yet.',
    'q.zf': 'What does this word mean?',
    'q.fz': 'Which word has this meaning?',
    'q.listen': 'Listen. Which word did you hear?',
    'q.type': 'Write this in Chinese:',
    check: 'Check',
    next: 'Next',
    right: 'Correct!',
    wrong: 'Correct answer:',
    score: '{n} of {m} correct',
    again: 'Next round',
    done: 'Quiz finished',
    few: 'This level does not have enough words for this quiz.',
    replay: 'Play again',
    progress: 'Question {n} of {m}',
  },
});

type Mode = 'zf' | 'fz' | 'listen' | 'type' | 'build';
const MODES: Mode[] = ['zf', 'fz', 'listen', 'type', 'build'];
const ROUND = 10;

/** Meaning shown to the learner: Persian when available, English otherwise. */
function Meaning({ word }: { word: Word }) {
  const showEn = settings.value.showEn;
  if (!word.fa.length) return <En>{enGloss(word)}</En>;
  return (
    <>
      <Fa>{faGloss(word)}</Fa>
      {showEn && word.en.length > 0 && (
        <>
          {' '}
          <En class="small">({enGloss(word)})</En>
        </>
      )}
    </>
  );
}

const meaningKey = (w: Word): string => (w.fa.length ? faGloss(w) : enGloss(w));

interface Question {
  word: Word;
  options: Word[];
}

/** Pick distractors that differ in form and meaning, same part of speech first. */
export function makeQuestions(pool: Word[], count: number, seed: number): Question[] {
  const targets = shuffled(pool, seed).slice(0, count);
  return targets.map((word, i) => {
    const others = shuffled(
      pool.filter((w) => w.s !== word.s && meaningKey(w) !== meaningKey(word)),
      seed + i + 1,
    );
    const samePos = others.filter((w) => w.pos?.[0] && w.pos[0] === word.pos?.[0]);
    const picked: Word[] = [];
    for (const w of [...samePos, ...others]) {
      if (picked.length === 3) break;
      if (!picked.some((p) => p.s === w.s || meaningKey(p) === meaningKey(w))) picked.push(w);
    }
    return { word, options: shuffled([word, ...picked], seed + 31 * (i + 1)) };
  });
}

export function Quiz() {
  const s = settings.value;
  const first = route.value.parts[0];
  const requested = route.value.query.mode as Mode | undefined;
  const mode: Mode = requested && MODES.includes(requested) ? requested : first === 'listening' ? 'listen' : 'zf';
  const [round, setRound] = useState(1);
  const state = useAsync(() => loadLevel(s.std, s.level), [s.std, s.level]);
  // Sentence tiles are cut with every word the learner knows up to this level.
  const known = useAsync(() => (mode === 'build' ? loadUpTo(s.std, s.level) : Promise.resolve([])), [s.std, s.level, mode]);

  const questions = useMemo(() => {
    const words = state.data?.words ?? [];
    if (mode === 'build') return [];
    const pool = mode === 'listen' ? words.filter((w) => w.a) : words;
    return pool.length >= 4 ? makeQuestions(pool, ROUND, round * 7919 + s.level) : [];
  }, [state.data, mode, round]);

  const sentences = useMemo(() => {
    if (mode !== 'build' || !state.data || !known.data?.length) return [];
    return buildItems(state.data.words, indexBySimplified(known.data), 8, round * 104729 + s.level);
  }, [state.data, known.data, mode, round]);

  return (
    <div class="shell">
      <TopBar title={`${t('mod.quiz')} · ${t('level.hsk', { n: s.level })}`} backTo="" />
      <main class="page">
        <div class="center">
          <Segmented<Mode>
            value={mode}
            options={MODES.map((m) => ({ value: m, label: tr(m) }))}
            onChange={(m) => go('quiz', { mode: m })}
          />
        </div>
        {state.loading && !state.data && <Spinner />}
        {state.error !== undefined && <ErrorBox error={state.error} retry={state.reload} />}
        {mode === 'build' && known.loading && <Spinner />}
        {mode === 'build' && state.data && !known.loading && sentences.length === 0 && (
          <p class="card center muted">{tr('noSentences')}</p>
        )}
        {mode === 'build' && sentences.length > 0 && (
          <BuildRound key={`build/${round}/${s.std}/${s.level}`} items={sentences} onAgain={() => setRound((r) => r + 1)} />
        )}
        {mode !== 'build' && state.data && questions.length === 0 && <p class="card center muted">{tr('few')}</p>}
        {mode !== 'build' && questions.length > 0 && (
          <Round key={`${mode}/${round}/${s.std}/${s.level}`} mode={mode} questions={questions} onAgain={() => setRound((r) => r + 1)} />
        )}
      </main>
      <BottomNav />
    </div>
  );
}

function Round({
  mode,
  questions,
  onAgain,
}: {
  mode: Exclude<Mode, 'build'>;
  questions: Question[];
  onAgain: () => void;
}) {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<Word | 'typed'>();
  const [typed, setTyped] = useState('');
  const [score, setScore] = useState(0);
  const q = questions[i];
  const done = i >= questions.length;

  useEffect(() => {
    if (!done && mode === 'listen') void playZh(q.word.s, q.word.a);
    return stopAudio;
  }, [i, done]);

  if (done) {
    return (
      <div class="card col center">
        <h2>{tr('done')}</h2>
        <p style={{ fontSize: '1.4rem', fontWeight: 800 }}>{tr('score', { n: score, m: questions.length })}</p>
        <button type="button" class="btn primary" onClick={onAgain}>
          {tr('again')}
        </button>
        <a class="btn ghost" href={href('')}>
          {t('study.done.home')}
        </a>
      </div>
    );
  }

  const answered = picked !== undefined;
  // A typed answer is right if it is the word or another word with the very same Persian gloss.
  const typedOk = () => [q.word.s, ...(q.word.amb ?? [])].some((s) => normZh(typed) === normZh(s));
  const correct = picked === 'typed' ? typedOk() : picked === q.word;

  function answer(choice: Word | 'typed') {
    if (answered) return;
    setPicked(choice);
    const ok = choice === 'typed' ? typedOk() : choice === q.word;
    if (ok) setScore((n) => n + 1);
    if (mode !== 'listen' && settings.value.autoAudio) void playZh(q.word.s, q.word.a);
  }

  function next() {
    setPicked(undefined);
    setTyped('');
    setI((n) => n + 1);
  }

  const zhOptions = mode === 'fz' || mode === 'listen';

  return (
    <>
      <div class="row">
        <span class="small muted grow">{tr('progress', { n: i + 1, m: questions.length })}</span>
        <span class="chip ok">{digits(score)}</span>
      </div>
      <section class="card fc" style={{ minHeight: '24dvh' }}>
        <p class="small muted">{tr(`q.${mode}`)}</p>
        {mode === 'zf' && (
          <>
            <Zh class={`hanzi${[...q.word.s].length > 4 ? ' long' : ''}`}>{q.word.s}</Zh>
            {(settings.value.pinyinOnFront || answered) && <Py class="pinyin">{q.word.p}</Py>}
            <AudioButton text={q.word.s} file={q.word.a} accent />
          </>
        )}
        {(mode === 'fz' || mode === 'type') && (
          <div class="gloss">
            <Meaning word={q.word} />
          </div>
        )}
        {mode === 'listen' && (
          <button
            type="button"
            class="btn"
            onClick={() => void playZh(q.word.s, q.word.a)}
            aria-label={tr('replay')}
          >
            <Icon name="play" />
            {tr('replay')}
          </button>
        )}
      </section>

      {mode === 'type' ? (
        !answered && (
          <ZhComposer value={typed} onChange={setTyped} onSubmit={() => answer('typed')} submitLabel={tr('check')} />
        )
      ) : (
        <div class={`choices${zhOptions ? ' two' : ''}`}>
          {q.options.map((o) => {
            const cls = !answered ? '' : o === q.word ? ' right' : o === picked ? ' wrong' : '';
            return (
              <button key={o.id} type="button" class={`choice${cls}`} disabled={answered} onClick={() => answer(o)}>
                {zhOptions ? <Zh>{o.s}</Zh> : <Meaning word={o} />}
              </button>
            );
          })}
        </div>
      )}

      {answered && (
        <div class="card col" role="status">
          <div class="row">
            <span class={`chip ${correct ? 'ok' : 'due'}`}>{correct ? tr('right') : tr('wrong')}</span>
            <span class="grow">
              <Zh>{q.word.s}</Zh> <Py class="small">{q.word.p}</Py>
            </span>
            <AudioButton text={q.word.s} file={q.word.a} />
          </div>
          <div>
            <Meaning word={q.word} />
          </div>
          <button type="button" class="btn primary block" onClick={next} autoFocus>
            {tr('next')}
          </button>
        </div>
      )}
    </>
  );
}
