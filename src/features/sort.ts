import { getPageAuthor, type CommentNode, type CommentTree } from '../hn/comments';
import { getSettings, updateSettings, type SortMode } from '../storage';
import { action, h } from '../ui/dom';
import type { Toolbar } from '../ui/toolbar';

export const SORT_MODES: { mode: SortMode; label: string; title: string }[] = [
  { mode: 'default', label: 'default', title: "HN's own ranking (roughly 'top')" },
  { mode: 'new', label: 'newest', title: 'Newest first at every level; subtrees stay together' },
  { mode: 'old', label: 'oldest', title: 'Oldest first at every level' },
  { mode: 'replies', label: 'most replies', title: 'Branches with the most replies first' },
  { mode: 'op', label: 'OP involved', title: 'Branches where the original poster replied come first' },
  { mode: 'flat', label: 'flat', title: 'Every comment in one list, newest first, no nesting' },
];

const isMode = (m: string): m is SortMode => SORT_MODES.some((x) => x.mode === m);

type Compare = (a: CommentNode, b: CommentNode) => number;

/**
 * HN item IDs are handed out in increasing order, so sorting by ID is sorting
 * by post time without having to parse timestamps.
 */
const byNew: Compare = (a, b) => b.id - a.id;
const byOld: Compare = (a, b) => a.id - b.id;
const byOriginal: Compare = (a, b) => a.originalIndex - b.originalIndex;

let reapply: (() => void) | null = null;

/** Re-runs the current sort, e.g. after a comment was added to the tree. */
export function resort(): void {
  reapply?.();
}

let buttons: Map<SortMode, HTMLAnchorElement> | null = null;
let pick: ((mode: SortMode) => void) | null = null;

const savedMode = (): SortMode => {
  const m = getSettings().commentSort;
  return isMode(m) ? m : 'default';
};

function markActive(mode: SortMode): void {
  for (const [m, a] of buttons ?? []) a.classList.toggle('hnxt-active', m === mode);
}

/**
 * Draws the sort buttons straight away (before the comments have loaded),
 * showing the saved mode. They start working once `initSort` has the tree.
 * A non-default saved sort fades the comments until they've been reordered,
 * so you don't start reading in one order and watch it reshuffle.
 */
export function prepareSortBar(toolbar: Toolbar, table: HTMLTableElement): void {
  if (buttons) return;
  buttons = new Map();
  toolbar.left.append(h('span', { class: 'hnxt-label' }, 'sort'));
  for (const { mode, label, title } of SORT_MODES) {
    const a = action(label, () => pick?.(mode), { title, class: 'hnxt-seg' });
    buttons.set(mode, a);
    toolbar.left.append(a);
  }
  const mode = savedMode();
  markActive(mode);
  if (mode !== 'default') table.classList.add('hnxt-pending');
}

export function initSort(tree: CommentTree, toolbar: Toolbar): void {
  prepareSortBar(toolbar, tree.table);
  const settings = getSettings();
  const op = getPageAuthor();
  if (settings.opBadge) markOp(tree, op);
  let opInvolved = computeOpInvolved(tree, op);

  const comparators: Record<Exclude<SortMode, 'flat'>, Compare> = {
    default: byOriginal,
    new: byNew,
    old: byOld,
    replies: (a, b) => b.descendants - a.descendants || byOriginal(a, b),
    op: (a, b) => Number(opInvolved.has(b)) - Number(opInvolved.has(a)) || byOriginal(a, b),
  };

  let current: SortMode = 'default';
  function apply(mode: SortMode) {
    current = mode;
    if (mode === 'flat') applyFlat(tree);
    else applyTree(tree, comparators[mode]);
    markActive(mode);
  }
  pick = (mode) => {
    apply(mode);
    updateSettings({ commentSort: mode });
  };
  reapply = () => {
    if (settings.opBadge) markOp(tree, op);
    opInvolved = computeOpInvolved(tree, op);
    apply(current);
  };

  // HN already rendered the default order, so there's nothing to move.
  const initial = savedMode();
  if (initial !== 'default') apply(initial);
  else markActive('default');
  tree.table.classList.remove('hnxt-pending');
}

// ---------------------------------------------------------------------------
// Tree sorts

