import { loadLevel, loadManifest } from '../data/loader';
import { STANDARDS, type Dir, type Std } from '../data/types';
import { digits, t, type Key } from '../i18n';
import { href } from '../lib/router';
import { setSettings, settings, type DirMode } from '../store/settings';
import { introducedToday, levelStats } from '../store/srs';
import { Icon, type IconName } from '../ui/Icon';
import { BottomNav, ErrorBox, Spinner, TopBar, useAsync } from '../ui/kit';

export const dirsOf = (m: DirMode): Dir[] => (m === 'both' ? ['zf', 'fz'] : [m]);

const MODULES: { path: string; icon: IconName; title: Key; desc: Key }[] = [
  { path: 'study', icon: 'cards', title: 'mod.flashcards', desc: 'mod.flashcards.desc' },
  { path: 'words', icon: 'list', title: 'mod.words', desc: 'mod.words.desc' },
  { path: 'quiz', icon: 'quiz', title: 'mod.quiz', desc: 'mod.quiz.desc' },
  { path: 'listening', icon: 'ear', title: 'mod.listening', desc: 'mod.listening.desc' },
  { path: 'writing', icon: 'pen', title: 'mod.writing', desc: 'mod.writing.desc' },
  { path: 'dialogues', icon: 'chat', title: 'mod.dialogues', desc: 'mod.dialogues.desc' },
  { path: 'grammar', icon: 'book', title: 'mod.grammar', desc: 'mod.grammar.desc' },
  { path: 'translate', icon: 'translate', title: 'mod.translator', desc: 'mod.translator.desc' },
];

export function Home() {
  const s = settings.value;
  const state = useAsync(async () => {
    const pack = await loadLevel(s.std, s.level);
    const [stats, introduced] = await Promise.all([levelStats(pack.words, dirsOf(s.dirMode)), introducedToday()]);
    const unseen = stats.total - stats.seen;
    return { stats, newToday: Math.max(0, Math.min(unseen, s.newPerDay - introduced)) };
  }, [s.std, s.level, s.dirMode, s.newPerDay]);

  return (
    <div class="shell">
      <TopBar title={t('app.name')}>
        <a class="iconbtn" href={href('about')} aria-label={t('about.title')}>
          <Icon name="info" />
        </a>
      </TopBar>
      <main class="page">
        <a class="card row" href={href('levels')}>
          <div class="levelbadge">{digits(s.level)}</div>
          <div class="grow">
            <h2>{t('level.hsk', { n: s.level })}</h2>
            <div class="small muted">{t(`std.${s.std}` as Key)}</div>
          </div>
          <span class="chip">{t('level.change')}</span>
          <Icon name="chevron" flip width="20" height="20" />
        </a>

        {state.loading && !state.data && <Spinner />}
        {state.error !== undefined && <ErrorBox error={state.error} retry={state.reload} />}
        {state.data && (
          <section class="card col">
            <div class="row">
              <div class="stat">
                <b>{digits(state.data.stats.due)}</b>
                <span>{t('level.due')}</span>
              </div>
              <div class="stat">
                <b>{digits(state.data.newToday)}</b>
                <span>{t('level.new')}</span>
              </div>
              <div class="stat">
                <b>{digits(state.data.stats.seen)}</b>
                <span>{t('level.seen')}</span>
              </div>
              <div class="stat">
                <b>{digits(state.data.stats.total)}</b>
                <span>{t('level.total')}</span>
              </div>
            </div>
            <div
              class="bar"
              role="progressbar"
              aria-label={t('level.progress')}
              aria-valuemin={0}
              aria-valuemax={state.data.stats.total}
              aria-valuenow={state.data.stats.seen}
            >
              <i style={{ width: `${(100 * state.data.stats.mature) / Math.max(1, state.data.stats.total)}%` }} />
              <i
                class="seen"
                style={{
                  width: `${(100 * (state.data.stats.seen - state.data.stats.mature)) / Math.max(1, state.data.stats.total)}%`,
                }}
              />
            </div>
            {state.data.stats.due + state.data.newToday > 0 ? (
              <a class="btn primary block" href={href('study')}>
                <Icon name="cards" />
                {state.data.stats.seen > 0 ? t('home.continue') : t('home.start')}
              </a>
            ) : (
              <p class="center muted">{t('home.nothingDue')}</p>
            )}
          </section>
        )}

        <h2>{t('home.modules')}</h2>
        <div class="grid">
          {MODULES.map((m) => (
            <a key={m.path} class="tile" href={href(m.path)}>
              <span class="ico">
                <Icon name={m.icon} />
              </span>
              <b>{t(m.title)}</b>
              <span class="small muted">{t(m.desc)}</span>
            </a>
          ))}
        </div>
      </main>
      <BottomNav />
    </div>
  );
}

/** Level picker for both standards. */
export function Levels() {
  const s = settings.value;
  const state = useAsync(loadManifest, []);
  return (
    <div class="shell">
      <TopBar title={t('level.choose')} backTo="" />
      <main class="page">
        {state.loading && <Spinner />}
        {state.error !== undefined && <ErrorBox error={state.error} retry={state.reload} />}
        {state.data &&
          STANDARDS.filter((std) => state.data!.standards[std]).map((std: Std) => (
            <section key={std} class="col">
              <div>
                <h2>{t(`std.${std}` as Key)}</h2>
                <p class="small muted">{t(`std.${std}.desc` as Key)}</p>
              </div>
              <div class="list">
                {state.data!.standards[std].levels.map((l) => {
                  const on = s.std === std && s.level === l.level;
                  return (
                    <button
                      key={l.level}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        setSettings({ std, level: l.level });
                        location.hash = href('');
                      }}
                    >
                      <span class={`levelbadge${on ? '' : ' off'}`}>{digits(l.level)}</span>
                      <span class="grow">
                        <b>{t('level.hsk', { n: l.level })}</b>
                        <span class="small muted" style={{ display: 'block' }}>
                          {t('level.words', { n: l.count })}
                        </span>
                      </span>
                      {on && <span class="chip ok">{t('level.current')}</span>}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
      </main>
    </div>
  );
}
