import { useMemo, useState } from 'preact/hooks';
import { loadUpTo } from '../data/loader';
import type { Word } from '../data/types';
import { defineStrings, t } from '../i18n';
import { speak } from '../lib/audio';
import {
  indexBySimplified,
  queryKind,
  searchExamples,
  searchLatin,
  searchPersian,
  segment,
  type WordHit,
} from '../lib/lookup';
import { href } from '../lib/router';
import { settings } from '../store/settings';
import { Icon } from '../ui/Icon';
import { AudioButton, BottomNav, En, ErrorBox, Fa, Py, Segmented, Spinner, TopBar, useAsync, Zh } from '../ui/kit';
import { enGloss, ExampleRow, faGloss } from '../ui/WordFace';
import { ZhComposer } from '../ui/ZhComposer';

const tr = defineStrings({
  fa: {
    fa: 'فارسی ← چینی',
    zh: 'چینی ← فارسی',
    'ph.fa': 'واژه یا عبارت فارسی (یا انگلیسی / پین‌یین)…',
    'ph.zh': 'جملهٔ چینی را بنویسید',
    words: 'واژه‌ها',
    breakdown: 'واژه‌به‌واژه',
    examples: 'نمونه‌جمله‌ها',
    none: 'چیزی پیدا نشد',
    unknown: 'در واژه‌نامه نیست',
    speak: 'خواندن جمله',
    note: 'این بخش یک واژه‌نامه و عبارت‌یاب آفلاین است، نه مترجم ماشینی: واژه‌ها و نمونه‌جمله‌های HSK را جست‌وجو می‌کند.',
    level: 'سطح {n}',
  },
  en: {
    fa: 'Persian → Chinese',
    zh: 'Chinese → Persian',
    'ph.fa': 'A Persian word or phrase (or English / pinyin)…',
    'ph.zh': 'Write a Chinese sentence',
    words: 'Words',
    breakdown: 'Word by word',
    examples: 'Example sentences',
    none: 'Nothing found',
    unknown: 'not in the dictionary',
    speak: 'Read the sentence aloud',
    note: 'This is an offline dictionary and phrase finder, not machine translation: it searches the HSK words and example sentences.',
    level: 'Level {n}',
  },
});

type Dir = 'fa' | 'zh';

function WordRow({ word }: { word: Word }) {
  const s = settings.value;
  const std = word.lv?.[s.std] !== undefined ? s.std : word.lv?.hsk3 !== undefined ? 'hsk3' : 'hsk2';
  return (
    <a class="wrow" href={href(`word/${std}/${word.id}`)}>
      <Zh>{word.s}</Zh>
      <span class="meta">
        <Py class="small">{word.p}</Py>
        {word.fa.length > 0 ? <Fa>{faGloss(word)}</Fa> : <En>{enGloss(word)}</En>}
        {s.showEn && word.fa.length > 0 && <En class="small">{enGloss(word)}</En>}
      </span>
      {word.lv?.[std] !== undefined && <span class="chip">{tr('level', { n: word.lv[std]! })}</span>}
      <AudioButton text={word.s} file={word.a} />
    </a>
  );
}

/**
 * Persian <-> Chinese lookup that works fully offline: dictionary search in
 * both directions, word-by-word breakdown of Chinese sentences, and example
 * sentences from the bundled content.
 */
export function Translator() {
  const s = settings.value;
  const [dir, setDir] = useState<Dir>('fa');
  const [q, setQ] = useState('');
  const state = useAsync(() => loadUpTo(s.std, 99), [s.std]);
  const index = useMemo(() => indexBySimplified(state.data ?? []), [state.data]);

  const result = useMemo(() => {
    const words = state.data ?? [];
    const query = q.trim();
    if (!query || !words.length) return undefined;
    const kind = queryKind(query);
    const hits: WordHit[] = kind === 'fa' ? searchPersian(words, query) : kind === 'latin' ? searchLatin(words, query) : [];
    const tokens = kind === 'zh' ? segment(query, index) : [];
    return { kind, hits, tokens, examples: searchExamples(words, query) };
  }, [q, state.data, index]);

  const empty = result && !result.hits.length && !result.tokens.some((tk) => tk.words.length) && !result.examples.length;

  return (
    <div class="shell">
      <TopBar title={t('mod.translator')} backTo="" />
      <main class="page">
        <div class="center">
          <Segmented<Dir>
            value={dir}
            options={[
              { value: 'fa', label: tr('fa') },
              { value: 'zh', label: tr('zh') },
            ]}
            onChange={(d) => {
              setDir(d);
              setQ('');
            }}
          />
        </div>
        {dir === 'fa' ? (
          <input
            class="input"
            type="search"
            dir="auto"
            value={q}
            placeholder={tr('ph.fa')}
            aria-label={tr('ph.fa')}
            onInput={(e) => setQ((e.target as HTMLInputElement).value)}
          />
        ) : (
          <ZhComposer value={q} onChange={setQ} placeholder={tr('ph.zh')} />
        )}

        {state.loading && !state.data && <Spinner />}
        {state.error !== undefined && <ErrorBox error={state.error} retry={state.reload} />}
        {!result && <p class="small muted center">{tr('note')}</p>}
        {empty && <p class="center muted">{tr('none')}</p>}

        {result && result.tokens.length > 0 && (
          <section class="col">
            <div class="row">
              <h2 class="grow">{tr('breakdown')}</h2>
              <button type="button" class="iconbtn accent" aria-label={tr('speak')} onClick={() => void speak(q, 'zh')}>
                <Icon name="play" />
              </button>
            </div>
            <div class="list">
              {result.tokens
                .filter((tk) => /\p{Script=Han}/u.test(tk.text))
                .map((tk, i) =>
                  tk.words.length ? (
                    tk.words.map((w) => <WordRow key={`${i}/${w.id}`} word={w} />)
                  ) : (
                    <div key={i} class="wrow">
                      <Zh>{tk.text}</Zh>
                      <span class="meta small muted">{tr('unknown')}</span>
                    </div>
                  ),
                )}
            </div>
          </section>
        )}

        {result && result.hits.length > 0 && (
          <section class="col">
            <h2>{tr('words')}</h2>
            <div class="list">
              {result.hits.map((h) => (
                <WordRow key={h.word.id} word={h.word} />
              ))}
            </div>
          </section>
        )}

        {result && result.examples.length > 0 && (
          <section class="col">
            <h2>{tr('examples')}</h2>
            <div class="card">
              {result.examples.map((h) => (
                <ExampleRow key={h.ex.zh} ex={h.ex} />
              ))}
            </div>
          </section>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
