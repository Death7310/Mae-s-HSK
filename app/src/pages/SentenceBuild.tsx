import { useMemo, useState } from 'preact/hooks';
import type { Example, Word } from '../data/types';
import { defineStrings, digits, t } from '../i18n';
import { playZh } from '../lib/audio';
import { segment } from '../lib/lookup';
import { href } from '../lib/router';
import { normZh, shuffled } from '../lib/text';
import { settings } from '../store/settings';
import { AudioButton, En, Fa, Py, Zh } from '../ui/kit';

const tr = defineStrings({
  fa: {
    prompt: 'این جمله را با چیدن واژه‌ها به چینی بسازید:',
    check: 'بررسی',
    next: 'بعدی',
    right: 'درست!',
    wrong: 'پاسخ درست:',
    clear: 'از نو',
    score: '{n} از {m} درست',
    done: 'پایان تمرین',
    again: 'دور بعد',
    progress: 'جملهٔ {n} از {m}',
    tiles: 'واژه‌ها',
    answer: 'جملهٔ شما',
  },
  en: {
    prompt: 'Build this sentence in Chinese by arranging the words:',
    check: 'Check',
    next: 'Next',
    right: 'Correct!',
    wrong: 'Correct answer:',
    clear: 'Reset',
    score: '{n} of {m} correct',
    done: 'Practice finished',
    again: 'Next round',
    progress: 'Sentence {n} of {m}',
    tiles: 'Words',
    answer: 'Your sentence',
  },
});

export interface BuildItem {
  ex: Example;
  /** The sentence cut into word tiles, in the right order. */
  tiles: string[];
}

/**
 * Sentences usable for the builder: 3-9 tiles after dictionary segmentation.
 * Shorter ones are trivial, longer ones are unmanageable on a phone screen.
 */
export function buildItems(words: Word[], index: Map<string, Word[]>, count: number, seed: number): BuildItem[] {
  const seen = new Set<string>();
  const items: BuildItem[] = [];
  for (const w of shuffled(words, seed)) {
    for (const ex of w.ex ?? []) {
      if (!ex.fa || seen.has(ex.zh)) continue;
      const tiles = segment(ex.zh, index)
        .map((tk) => tk.text)
        .filter((x) => /\p{Script=Han}|[A-Za-z0-9]/u.test(x));
      if (tiles.length < 3 || tiles.length > 9) continue;
      seen.add(ex.zh);
      items.push({ ex, tiles });
      break;
    }
    if (items.length >= count) break;
  }
  return items;
}

/** Sentence-building round: the Persian sentence is the prompt, word tiles the answer. */
export function BuildRound({ items, onAgain }: { items: BuildItem[]; onAgain: () => void }) {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number[]>([]);
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState(0);
  const item = items[i];
  // Shuffle once per sentence; tiles are identified by their index in this order.
  const order = useMemo(() => (item ? shuffled(item.tiles.map((_, k) => k), i * 131 + item.tiles.length) : []), [i]);

  if (!item) {
    return (
      <div class="card col center">
        <h2>{tr('done')}</h2>
        <p style={{ fontSize: '1.4rem', fontWeight: 800 }}>{tr('score', { n: score, m: items.length })}</p>
        <button type="button" class="btn primary" onClick={onAgain}>
          {tr('again')}
        </button>
        <a class="btn ghost" href={href('')}>
          {t('study.done.home')}
        </a>
      </div>
    );
  }

  const answer = picked.map((k) => item.tiles[k]).join('');
  const correct = normZh(answer) === normZh(item.ex.zh);

  function check() {
    setChecked(true);
    if (correct) setScore((n) => n + 1);
    void playZh(item.ex.zh, item.ex.a);
  }

  function next() {
    setPicked([]);
    setChecked(false);
    setI((n) => n + 1);
  }

  return (
    <>
      <div class="row">
        <span class="small muted grow">{tr('progress', { n: i + 1, m: items.length })}</span>
        <span class="chip ok">{digits(score)}</span>
      </div>
      <section class="card col">
        <p class="small muted">{tr('prompt')}</p>
        <Fa class="gloss">{item.ex.fa}</Fa>
        {settings.value.showEn && item.ex.en && <En class="small">{item.ex.en}</En>}
        <div class="tiles answer" role="list" aria-label={tr('answer')}>
          {picked.map((k, pos) => (
            <button
              key={k}
              type="button"
              class="zh"
              lang="zh-Hans"
              disabled={checked}
              onClick={() => setPicked(picked.filter((_, p) => p !== pos))}
            >
              {item.tiles[k]}
            </button>
          ))}
        </div>
      </section>

      {!checked && (
        <>
          <div class="tiles" role="list" aria-label={tr('tiles')}>
            {order.map((k) => (
              <button
                key={k}
                type="button"
                class="zh"
                lang="zh-Hans"
                disabled={picked.includes(k)}
                onClick={() => setPicked([...picked, k])}
              >
                {item.tiles[k]}
              </button>
            ))}
          </div>
          <div class="row">
            <button type="button" class="btn" disabled={!picked.length} onClick={() => setPicked([])}>
              {tr('clear')}
            </button>
            <button
              type="button"
              class="btn primary grow"
              disabled={picked.length !== item.tiles.length}
              onClick={check}
            >
              {tr('check')}
            </button>
          </div>
        </>
      )}

      {checked && (
        <div class="card col" role="status">
          <div class="row">
            <span class={`chip ${correct ? 'ok' : 'due'}`}>{correct ? tr('right') : tr('wrong')}</span>
            <span class="grow" />
            <AudioButton text={item.ex.zh} file={item.ex.a} />
          </div>
          <Zh class="gram-pattern">{item.ex.zh}</Zh>
          {item.ex.py && <Py>{item.ex.py}</Py>}
          <button type="button" class="btn primary block" onClick={next} autoFocus>
            {tr('next')}
          </button>
        </div>
      )}
    </>
  );
}
