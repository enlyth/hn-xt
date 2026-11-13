import { GM_addValueChangeListener, GM_getValue, GM_setValue } from '$';

/**
 * Userscript storage (GM_*) is shared by every HN tab and survives clearing
 * site data. Change listeners fire in *other* tabs too, which keeps the header
 * badge, filters and watcher in sync everywhere.
 */

export type SortMode = 'default' | 'new' | 'old' | 'replies' | 'op' | 'flat';

export interface Settings {
  commentSort: SortMode;
  opBadge: boolean;
  highlightNew: boolean;
  highlightRepliesToMe: boolean;
  highlightOwn: boolean;
  nextNewKey: boolean;
  newCountsOnListings: boolean;
  infiniteScroll: boolean;
  inlineReply: boolean;
  watcher: boolean;
  pollMinutes: number;
  notifyReplies: boolean;
  watcherStartDetached: boolean;
  replyLookbackDays: number;
}

export const defaultSettings: Settings = {
  commentSort: 'default',
  opBadge: true,
  highlightNew: true,
  highlightRepliesToMe: true,
  highlightOwn: true,
  nextNewKey: true,
  newCountsOnListings: true,
  infiniteScroll: true,
  inlineReply: true,
  watcher: true,
  pollMinutes: 5,
  notifyReplies: true,
  watcherStartDetached: false,
  replyLookbackDays: 14,
};

export function load<T>(key: string, fallback: T): T {
  return GM_getValue(key, fallback) as T;
}

export function save<T>(key: string, value: T): void {
  GM_setValue(key, value);
}

export function onChange<T>(key: string, cb: (value: T, remote: boolean) => void): void {
  GM_addValueChangeListener(key, (_k, _old, value, remote) => cb(value as T, !!remote));
}

export function getSettings(): Settings {
  return { ...defaultSettings, ...load<Partial<Settings>>('settings', {}) };
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch };
  save('settings', next);
  return next;
}
