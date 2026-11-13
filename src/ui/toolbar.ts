import { h } from './dom';

export interface Toolbar {
  left: HTMLElement;
  right: HTMLElement;
}

let toolbar: Toolbar | null = null;

/** The HN-XT bar above a comment thread. Features add their controls to either side. */
export function threadToolbar(table: HTMLTableElement): Toolbar {
  if (toolbar) return toolbar;
  const left = h('div', { class: 'hnxt-toolbar-left' });
  const right = h('div', { class: 'hnxt-toolbar-right' });
  table.before(h('div', { class: 'hnxt hnxt-toolbar' }, left, right));
  toolbar = { left, right };
  return toolbar;
}