function applyTree(tree: CommentTree, compare: Compare): void {
  tree.table.classList.remove('hnxt-flat');
  const order: CommentNode[] = [];
  const prevSibling = new Map<CommentNode, CommentNode>();
  const visit = (nodes: CommentNode[]) => {
    const sorted = [...nodes].sort(compare);
    sorted.forEach((n, i) => {
      if (i > 0) prevSibling.set(n, sorted[i - 1]);
      restoreIndent(n);
      n.row.querySelector('.hnxt-re')?.remove();
      order.push(n);
      visit(n.children);
    });
  };
  visit(tree.roots);

  // Subtrees are contiguous, so the first row past a comment's subtree is
  // what HN's "next" points at (a sibling, or an ancestor's sibling).
  order.forEach((n, i) => rewriteNavs(n, prevSibling.get(n), order[i + 1 + n.descendants]));

  // Flat mode may have revealed rows, and the user may have (un)collapsed
  // comments while in it, so derive visibility from the current collapse state.
  for (const n of order) {
    let hidden = false;
    for (let p = n.parent; p; p = p.parent) {
      if (p.row.classList.contains('coll')) {
        hidden = true;
        break;
      }
    }
    n.row.classList.toggle('noshow', hidden);
  }

  reorder(tree, order);
}

/**
 * HN prints "root | parent | prev | next" links per comment. "prev" is the
 * previous sibling and "next" skips past the subtree, so both depend on order.
 */
function rewriteNavs(n: CommentNode, prev?: CommentNode, next?: CommentNode, flat = false): void {
  const navs = n.row.querySelector('.navs');
  if (!navs) return;
  let root = n;
  while (root.parent) root = root.parent;

  // Tree positions mean nothing in the flat list; the "↳ author" link covers parent.
  const links: [string, CommentNode | undefined][] = flat
    ? []
    : [
        ['root', n.parent?.parent ? root : undefined],
        ['parent', n.parent ?? undefined],
        ['prev', prev],
        ['next', next],
      ];

  const kept = Array.from(navs.children).filter((el) => !(el instanceof HTMLAnchorElement) || el.classList.contains('togg'));
  const parts: (Node | string)[] = [];
  for (const [label, target] of links) {
    if (!target) continue;
    parts.push(' | ', anchor(`#${target.id}`, label));
  }
  parts.push(' ', ...kept);
  navs.replaceChildren(...parts);
}

// ---------------------------------------------------------------------------
// Flat mode

function applyFlat(tree: CommentTree): void {
  tree.table.classList.add('hnxt-flat');
  const order = [...tree.all].sort(byNew);
  for (const n of order) {
    // With every indent at 0, HN's collapse toggle only hides the comment's
    // own text, never the rows after it, which is what we want in a flat list.
    n.indCell?.setAttribute('indent', '0');
    n.spacer?.setAttribute('width', '0');
    n.row.classList.remove('noshow');
    rewriteNavs(n, undefined, undefined, true);
    addReplyContext(n);
  }
  reorder(tree, order);
}

function addReplyContext(n: CommentNode): void {
  if (!n.parent || n.row.querySelector('.hnxt-re')) return;
  const age = n.row.querySelector('.comhead .age');
  if (!age) return;
  const re = h('span', { class: 'hnxt-re', title: 'In reply to' }, ' ↳ ', anchor(`#${n.parent.id}`, n.parent.author ?? 'parent'));
  age.after(re);
}

function restoreIndent(n: CommentNode): void {
  n.indCell?.setAttribute('indent', String(n.indent));
  if (n.spacerWidth !== null) n.spacer?.setAttribute('width', n.spacerWidth);
}

// ---------------------------------------------------------------------------
// OP highlighting

function markOp(tree: CommentTree, op: string | null): void {
  if (!op) return;
  for (const n of tree.all) {
    if (n.author !== op) continue;
    const user = n.row.querySelector('.comhead a[href^="user?id="]');
    if (!user || user.nextElementSibling?.classList.contains('hnxt-op')) continue;
    user.after(h('span', { class: 'hnxt-badge hnxt-op', title: 'Original poster' }, 'OP'));
  }
}

/** Nodes that are by OP or have an OP comment somewhere below them. */
function computeOpInvolved(tree: CommentTree, op: string | null): Set<CommentNode> {
  const involved = new Set<CommentNode>();
  if (!op) return involved;
  for (const n of tree.all) {
    if (n.author !== op) continue;
    for (let p: CommentNode | null = n; p && !involved.has(p); p = p.parent) involved.add(p);
  }
  return involved;
}

// ---------------------------------------------------------------------------
// DOM helpers

function reorder(tree: CommentTree, order: CommentNode[]): void {
  const frag = document.createDocumentFragment();
  for (const n of order) frag.append(n.row);
  for (const el of tree.trailing) frag.append(el);
  tree.container.append(frag);
}

/** `clicky` makes HN's own click handler smooth-scroll to the target. */
function anchor(href: string, text: string): HTMLAnchorElement {
  return h('a', { href, class: 'clicky', 'aria-hidden': 'true' }, text);
}
