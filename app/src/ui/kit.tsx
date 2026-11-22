import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { digits, t, type Key } from '../i18n';
import { playZh } from '../lib/audio';
import { back, href, route } from '../lib/router';
import { Icon, type IconName } from './Icon';

/** Chinese text run: always LTR, CJK font stack, tagged for screen readers. */
export function Zh({ children, class: cls }: { children: ComponentChildren; class?: string }) {
  return (
    <span lang="zh-Hans" class={`zh${cls ? ` ${cls}` : ''}`}>
      {children}
    </span>
  );
}

/** Pinyin run. */
export function Py({ children, class: cls }: { children: ComponentChildren; class?: string }) {
  return (
    <span lang="zh-Latn" class={`py${cls ? ` ${cls}` : ''}`}>
      {children}
    </span>
  );
}

/** Persian text run (for content shown while the UI itself is in English). */
export function Fa({ children, class: cls }: { children: ComponentChildren; class?: string }) {
  return (
    <span lang="fa" class={`fa${cls ? ` ${cls}` : ''}`}>
      {children}
    </span>
  );
}

export function En({ children, class: cls }: { children: ComponentChildren; class?: string }) {
  return (
    <span lang="en" class={`en${cls ? ` ${cls}` : ''}`}>
      {children}
    </span>
  );
}

/** Speaker button for a Chinese word or sentence. */
export function AudioButton({ text, file, accent }: { text: string; file?: string; accent?: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      class={`iconbtn${accent ? ' accent' : ''}`}
      aria-label={failed ? t('study.noAudio') : t('study.play')}
      title={failed ? t('study.noAudio') : t('study.play')}
      onClick={async (e) => {
        e.stopPropagation();
        setFailed(!(await playZh(text, file)));
      }}
    >
      <Icon name={failed ? 'mute' : 'play'} />
    </button>
  );
}

export function TopBar({
  title,
  backTo,
  children,
}: {
  title: string;
  /** Show a back button; the value is the fallback route when there is no history. */
  backTo?: string;
  children?: ComponentChildren;
}) {
  return (
    <header class="topbar">
      {backTo !== undefined && (
        <button type="button" class="iconbtn" aria-label={t('app.back')} onClick={() => back(backTo)}>
          <Icon name="chevron" flip />
        </button>
      )}
      <h1>{title}</h1>
      {children}
    </header>
  );
}

const NAV: { path: string; match: string[]; icon: IconName; label: Key }[] = [
  { path: '', match: ['', 'levels'], icon: 'home', label: 'nav.home' },
  { path: 'study', match: ['study'], icon: 'cards', label: 'nav.study' },
  { path: 'words', match: ['words', 'word'], icon: 'list', label: 'nav.words' },
  { path: 'talk', match: ['talk', 'dialogues', 'dialogue', 'translate'], icon: 'chat', label: 'nav.talk' },
  { path: 'settings', match: ['settings', 'about'], icon: 'gear', label: 'nav.settings' },
];

export function BottomNav() {
  const first = route.value.parts[0] ?? '';
  return (
    <nav class="bottomnav">
      {NAV.map((n) => (
        <a key={n.path} href={href(n.path)} aria-current={n.match.includes(first) ? 'page' : undefined}>
          <Icon name={n.icon} />
          <span>{t(n.label)}</span>
        </a>
      ))}
    </nav>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div class="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      class="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    />
  );
}

export function Stepper({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  format,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  label: string;
  format?: (v: number) => string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v * 100) / 100));
  return (
    <div class="stepper" role="group" aria-label={label}>
      <button type="button" aria-label="−" disabled={value <= min} onClick={() => onChange(clamp(value - step))}>
        −
      </button>
      <output>{format ? format(value) : digits(value)}</output>
      <button type="button" aria-label="+" disabled={value >= max} onClick={() => onChange(clamp(value + step))}>
        +
      </button>
    </div>
  );
}

/** Settings row: label + description on one side, control on the other. */
export function Field({ label, desc, children }: { label: string; desc?: string; children: ComponentChildren }) {
  return (
    <div class="field">
      <div class="label">
        <div>{label}</div>
        {desc && <div class="small muted">{desc}</div>}
      </div>
      {children}
    </div>
  );
}

export function Spinner() {
  return <div class="spinner" role="status" aria-label={t('app.loading')} />;
}

export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div class="card col center" role="alert">
      <h2>{t('app.error')}</h2>
      <p class="small muted" dir="ltr">
        {String((error as Error)?.message ?? error)}
      </p>
      {retry && (
        <button type="button" class="btn" onClick={retry}>
          {t('app.retry')}
        </button>
      )}
    </div>
  );
}

export interface AsyncState<T> {
  data?: T;
  error?: unknown;
  loading: boolean;
  reload: () => void;
}

/** Run an async loader whenever `deps` change; ignores results of stale runs. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<{ data?: T; error?: unknown; loading: boolean }>({ loading: true });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: undefined }));
    fn().then(
      (data) => live && setState({ data, loading: false }),
      (error) => live && setState({ error, loading: false }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);
  return { ...state, reload: () => setNonce((n) => n + 1) };
}

/** Transient message at the bottom of the screen. */
export function useToast(): [ComponentChildren, (msg: string) => void] {
  const [msg, setMsg] = useState<string>();
  useEffect(() => {
    if (!msg) return;
    const id = setTimeout(() => setMsg(undefined), 2600);
    return () => clearTimeout(id);
  }, [msg]);
  return [
    msg ? (
      <div class="toast" role="status">
        {msg}
      </div>
    ) : null,
    setMsg,
  ];
}
