import { action, h } from './dom';

export interface MenuItem {
  label: string;
  run: () => void;
}

let open: HTMLElement | null = null;

function close(): void {
  open?.remove();
  open = null;
}

document.addEventListener('click', (e) => {
  if (open && !open.contains(e.target as Node)) close();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') close();
});

/** A small dropdown under `anchor`. */
export function openMenu(anchor: HTMLElement, items: MenuItem[], opts: { alignRight?: boolean } = {}): void {
  close();
  const menu = h('div', { class: 'hnxt hnxt-menu', role: 'menu' },
    ...items.map((it) => action(it.label, () => {
      close();
      it.run();
    }, { role: 'menuitem' })));
  document.body.append(menu);
  const r = anchor.getBoundingClientRect();
  // alignRight: start under the anchor's right end (where a CSS-drawn ▾ sits).
  const x = opts.alignRight ? r.right - 12 : r.left;
  const left = Math.min(x + window.scrollX, window.scrollX + document.documentElement.clientWidth - menu.offsetWidth - 8);
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${r.bottom + window.scrollY + 2}px`;
  open = menu;
}
