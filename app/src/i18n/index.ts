import { settings, type UiLang } from '../store/settings';
import { en } from './en';
import { fa, type Key } from './fa';

export type { Key };

const TABLES: Record<UiLang, Record<Key, string>> = { fa, en };

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/** Western digits -> Persian digits when the UI is Persian. */
export function digits(s: string | number, lang: UiLang = settings.value.ui): string {
  const str = String(s);
  return lang === 'fa' ? str.replace(/\d/g, (d) => FA_DIGITS[Number(d)]) : str;
}

/**
 * Translate a UI key. Reads the settings signal, so any component calling
 * t() re-renders when the interface language changes. Numeric parameters are
 * rendered with Persian digits in the Persian UI.
 */
export function t(key: Key, params?: Record<string, string | number>): string {
  const lang = settings.value.ui;
  return format(TABLES[lang][key] ?? fa[key] ?? key, lang, params);
}

function format(s: string, lang: UiLang, params?: Record<string, string | number>): string {
  if (!params) return s;
  for (const [k, v] of Object.entries(params)) {
    s = s.replaceAll(`{${k}}`, typeof v === 'number' ? digits(v, lang) : v);
  }
  return s;
}

/**
 * Module-local strings. Feature modules keep their own fa/en table next to
 * their code instead of growing the shared tables:
 *
 *   const tr = defineStrings({ fa: { title: '…' }, en: { title: '…' } });
 *   tr('title')
 */
export function defineStrings<K extends string>(tables: { fa: Record<K, string>; en: Record<K, string> }) {
  return (key: K, params?: Record<string, string | number>): string => {
    const lang = settings.value.ui;
    return format(tables[lang][key] ?? tables.fa[key] ?? key, lang, params);
  };
}

/** Translate a key that may not exist (e.g. dynamic part-of-speech tags). */
export function tMaybe(key: string): string | undefined {
  const lang = settings.value.ui;
  return (TABLES[lang] as Record<string, string>)[key];
}

/** Human-readable interval for the grade buttons ("۱۰ دقیقه", "۳ روز"). */
export function interval(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 1) return t('time.now');
  if (min < 60) return t('time.min', { n: min });
  const h = Math.round(min / 60);
  if (h < 24) return t('time.hour', { n: h });
  const d = Math.round(h / 24);
  if (d < 30) return t('time.day', { n: d });
  if (d < 365) return t('time.month', { n: Math.round(d / 30) });
  return t('time.year', { n: Math.round((d / 365) * 10) / 10 });
}
