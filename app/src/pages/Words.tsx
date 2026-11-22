import { useMemo, useState } from 'preact/hooks';
import { findWord, loadLevel } from '../data/loader';
import type { Std, Word } from '../data/types';
import { t, type Key } from '../i18n';
import { href, route } from '../lib/router';
import { foldPinyin, normFa } from '../lib/text';
import { settings } from '../store/settings';
import { cardsForWords, cardKey } from '../store/srs';
import { AudioButton, BottomNav, En, ErrorBox, Fa, Py, Spinner, TopBar, useAsync, Zh } from '../ui/kit';
import { StrokeOrder } from '../ui/StrokeOrder';
import { enGloss, faGloss, MeaningSide, WordExtras, ZhSide } from '../ui/WordFace';

const PAGE = 80;

/** Case/diacritic-insensitive match on characters, pinyin, Persian and English. */
function matches(w: Word, q: string, qFa: string, qPy: string): boolean {
  if (w.s.includes(q) || (w.t?.includes(q) ?? false)) return true;
  if (qPy && foldPinyin(w.p).includes(qPy)) return true;
  if (qFa && w.fa.some((g) => normFa(g).includes(qFa))) return true;
  const ql = q.toLowerCase();
  return w.en.some((g) => g.toLowerCase().includes(ql));
}

export function Words() {
  const s = settings.value;
  const [q, setQ] = useState('');
  const [shown, setShown] = useState(PAGE);
  const state = useAsync(async () => {
    const pack = await loadLevel(s.std, s.level);
    const rows = await cardsForWords(pack.words, ['zf']);
    return { words: pack.words, rows };
  }, [s.std, s.level]);

  const filtered = useMemo(() => {
    const words = state.data?.words ?? [];
    const query = q.trim();
    if (!query) return words;
    const qFa = normFa(query);
    const qPy = foldPinyin(query);
    return words.filter((w) => matches(w, query, qFa, qPy));
  }, [state.data, q]);

  return (
    <div class="shell">
      <TopBar title={`${t('mod.words')} · ${t('level.hsk', { n: s.level })}`} backTo="" />
      <main class="page">
        <input
          class="input"
          type="search"
          value={q}
          placeholder={t('words.search')}
          aria-label={t('words.search')}
          onInput={(e) => {
            setQ((e.target as HTMLInputElement).value);
            setShown(PAGE);
          }}
        />
        {state.loading && !state.data && <Spinner />}
        {state.error !== undefined && <ErrorBox error={state.error} retry={state.reload} />}
        {state.data && (
          <>
            <div class="small muted">{t('words.count', { n: filtered.length })}</div>
            {filtered.length === 0 && <p class="center muted">{t('words.none')}</p>}
            <div class="list">
              {filtered.slice(0, shown).map((w) => {
                const st = state.data!.rows.get(cardKey(w.id, 'zf'))?.state;
                return (
                  <a key={w.id} class="wrow" href={href(`word/${s.std}/${w.id}`)}>
                    <span class={`dot${st === undefined ? '' : ` s${st}`}`} />
                    <Zh>{w.s}</Zh>
                    <span class="meta">
                      <Py class="small">{w.p}</Py>
                      {w.fa.length > 0 ? <Fa>{faGloss(w)}</Fa> : <En>{enGloss(w)}</En>}
                    </span>
                    <AudioButton text={w.s} file={w.a} />
                  </a>
                );
              })}
            </div>
            {filtered.length > shown && (
              <button type="button" class="btn" onClick={() => setShown((n) => n + PAGE * 2)}>
                +{' '}
                {t('words.count', { n: Math.min(PAGE * 2, filtered.length - shown) })}
              </button>
            )}
          </>
        )}
      </main>
      <BottomNav />
    </div>
  );
}

export function WordDetail() {
  const [, stdRaw, ...rest] = route.value.parts;
  const std = (stdRaw === 'hsk2' ? 'hsk2' : 'hsk3') as Std;
  const id = rest.join('/');
  const state = useAsync(() => findWord(std, id), [std, id]);
  const w = state.data;
  const other: Std = std === 'hsk3' ? 'hsk2' : 'hsk3';
  const chars = useMemo(() => (w ? [...new Set([...w.s])].filter((c) => /\p{Script=Han}/u.test(c)) : []), [w]);
  const [char, setChar] = useState<string>();
  const active = char && chars.includes(char) ? char : chars[0];

  return (
    <div class="shell">
      <TopBar title={t('words.detail')} backTo="words" />
      <main class="page no-nav">
        {state.loading && <Spinner />}
        {state.error !== undefined && <ErrorBox error={state.error} retry={state.reload} />}
        {!state.loading && !w && state.error === undefined && <p class="center muted">{t('words.none')}</p>}
        {w && (
          <>
            <section class="card fc" style={{ minHeight: 'auto' }}>
              <ZhSide word={w} pinyin />
              <hr />
              <MeaningSide word={w} />
              {/* English is always available on the detail page, whatever the card setting. */}
              {!settings.value.showEn && w.fa.length > 0 && w.en.length > 0 && <En class="gloss-en">{enGloss(w)}</En>}
              {w.lv?.[other] !== undefined && (
                <span class="chip">
                  {t('words.alsoIn', { std: t(`std.${other}` as Key), n: w.lv[other]! })}
                </span>
              )}
            </section>
            {(w.cl?.length || w.note || w.ex?.length) && (
              <section class="card">
                <WordExtras word={w} />
              </section>
            )}
            {active && (
              <section class="card col">
                <h2>{t('words.strokes')}</h2>
                {chars.length > 1 && (
                  <div class="seg" role="group" style={{ alignSelf: 'center' }}>
                    {chars.map((c) => (
                      <button key={c} type="button" aria-pressed={c === active} onClick={() => setChar(c)}>
                        <Zh>{c}</Zh>
                      </button>
                    ))}
                  </div>
                )}
                <StrokeOrder key={active} char={active} />
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
