import { createEmptyCard, fsrs, Rating, State, type Card, type FSRS, type Grade } from 'ts-fsrs';
import type { Dir, Std, Word } from '../data/types';
import { db, type CardRow } from './db';

/**
 * Scheduling: FSRS (Ye, Su & Cao, KDD 2022) through ts-fsrs. One card per
 * (word, direction) so recognition (Chinese -> Persian) and production
 * (Persian -> Chinese) are scheduled independently — they are different
 * memories and decay at different rates.
 */

export { Rating, State };
export type { Grade };

export const cardKey = (wordId: string, dir: Dir): string => `${wordId}#${dir}`;

let scheduler: FSRS | undefined;
let schedulerRetention = 0;

export function getScheduler(retention = 0.9): FSRS {
  if (!scheduler || schedulerRetention !== retention) {
    scheduler = fsrs({
      request_retention: retention,
      maximum_interval: 365 * 5,
      enable_fuzz: true,
      enable_short_term: true,
    });
    schedulerRetention = retention;
  }
  return scheduler;
}

function toCard(r: CardRow): Card {
  return {
    due: new Date(r.due),
    stability: r.stability,
    difficulty: r.difficulty,
    elapsed_days: r.elapsed_days,
    scheduled_days: r.scheduled_days,
    learning_steps: r.learning_steps,
    reps: r.reps,
    lapses: r.lapses,
    state: r.state as State,
    last_review: r.last_review ? new Date(r.last_review) : undefined,
  };
}

function toRow(c: Card, base: Pick<CardRow, 'key' | 'wordId' | 'dir' | 'std' | 'level'>): CardRow {
  return {
    ...base,
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.last_review?.getTime(),
  };
}

export interface StudyItem {
  word: Word;
  dir: Dir;
  /** Stored state; undefined for a card that has never been shown. */
  row?: CardRow;
}

export interface QueueOptions {
  std: Std;
  level: number;
  dirs: Dir[];
  /** Max never-seen cards to introduce in this session. */
  newLimit: number;
  /** Max due reviews to include in this session. */
  reviewLimit: number;
  now?: number;
}

/** Start of the learner's local day, used for "introduced today" counting. */
export function startOfDay(now = Date.now()): number {
  const d = new Date(now);
  d.setHours(4, 0, 0, 0); // roll over at 04:00 like Anki, so late-night study counts as the same day
  if (d.getTime() > now) d.setDate(d.getDate() - 1);
  return d.getTime();
}

export async function cardsForWords(words: Word[], dirs: Dir[]): Promise<Map<string, CardRow>> {
  const d = await db();
  const tx = d.transaction('cards');
  const out = new Map<string, CardRow>();
  await Promise.all(
    words.flatMap((w) =>
      dirs.map(async (dir) => {
        const row = await tx.store.get(cardKey(w.id, dir));
        if (row) out.set(row.key, row);
      }),
    ),
  );
  return out;
}

/** How many brand-new cards were first reviewed since the day started. */
export async function introducedToday(now = Date.now()): Promise<number> {
  const d = await db();
  const since = startOfDay(now);
  let n = 0;
  let cur = await d.transaction('logs').store.index('ts').openCursor(IDBKeyRange.lowerBound(since));
  while (cur) {
    if (cur.value.state === State.New) n++;
    cur = await cur.continue();
  }
  return n;
}

/**
 * Build a study session: due reviews first (most overdue first), then new
 * cards in list order. The production card of a word is only introduced once
 * its recognition card has been seen, so a learner never has to produce a word
 * they have not met yet.
 */
export async function buildQueue(words: Word[], o: QueueOptions): Promise<StudyItem[]> {
  const now = o.now ?? Date.now();
  const rows = await cardsForWords(words, ['zf', 'fz']);
  const due: StudyItem[] = [];
  const fresh: StudyItem[] = [];
  for (const word of words) {
    for (const dir of o.dirs) {
      const row = rows.get(cardKey(word.id, dir));
      if (row) {
        if (row.due <= now) due.push({ word, dir, row });
      } else if (dir === 'zf' || !o.dirs.includes('zf') || rows.has(cardKey(word.id, 'zf'))) {
        fresh.push({ word, dir });
      }
    }
  }
  due.sort((a, b) => a.row!.due - b.row!.due);
  return [...due.slice(0, o.reviewLimit), ...fresh.slice(0, Math.max(0, o.newLimit))];
}

export interface GradeResult {
  row: CardRow;
  /** True when the card should come back within this session (learning step). */
  again: boolean;
}

/** Apply a rating, persist the new state and the review log. */
export async function gradeItem(
  item: StudyItem,
  rating: Grade,
  ctx: { std: Std; level: number; retention?: number; now?: number; ms?: number },
): Promise<GradeResult> {
  const now = new Date(ctx.now ?? Date.now());
  const key = cardKey(item.word.id, item.dir);
  const before = item.row ? toCard(item.row) : createEmptyCard(now);
  const { card } = getScheduler(ctx.retention).next(before, now, rating);
  const row = toRow(card, {
    key,
    wordId: item.word.id,
    dir: item.dir,
    std: item.row?.std ?? ctx.std,
    level: item.row?.level ?? ctx.level,
  });
  const d = await db();
  const tx = d.transaction(['cards', 'logs'], 'readwrite');
  void tx.objectStore('cards').put(row);
  void tx.objectStore('logs').add({ key, ts: now.getTime(), rating, state: before.state, ms: ctx.ms });
  await tx.done;
  // Cards still in (re)learning are due within minutes: show them again this session.
  const again = card.state === State.Learning || card.state === State.Relearning;
  return { row, again };
}

/** Interval each button would give, for the labels under the grade buttons. */
export function previewIntervals(item: StudyItem, retention?: number, nowMs = Date.now()): Record<Grade, number> {
  const now = new Date(nowMs);
  const before = item.row ? toCard(item.row) : createEmptyCard(now);
  const p = getScheduler(retention).repeat(before, now);
  const ms = (g: Grade) => p[g].card.due.getTime() - nowMs;
  return {
    [Rating.Again]: ms(Rating.Again),
    [Rating.Hard]: ms(Rating.Hard),
    [Rating.Good]: ms(Rating.Good),
    [Rating.Easy]: ms(Rating.Easy),
  } as Record<Grade, number>;
}

export interface LevelStats {
  total: number;
  /** Words whose recognition card has been seen at least once. */
  seen: number;
  /** Words whose recognition card is in long-term review with interval >= 21 days. */
  mature: number;
  /** Cards (any direction) due now. */
  due: number;
}

export async function levelStats(words: Word[], dirs: Dir[], now = Date.now()): Promise<LevelStats> {
  const rows = await cardsForWords(words, ['zf', 'fz']);
  let seen = 0;
  let mature = 0;
  let due = 0;
  for (const w of words) {
    const zf = rows.get(cardKey(w.id, 'zf'));
    if (zf) {
      seen++;
      if (zf.state === State.Review && zf.scheduled_days >= 21) mature++;
    }
    for (const dir of dirs) {
      const r = rows.get(cardKey(w.id, dir));
      if (r && r.due <= now) due++;
    }
  }
  return { total: words.length, seen, mature, due };
}
