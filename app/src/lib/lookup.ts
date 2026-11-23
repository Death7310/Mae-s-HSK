import type { Example, Word } from '../data/types';
import { foldPinyin, hasHan, hasPersian, normFa, normZh } from './text';

/**
 * Offline dictionary lookup behind the translator screen. This is NOT machine
 * translation: it finds words by Persian / Chinese / pinyin / English, splits
 * Chinese sentences into known words, and retrieves bundled example sentences.
 */

export type QueryKind = 'zh' | 'fa' | 'latin';

export function queryKind(q: string): QueryKind {
  if (hasHan(q)) return 'zh';
  if (hasPersian(q)) return 'fa';
  return 'latin';
}

/** A gloss without its parenthesised clarification: «قدیمی (کهنه)» -> «قدیمی». */
const bare = (gloss: string): string => normFa(gloss.replace(/\([^)]*\)|（[^）]*）/g, ' '));

export interface WordHit {
  word: Word;
  /** Higher is better. */
  score: number;
}

function rank(hits: WordHit[], limit: number): WordHit[] {
  const level = (w: Word) => Math.min(w.lv?.hsk3 ?? 9, w.lv?.hsk2 ?? 9);
  return hits
    .sort((a, b) => b.score - a.score || level(a.word) - level(b.word) || a.word.s.length - b.word.s.length)
    .slice(0, limit);
}

/** Persian -> Chinese: words whose Persian gloss matches the query. */
export function searchPersian(words: Word[], query: string, limit = 30): WordHit[] {
  const q = normFa(query);
  if (!q) return [];
  const hits: WordHit[] = [];
  for (const word of words) {
    let best = 0;
    word.fa.forEach((gloss, i) => {
      const g = bare(gloss);
      const full = normFa(gloss);
      let s = 0;
      if (g === q || full === q) s = 100;
      else if (g.split(' ').includes(q)) s = 70;
      else if (g.startsWith(q) || full.includes(q)) s = 50;
      // The first gloss is the main sense: a match there outranks a secondary sense.
      if (s) best = Math.max(best, s - i * 5);
    });
    if (best) hits.push({ word, score: best });
  }
  return rank(hits, limit);
}

/** Pinyin or English -> Chinese. */
export function searchLatin(words: Word[], query: string, limit = 30): WordHit[] {
  const q = query.trim().toLowerCase();
  const qp = foldPinyin(q);
  if (!q) return [];
  const hits: WordHit[] = [];
  for (const word of words) {
    const p = foldPinyin(word.p);
    let s = 0;
    if (qp && p === qp) s = 100;
    else if (qp.length >= 2 && p.startsWith(qp)) s = 60;
    for (const g of word.en) {
      const e = g.toLowerCase();
      if (e === q || e === `to ${q}`) s = Math.max(s, 90);
      else if (new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(e)) s = Math.max(s, 55);
    }
    if (s) hits.push({ word, score: s });
  }
  return rank(hits, limit);
}

export interface Token {
  text: string;
  /** Dictionary entries for this stretch of text (several for homographs); empty if unknown. */
  words: Word[];
}

/** Index words by their characters for segmentation. */
export function indexBySimplified(words: Word[]): Map<string, Word[]> {
  const m = new Map<string, Word[]>();
  for (const w of words) {
    const list = m.get(w.s);
    if (list) list.push(w);
    else m.set(w.s, [w]);
  }
  return m;
}

/**
 * Split Chinese text into dictionary words by forward maximum matching — the
 * longest known word at each position wins. Unknown characters and punctuation
 * become their own tokens.
 */
export function segment(text: string, index: Map<string, Word[]>, maxLen = 6): Token[] {
  const chars = [...text.trim()];
  const out: Token[] = [];
  let i = 0;
  while (i < chars.length) {
    let matched = false;
    for (let n = Math.min(maxLen, chars.length - i); n >= 1; n--) {
      const piece = chars.slice(i, i + n).join('');
      const words = index.get(piece);
      if (words) {
        out.push({ text: piece, words });
        i += n;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out.push({ text: chars[i], words: [] });
      i++;
    }
  }
  return out;
}

export interface ExampleHit {
  ex: Example;
  word: Word;
}

/** Bundled example sentences containing the query (in Chinese or in Persian). */
export function searchExamples(words: Word[], query: string, limit = 12): ExampleHit[] {
  const kind = queryKind(query);
  const q = kind === 'zh' ? normZh(query) : kind === 'fa' ? normFa(query) : query.trim().toLowerCase();
  if ([...q].length < (kind === 'zh' ? 1 : 2)) return [];
  const out: ExampleHit[] = [];
  const seen = new Set<string>();
  for (const word of words) {
    for (const ex of word.ex ?? []) {
      const hay =
        kind === 'zh' ? normZh(ex.zh) : kind === 'fa' ? normFa(ex.fa ?? '') : `${ex.en ?? ''} ${ex.py ?? ''}`.toLowerCase();
      if (hay.includes(q) && !seen.has(ex.zh)) {
        seen.add(ex.zh);
        out.push({ ex, word });
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}
