import { useEffect, useRef, useState } from 'preact/hooks';
import { digits, t } from '../i18n';
import { audioCached, cacheLevelAudio, canCacheAudio } from '../lib/offline';
import { href } from '../lib/router';
import { exportBackup, importBackup, isBackup } from '../store/db';
import { loadSettings, setSettings, settings, type DirMode, type Theme, type UiLang } from '../store/settings';
import { Icon } from '../ui/Icon';
import { BottomNav, Field, Segmented, Stepper, Switch, TopBar, useToast } from '../ui/kit';

function saveFile(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Per-level audio download for the installed web app (hidden in the Android build). */
function OfflineAudio() {
  const s = settings.value;
  const [state, setState] = useState<{ done: number; total: number }>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    audioCached(s.std, s.level).then((r) => live && setState(r), () => undefined);
    return () => {
      live = false;
    };
  }, [s.std, s.level]);

  if (!canCacheAudio()) return null;
  const ready = state && state.total > 0 && state.done >= state.total;
  return (
    <>
      <h2>{t('set.offline')}</h2>
      <section class="card">
        <Field
          label={t('set.offline.audio', { n: s.level })}
          desc={
            ready
              ? t('set.offline.ready')
              : state
                ? t('set.offline.progress', { done: digits(state.done), total: digits(state.total) })
                : undefined
          }
        >
          <button
            type="button"
            class="iconbtn accent"
            aria-label={t('set.offline.audio', { n: s.level })}
            disabled={busy || ready}
            onClick={async () => {
              setBusy(true);
              try {
                await cacheLevelAudio(s.std, s.level, (done, total) => setState({ done, total }));
                setState(await audioCached(s.std, s.level));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Icon name={ready ? 'check' : 'download'} />
          </button>
        </Field>
      </section>
    </>
  );
}

export function Settings() {
  const s = settings.value;
  const file = useRef<HTMLInputElement>(null);
  const [toast, show] = useToast();

  async function onExport() {
    const b = await exportBackup();
    saveFile(`mae-hsk-backup-${b.exported.slice(0, 10)}.json`, JSON.stringify(b));
  }

  async function onImport(e: Event) {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    try {
      const data: unknown = JSON.parse(await f.text());
      if (!isBackup(data)) return show(t('set.import.bad'));
      if (!confirm(t('set.import.confirm'))) return;
      await importBackup(data);
      await loadSettings();
      show(t('set.import.done'));
    } catch {
      show(t('set.import.bad'));
    }
  }

  return (
    <div class="shell">
      <TopBar title={t('set.title')} />
      <main class="page">
        <section class="card">
          <Field label={t('set.language')}>
            <Segmented<UiLang>
              value={s.ui}
              onChange={(ui) => setSettings({ ui })}
              options={[
                { value: 'fa', label: t('set.language.fa') },
                { value: 'en', label: t('set.language.en') },
              ]}
            />
          </Field>
          <Field label={t('level.current')} desc={`${t(`std.${s.std}`)} · ${t('level.hsk', { n: s.level })}`}>
            <a class="btn" href={href('levels')}>
              {t('level.change')}
            </a>
          </Field>
        </section>

        <h2>{t('set.study')}</h2>
        <section class="card">
          <Field label={t('set.direction')}>
            <Segmented<DirMode>
              value={s.dirMode}
              onChange={(dirMode) => setSettings({ dirMode })}
              options={[
                { value: 'zf', label: t('study.dir.zf') },
                { value: 'fz', label: t('study.dir.fz') },
                { value: 'both', label: t('study.dir.both') },
              ]}
            />
          </Field>
          <Field label={t('set.showEn')} desc={t('set.showEn.desc')}>
            <Switch checked={s.showEn} onChange={(showEn) => setSettings({ showEn })} label={t('set.showEn')} />
          </Field>
          <Field label={t('set.pinyinFront')} desc={t('set.pinyinFront.desc')}>
            <Switch
              checked={s.pinyinOnFront}
              onChange={(pinyinOnFront) => setSettings({ pinyinOnFront })}
              label={t('set.pinyinFront')}
            />
          </Field>
          <Field label={t('set.autoAudio')}>
            <Switch checked={s.autoAudio} onChange={(autoAudio) => setSettings({ autoAudio })} label={t('set.autoAudio')} />
          </Field>
          <Field label={t('set.newPerDay')}>
            <Stepper
              value={s.newPerDay}
              min={0}
              max={100}
              step={5}
              onChange={(newPerDay) => setSettings({ newPerDay })}
              label={t('set.newPerDay')}
            />
          </Field>
          <Field label={t('set.reviews')}>
            <Stepper
              value={s.reviewsPerSession}
              min={20}
              max={500}
              step={20}
              onChange={(reviewsPerSession) => setSettings({ reviewsPerSession })}
              label={t('set.reviews')}
            />
          </Field>
          <Field label={t('set.retention')} desc={t('set.retention.desc')}>
            <Stepper
              value={s.retention}
              min={0.75}
              max={0.97}
              step={0.01}
              onChange={(retention) => setSettings({ retention })}
              label={t('set.retention')}
              format={(v) => `${digits(Math.round(v * 100))}٪`}
            />
          </Field>
        </section>

        <h2>{t('set.display')}</h2>
        <section class="card">
          <Field label={t('set.theme')}>
            <Segmented<Theme>
              value={s.theme}
              onChange={(theme) => setSettings({ theme })}
              options={[
                { value: 'auto', label: t('set.theme.auto') },
                { value: 'light', label: t('set.theme.light') },
                { value: 'dark', label: t('set.theme.dark') },
              ]}
            />
          </Field>
          <Field label={t('set.zhScale')}>
            <Stepper
              value={s.zhScale}
              min={0.8}
              max={1.6}
              step={0.1}
              onChange={(zhScale) => setSettings({ zhScale })}
              label={t('set.zhScale')}
              format={(v) => `${digits(Math.round(v * 100))}٪`}
            />
          </Field>
          <Field label={t('set.showTrad')}>
            <Switch checked={s.showTrad} onChange={(showTrad) => setSettings({ showTrad })} label={t('set.showTrad')} />
          </Field>
        </section>

        <OfflineAudio />

        <h2>{t('set.data')}</h2>
        <section class="card">
          <Field label={t('set.export')} desc={t('set.export.desc')}>
            <button type="button" class="iconbtn accent" aria-label={t('set.export')} onClick={onExport}>
              <Icon name="download" />
            </button>
          </Field>
          <Field label={t('set.import')}>
            <button type="button" class="iconbtn accent" aria-label={t('set.import')} onClick={() => file.current?.click()}>
              <Icon name="upload" />
            </button>
            <input ref={file} type="file" accept="application/json,.json" hidden onChange={onImport} />
          </Field>
        </section>

        <a class="btn ghost" href={href('about')}>
          <Icon name="info" />
          {t('set.about')}
        </a>
      </main>
      <BottomNav />
      {toast}
    </div>
  );
}
