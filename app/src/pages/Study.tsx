import { useEffect, useRef, useState } from 'preact/hooks';
import { loadLevel } from '../data/loader';
import type { Dir } from '../data/types';
import { digits, interval, t, type Key } from '../i18n';
import { playZh, stopAudio } from '../lib/audio';
import { href } from '../lib/router';
import { setSettings, settings, type DirMode } from '../store/settings';
import {
  buildQueue,
  gradeItem,
  introducedToday,
  previewIntervals,
  Rating,
  State,
  type Grade,
  type StudyItem,
} from '../store/srs';
import { ErrorBox, Segmented, Spinner, TopBar, Zh } from '../ui/kit';
import { MeaningSide, WordExtras, ZhSide } from '../ui/WordFace';
import { dirsOf } from './Home';

const GRADES: { g: Grade; key: Key; cls: string }[] = [
  { g: Rating.Again, key: 'study.again', cls: 'g1' },
  { g: Rating.Hard, key: 'study.hard', cls: 'g2' },
  { g: Rating.Good, key: 'study.good', cls: 'g3' },
  { g: Rating.Easy, key: 'study.easy', cls: 'g4' },
];

type Phase = 'loading' | 'card' | 'done' | 'empty' | 'error';

/**
 * Flashcard session. Chinese -> Persian cards ask for the meaning; Persian ->
 * Chinese cards ask the learner to produce the word. Each direction has its
 * own FSRS schedule (see store/srs.ts).
 */
