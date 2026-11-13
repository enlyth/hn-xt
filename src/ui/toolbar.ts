import { h } from './dom';

export interface Toolbar {
  left: HTMLElement;
  right: HTMLElement;
  /** Ends the loading state once the thread's features are set up. */
  ready(): void;
  /** Removes the bar (a thread page with no comments). */
  remove(): void;
}

let toolbar: Toolbar | null = null;

/**
 * The HN-XT bar above a comment thread. Features add their controls to either side.
 *
 * It's created as soon as HN's comment table starts to render, before the
 * comments themselves are parsed, so the page never shifts down when it appears.
 * Until `ready()` it shows a quiet loading note on the right.
 */
export function threadToolbar(table: HTMLTableElement): Toolbar {
  if (toolbar) return toolbar;
  const left = h('div', { class: 'hnxt-toolbar-left' });
  const loading = h('span', { class: 'hnxt-muted hnxt-loading-note' }, 'loading comments…');
  const right = h('div', { class: 'hnxt-toolbar-right' }, loading);
  const bar = h('div', { class: 'hnxt hnxt-toolbar hnxt-loading', 'aria-busy': 'true' }, left, right);
  table.before(bar);
  toolbar = {
    left,
    right,
    ready() {
      loading.remove();
      bar.classList.remove('hnxt-loading');
      bar.removeAttribute('aria-busy');
    },
    remove() {
      bar.remove();
      table.classList.remove('hnxt-pending');
    },
  };
  return toolbar;
}

/**
 * Calls `cb` with HN's comment table the moment the parser creates it.
 * With the script running at document-start this is long before the
 * (possibly thousands of) comment rows have arrived.
 */
export function whenCommentTable(cb: (table: HTMLTableElement) => void): void {
  const find = () => document.querySelector<HTMLTableElement>('table.comment-tree');
  const existing = find();
  if (existing) return cb(existing);
  const obs = new MutationObserver(() => {
    const table = find();
    if (!table) return;
    obs.disconnect();
    cb(table);
  });
  obs.observe(document, { childList: true, subtree: true });
  // Pages without comments never get the table; stop looking once parsing is done.
  document.addEventListener('DOMContentLoaded', () => {
    obs.disconnect();
    const table = find();
    if (table && !toolbar) cb(table);
  }, { once: true });
}
