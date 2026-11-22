import type { Dialogue, GrammarPoint, LevelPack, Manifest, Std, Word } from './types';

/**
 * All learning content is static JSON under <base>/data, emitted by the build
 * pipeline in tools/. Nothing is fetched from the network at run time: the
 * service worker precaches these files, and in the Android build they ship
 * inside the APK.
 */
const BASE = `${import.meta.env.BASE_URL}data/`;

const cache = new Map<string, Promise<unknown>>();

function getJson<T>(file: string): Promise<T> {
  let p = cache.get(file) as Promise<T> | undefined;
  if (!p) {
    p = fetch(BASE + file).then((r) => {
      if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`);
      return r.json() as Promise<T>;
    });
    // A failed load must not poison the cache: let the next call retry.
    p.catch(() => cache.delete(file));
    cache.set(file, p);
  }
  return p;
}

export const loadManifest = (): Promise<Manifest> => getJson<Manifest>('manifest.json');

export async function loadLevel(std: Std, level: number): Promise<LevelPack> {
  const m = await loadManifest();
  const info = m.standards[std]?.levels.find((l) => l.level === level);
  if (!info) throw new Error(`No such level: ${std} ${level}`);
  return getJson<LevelPack>(info.file);
}

/** Optional per-level content: resolves to [] when the file does not exist yet. */
async function optional<T>(file: string): Promise<T[]> {
  try {
    return await getJson<T[]>(file);
  } catch {
    return [];
  }
}

export const loadDialogues = (std: Std, level: number): Promise<Dialogue[]> =>
  optional<Dialogue>(`${std}/dialogues-${level}.json`);

export const loadGrammar = (std: Std, level: number): Promise<GrammarPoint[]> =>
  optional<GrammarPoint>(`${std}/grammar-${level}.json`);

/** Every word of a standard up to and including `maxLevel` (for search, IME, translator). */
export async function loadUpTo(std: Std, maxLevel: number): Promise<Word[]> {
  const m = await loadManifest();
  const levels = m.standards[std].levels.filter((l) => l.level <= maxLevel);
  const packs = await Promise.all(levels.map((l) => getJson<LevelPack>(l.file)));
  return packs.flatMap((p) => p.words);
}

const wordIndex = new Map<Std, Promise<Map<string, Word>>>();

/** Look a word up by id across every level of a standard. */
export function findWord(std: Std, id: string): Promise<Word | undefined> {
  let idx = wordIndex.get(std);
  if (!idx) {
    idx = loadUpTo(std, 99).then((ws) => new Map(ws.map((w) => [w.id, w])));
    idx.catch(() => wordIndex.delete(std));
    wordIndex.set(std, idx);
  }
  return idx.then((m) => m.get(id));
}

export const audioUrl = (rel: string): string => `${import.meta.env.BASE_URL}audio/${rel}`;
