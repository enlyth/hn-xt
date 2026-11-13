import {
  getPollStatus, getReplies, markRepliesRead, pollNow, replyUrl, totalUnread, unreadCount, unwatch, watchedList,
} from '../features/watcher';
import { getSettings, load, onChange, save } from '../storage';
import { action, h, timeAgo } from './dom';
import { openSettings } from './settings';

/** A plain eye outline (drawn for HN-XT, no icon font needed). */
function eyeIcon(): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'hnxt-icon');
  svg.setAttribute('aria-hidden', 'true');
  const eye = document.createElementNS(NS, 'path');
  eye.setAttribute('d', 'M1.5 12S5.5 4.5 12 4.5 22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12z');
  const pupil = document.createElementNS(NS, 'circle');
  pupil.setAttribute('cx', '12');
  pupil.setAttribute('cy', '12');
  pupil.setAttribute('r', '3.5');
  for (const el of [eye, pupil]) {
    el.setAttribute('fill', 'none');
    el.setAttribute('stroke', 'currentColor');
    el.setAttribute('stroke-width', '2.2');
    el.setAttribute('stroke-linejoin', 'round');
    svg.append(el);
  }
  return svg;
}

let me: string | null = null;

/** Adds the watcher (eye) and "hn-xt" links to the right side of HN's header. */
export function initHeader(user: string | null): void {
  me = user;
  const right = document.querySelectorAll('.pagetop')[1];
  if (!right) return;

  const badge = h('span', { class: 'hnxt-badge hnxt-count-badge' });
  const watchedLink = action('', (e) => onEyeClick(e.currentTarget as HTMLElement), {
    class: 'hnxt-head hnxt-eye', title: 'Watched threads and replies', 'aria-label': 'Watched threads and replies',
  });
  watchedLink.append(eyeIcon(), badge);
  const settingsLink = action('hn-xt', () => openSettings(), { class: 'hnxt-head', title: 'HN-XT settings' });

  right.prepend(watchedLink, ' | ', settingsLink, ' | ');

  const refresh = () => {
    const { threads, replies } = totalUnread();
    const n = threads + replies;
    badge.textContent = n ? String(n) : '';
    badge.hidden = !n;
    badge.classList.toggle('hnxt-hot', replies > 0);
    const summary = [replies && `${replies} new ${replies === 1 ? 'reply' : 'replies'}`, threads && `${threads} new comments in watched threads`]
      .filter(Boolean).join(', ');
    watchedLink.title = summary ? `Watched threads and replies: ${summary}` : 'Watched threads and replies';
    renderAll();
  };
  refresh();
  onChange('watched', refresh);
  onChange('replies', refresh);
  onChange('pollStatus', refresh);

  const win = getWindowState();
  if (win.open || getSettings().watcherStartDetached) openFloating();
  // Keep every tab's window in the same place / state.
  onChange<WindowState>(WIN, (s, remote) => remote && s && syncFloating(s));
}

// ---------------------------------------------------------------------------
// Shared content, rendered into the dropdown and/or the floating window

function renderContent(target: HTMLElement, mode: 'dropdown' | 'floating'): void {
  const replies = getReplies().unread;
  const threads = watchedList();
  const status = getPollStatus();

  const replySection = me
    ? h('section', null,
        h('div', { class: 'hnxt-panel-title' }, 'Replies to you',
          replies.length ? action('mark all read', () => markRepliesRead('all'), { class: 'hnxt-panel-act' }) : null),
        replies.length
          ? h('ul', null, ...replies.slice(0, 30).map((r) =>
              h('li', null,
                h('a', { href: replyUrl(r), onclick: () => markRepliesRead([r.id]) },
                  h('b', null, r.by), ' ', h('span', { class: 'hnxt-muted' }, timeAgo(r.time)),
                  h('div', { class: 'hnxt-snippet' }, r.text || '(no text)')),
                action('×', () => markRepliesRead([r.id]), { class: 'hnxt-close', title: 'Mark read' }))))
          : h('p', { class: 'hnxt-muted' }, 'No new replies.'))
    : h('section', null, h('p', { class: 'hnxt-muted' }, 'Log in to get notified about replies to you.'));

  const threadSection = h('section', null,
    h('div', { class: 'hnxt-panel-title' }, 'Watched threads'),
    threads.length
      ? h('ul', null, ...threads.map((t) => {
          const n = unreadCount(t);
          return h('li', null,
            h('a', { href: `item?id=${t.id}`, class: t.gone ? 'hnxt-gone' : '' }, t.title || `item ${t.id}`,
              ' ', n ? h('span', { class: 'hnxt-badge hnxt-newbadge' }, `+${n}`) : h('span', { class: 'hnxt-muted' }, `${t.latest}`)),
            action('×', () => unwatch(t.id), { class: 'hnxt-close', title: 'Unwatch' }));
        }))
      : h('p', { class: 'hnxt-muted' }, 'Nothing watched yet. Use "watch" under any story.'));

  target.replaceChildren(
    replySection,
    threadSection,
    h('div', { class: 'hnxt-panel-foot' },
      h('span', { class: 'hnxt-muted' },
        status ? `checked ${timeAgo(status.at)}${status.error ? ` (failed: ${status.error})` : ''}` : 'not checked yet'),
      h('span', null,
        action('check now', (e) => {
          (e.target as HTMLElement).textContent = 'checking…';
          void pollNow(me, true);
        }),
        mode === 'dropdown' ? ' · ' : null,
        mode === 'dropdown'
          ? action('detach', () => {
              closePanel();
              openFloating();
            }, { title: 'Open as a floating window that stays on screen' })
          : null)),
  );
}

