import { GM_notification } from '$';
import { getItem, getUser, mapLimit, snippet, type ApiItem } from '../hn/api';
import { listingStories, onStoriesAdded, pageItemId, pageStory, type StoryInfo } from '../hn/page';
import { getSettings, load, onChange, save } from '../storage';
import { action } from '../ui/dom';

// ---------------------------------------------------------------------------
// Data

export interface WatchedThread {
  id: number;
  title: string;
  /** Comment count when you last opened the thread. */
  seen: number;
  /** Latest known comment count. */
  latest: number;
  addedAt: number;
  checkedAt: number;
  gone?: boolean;
}

export interface Reply {
  id: number;
  by: string;
  parent: number;
  text: string;
  time: number;
}

interface ReplyState {
  /** The account `known` belongs to; switching accounts starts over. */
  user: string | null;
  /** Child IDs of each of your recent posts as of the last check. */
  known: Record<string, number[]>;
  unread: Reply[];
  lastPoll: number;
}

export interface PollStatus {
  at: number;
  error?: string;
}

const W = 'watched';
const R = 'replies';
const emptyReplies: ReplyState = { user: null, known: {}, unread: [], lastPoll: 0 };

export const getWatched = () => load<Record<string, WatchedThread>>(W, {});
export const getReplies = () => ({ ...emptyReplies, ...load<Partial<ReplyState>>(R, {}) });
export const getPollStatus = () => load<PollStatus | null>('pollStatus', null);

export const unreadCount = (t: WatchedThread) => (t.gone ? 0 : Math.max(0, t.latest - t.seen));

function updateWatched(fn: (w: Record<string, WatchedThread>) => void): void {
  const w = getWatched();
  fn(w);
  save(W, w);
}

export function watch(s: Pick<StoryInfo, 'id' | 'title' | 'comments'>): void {
  updateWatched((w) => {
    const n = s.comments ?? 0;
    w[s.id] = { id: s.id, title: s.title, seen: n, latest: n, addedAt: Date.now(), checkedAt: Date.now() };
  });
}

export function unwatch(id: number): void {
  updateWatched((w) => delete w[id]);
}

export function markRepliesRead(ids: number[] | 'all'): void {
  const st = getReplies();
  const before = st.unread.length;
  st.unread = ids === 'all' ? [] : st.unread.filter((r) => !ids.includes(r.id));
  if (st.unread.length !== before) save(R, st);
}

// ---------------------------------------------------------------------------
// Polling. Every open HN tab runs the timer, but a shared lock in GM storage
// means only one of them actually polls per interval.

const TAB = Math.random().toString(36).slice(2);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let polling = false;

export async function pollNow(me: string | null, force = true): Promise<void> {
  if (polling) return;
  const lock = load<{ at: number; tab: string }>('pollLock', { at: 0, tab: '' });
  if (!force && Date.now() - lock.at < getSettings().pollMinutes * 60_000) return;
  save('pollLock', { at: Date.now(), tab: TAB });
  await sleep(200 + Math.random() * 300);
  if (load<{ tab: string }>('pollLock', { tab: '' }).tab !== TAB) return;

  polling = true;
  const status: PollStatus = { at: Date.now() };
  try {
    await pollThreads();
    if (me) await pollReplies(me);
  } catch (e) {
    status.error = e instanceof Error ? e.message : String(e);
    console.warn('[hn-xt] poll failed', e);
  } finally {
    polling = false;
    save('pollStatus', status);
  }
}

async function pollThreads(): Promise<void> {
  const ids = Object.keys(getWatched()).map(Number);
  if (!ids.length) return;
  const items = await mapLimit(ids, 6, (id) => getItem(id).catch(() => undefined));
  // Re-read so a watch/unwatch made during the requests isn't lost.
  updateWatched((w) => {
    ids.forEach((id, i) => {
      const t = w[id];
      const item = items[i];
      if (!t || item === undefined) return; // request failed; try again next time
      if (item === null || item.deleted || item.dead) t.gone = true;
      // The API can lag the HTML site by a minute or two; never report fewer
      // comments than you've already seen.
      else t.latest = Math.max(item.descendants ?? t.latest, t.seen);
      t.checkedAt = Date.now();
    });
  });
}

