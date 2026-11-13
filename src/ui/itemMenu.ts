import { listingStories, onStoriesAdded, type StoryInfo } from '../hn/page';
import { action } from './dom';
import { openMenu, type MenuItem } from './menu';

/** What a "▾" menu was opened on. */
export interface MenuContext {
  kind: 'story' | 'comment';
  user: string | null;
  domain: string | null;
  /** The element the menu button lives in (story title row or comment row). */
  row: HTMLElement;
  /** Text the user had selected inside `row` when opening the menu. */
  selection: string;
  /** The ▾ button itself, for anchoring follow-up popovers. */
  button: HTMLElement;
}

type Provider = (ctx: MenuContext) => MenuItem[];
const providers: Provider[] = [];

/** Features call this to add entries to the ▾ menu next to stories and comments. */
export function registerMenuItems(p: Provider): void {
  providers.push(p);
}

function selectionWithin(el: Element): string {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.anchorNode || !el.contains(sel.anchorNode)) return '';
  return sel.toString().trim().slice(0, 200);
}

function button(ctx: Omit<MenuContext, 'selection' | 'button'>): HTMLElement {
  const btn = action('▾', () => {
    const full = { ...ctx, selection: selectionWithin(ctx.row), button: btn };
    openMenu(btn, providers.flatMap((p) => p(full)));
  }, {
    class: 'hnxt-menu-btn',
    title: 'HN-XT menu (select text first to pre-fill a filter)',
    // Keeps any text selection alive so filters can pre-fill it.
    onmousedown: (e: MouseEvent) => e.preventDefault(),
  });
  return btn;
}

function addStoryMenu(s: StoryInfo): void {
  s.subline?.append(' ', button({ kind: 'story', user: s.user, domain: s.domain, row: s.rows[0] }));
}

export function initItemMenus(): void {
  listingStories().forEach(addStoryMenu);
  onStoriesAdded((stories) => stories.forEach(addStoryMenu));
  for (const row of document.querySelectorAll<HTMLElement>('tr.athing.comtr')) {
    const age = row.querySelector('.comhead .age');
    const user = row.querySelector('.comhead a[href^="user?id="]')?.textContent ?? null;
    if (age && user) age.after(button({ kind: 'comment', user, domain: null, row }));
  }
}