function renderAll(): void {
  if (panel) renderContent(panel, 'dropdown');
  if (floating) renderContent(floating.body, 'floating');
}

// ---------------------------------------------------------------------------
// Dropdown

let panel: HTMLElement | null = null;

function closePanel(): void {
  panel?.remove();
  panel = null;
}

document.addEventListener('click', (e) => {
  if (panel && !panel.contains(e.target as Node)) closePanel();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closePanel();
});

function onEyeClick(anchor: HTMLElement): void {
  // With the window open, the eye just brings it back into view.
  if (floating) {
    setWindowState({ minimized: false });
    syncFloating(getWindowState());
    floating.el.classList.remove('hnxt-attn');
    void floating.el.offsetWidth;
    floating.el.classList.add('hnxt-attn');
    return;
  }
  if (panel) return closePanel();
  panel = h('div', { class: 'hnxt hnxt-panel' });
  document.body.append(panel);
  const r = anchor.getBoundingClientRect();
  panel.style.top = `${r.bottom + window.scrollY + 4}px`;
  panel.style.right = `${Math.max(8, document.documentElement.clientWidth - r.right - window.scrollX)}px`;
  renderContent(panel, 'dropdown');
}

// ---------------------------------------------------------------------------
// Floating window: fixed on screen, draggable by its title bar, and it
// reopens where you left it on every HN page until you close or dock it.

interface WindowState {
  open: boolean;
  minimized: boolean;
  /** Distance from the right/top edges, so it stays put when the window resizes. */
  right: number;
  top: number;
}

const WIN = 'watcherWindow';
const defaultWin: WindowState = { open: false, minimized: false, right: 16, top: 40 };
const getWindowState = () => ({ ...defaultWin, ...load<Partial<WindowState>>(WIN, {}) });
const setWindowState = (patch: Partial<WindowState>) => save(WIN, { ...getWindowState(), ...patch });

let floating: { el: HTMLElement; body: HTMLElement } | null = null;

function closeFloating(): void {
  floating?.el.remove();
  floating = null;
}

function syncFloating(s: WindowState): void {
  if (!s.open) return closeFloating();
  if (!floating) return openFloating(false);
  floating.el.classList.toggle('hnxt-min', s.minimized);
  place(floating.el, s);
}

/** Keeps the window fully on screen. */
function place(el: HTMLElement, s: WindowState): void {
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const right = Math.min(Math.max(0, s.right), Math.max(0, vw - el.offsetWidth));
  const top = Math.min(Math.max(0, s.top), Math.max(0, vh - 28));
  el.style.right = `${right}px`;
  el.style.top = `${top}px`;
}

function openFloating(persist = true): void {
  if (floating) return;
  if (persist) setWindowState({ open: true });
  const s = getWindowState();

  const body = h('div', { class: 'hnxt-float-body' });
  const minBtn = action('', () => {
    const minimized = !getWindowState().minimized;
    setWindowState({ minimized });
    el.classList.toggle('hnxt-min', minimized);
    minBtn.textContent = minimized ? '▢' : '–';
    minBtn.title = minimized ? 'Expand' : 'Minimize';
  }, { class: 'hnxt-winbtn', title: s.minimized ? 'Expand' : 'Minimize' });
  minBtn.textContent = s.minimized ? '▢' : '–';

  const bar = h('div', { class: 'hnxt-float-bar', title: 'Drag to move' },
    eyeIcon(),
    h('span', { class: 'hnxt-float-title' }, 'Watched'),
    h('span', { class: 'hnxt-spacer' }),
    minBtn,
    action('dock', () => {
      setWindowState({ open: false });
      closeFloating();
    }, { class: 'hnxt-winbtn', title: 'Put it back in the header menu' }),
  );
  const el = h('div', { class: `hnxt hnxt-float${s.minimized ? ' hnxt-min' : ''}`, role: 'dialog', 'aria-label': 'Watched threads and replies' }, bar, body);
  document.body.append(el);
  floating = { el, body };
  renderContent(body, 'floating');
  place(el, s);

  // Dragging. Pointer capture keeps the drag going even if the cursor outruns the bar.
  bar.addEventListener('pointerdown', (e) => {
    if ((e.target as Element).closest('a, button') || e.button !== 0) return;
    e.preventDefault();
    bar.setPointerCapture(e.pointerId);
    const rect = el.getBoundingClientRect();
    const dx = e.clientX - rect.left;
    const dy = e.clientY - rect.top;
    el.classList.add('hnxt-dragging');
    const move = (ev: PointerEvent) => {
      const vw = document.documentElement.clientWidth;
      place(el, { ...getWindowState(), right: vw - (ev.clientX - dx) - el.offsetWidth, top: ev.clientY - dy });
    };
    const up = () => {
      bar.removeEventListener('pointermove', move);
      el.classList.remove('hnxt-dragging');
      setWindowState({ right: parseFloat(el.style.right), top: parseFloat(el.style.top) });
    };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up, { once: true });
    bar.addEventListener('pointercancel', up, { once: true });
  });
}

window.addEventListener('resize', () => floating && place(floating.el, getWindowState()));
