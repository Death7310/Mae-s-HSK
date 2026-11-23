import { audioUrl, loadLevel } from '../data/loader';
import type { Std } from '../data/types';

/**
 * Offline audio for the installed web app. The app shell and all data are
 * precached by the service worker; recordings are large (about 60 MB in all),
 * so they are cached per level on request. Fetching each file once is enough:
 * the service worker stores it in its cache-first "audio-v1" cache.
 *
 * In the Android build (`__NATIVE__`) every file is already inside the app.
 */
declare const __NATIVE__: boolean;

export const isNative: boolean = typeof __NATIVE__ !== 'undefined' && __NATIVE__;

export const canCacheAudio = (): boolean => !isNative && typeof caches !== 'undefined' && 'serviceWorker' in navigator;

async function levelAudio(std: Std, level: number): Promise<string[]> {
  const pack = await loadLevel(std, level);
  const files = new Set<string>();
  for (const w of pack.words) {
    if (w.a) files.add(w.a);
    for (const ex of w.ex ?? []) if (ex.a) files.add(ex.a);
  }
  return [...files].map(audioUrl);
}

/** How many of the level's recordings are already available offline. */
export async function audioCached(std: Std, level: number): Promise<{ done: number; total: number }> {
  const urls = await levelAudio(std, level);
  if (!canCacheAudio()) return { done: urls.length, total: urls.length };
  const cache = await caches.open('audio-v1');
  const hits = await Promise.all(urls.map((u) => cache.match(u).then(Boolean)));
  return { done: hits.filter(Boolean).length, total: urls.length };
}

/** Fetch every recording of a level so the service worker caches it. */
export async function cacheLevelAudio(
  std: Std,
  level: number,
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<{ done: number; total: number; failed: number }> {
  const urls = await levelAudio(std, level);
  const cache = await caches.open('audio-v1');
  let done = 0;
  let failed = 0;
  let next = 0;
  async function worker() {
    while (next < urls.length && !signal?.aborted) {
      const url = urls[next++];
      try {
        if (!(await cache.match(url))) {
          const res = await fetch(url, { signal });
          // Store it ourselves as well: on the very first visit the service worker
          // may not control the page yet, and then it would not see this request.
          if (res.ok) await cache.put(url, res);
          else failed++;
        }
      } catch {
        failed++;
      }
      onProgress(++done, urls.length);
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  return { done, total: urls.length, failed };
}
