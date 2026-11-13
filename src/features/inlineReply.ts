import { addComment, parseCommentTree, type CommentTree } from '../hn/comments';
import { commentsAdded } from '../hn/page';
import { getSettings, load, save } from '../storage';
import { action, h, toast } from '../ui/dom';
import { resort } from './sort';

/**
 * Reply to comments in place instead of going to /reply.
 *
 * HN's reply form needs a per-user, per-parent `hmac` token, so opening the
 * box fetches /reply?id=… once to read it. Submitting posts the same fields
 * HN's own form would to /comment. On success HN redirects to the thread, and
 * the new comment row is taken from that response and inserted under its parent.
 */

interface ReplyForm {
  parent: string;
  goto: string;
  hmac: string;
}

interface Draft {
  text: string;
  at: number;
}

const DRAFTS = 'replyDrafts';
const DRAFT_TTL = 30 * 86400_000;

const getDrafts = () => load<Record<string, Draft>>(DRAFTS, {});

function saveDraft(parent: string, text: string): void {
  const drafts = getDrafts();
  if (text.trim()) drafts[parent] = { text, at: Date.now() };
  else delete drafts[parent];
  for (const [k, d] of Object.entries(drafts)) if (Date.now() - d.at > DRAFT_TTL) delete drafts[k];
  save(DRAFTS, drafts);
}

let tree: CommentTree | null = null;
let me: string | null = null;
const open = new Map<string, Box>();

export function initInlineReply(commentTree: CommentTree | null, user: string | null): void {
  if (!getSettings().inlineReply || !user) return;
  tree = commentTree;
  me = user;

  const drafts = getDrafts();
  for (const a of replyLinks(document)) {
    const id = parentIdOf(a);
    if (id && drafts[id]) markDraft(a, true);
  }

  // Capture phase, so this runs before navigation. Modified clicks
  // (new tab etc.) still go to HN's reply page.
  document.addEventListener('click', (e) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element).closest?.<HTMLAnchorElement>('.reply a[href^="reply?id="]');
    const row = a?.closest<HTMLTableRowElement>('tr.athing.comtr');
    if (!a || !row) return;
    e.preventDefault();
    openBox(row, a);
  }, true);
}

function replyLinks(root: ParentNode): HTMLAnchorElement[] {
  return Array.from(root.querySelectorAll<HTMLAnchorElement>('tr.athing.comtr .reply a[href^="reply?id="]'));
}

function parentIdOf(a: HTMLAnchorElement): string | null {
  return new URLSearchParams(a.getAttribute('href')!.split('?')[1]).get('id');
}

function markDraft(a: HTMLAnchorElement, on: boolean): void {
  a.classList.toggle('hnxt-has-draft', on);
  a.title = on ? 'You have an unsent draft here' : '';
}

/** The selected text inside this comment, formatted as an HN-style quote. */
function quoteFrom(row: HTMLElement): string {
  const sel = window.getSelection();
  const text = row.querySelector('.commtext');
  if (!sel || sel.isCollapsed || !text || !sel.anchorNode || !text.contains(sel.anchorNode)) return '';
  const quoted = sel.toString().trim().split(/\n+/).map((l) => `> ${l.trim()}`).filter((l) => l !== '>').join('\n\n');
  return quoted ? `${quoted}\n\n` : '';
}

// ---------------------------------------------------------------------------

interface Box {
  el: HTMLElement;
  textarea: HTMLTextAreaElement;
}

