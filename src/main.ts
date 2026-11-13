import './styles.css';
import { parseCommentTree } from './hn/comments';
import { currentUser } from './hn/page';
import { initCustomCss, placeStyles } from './features/customCss';
import { initFilters } from './features/filters';
import { initInfiniteScroll } from './features/infiniteScroll';
import { initInlineReply } from './features/inlineReply';
import { initSort, prepareSortBar } from './features/sort';
import { initListingCounts, initUnread } from './features/unread';
import { initTags } from './features/tags';
import { initWatcher } from './features/watcher';
import { initHeader } from './ui/header';
import { initItemMenus } from './ui/itemMenu';
import { openSettings } from './ui/settings';
import { threadToolbar, whenCommentTable } from './ui/toolbar';

// Runs at document-start. Only things that must beat the first paint happen
// here; everything else waits for HN's markup to be parsed.
const isThread = location.pathname === '/item';
initCustomCss();
if (isThread) whenCommentTable((table) => prepareSortBar(threadToolbar(table), table));

function main(): void {
  placeStyles();
  const me = currentUser();

  initHeader(me);
  initWatcher(me);
  initItemMenus();
  initFilters((draft) => openSettings('filters', draft));
  initTags();

  if (isThread) {
    const tree = parseCommentTree();
    const table = document.querySelector<HTMLTableElement>('table.comment-tree');
    if (tree) {
      const toolbar = threadToolbar(tree.table);
      initSort(tree, toolbar);
      initUnread(tree, toolbar, me);
      toolbar.ready();
    } else if (table) {
      threadToolbar(table).remove();
    }
    initInlineReply(tree, me);
  } else {
    initInlineReply(null, me);
    initListingCounts();
    initInfiniteScroll();
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', main, { once: true });
else main();
