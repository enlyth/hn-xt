import { GM_xmlhttpRequest } from '$';

/**
 * The official HN API (Firebase). It is not rate limited like the HTML site,
 * so polling it doesn't risk getting the user's IP throttled on HN itself.
 */
const BASE = 'https://hacker-news.firebaseio.com/v0';

export interface ApiItem {
  id: number;
  type: 'story' | 'comment' | 'job' | 'poll' | 'pollopt';
  by?: string;
  time: number;
  text?: string;
  title?: string;
  parent?: number;
  kids?: number[];
  descendants?: number;
  deleted?: boolean;
  dead?: boolean;
}

export interface ApiUser {
  id: string;
  submitted?: number[];
}

function getJson<T>(path: string): Promise<T | null> {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'GET',
      url: `${BASE}/${path}.json`,
      responseType: 'json',
      timeout: 15000,
      onload: (r) => (r.status === 200 ? resolve(r.response as T | null) : reject(new Error(`HTTP ${r.status}`))),
      onerror: () => reject(new Error('network error')),
      ontimeout: () => reject(new Error('timeout')),
    });
  });
}

export const getItem = (id: number) => getJson<ApiItem>(`item/${id}`);
export const getUser = (name: string) => getJson<ApiUser>(`user/${encodeURIComponent(name)}`);

/** Runs `fn` over `items` with at most `limit` in flight. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/** HN item text is HTML; this gives a plain one-line snippet. */
export function snippet(html: string | undefined, max = 140): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html.replace(/<p>/g, ' '), 'text/html');
  const text = (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
