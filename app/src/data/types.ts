/**
 * Shared data contracts. Everything the build pipeline (tools/) emits into
 * app/public/data and everything the UI reads goes through these types.
 */

/** Which official word list a level number refers to. */
export type Std =
  | 'hsk3' // "newest": the Nov-2025 HSK 3.0 syllabus, examined from Dec 2026
  | 'hsk2'; // legacy HSK 2.0 (2012 list), 6 levels / 5,000 words

export const STANDARDS: Std[] = ['hsk3', 'hsk2'];

/** Card direction. */
export type Dir =
  | 'zf' // Chinese -> Persian (recognition / receptive)
  | 'fz'; // Persian -> Chinese (production / productive)

export const DIRS: Dir[] = ['zf', 'fz'];

/** How trustworthy a Persian gloss is. Shown in the UI so learners know. */
export type FaQuality =
  | 0 // machine draft, not cross-checked
  | 1 // generated and independently cross-checked by a second pass
  | 2; // confirmed by a native-speaker reviewer

export interface Example {
  zh: string;
  py?: string;
  fa?: string;
  en?: string;
  /** relative audio path under audio/, if a recording exists */
  a?: string;
}

export interface Word {
  /** Stable key: simplified + '|' + numeric pinyin without spaces. */
  id: string;
  /** Simplified characters. */
  s: string;
  /** Traditional characters, only when different from simplified. */
  t?: string;
  /** Pinyin with tone marks, syllables separated by spaces. */
  p: string;
  /** Part-of-speech tags (ICTCLAS-style short codes: n, v, a, d, ...). */
  pos?: string[];
  /** Persian glosses, most common sense first. */
  fa: string[];
  /** English glosses (CC-CEDICT), most common sense first. */
  en: string[];
  /** Measure words / classifiers. */
  cl?: string[];
  /** Relative path of the word recording under audio/, if any. */
  a?: string;
  /** Example sentences. */
  ex?: Example[];
  /** Short Persian usage note (register, common confusion, measure word...). */
  note?: string;
  /** Quality of the Persian gloss. */
  q?: FaQuality;
  /**
   * Other words (already met by the learner) whose Persian gloss is identical,
   * so a Persian -> Chinese prompt alone cannot tell them apart.
   */
  amb?: string[];
  /** Levels of this word in each standard (for cross-reference badges). */
  lv?: Partial<Record<Std, number>>;
}

export interface LevelPack {
  std: Std;
  level: number;
  words: Word[];
}

export interface LevelInfo {
  level: number;
  /** Number of words introduced at this level (not cumulative). */
  count: number;
  /** Path relative to data/. */
  file: string;
  /** Number of words that have a recording. */
  audio?: number;
}

export interface Manifest {
  /** Data build id, bumps whenever the pipeline output changes. */
  version: string;
  standards: Record<Std, { levels: LevelInfo[] }>;
}

/** One turn of a scripted dialogue. */
export interface DialogueLine {
  /** Speaker id: 'A' | 'B' | ... */
  who: string;
  zh: string;
  py: string;
  fa: string;
  en?: string;
  a?: string;
  /**
   * In role-play mode the learner types this line. Extra accepted variants
   * (other natural ways to say the same thing) go here.
   */
  alt?: string[];
}

export interface Dialogue {
  id: string;
  std: Std;
  level: number;
  title: { fa: string; zh: string; en?: string };
  /** Short Persian description of the situation. */
  scene?: string;
  lines: DialogueLine[];
}

export interface GrammarPoint {
  id: string;
  std: Std;
  level: number;
  /** Number of the point in the official syllabus. */
  no?: number;
  /** Pattern, e.g. "A 比 B + adj". */
  pattern: string;
  title: { fa: string; en?: string };
  /** Persian explanation (Markdown-free plain text, paragraphs split by \n). */
  body: string;
  examples: Example[];
}