function openBox(row: HTMLTableRowElement, link: HTMLAnchorElement): void {
  const id = parentIdOf(link);
  if (!id) return;
  const parent = id;
  const quote = quoteFrom(row);

  const existing = open.get(parent);
  if (existing) {
    if (quote) insertAtCursor(existing.textarea, quote);
    existing.textarea.focus();
    return;
  }

  const textarea = h('textarea', { rows: 6, class: 'hnxt-qr-text', placeholder: 'Write a reply…', 'aria-label': 'Reply text' });
  textarea.value = (getDrafts()[parent]?.text ?? '') + quote;
  const status = h('span', { class: 'hnxt-muted hnxt-qr-status' });
  const submit = h('button', { type: 'button', class: 'hnxt-qr-submit', disabled: true }, 'reply');

  const el = h('div', { class: 'hnxt hnxt-qr' },
    textarea,
    h('div', { class: 'hnxt-qr-foot' },
      submit,
      action('cancel', () => close()),
      h('a', { href: 'formatdoc', target: '_blank', class: 'hnxt-muted' }, 'formatting help'),
      h('span', { class: 'hnxt-spacer' }),
      status),
  );
  const box: Box = { el, textarea };
  open.set(parent, box);
  // Directly under the comment text, above the replies.
  (row.querySelector('td.default') ?? row).append(el);
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);

  let draftTimer: number | undefined;
  textarea.addEventListener('input', () => {
    clearTimeout(draftTimer);
    draftTimer = window.setTimeout(() => {
      saveDraft(parent, textarea.value);
      markDraft(link, !!textarea.value.trim());
    }, 400);
  });
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submit.click();
    } else if (e.key === 'Escape') {
      close();
    }
  });

  function close() {
    clearTimeout(draftTimer);
    saveDraft(parent, textarea.value);
    markDraft(link, !!textarea.value.trim());
    el.remove();
    open.delete(parent);
  }

  // Fetch the form token while the user types.
  let form: ReplyForm | null = null;
  status.textContent = 'loading…';
  fetchForm(link.getAttribute('href')!)
    .then((f) => {
      form = f;
      status.textContent = 'Ctrl+Enter to send';
      submit.disabled = false;
    })
    .catch((e: Error) => {
      status.textContent = e.message;
      status.classList.add('hnxt-qr-error');
    });

  submit.addEventListener('click', async () => {
    if (!form || submit.disabled) return;
    const text = textarea.value;
    if (!text.trim()) {
      status.textContent = 'Write something first.';
      return;
    }
    submit.disabled = true;
    textarea.readOnly = true;
    status.classList.remove('hnxt-qr-error');
    status.textContent = 'sending…';
    try {
      const result = await post(form, text);
      saveDraft(parent, '');
      markDraft(link, false);
      el.remove();
      open.delete(parent);
      if (result.row) insertReply(row, result.row);
      else toast('Reply posted. Reload the page to see it.');
    } catch (e) {
      // Keep the draft and the box so nothing is lost.
      status.textContent = e instanceof Error ? e.message : String(e);
      status.classList.add('hnxt-qr-error');
      submit.disabled = false;
      textarea.readOnly = false;
    }
  });
}

function insertAtCursor(t: HTMLTextAreaElement, text: string): void {
  const start = t.selectionStart;
  t.setRangeText(text, start, t.selectionEnd, 'end');
  t.dispatchEvent(new Event('input'));
}

// ---------------------------------------------------------------------------
// Talking to HN

async function fetchForm(replyHref: string): Promise<ReplyForm> {
  const res = await fetch(replyHref, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(res.status === 503 ? 'HN is rate limiting, try again shortly' : `couldn't load the reply form (HTTP ${res.status})`);
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  const f = doc.querySelector('form[action="comment"]');
  const val = (name: string) => f?.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value ?? '';
  if (!f || !val('hmac')) {
    if (doc.querySelector('form[action="login"]')) throw new Error('log in to reply');
    throw new Error(pageMessage(doc) || "can't reply to this comment");
  }
  return { parent: val('parent'), goto: val('goto'), hmac: val('hmac') };
}

async function post(form: ReplyForm, text: string): Promise<{ row: HTMLTableRowElement | null }> {
  const body = new URLSearchParams({ parent: form.parent, goto: form.goto, hmac: form.hmac, text });
  // If the request fails after being sent, the reply may still have been
  // posted; say so rather than inviting a duplicate.
  const unsure = "couldn't confirm the reply was posted. Check the thread before sending again";
  let res: Response;
  try {
    res = await fetch('comment', { method: 'POST', body, credentials: 'same-origin' });
  } catch {
    throw new Error(unsure);
  }
  if (!res.ok) throw new Error(res.status === 503 ? `HN is rate limiting; ${unsure}` : `HTTP ${res.status}; ${unsure}`);
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  // Success redirects to the thread; errors ("posting too fast", too long, …) come back as a bare page at /comment.
  if (new URL(res.url).pathname !== '/item') throw new Error(pageMessage(doc) || 'HN rejected the reply');

  const fetched = parseCommentTree(doc);
  const known = new Set(Array.from(document.querySelectorAll('tr.athing.comtr'), (r) => r.id));
  const mine = fetched?.all.find((n) => n.author === me && !known.has(String(n.id)) && String(n.parent?.id ?? '') === form.parent);
  return { row: mine ? (document.importNode(mine.row, true) as HTMLTableRowElement) : null };
}

/** The short message on an HN error page, if there is one. */
function pageMessage(doc: Document): string {
  const text = (doc.body?.textContent ?? '').replace(/\s+/g, ' ').trim();
  return text.length > 0 && text.length < 300 ? text : '';
}

function insertReply(parentRow: HTMLTableRowElement, row: HTMLTableRowElement): void {
  row.classList.add('hnxt-mine-new');
  const parentNode = tree?.byId.get(Number(parentRow.id));
  if (tree && parentNode) {
    addComment(tree, row, parentNode);
    parentRow.after(row); // placeholder position; resort() moves it into place
    resort();
  } else {
    // Pages without a sortable tree (e.g. /threads): put it right below the parent.
    const ind = parentRow.querySelector('td.ind');
    const indent = Number(ind?.getAttribute('indent') ?? 0) + 1;
    row.querySelector('td.ind')?.setAttribute('indent', String(indent));
    row.querySelector('td.ind img')?.setAttribute('width', String(indent * 40));
    parentRow.after(row);
  }
  commentsAdded([row]);
  row.scrollIntoView({ block: 'nearest' });
}
