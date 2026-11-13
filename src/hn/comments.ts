/**
 * Parses HN's flat comment table into a tree.
 *
 * HN renders every comment as a sibling <tr class="athing comtr"> in one
 * table; nesting exists only as `td.ind[indent=N]` plus a spacer image whose
 * width is N * 40px. HN's own collapse code (hn.js) walks following rows while
 * their indent is greater, so any reordering must keep each subtree contiguous.
 */

export interface CommentNode {
  id: number;
  row: HTMLTableRowElement;
  /** Indent level as HN rendered it. */
  indent: number;
  author: string | null;
  parent: CommentNode | null;
  children: CommentNode[];
  /** Position in HN's original order, used to restore the default sort. */
  originalIndex: number;
  /** Total number of replies below this comment, at any depth. */
  descendants: number;
  indCell: HTMLElement | null;
  spacer: HTMLImageElement | null;
  spacerWidth: string | null;
}

export interface CommentTree {
  roots: CommentNode[];
  all: CommentNode[];
  byId: Map<number, CommentNode>;
  /** The <tbody> holding the comment rows. */
  container: HTMLElement;
  /** The comment-tree <table>. */
  table: HTMLTableElement;
  /** Non-comment rows after the comments (e.g. the "More" pagination link). */
  trailing: Element[];
}

/** Parses the comment table in `root` (the current page by default, or a fetched document). */
export function parseCommentTree(root: ParentNode = document): CommentTree | null {
  const table = root.querySelector<HTMLTableElement>('table.comment-tree');
  if (!table) return null;
  const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>('tr.athing.comtr'));
  if (rows.length === 0) return null;
  const container = rows[0].parentElement!;

  const all: CommentNode[] = [];
  const roots: CommentNode[] = [];
  const byId = new Map<number, CommentNode>();
  const stack: CommentNode[] = [];

  rows.forEach((row, i) => {
    const indCell = row.querySelector<HTMLElement>('td.ind');
    const spacer = indCell?.querySelector('img') ?? null;
    const indent = Number(indCell?.getAttribute('indent') ?? 0) || 0;
    const node: CommentNode = {
      id: Number(row.id),
      row,
      indent,
      author: row.querySelector('.comhead a[href^="user?id="]')?.textContent ?? null,
      parent: null,
      children: [],
      originalIndex: i,
      descendants: 0,
      indCell,
      spacer,
      spacerWidth: spacer?.getAttribute('width') ?? null,
    };

    // Nearest preceding comment with a smaller indent is the parent. Being
    // tolerant here (rather than indexing stack[indent - 1]) copes with pages
    // that start mid-thread.
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    node.parent = stack[stack.length - 1] ?? null;
    (node.parent ? node.parent.children : roots).push(node);
    stack.push(node);

    all.push(node);
    byId.set(node.id, node);
  });

  for (let i = all.length - 1; i >= 0; i--) {
    const n = all[i];
    if (n.parent) n.parent.descendants += n.descendants + 1;
  }

  const lastRow = rows[rows.length - 1];
  const trailing: Element[] = [];
  for (let el = lastRow.nextElementSibling; el; el = el.nextElementSibling) trailing.push(el);

  return { roots, all, byId, container, table, trailing };
}

/**
 * Adds a freshly posted comment row under `parent` (or as a top-level comment).
 * The row gets the indent HN would have given it, and it sorts right after its
 * parent in the default order, so your own reply shows up where you wrote it.
 */
export function addComment(tree: CommentTree, row: HTMLTableRowElement, parent: CommentNode | null): CommentNode {
  const indent = parent ? parent.indent + 1 : 0;
  const indCell = row.querySelector<HTMLElement>('td.ind');
  const spacer = indCell?.querySelector('img') ?? null;
  indCell?.setAttribute('indent', String(indent));
  spacer?.setAttribute('width', String(indent * 40));
  row.classList.remove('noshow', 'coll');

  const node: CommentNode = {
    id: Number(row.id),
    row,
    indent,
    author: row.querySelector('.comhead a[href^="user?id="]')?.textContent ?? null,
    parent,
    children: [],
    originalIndex: parent ? parent.originalIndex + 0.5 : -1,
    descendants: 0,
    indCell,
    spacer,
    spacerWidth: spacer?.getAttribute('width') ?? null,
  };
  (parent ? parent.children : tree.roots).unshift(node);
  for (let p = parent; p; p = p.parent) p.descendants++;
  tree.all.push(node);
  tree.byId.set(node.id, node);
  return node;
}

/** Author of the item the page is about (story submitter, or the comment's author on a comment permalink). */
export function getPageAuthor(): string | null {
  return document.querySelector('.fatitem a[href^="user?id="]')?.textContent ?? null;
}
