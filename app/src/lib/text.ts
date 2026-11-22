/**
 * Text normalisation shared by search, answer checking, the pinyin input
 * method and the dictionary translator.
 */

const TONE_MARKS: Record<string, [string, number]> = {
  ā: ['a', 1], á: ['a', 2], ǎ: ['a', 3], à: ['a', 4],
  ē: ['e', 1], é: ['e', 2], ě: ['e', 3], è: ['e', 4],
  ī: ['i', 1], í: ['i', 2], ǐ: ['i', 3], ì: ['i', 4],
  ō: ['o', 1], ó: ['o', 2], ǒ: ['o', 3], ò: ['o', 4],
  ū: ['u', 1], ú: ['u', 2], ǔ: ['u', 3], ù: ['u', 4],
  ǖ: ['ü', 1], ǘ: ['ü', 2], ǚ: ['ü', 3], ǜ: ['ü', 4],
  ń: ['n', 2], ň: ['n', 3], ǹ: ['n', 4], ḿ: ['m', 2],
};

/**
 * Pinyin reduced to bare lowercase letters: no tones, no spaces, ü -> v.
 * "Nǐ hǎo" -> "nihao", "lǜ sè" -> "lvse". Used for tone-insensitive search and
 * for the pinyin input method.
 */
export function foldPinyin(s: string): string {
  let out = '';
  // "u:" is the ASCII spelling of ü used by CC-CEDICT.
  for (const ch of s.normalize('NFC').toLowerCase().replaceAll('u:', 'ü')) {
    const m = TONE_MARKS[ch];
    const base = m ? m[0] : ch;
    if (base === 'ü') out += 'v';
    else if (base >= 'a' && base <= 'z') out += base;
  }
  return out;
}

/** Tone number (1-4, 5 = neutral) of one pinyin syllable written with tone marks. */
export function toneOf(syllable: string): number {
  for (const ch of syllable.normalize('NFC').toLowerCase()) {
    const m = TONE_MARKS[ch];
    if (m) return m[1];
  }
  return 5;
}

/**
 * Persian normalisation for matching (never for display): unify Arabic and
 * Persian yeh/kaf, drop diacritics, tatweel and the zero-width non-joiner,
 * unify digits, collapse whitespace. "كتاب‌ها" and "کتابها" compare equal.
 */
export function normFa(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[يى]/g, 'ی') // Arabic yeh, alef maksura -> Persian yeh
    .replace(/ك/g, 'ک') // Arabic kaf -> Persian kaf
    .replace(/[ةۀۂ]/g, 'ه') // teh marbuta, heh with hamza -> heh
    .replace(/[أإٱ]/g, 'ا') // alef variants -> alef (keep آ distinct)
    .replace(/ؤ/g, 'و') // waw with hamza -> waw
    .replace(/[ً-ٰٟـ]/g, '') // harakat, superscript alef, tatweel
    .replace(/[‌‍‎‏]/g, '') // ZWNJ, ZWJ, direction marks
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const ZH_PUNCT = /[\s　-〿＀-／：-＠［-｀｛-･!-/:-@[-`{-~·…—“”‘’]/g;

/** Chinese text with whitespace and punctuation (ASCII and full-width) removed. */
export function normZh(s: string): string {
  return s.normalize('NFKC').replace(ZH_PUNCT, '');
}

/** Levenshtein distance over code points (works for Han, Persian and Latin). */
export function editDistance(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  if (!x.length) return y.length;
  if (!y.length) return x.length;
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[y.length];
}

/** True for a string containing at least one Han character. */
export const hasHan = (s: string): boolean => /\p{Script=Han}/u.test(s);

/** True for a string containing Arabic-script (Persian) letters. */
export const hasPersian = (s: string): boolean => /[؀-ۿ]/.test(s);

/** Deterministic shuffle (mulberry32) so quizzes are reproducible in tests. */
export function shuffled<T>(items: readonly T[], seed = Date.now()): T[] {
  let a = seed >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
