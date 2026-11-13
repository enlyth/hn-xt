import './styles.css';
import { parseCommentTree } from './hn/comments';
import { currentUser } from './hn/page';
import { initCustomCss } from './features/customCss';
import { initFilters } from './features/filters';
import { initInfiniteScroll } from './features/infiniteScroll';
import { initInlineReply } from './features/inlineReply';
import { initSort } from './features/sort';
import { initListingCounts, initUnread } from './features/unread';
import { initTags } from './features/tags';
import { initWatcher } from './features/watcher';
import { initHeader } from './ui/header';
import { initItemMenus } from './ui/itemMenu';
import { openSettings } from './ui/settings';
import { threadToolbar } from './ui/toolbar';

const me = currentUser();

initHeader(me);
initWatcher(me);
initItemMenus();
initFilters((draft) => openSettings('filters', draft));
initTags();
initCustomCss();

if (location.pathname === '/item') {
  const tree = parseCommentTree();
  if (tree) {
    const toolbar = threadToolbar(tree.table);
    initSort(tree, toolbar);
    initUnread(tree, toolbar, me);
  }
  initInlineReply(tree, me);
} else {
  initInlineReply(null, me);
  initListingCounts();
  initInfiniteScroll();
}
