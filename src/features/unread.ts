import type { CommentTree } from '../hn/comments';
import { listingStories, onCommentsAdded, onStoriesAdded, pageItemId, pageStory, type StoryInfo } from '../hn/page';
import { getSettings, load, save } from '../storage';
import { action, h, timeAgo } from '../ui/dom';
import type { Toolbar } from '../ui/toolbar';

/**
 * "New since last visit". Comment IDs only ever go up, so remembering the
 * highest ID seen per thread is enough to tell which comments are new.
 */
interface Visit {
  maxId: number;
  /** Comment count HN showed at the time, for "+N" badges on listings. */
  count: number;
  at: number;
}

const KEY = 'visits';
const MAX_VISITS = 3000;

export function getVisits(): Record<string, Visit> {
  return load<Record<string, Visit>>(KEY, {});
}

function recordVisit(id: number, visit: Visit): void {
  const visits = getVisits();
  visits[id] = visit;
  const keys = Object.keys(visits);
  if (keys.length > MAX_VISITS) {
    keys.sort((a, b) => visits[a].at - visits[b].at);
    for (const k of keys.slice(0, keys.length - MAX_VISITS)) delete visits[k];
  }
  save(KEY, visits);
}

export function initUnread(tree: CommentTree, toolbar: Toolbar, me: string | null): void {
  const settings = getSettings();
  const itemId = pageItemId();
  if (!itemId) return;

  if (me && settings.highlightRepliesToMe) {
    for (const n of tree.all) {
      if (n.parent?.author === me && n.author !== me) n.row.classList.add('hnxt-tome');
    }
  }

  const prev = getVisits()[itemId];
  const maxId = Math.max(...tree.all.map((n) => n.id));
  recordVisit(itemId, { maxId, count: pageStory()?.comments ?? tree.all.length, at: Date.now() });

  if (!settings.highlightNew) return;
  if (!prev) {
    toolbar.right.append(h('span', { class: 'hnxt-muted', title: 'New comments will be highlighted on your next visit' }, 'first visit'));
    return;
  }

  const fresh = tree.all.filter((n) => n.id > prev.maxId && n.author !== me);
  for (const n of fresh) n.row.classList.add('hnxt-new');

  toolbar.right.append(
    h('span', { class: fresh.length ? 'hnxt-newcount' : 'hnxt-muted', title: `Last visit ${new Date(prev.at).toLocaleString()}` },
      `${fresh.length} new since ${timeAgo(prev.at)}`),
  );
  if (!fresh.length) return;

  toolbar.right.append(
    action('↑', () => jump(-1), { class: 'hnxt-seg', title: settings.nextNewKey ? 'Previous new comment (Shift+N)' : 'Previous new comment' }),
    action('↓', () => jump(1), { class: 'hnxt-seg', title: settings.nextNewKey ? 'Next new comment (N)' : 'Next new comment' }),
  );

  if (settings.nextNewKey) {
    document.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() !== 'n' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t instanceof Element && t.closest('input, textarea, select, [contenteditable]')) return;
      e.preventDefault();
      jump(e.shiftKey ? -1 : 1);
    });
  }
}

/** Scrolls to the next/previous visible new comment, in whatever order the page is sorted. */
function jump(dir: 1 | -1): void {
  const rows = Array.from(document.querySelectorAll<HTMLElement>('tr.comtr.hnxt-new:not(.noshow)'));
  if (!rows.length) return;
  const tops = rows.map((r) => r.getBoundingClientRect().top);
  let i = dir === 1 ? tops.findIndex((t) => t > 12) : tops.findLastIndex((t) => t < -2);
  if (i === -1) i = dir === 1 ? 0 : rows.length - 1; // wrap around
  const row = rows[i];
  row.scrollIntoView({ block: 'start' });
  window.scrollBy(0, -8);
  for (const r of document.querySelectorAll('tr.hnxt-flash')) r.classList.remove('hnxt-flash');
  void row.offsetWidth; // restart the animation
  row.classList.add('hnxt-flash');
}

/** "+N" next to the comment count on listings, for threads you've opened before. */
export function initListingCounts(): void {
  if (!getSettings().newCountsOnListings) return;
  const visits = getVisits();
  const badge = (s: StoryInfo) => {
    const v = visits[s.id];
    if (!v || s.comments === null || s.comments <= v.count) return;
    const link = Array.from(s.subline?.querySelectorAll('a[href^="item?id="]') ?? []).at(-1);
    link?.after(h('span', { class: 'hnxt-badge hnxt-newbadge', title: `New since you opened it ${timeAgo(v.at)}` }, `+${s.comments - v.count}`));
  };
  listingStories().forEach(badge);
  onStoriesAdded((stories) => stories.forEach(badge));
}

/** Stripes your own comments, on any page that shows comments (threads, /threads, /newcomments). */
export function initOwnComments(me: string | null): void {
  if (!me || !getSettings().highlightOwn) return;
  const mark = (row: Element) => {
    if (row.querySelector('.comhead a[href^="user?id="]')?.textContent === me) row.classList.add('hnxt-mine');
  };
  document.querySelectorAll('tr.athing.comtr').forEach(mark);
  onCommentsAdded((rows) => rows.forEach(mark));
}
