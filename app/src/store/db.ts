import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Dir, Std } from '../data/types';

/** Persisted scheduling state of one card (a word in one direction). */
export interface CardRow {
  /** `${wordId}#${dir}` */
  key: string;
  wordId: string;
  dir: Dir;
  /** Level pack the card was first introduced from (for per-level stats). */
  std: Std;
  level: number;
  /** FSRS fields (ts-fsrs Card, with dates stored as epoch ms). */
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review?: number;
}

export interface LogRow {
  id?: number;
  key: string;
  /** Review time, epoch ms. */
  ts: number;
  rating: number;
  /** FSRS state before the review. */
  state: number;
  /** Milliseconds the learner took to answer. */
  ms?: number;
}

interface Schema extends DBSchema {
  kv: { key: string; value: unknown };
  cards: {
    key: string;
    value: CardRow;
    indexes: { due: number; lvl: [string, number]; word: string };
  };
  logs: { key: number; value: LogRow; indexes: { ts: number; key: string } };
}

let dbp: Promise<IDBPDatabase<Schema>> | undefined;

export function db(): Promise<IDBPDatabase<Schema>> {
  dbp ??= openDB<Schema>('mae-hsk', 1, {
    upgrade(d) {
      d.createObjectStore('kv');
      const cards = d.createObjectStore('cards', { keyPath: 'key' });
      cards.createIndex('due', 'due');
      cards.createIndex('lvl', ['std', 'level']);
      cards.createIndex('word', 'wordId');
      const logs = d.createObjectStore('logs', { keyPath: 'id', autoIncrement: true });
      logs.createIndex('ts', 'ts');
      logs.createIndex('key', 'key');
    },
  });
  return dbp;
}

/** Test hook: forget the cached connection (used with fake-indexeddb). */
export function resetDbForTests(): void {
  dbp = undefined;
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  return (await (await db()).get('kv', key)) as T | undefined;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await (await db()).put('kv', value, key);
}

/** Everything a learner would lose with the device; used by export/import. */
export interface Backup {
  app: 'mae-hsk';
  format: 1;
  exported: string;
  kv: Record<string, unknown>;
  cards: CardRow[];
  logs: LogRow[];
}

export async function exportBackup(): Promise<Backup> {
  const d = await db();
  const kv: Record<string, unknown> = {};
  let cur = await d.transaction('kv').store.openCursor();
  while (cur) {
    kv[String(cur.key)] = cur.value;
    cur = await cur.continue();
  }
  return {
    app: 'mae-hsk',
    format: 1,
    exported: new Date().toISOString(),
    kv,
    cards: await d.getAll('cards'),
    logs: await d.getAll('logs'),
  };
}

export function isBackup(x: unknown): x is Backup {
  const b = x as Backup;
  return !!b && b.app === 'mae-hsk' && b.format === 1 && Array.isArray(b.cards) && Array.isArray(b.logs);
}

/** Replace all local progress with the content of a backup. */
export async function importBackup(b: Backup): Promise<void> {
  const d = await db();
  const tx = d.transaction(['kv', 'cards', 'logs'], 'readwrite');
  await Promise.all([tx.objectStore('kv').clear(), tx.objectStore('cards').clear(), tx.objectStore('logs').clear()]);
  for (const [k, v] of Object.entries(b.kv ?? {})) void tx.objectStore('kv').put(v, k);
  for (const c of b.cards) void tx.objectStore('cards').put(c);
  for (const l of b.logs) {
    const { id: _drop, ...rest } = l;
    void tx.objectStore('logs').add(rest);
  }
  await tx.done;
}
