import { useState } from 'preact/hooks';
import { loadGrammar } from '../data/loader';
import { defineStrings, t } from '../i18n';
import { settings } from '../store/settings';
import { BottomNav, En, ErrorBox, Fa, Spinner, TopBar, useAsync, Zh } from '../ui/kit';
import { ExampleRow } from '../ui/WordFace';

const tr = defineStrings({
  fa: {
    none: 'برای این سطح هنوز درس دستور زبان آماده نشده است.',
    count: '{n} الگو',
  },
  en: {
    none: 'No grammar notes are available for this level yet.',
    count: '{n} patterns',
  },
});

/** Grammar points of the level: pattern, Persian explanation, examples. */
export function Grammar() {
  const s = settings.value;
  const [open, setOpen] = useState<string>();
  const state = useAsync(() => loadGrammar(s.std, s.level), [s.std, s.level]);
  const points = state.data ?? [];

  return (
    <div class="shell">
      <TopBar title={`${t('mod.grammar')} · ${t('level.hsk', { n: s.level })}`} backTo="" />
      <main class="page">
        {state.loading && !state.data && <Spinner />}
        {state.error !== undefined && <ErrorBox error={state.error} retry={state.reload} />}
        {state.data && points.length === 0 && <p class="card center muted">{tr('none')}</p>}
        {points.length > 0 && <div class="small muted">{tr('count', { n: points.length })}</div>}
        {points.map((g) => {
          const isOpen = open === g.id;
          return (
            <section key={g.id} class="card col">
              <button
                type="button"
                class="row"
                style={{ textAlign: 'start', width: '100%' }}
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? undefined : g.id)}
              >
                <span class="grow">
                  <Zh class="gram-pattern">{g.pattern}</Zh>
                  <span style={{ display: 'block' }}>
                    <Fa>{g.title.fa}</Fa>
                  </span>
                  {s.showEn && g.title.en && <En class="small">{g.title.en}</En>}
                </span>
              </button>
              {isOpen && (
                <>
                  {g.body.split('\n').map((para, i) => (
                    <p key={i}>
                      <Fa>{para}</Fa>
                    </p>
                  ))}
                  <div>
                    {g.examples.map((ex, i) => (
                      <ExampleRow key={i} ex={ex} />
                    ))}
                  </div>
                </>
              )}
            </section>
          );
        })}
      </main>
      <BottomNav />
    </div>
  );
}