async function pollReplies(me: string): Promise<void> {
  const settings = getSettings();
  const user = await getUser(me);
  if (!user?.submitted) return;

  let st = getReplies();
  // First run for this account: record what exists, notify about nothing.
  const baseline = st.user !== me;
  if (baseline) st = { ...emptyReplies, user: me };

  const cutoff = Date.now() / 1000 - settings.replyLookbackDays * 86400;
  const recent: ApiItem[] = [];
  // `submitted` is newest first; fetch in pages until we pass the cutoff.
  for (let i = 0; i < Math.min(user.submitted.length, 300); i += 10) {
    const page = await mapLimit(user.submitted.slice(i, i + 10), 10, (id) => getItem(id).catch(() => null));
    const items = page.filter((it): it is ApiItem => !!it);
    recent.push(...items.filter((it) => it.time >= cutoff && !it.deleted));
    if (items.some((it) => it.time < cutoff)) break;
  }

  const known: Record<string, number[]> = {};
  const newIds: number[] = [];
  for (const it of recent) {
    const kids = it.kids ?? [];
    known[it.id] = kids;
    if (baseline) continue;
    const prev = st.known[it.id];
    if (prev) newIds.push(...kids.filter((k) => !prev.includes(k)));
    // A post we haven't seen before only counts if it's newer than the last
    // check, so widening the lookback window doesn't flood you with old replies.
    else if (it.time * 1000 > st.lastPoll) newIds.push(...kids);
  }

  const items = await mapLimit(newIds, 6, (id) => getItem(id).catch(() => null));
  const fresh: Reply[] = items
    .filter((it): it is ApiItem => !!it && !it.deleted && !it.dead && it.by !== me && it.parent !== undefined)
    .map((it) => ({ id: it.id, by: it.by ?? '?', parent: it.parent!, text: snippet(it.text), time: it.time * 1000 }));

  const latest = getReplies();
  const unread = baseline ? [] : latest.unread;
  const seenIds = new Set(unread.map((r) => r.id));
  save(R, {
    user: me,
    known,
    unread: [...fresh.filter((r) => !seenIds.has(r.id)), ...unread].slice(0, 200),
    lastPoll: Date.now(),
  } satisfies ReplyState);

  if (settings.notifyReplies && fresh.length) notify(fresh);
}

export const replyUrl = (r: Reply) => `https://news.ycombinator.com/item?id=${r.parent}#${r.id}`;

function notify(replies: Reply[]): void {
  const shown = replies.slice(0, 3);
  for (const r of shown) {
    GM_notification({
      title: `${r.by} replied to you`,
      text: r.text || '(no text)',
      onclick: () => window.open(replyUrl(r), '_blank'),
    });
  }
  if (replies.length > shown.length) {
    GM_notification({ title: 'Hacker News', text: `…and ${replies.length - shown.length} more replies` });
  }
}

// ---------------------------------------------------------------------------
// Page integration

export function initWatcher(me: string | null): void {
  // What's on this page is fresher than the last poll, so use it.
  const itemId = pageItemId();
  const story = pageStory();
  const visible = listingStories();
  updateWatchedFromPage(itemId, story, visible);

  if (story) addWatchLink(story);
  for (const s of visible) addWatchLink(s);
  onStoriesAdded((stories) => {
    updateWatchedFromPage(null, null, stories);
    stories.forEach(addWatchLink);
  });

  // Opening a reply (or a page that contains it) marks it read.
  const onPage = new Set(Array.from(document.querySelectorAll('tr.athing.comtr'), (r) => Number(r.id)));
  const read = getReplies().unread.filter((r) => onPage.has(r.id)).map((r) => r.id);
  if (read.length) markRepliesRead(read);

  void pollNow(me, false);
  setInterval(() => void pollNow(me, false), 30_000);
}

function updateWatchedFromPage(itemId: number | null, story: StoryInfo | null, visible: StoryInfo[]): void {
  const w = getWatched();
  let changed = false;
  if (itemId && story && w[itemId] && story.comments !== null) {
    w[itemId].seen = w[itemId].latest = story.comments;
    w[itemId].title = story.title;
    changed = true;
  }
  for (const s of visible) {
    const t = w[s.id];
    if (t && s.comments !== null && s.comments > t.latest) {
      t.latest = s.comments;
      changed = true;
    }
  }
  if (changed) save(W, w);
}

function addWatchLink(s: StoryInfo): void {
  if (!s.subline) return;
  const link = action('', () => {
    if (getWatched()[s.id]) unwatch(s.id);
    else watch(s);
  }, { class: 'hnxt-action' });
  const render = () => {
    const on = !!getWatched()[s.id];
    link.textContent = on ? 'unwatch' : 'watch';
    link.title = on ? 'Stop watching this thread' : 'Watch this thread for new comments';
    link.classList.toggle('hnxt-on', on);
  };
  render();
  onChange(W, render);
  s.subline.append(' | ', link);
}

export function watchedList(): WatchedThread[] {
  return Object.values(getWatched()).sort((a, b) => unreadCount(b) - unreadCount(a) || b.addedAt - a.addedAt);
}

export function totalUnread(): { threads: number; replies: number } {
  return {
    threads: watchedList().reduce((n, t) => n + unreadCount(t), 0),
    replies: getReplies().unread.length,
  };
}

