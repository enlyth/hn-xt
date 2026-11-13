import { storiesAdded } from '../hn/page';
import { getSettings } from '../storage';
import { action, h } from '../ui/dom';

/**
 * Loads the next page of a story listing when you scroll near the "More" link
 * and appends its stories in place. Requests go to HN itself (same origin),
 * one at a time and at most one every couple of seconds, because HN rate
 * limits clients that fetch pages quickly.
 */
const MIN_GAP_MS = 2000;
const MAX_PAGES = 20;

export function initInfiniteScroll(): void {
  if (!getSettings().infiniteScroll) return;
  const found = document.querySelector<HTMLAnchorElement>('a.morelink');
  const firstStory = document.querySelector('tr.athing.submission');
  if (!found || !firstStory) return; // not a story listing (or the last page)
  const more = found;

  const moreRow = more.closest('tr')!;
  const table = moreRow.parentElement!;
  // HN puts a spacer row ("morespace") just before the More link; new stories go before it.
  const insertBefore = moreRow.previousElementSibling?.classList.contains('morespace') ? moreRow.previousElementSibling : moreRow;

  let loading = false;
  let lastLoad = 0;
  let pages = 1;
  let nextUrl: string | null = more.href;
  const status = h('span', { class: 'hnxt hnxt-loadstatus' });
  more.after(' ', status);

  async function loadNext() {
    if (loading || !nextUrl) return;
    const wait = lastLoad + MIN_GAP_MS - Date.now();
    if (wait > 0) {
      setTimeout(check, wait);
      return;
    }
    loading = true;
    lastLoad = Date.now();
    status.replaceChildren('loading…');
    try {
      const res = await fetch(nextUrl, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(res.status === 503 ? 'HN is rate limiting, try again in a bit' : `HTTP ${res.status}`);
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      const rows = collectStoryRows(doc);
      if (!rows.length) throw new Error('no stories found');

      pages++;
      const page = new URL(nextUrl).searchParams.get('p') ?? String(pages);
      const imported = rows.map((r) => document.importNode(r, true));
      const divider = h('tr', { class: 'hnxt-pagebreak' },
        h('td', { colspan: '2' }),
        h('td', null, h('span', { class: 'hnxt' }, `page ${page}`)));
      table.insertBefore(divider, insertBefore);
      for (const r of imported) table.insertBefore(r, insertBefore);

      const newMore = doc.querySelector<HTMLAnchorElement>('a.morelink');
      nextUrl = newMore && pages < MAX_PAGES ? new URL(newMore.getAttribute('href')!, nextUrl).href : null;
      if (nextUrl) more.href = nextUrl;
      else more.closest('tr')!.style.display = 'none';
      status.replaceChildren();

      storiesAdded(imported.filter((r): r is HTMLTableRowElement => r instanceof HTMLTableRowElement && r.matches('tr.athing.submission')));
    } catch (e) {
      status.replaceChildren(
        `couldn't load more (${e instanceof Error ? e.message : e}) `,
        action('retry', () => {
          lastLoad = 0;
          void loadNext();
        }),
      );
    } finally {
      loading = false;
    }
    check();
  }

  // Keep loading while the More link is within a screen of the viewport.
  function check() {
    if (!nextUrl || loading) return;
    if (more.getBoundingClientRect().top < window.innerHeight * 2) void loadNext();
  }

  new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) check();
  }, { rootMargin: '0px 0px 100% 0px' }).observe(more);
  window.addEventListener('scroll', check, { passive: true });
}

/** Story rows (title row, subtext row, spacer) from a fetched listing page, in order. */
function collectStoryRows(doc: Document): Element[] {
  const out: Element[] = [];
  for (const row of doc.querySelectorAll('tr.athing.submission')) {
    out.push(row);
    const sub = row.nextElementSibling;
    if (sub) out.push(sub);
    const spacer = sub?.nextElementSibling;
    if (spacer?.classList.contains('spacer')) out.push(spacer);
  }
  return out;
}
