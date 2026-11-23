import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Word } from '../src/data/types';
import { db, resetDbForTests } from '../src/store/db';
import { buildQueue, cardKey, gradeItem, introducedToday, levelStats, Rating, startOfDay, State } from '../src/store/srs';

const word = (id: string): Word => ({ id, s: id, p: 'x', fa: ['الف'], en: ['a'] });
const words = ['一', '二', '三', '四'].map(word);
const ctx = { std: 'hsk3' as const, level: 1 };
const opts = { ...ctx, dirs: ['zf', 'fz'] as ('zf' | 'fz')[], newLimit: 10, reviewLimit: 100 };

beforeEach(async () => {
  const d = await db();
  d.close();
  resetDbForTests();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('mae-hsk');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
});

describe('buildQueue', () => {
  it('introduces only recognition cards for unseen words', async () => {
    const q = await buildQueue(words, opts);
    expect(q.map((i) => i.dir)).toEqual(['zf', 'zf', 'zf', 'zf']);
  });

  it('respects the new-card limit', async () => {
    expect(await buildQueue(words, { ...opts, newLimit: 2 })).toHaveLength(2);
  });

  it('unlocks the production card once the recognition card has been seen', async () => {
    const now = Date.UTC(2026, 0, 1, 12);
    const [first] = await buildQueue(words, { ...opts, now });
    await gradeItem(first, Rating.Easy, { ...ctx, now });
    const q = await buildQueue(words, { ...opts, now });
    expect(q.some((i) => i.word.id === '一' && i.dir === 'fz' && !i.row)).toBe(true);
    // Easy on a new card schedules it days ahead, so it is not due again now.
    expect(q.some((i) => i.word.id === '一' && i.dir === 'zf')).toBe(false);
  });

  it('puts due reviews before new cards and honours direction choice', async () => {
    const now = Date.UTC(2026, 0, 1, 12);
    const [first] = await buildQueue(words, { ...opts, now });
    await gradeItem(first, Rating.Good, { ...ctx, now });
    const later = now + 40 * 86400_000;
    const q = await buildQueue(words, { ...opts, dirs: ['zf'], now: later });
    expect(q[0].row?.key).toBe(cardKey('一', 'zf'));
    expect(q.every((i) => i.dir === 'zf')).toBe(true);
  });
});

describe('gradeItem', () => {
  it('stores the card and a log entry, and keeps "Again" in the session', async () => {
    const now = Date.UTC(2026, 0, 1, 12);
    const [first] = await buildQueue(words, { ...opts, now });
    const res = await gradeItem(first, Rating.Again, { ...ctx, now, ms: 1500 });
    expect(res.again).toBe(true);
    expect(res.row.state).toBe(State.Learning);
    const d = await db();
    expect(await d.count('cards')).toBe(1);
    const logs = await d.getAll('logs');
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ key: cardKey('一', 'zf'), rating: Rating.Again, state: State.New, ms: 1500 });
  });

  it('counts cards introduced today and feeds level statistics', async () => {
    const now = Date.UTC(2026, 0, 1, 12);
    const q = await buildQueue(words, { ...opts, now });
    await gradeItem(q[0], Rating.Good, { ...ctx, now });
    await gradeItem(q[1], Rating.Easy, { ...ctx, now });
    expect(await introducedToday(now)).toBe(2);
    const stats = await levelStats(words, ['zf', 'fz'], now);
    expect(stats).toMatchObject({ total: 4, seen: 2 });
  });
});

describe('startOfDay', () => {
  it('rolls over at 04:00 local time', () => {
    const d = new Date(2026, 5, 10, 2, 30).getTime();
    expect(new Date(startOfDay(d)).getDate()).toBe(9);
    const e = new Date(2026, 5, 10, 9, 0).getTime();
    expect(new Date(startOfDay(e)).getDate()).toBe(10);
  });
});
