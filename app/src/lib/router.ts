import { signal } from '@preact/signals';

/**
 * Tiny hash router. Hash routing is deliberate: it works unchanged on a web
 * host sub-path, inside a Capacitor WebView and behind any static file server,
 * none of which can be relied on to rewrite paths to index.html.
 */
export interface Route {
  /** Path segments, e.g. ['level', 'hsk3', '2']. */
  parts: string[];
  /** Query parameters after '?'. */
  query: Record<string, string>;
}

function parse(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [path, qs = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const query: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(qs)) query[k] = v;
  return { parts, query };
}

export const route = signal<Route>(parse(typeof location === 'undefined' ? '' : location.hash));

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    route.value = parse(location.hash);
    window.scrollTo(0, 0);
  });
}

export function href(path: string, query?: Record<string, string | number | undefined>): string {
  const parts = path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  const qs = query
    ? Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';
  return `#/${parts}${qs ? `?${qs}` : ''}`;
}

export function go(path: string, query?: Record<string, string | number | undefined>): void {
  location.hash = href(path, query);
}

export function back(fallback = ''): void {
  if (history.length > 1) history.back();
  else go(fallback);
}
