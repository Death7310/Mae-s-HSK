import { useState } from 'preact/hooks';
import { loadManifest } from '../data/loader';
import { STANDARDS, type Std } from '../data/types';
import { digits, t, type Key } from '../i18n';
import { setSettings, settings, type UiLang } from '../store/settings';
import { ErrorBox, Segmented, Spinner, useAsync } from '../ui/kit';

/** First run: interface language, exam standard, starting level. */
export function Onboarding() {
  const s = settings.value;
  const [std, setStd] = useState<Std>(s.std);
  const [level, setLevel] = useState(s.level);
  const m = useAsync(loadManifest, []);
  const levels = m.data?.standards[std]?.levels ?? [];

  return (
    <div class="shell">
      <main class="page no-nav">
        <div class="center col" style={{ paddingBlock: '24px 8px' }}>
          <div class="zh" style={{ fontSize: '3.5rem', lineHeight: 1.2, color: 'var(--accent)' }} lang="zh-Hans">
            你好
          </div>
          <h1>{t('onb.welcome')}</h1>
          <p class="muted">{t('onb.intro')}</p>
          <div>
            <Segmented<UiLang>
              value={s.ui}
              onChange={(ui) => setSettings({ ui })}
              options={[
                { value: 'fa', label: 'فارسی' },
                { value: 'en', label: 'English' },
              ]}
            />
          </div>
        </div>

        {m.loading && <Spinner />}
        {m.error !== undefined && <ErrorBox error={m.error} retry={m.reload} />}
        {m.data && (
          <>
            <section class="col">
              <h2>{t('onb.pickStd')}</h2>
              <div class="list">
                {STANDARDS.filter((x) => m.data!.standards[x]).map((x) => (
                  <button
                    key={x}
                    type="button"
                    aria-pressed={x === std}
                    onClick={() => {
                      setStd(x);
                      setLevel(1);
                    }}
                  >
                    <span class={`dot${x === std ? ' s2' : ''}`} />
                    <span class="grow">
                      <b>{t(`std.${x}` as Key)}</b>
                      <span class="small muted" style={{ display: 'block' }}>
                        {t(`std.${x}.desc` as Key)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
            <section class="col">
              <h2>{t('onb.pickLevel')}</h2>
              <div class="row wrap">
                {levels.map((l) => (
                  <button
                    key={l.level}
                    type="button"
                    class={`levelbadge${l.level === level ? '' : ' off'}`}
                    aria-pressed={l.level === level}
                    aria-label={t('level.hsk', { n: l.level })}
                    onClick={() => setLevel(l.level)}
                  >
                    {digits(l.level)}
                  </button>
                ))}
              </div>
            </section>
            <button
              type="button"
              class="btn primary block"
              onClick={() => setSettings({ std, level, onboarded: true })}
            >
              {t('onb.start')}
            </button>
          </>
        )}
      </main>
    </div>
  );
}
