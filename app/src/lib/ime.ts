/**
 * Offline pinyin input method. The learner types toneless pinyin letters
 * ("nihao", "lv" for lü) and picks characters from a candidate list — no
 * system Chinese keyboard required.
 *
 * The table (data/ime.json, built by tools/build_data.py) holds every HSK word
 * with its official reading plus the single characters they are made of.
 */

/** [pinyin letters, hanzi, frequency rank (lower = more common)] */
export type ImeRow = [string, string, number];

export interface Candidate {
  /** Characters to insert. */
  h: string;
  /** How many letters of the buffer this candidate consumes. */
  used: number;
}

/** Keep only what the table is keyed on: a-z, with ü written as v. */
export function cleanBuffer(s: string): string {
  return s
    .toLowerCase()
    .replace(/ü|u:/g, 'v')
    .replace(/[^a-z]/g, '');
}

export class Ime {
  private byKey = new Map<string, ImeRow[]>();
  private keys: string[];

  constructor(rows: ImeRow[]) {
    // Rows arrive sorted by rank, so each bucket is already most-common-first.
    for (const row of rows) {
      const bucket = this.byKey.get(row[0]);
      if (bucket) bucket.push(row);
      else this.byKey.set(row[0], [row]);
    }
    this.keys = [...this.byKey.keys()].sort();
  }

  /** Index of the first key >= prefix (binary search). */
  private lowerBound(prefix: string): number {
    let lo = 0;
    let hi = this.keys.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.keys[mid] < prefix) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /**
   * Candidates for the typed letters, best first:
   *  1. entries spelled exactly by the whole buffer;
   *  2. entries the buffer is a prefix of (completion: "xues" -> 学生);
   *  3. entries spelled by a shorter prefix of the buffer, longest first —
   *     picking one leaves the rest of the buffer to continue with.
   */
  candidates(buffer: string, limit = 40): Candidate[] {
    const buf = cleanBuffer(buffer);
    if (!buf) return [];
    const out: Candidate[] = [];
    const seen = new Set<string>();
    const push = (h: string, used: number) => {
      const id = `${h}/${used}`;
      if (seen.has(id) || out.length >= limit) return;
      seen.add(id);
      out.push({ h, used });
    };

    for (const row of this.byKey.get(buf) ?? []) push(row[1], buf.length);

    const completions: ImeRow[] = [];
    for (let i = this.lowerBound(buf); i < this.keys.length && this.keys[i].startsWith(buf); i++) {
      if (this.keys[i] !== buf) completions.push(...this.byKey.get(this.keys[i])!);
      if (completions.length > 400) break;
    }
    completions.sort((a, b) => a[2] - b[2]);
    for (const row of completions.slice(0, 12)) push(row[1], buf.length);

    for (let n = buf.length - 1; n >= 1 && out.length < limit; n--) {
      for (const row of (this.byKey.get(buf.slice(0, n)) ?? []).slice(0, 8)) push(row[1], n);
    }
    return out;
  }
}

let loaded: Promise<Ime> | undefined;

export function loadIme(): Promise<Ime> {
  if (!loaded) {
    loaded = fetch(`${import.meta.env.BASE_URL}data/ime.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`ime.json: HTTP ${r.status}`);
        return r.json() as Promise<ImeRow[]>;
      })
      .then((rows) => new Ime(rows));
    loaded.catch(() => (loaded = undefined));
  }
  return loaded;
}

/** ASCII punctuation -> full-width Chinese punctuation, for the composer's punctuation keys. */
export const ZH_PUNCT: Record<string, string> = { ',': '，', '.': '。', '?': '？', '!': '！', ':': '：', ';': '；' };
