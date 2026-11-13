/** Helpers for reading things off the current HN page. */

export function currentUser(): string | null {
  return document.querySelector('#me')?.textContent?.trim() || null;
}

/** The `id` of an /item page. */
export function pageItemId(): number | null {
  if (location.pathname !== '/item') return null;
  const id = Number(new URLSearchParams(location.search).get('id'));
  return id || null;
}

export function isStoryPage(): boolean {
  return !!document.querySelector('.fatitem tr.athing.submission');
}

/** Parses "123 comments" / "1 comment" / "discuss" from a subline. */
export function commentCountFrom(subline: Element | null): number | null {
  if (!subline) return null;
  for (const a of subline.querySelectorAll('a[href^="item?id="]')) {
    const text = a.textContent?.replace(/ /g, ' ') ?? '';
    const m = text.match(/^(\d+)\s+comments?$/);
    if (m) return Number(m[1]);
    if (text === 'discuss') return 0;
  }
  return null;
}

export interface StoryInfo {
  id: number;
  title: string;
  domain: string | null;
  user: string | null;
  comments: number | null;
  /** The title row, the subtext row and the spacer row after it. */
  rows: HTMLElement[];
  subline: HTMLElement | null;
}

function readStory(row: HTMLTableRowElement): StoryInfo {
  const sub = row.nextElementSibling as HTMLElement | null;
  const spacer = sub?.nextElementSibling as HTMLElement | null;
  const rows: HTMLElement[] = [row];
  if (sub) rows.push(sub);
  if (spacer?.classList.contains('spacer')) rows.push(spacer);
  const subline = sub?.querySelector<HTMLElement>('.subline') ?? sub?.querySelector<HTMLElement>('td.subtext') ?? null;
  return {
    id: Number(row.id),
    title: row.querySelector('.titleline > a')?.textContent ?? '',
    domain: row.querySelector('.sitestr')?.textContent ?? null,
    user: subline?.querySelector('a[href^="user?id="]')?.textContent ?? null,
    comments: commentCountFrom(subline),
    rows,
    subline,
  };
}

/** Stories in a listing (front page, new, ask, ...). Excludes the story at the top of an item page. */
export function listingStories(): StoryInfo[] {
  return Array.from(document.querySelectorAll<HTMLTableRowElement>('tr.athing.submission'))
    .filter((r) => !r.closest('.fatitem'))
    .map(readStory);
}

// Stories appended after page load (infinite scroll). Features that decorate
// stories subscribe here so new rows get the same treatment as the first page.
const storyListeners: ((stories: StoryInfo[]) => void)[] = [];

export function onStoriesAdded(cb: (stories: StoryInfo[]) => void): void {
  storyListeners.push(cb);
}

export function storiesAdded(rows: HTMLTableRowElement[]): void {
  const stories = rows.map(readStory);
  for (const cb of storyListeners) cb(stories);
}

/** The story an /item page is about, if it is a story. */
export function pageStory(): StoryInfo | null {
  const row = document.querySelector<HTMLTableRowElement>('.fatitem tr.athing.submission');
  return row ? readStory(row) : null;
}