export function Study() {
  const s = settings.value;
  const [phase, setPhase] = useState<Phase>('loading');
  const [queue, setQueue] = useState<StudyItem[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [error, setError] = useState<unknown>();
  const [round, setRound] = useState(0);
  /** Extra new cards requested with "more new words" beyond the daily limit. */
  const [bonus, setBonus] = useState(0);
  const shownAt = useRef(Date.now());
  const busy = useRef(false);

  useEffect(() => {
    let live = true;
    setPhase('loading');
    (async () => {
      const pack = await loadLevel(s.std, s.level);
      const introduced = await introducedToday();
      const q = await buildQueue(pack.words, {
        std: s.std,
        level: s.level,
        dirs: dirsOf(s.dirMode),
        newLimit: Math.max(0, s.newPerDay - introduced) + bonus,
        reviewLimit: s.reviewsPerSession,
      });
      if (!live) return;
      setQueue(q);
      setRevealed(false);
      setPhase(q.length ? 'card' : 'empty');
    })().catch((e) => {
      if (!live) return;
      setError(e);
      setPhase('error');
    });
    return () => {
      live = false;
      stopAudio();
    };
  }, [s.std, s.level, s.dirMode, round, bonus]);

  const item = queue[0];

  // Audio: play when a Chinese side becomes visible (front of zh->fa, back of fa->zh).
  useEffect(() => {
    if (phase !== 'card' || !item) return;
    shownAt.current = revealed ? shownAt.current : Date.now();
    const zhVisible = item.dir === 'zf' ? !revealed : revealed;
    if (s.autoAudio && zhVisible) void playZh(item.word.s, item.word.a);
  }, [item, revealed, phase]);

  async function grade(g: Grade) {
    if (!item || busy.current) return;
    busy.current = true;
    try {
      const res = await gradeItem(item, g, {
        std: s.std,
        level: s.level,
        retention: s.retention,
        ms: Date.now() - shownAt.current,
      });
      const rest = queue.slice(1);
      // A card still in a learning step comes back later in this session,
      // a few cards further on so it is not answered from short-term echo.
      if (res.again) rest.splice(Math.min(rest.length, 6), 0, { ...item, row: res.row });
      setQueue(rest);
      setReviewed((n) => n + 1);
      setRevealed(false);
      if (!rest.length) setPhase('done');
    } catch (e) {
      setError(e);
      setPhase('error');
    } finally {
      busy.current = false;
    }
  }

  // Keyboard: space/enter reveals, 1-4 grade.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase !== 'card') return;
      if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        setRevealed(true);
      } else if (revealed && ['1', '2', '3', '4'].includes(e.key)) {
        void grade(Number(e.key) as Grade);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const dirOptions: { value: DirMode; label: string }[] = [
    { value: 'zf', label: t('study.dir.zf') },
    { value: 'fz', label: t('study.dir.fz') },
    { value: 'both', label: t('study.dir.both') },
  ];

  return (
    <div class="shell">
      <TopBar title={`${t('study.title')} · ${t('level.hsk', { n: s.level })}`} backTo="">
        {phase === 'card' && <span class="chip">{t('study.left', { n: queue.length })}</span>}
      </TopBar>
      <main class="page no-nav">
        <div class="center">
          <Segmented
            value={s.dirMode}
            options={dirOptions}
            onChange={(dirMode) => setSettings({ dirMode })}
            label={t('set.direction')}
          />
        </div>

        {phase === 'loading' && <Spinner />}
        {phase === 'error' && <ErrorBox error={error} retry={() => setRound((r) => r + 1)} />}

        {phase === 'empty' && (
          <div class="card col center">
            <p>{t('study.empty')}</p>
            <button type="button" class="btn primary" onClick={() => setBonus((b) => b + s.newPerDay)}>
              {t('study.empty.more')}
            </button>
            <a class="btn ghost" href={href('')}>
              {t('study.done.home')}
            </a>
          </div>
        )}

        {phase === 'done' && (
          <div class="card col center">
            <h2>{t('study.done.title')}</h2>
            <p>{t('study.done.body', { n: reviewed })}</p>
            <button
              type="button"
              class="btn primary"
              onClick={() => {
                setReviewed(0);
                setRound((r) => r + 1);
              }}
            >
              {t('study.done.more')}
            </button>
            <a class="btn ghost" href={href('')}>
              {t('study.done.home')}
            </a>
          </div>
        )}

        {phase === 'card' && item && (
          <Card key={`${item.word.id}#${item.dir}#${reviewed}`} item={item} revealed={revealed} dir={item.dir} />
        )}

        {phase === 'card' && item && (
          <div class="sticky-actions">
            {!revealed ? (
              <button type="button" class="btn primary block" onClick={() => setRevealed(true)}>
                {t('study.show')}
              </button>
            ) : (
              <GradeButtons item={item} onGrade={grade} />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function stateChip(item: StudyItem) {
  const st = item.row?.state ?? State.New;
  if (st === State.New) return <span class="chip new">{t('study.new')}</span>;
  if (st === State.Review) return <span class="chip ok">{t('study.review')}</span>;
  return <span class="chip warn">{t('study.learning')}</span>;
}

function Card({ item, revealed, dir }: { item: StudyItem; revealed: boolean; dir: Dir }) {
  const s = settings.value;
  const w = item.word;
  return (
    <section class="card fc" aria-live="polite">
      <div class="row wrap" style={{ justifyContent: 'center', gap: '6px' }}>
        {stateChip(item)}
        <span class="chip">{t(dir === 'zf' ? 'study.dir.zf' : 'study.dir.fz')}</span>
      </div>
      {dir === 'zf' ? (
        <>
          <ZhSide word={w} pinyin={s.pinyinOnFront || revealed} />
          {!revealed && <p class="small muted">{t('study.prompt.zf')}</p>}
          {revealed && (
            <>
              <hr />
              <MeaningSide word={w} />
            </>
          )}
        </>
      ) : (
        <>
          <MeaningSide word={w} />
          {!revealed && <p class="small muted">{t('study.prompt.fz')}</p>}
          {!revealed && w.amb && w.amb.length > 0 && (
            <p class="small muted">
              {t('study.amb')} <Zh>{w.amb.join('، ')}</Zh>
            </p>
          )}
          {revealed && (
            <>
              <hr />
              <ZhSide word={w} pinyin />
            </>
          )}
        </>
      )}
      {revealed && <WordExtras word={w} />}
      {revealed && w.fa.length > 0 && (w.q ?? 0) < 1 && <p class="tiny muted">{t('study.unverified')}</p>}
    </section>
  );
}

function GradeButtons({ item, onGrade }: { item: StudyItem; onGrade: (g: Grade) => void }) {
  const iv = previewIntervals(item, settings.value.retention);
  return (
    <div class="grades">
      {GRADES.map(({ g, key, cls }) => (
        <button key={g} type="button" class={cls} onClick={() => onGrade(g)}>
          <span>{t(key)}</span>
          <small>{interval(iv[g])}</small>
          <small aria-hidden="true">{digits(g)}</small>
        </button>
      ))}
    </div>
  );
}
