import { effect, signal } from '@preact/signals';
import type { Std } from '../data/types';
import { kvGet, kvSet } from './db';

export type UiLang = 'fa' | 'en';
/** Which card directions a study session contains. */
export type DirMode = 'zf' | 'fz' | 'both';
export type Theme = 'auto' | 'light' | 'dark';

export interface Settings {
  ui: UiLang;
  std: Std;
  level: number;
  dirMode: DirMode;
  /** Show the English gloss next to the Persian one. */
  showEn: boolean;
  /** Show pinyin on the question side of Chinese -> Persian cards. */
  pinyinOnFront: boolean;
  /** Play the recording automatically when a Chinese side is shown. */
  autoAudio: boolean;
  /** New cards introduced per day. */
  newPerDay: number;
  /** Max reviews per session. */
  reviewsPerSession: number;
  /** FSRS target retention (0.7 - 0.97). */
  retention: number;
  /** Show traditional characters where they differ. */
  showTrad: boolean;
  theme: Theme;
  /** Chinese text scale, 1 = default. */
  zhScale: number;
  /** Set once the first-run screen has been completed. */
  onboarded: boolean;
}

export const DEFAULTS: Settings = {
  ui: 'fa',
  std: 'hsk3',
  level: 1,
  dirMode: 'both',
  showEn: false,
  pinyinOnFront: false,
  autoAudio: true,
  newPerDay: 10,
  reviewsPerSession: 100,
  retention: 0.9,
  showTrad: false,
  theme: 'auto',
  zhScale: 1,
  onboarded: false,
};

export const settings = signal<Settings>({ ...DEFAULTS });
/** False until the stored settings have been read from IndexedDB. */
export const settingsReady = signal(false);

export async function loadSettings(): Promise<void> {
  try {
    const stored = await kvGet<Partial<Settings>>('settings');
    if (stored) settings.value = { ...DEFAULTS, ...stored };
  } catch {
    // Private-mode browsers can refuse IndexedDB; the app still works with defaults.
  }
  settingsReady.value = true;
}

export function setSettings(patch: Partial<Settings>): void {
  settings.value = { ...settings.value, ...patch };
  void kvSet('settings', settings.value).catch(() => undefined);
}

/** Keep <html lang/dir/data-theme> in sync with the settings. */
export function bindDocument(): void {
  effect(() => {
    const s = settings.value;
    const el = document.documentElement;
    el.lang = s.ui;
    el.dir = s.ui === 'fa' ? 'rtl' : 'ltr';
    if (s.theme === 'auto') el.removeAttribute('data-theme');
    else el.setAttribute('data-theme', s.theme);
    el.style.setProperty('--zh-scale', String(s.zhScale));
  });
}
