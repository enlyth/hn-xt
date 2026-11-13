import { onCommentsAdded, onStoriesAdded } from '../hn/page';
import { load, onChange, save } from '../storage';
import { action, h, toast } from '../ui/dom';
import { registerMenuItems } from '../ui/itemMenu';

/** Personal labels on usernames, shown as coloured badges wherever the name appears. */
export interface Tag {
  label: string;
  color: string;
}

const KEY = 'userTags';
export const TAG_COLORS = ['#c0392b', '#e67e22', '#d4ac0d', '#27ae60', '#16a085', '#2980b9', '#8e44ad', '#7f8c8d'];

export const getTags = () => load<Record<string, Tag>>(KEY, {});

export function setTag(user: string, tag: Tag | null): void {
  const tags = getTags();
  if (tag && tag.label.trim()) tags[user] = { label: tag.label.trim(), color: tag.color };
  else delete tags[user];
  save(KEY, tags);
}

/** Black or white text, whichever reads better on `bg`. */
export function textOn(bg: string): string {
  const m = bg.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return '#fff';
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#000' : '#fff';
}

export function tagBadge(tag: Tag, user?: string): HTMLElement {
  return h('span', {
    class: 'hnxt-badge hnxt-tag',
    style: `background:${tag.color};color:${textOn(tag.color)}`,
    title: user ? `Your tag for ${user}` : undefined,
  }, tag.label);
}

function render(): void {
  for (const el of document.querySelectorAll('.hnxt-tag-slot')) el.remove();
  const tags = getTags();
  if (!Object.keys(tags).length) return;
  for (const a of document.querySelectorAll<HTMLAnchorElement>('a[href^="user?id="]')) {
    if (a.id === 'me' || a.closest('.hnxt')) continue;
    const user = a.textContent?.trim();
    const tag = user && tags[user];
    if (!tag) continue;
    const slot = h('span', { class: 'hnxt-tag-slot' }, tagBadge(tag, user));
    a.after(slot);
  }
}

export function initTags(): void {
  render();
  onChange(KEY, render);
  onStoriesAdded(render);
  onCommentsAdded(render);
  registerMenuItems(({ user, button }) => {
    if (!user) return [];
    const has = !!getTags()[user];
    return [{ label: has ? `Edit tag for ${user}…` : `Tag ${user}…`, run: () => openTagEditor(button, user) }];
  });
}

// ---------------------------------------------------------------------------
// Popover editor

let pop: HTMLElement | null = null;
const closePop = () => {
  pop?.remove();
  pop = null;
};
document.addEventListener('mousedown', (e) => {
  if (pop && !pop.contains(e.target as Node)) closePop();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closePop();
});

export function openTagEditor(anchor: HTMLElement, user: string): void {
  closePop();
  const existing = getTags()[user];
  let color = existing?.color ?? TAG_COLORS[5];

  const preview = h('span');
  const label = h('input', { type: 'text', value: existing?.label ?? '', placeholder: 'e.g. expert, troll, friend', maxlength: 24 });
  const custom = h('input', { type: 'color', value: color, title: 'Custom colour' });
  const swatches = h('div', { class: 'hnxt-swatches' });

  const refresh = () => {
    preview.replaceChildren(tagBadge({ label: label.value.trim() || 'tag', color }));
    for (const s of swatches.children) s.classList.toggle('hnxt-active', (s as HTMLElement).dataset.color === color);
    custom.value = color;
  };
  for (const c of TAG_COLORS) {
    swatches.append(h('button', {
      type: 'button', class: 'hnxt-swatch', style: `background:${c}`, 'data-color': c, title: c,
      onclick: () => { color = c; refresh(); },
    }));
  }
  custom.addEventListener('input', () => { color = custom.value; refresh(); });
  label.addEventListener('input', refresh);

  const commit = () => {
    setTag(user, { label: label.value, color });
    closePop();
    toast(label.value.trim() ? `Tagged ${user}.` : `Removed tag from ${user}.`);
  };
  label.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commit();
  });

  pop = h('div', { class: 'hnxt hnxt-pop' },
    h('div', { class: 'hnxt-pop-title' }, 'Tag ', h('b', null, user), ' ', preview),
    label,
    h('div', { class: 'hnxt-swatch-row' }, swatches, custom),
    h('div', { class: 'hnxt-footer' },
      action('save', commit, { class: 'hnxt-button' }),
      existing ? action('remove tag', () => { setTag(user, null); closePop(); }) : null,
      h('span', { class: 'hnxt-spacer' }),
      action('cancel', closePop)),
  );
  document.body.append(pop);
  const r = anchor.getBoundingClientRect();
  pop.style.left = `${Math.max(8, Math.min(r.left + window.scrollX, window.scrollX + document.documentElement.clientWidth - pop.offsetWidth - 8))}px`;
  pop.style.top = `${r.bottom + window.scrollY + 2}px`;
  refresh();
  label.focus();
}
