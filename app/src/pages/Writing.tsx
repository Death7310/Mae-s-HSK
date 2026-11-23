import { useMemo, useState } from 'preact/hooks';
import { loadLevel, loadUpTo } from '../data/loader';
import type { Word } from '../data/types';
import { defineStrings, t } from '../i18n';
import { kvGet, kvSet } from '../store/db';
import { settings } from '../store/settings';
import { Icon } from '../ui/Icon';
import { AudioButton, BottomNav, ErrorBox, Fa, En, Py, Segmented, Spinner, TopBar, useAsync, Zh } from '../ui/kit';
import { StrokeOrder } from '../ui/StrokeOrder';
import { enGloss, faGloss } from '../ui/WordFace';

const tr = defineStrings({
  fa: {
    write: 'نویسه‌های نوشتنی',
    read: 'نویسه‌های خواندنی',
    'write.desc': 'نویسه‌هایی که در این سطح باید بتوانید با دست بنویسید',
    'read.desc': 'نویسه‌هایی که در این سطح باید بتوانید بخوانید',
    done: 'تمرین شد',
    mark: 'تمرین کردم',
    prev: 'قبلی',
    next: 'بعدی',
    in: 'در واژه‌های',
    none: 'برای این سطح فهرست نویسه‌ای وجود ندارد.',
    count: '{n} نویسه',
  },
  en: {
    write: 'Handwriting characters',
    read: 'Recognition characters',
    'write.desc': 'Characters you should be able to write by hand at this level',
    'read.desc': 'Characters you should be able to read at this level',
    done: 'Practised',
    mark: 'Mark as practised',
    prev: 'Previous',
    next: 'Next',
    in: 'Used in',
    none: 'There is no character list for this level.',
    count: '{n} characters',
  },
});

interface CharLists {
  read: string[];
  write: string[];
}

type Kind = keyof CharLists;

async function loadChars(std: string, level: number): Promise<CharLists> {
  if (std === 'hsk3') {
    const r = await fetch(`${import.meta.env.BASE_URL}data/hsk3/chars-${level}.json`);
    if (r.ok) return (await r.json()) as CharLists;
  }
  // HSK 2.0 has no official character list: derive one from the level's words.
  const pack = await loadLevel(std as 'hsk2', level);
  const chars = [...new Set(pack.words.flatMap((w) => [...w.s]))].filter((c) => /\p{Script=Han}/u.test(c));
  return { read: chars, write: chars };
}

const doneKey = 'writing.done';

/**
 * Character practice on the official per-level lists: stroke-order animation
 * and stroke-by-stroke tracing with feedback.
 */
export function Writing() {
  const s = settings.value;
  const [kind, setKind] = useState<Kind>('write');
  const [index, setIndex] = useState<number>();
  const [done, setDone] = useState<Set<string>>(new Set());
  const state = useAsync(async () => {
    const [chars, words, stored] = await Promise.all([
      loadChars(s.std, s.level),
      loadUpTo(s.std, s.level),
      kvGet<string[]>(doneKey).catch(() => undefined),
    ]);
    setDone(new Set(stored ?? []));
    return { chars, words };
  }, [s.std, s.level]);

  const list = state.data?.chars[kind] ?? [];
  const char = index !== undefined ? list[index] : undefined;

  const related = useMemo(() => {
    if (!char || !state.data) return { self: undefined as Word | undefined, words: [] as Word[] };
    const words = state.data.words.filter((w) => w.s.includes(char));
    return { self: words.find((w) => w.s === char), words: words.filter((w) => w.s !== char).slice(0, 6) };
  }, [char, state.data]);

  function toggleDone(c: string) {
    const nextSet = new Set(done);
    if (nextSet.has(c)) nextSet.delete(c);
    else nextSet.add(c);
    setDone(nextSet);
    void kvSet(doneKey, [...nextSet]).catch(() => undefined);
  }

  return (
    <div class="shell">
      <TopBar title={`${t('mod.writing')} · ${t('level.hsk', { n: s.level })}`} backTo="" />
      <main class="page">
        <div class="center">
          <Segmented<Kind>
            value={kind}
            options={[
              { value: 'write', label: tr('write') },
              { value: 'read', label: tr('read') },
            ]}
            onChange={(k) => {
              setKind(k);
              setIndex(undefined);
            }}
          />
        </div>
        <p class="small muted center">
          {tr(`${kind}.desc`)} · {tr('count', { n: list.length })}
        </p>
        {state.loading && !state.data && <Spinner />}
        {state.error !== undefined && <ErrorBox error={state.error} retry={state.reload} />}
        {state.data && list.length === 0 && <p class="card center muted">{tr('none')}</p>}

        {char && index !== undefined && (
          <section class="card col">
            <div class="row">
              <button type="button" class="iconbtn" aria-label={tr('prev')} disabled={index === 0} onClick={() => setIndex(index - 1)}>
                <Icon name="back" flip />
              </button>
              <div class="grow center">
                {related.self ? (
                  <>
                    <Py>{related.self.p}</Py>{' '}
                    {related.self.fa.length ? <Fa>{faGloss(related.self)}</Fa> : <En>{enGloss(related.self)}</En>}
                  </>
                ) : (
                  <Zh>{char}</Zh>
                )}
              </div>
              {related.self && <AudioButton text={char} file={related.self.a} />}
              <button
                type="button"
                class="iconbtn"
                aria-label={tr('next')}
                disabled={index >= list.length - 1}
                onClick={() => setIndex(index + 1)}
              >
                <Icon name="chevron" flip />
              </button>
            </div>
            <StrokeOrder key={char} char={char} />
            {related.words.length > 0 && (
              <div class="small">
                <span class="muted">{tr('in')}: </span>
                {related.words.map((w, i) => (
                  <span key={w.id}>
                    {i > 0 && '، '}
                    <Zh>{w.s}</Zh>
                  </span>
                ))}
              </div>
            )}
            <button type="button" class={`btn${done.has(char) ? '' : ' primary'}`} onClick={() => toggleDone(char)}>
              <Icon name="check" />
              {done.has(char) ? tr('done') : tr('mark')}
            </button>
          </section>
        )}

        <div class="chargrid">
          {list.map((c, i) => (
            <button
              key={c}
              type="button"
              lang="zh-Hans"
              class={`zh${done.has(c) ? ' done' : ''}`}
              aria-pressed={i === index}
              onClick={() => {
                setIndex(i);
                window.scrollTo({ top: 0 });
              }}
            >
              {c}
            </button>
          ))}
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
