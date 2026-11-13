import { listingStories, onStoriesAdded } from '../hn/page';
import { load, onChange, save } from '../storage';
import { action, h, toast } from '../ui/dom';
import { registerMenuItems } from '../ui/itemMenu';
import type { MenuItem } from '../ui/menu';

// ---------------------------------------------------------------------------
// Rules

export type Field = 'title' | 'domain' | 'user' | 'text';
export type Match = 'contains' | 'word' | 'exact' | 'regex';
export type FilterAction = 'hide' | 'dim' | 'highlight';

export interface Rule {
  id: string;
  enabled: boolean;
  field: Field;
  match: Match;
  value: string;
  action: FilterAction;
  /** Highlight colour. */
  color: string;
  expiresAt: number | null;
}

export const FIELDS: Record<Field, string> = {
  title: 'story title',
  domain: 'story site',
  user: 'username',
  text: 'comment text',
};
export const MATCHES: Record<Match, string> = {
  contains: 'contains',
  word: 'has word',
  exact: 'is',
  regex: 'matches regex',
};
export const ACTIONS: Record<FilterAction, string> = {
  hide: 'hide',
  dim: 'dim',
  highlight: 'highlight',
};
export const DEFAULT_COLOR = '#fff3b0';

const KEY = 'filters';

export const getRules = () => load<Rule[]>(KEY, []);
export const saveRules = (rules: Rule[]) => save(KEY, rules);

export function newRule(partial: Partial<Rule> = {}): Rule {
  return {
    id: Math.random().toString(36).slice(2, 10),
    enabled: true,
    field: 'title',
    match: 'contains',
    value: '',
    action: 'hide',
    color: DEFAULT_COLOR,
    expiresAt: null,
    ...partial,
  };
}

export function addRule(partial: Partial<Rule>): Rule {
  const rule = newRule(partial);
  saveRules([...getRules(), rule]);
  return rule;
}

export function describe(r: Rule): string {
  return `${ACTIONS[r.action]}: ${FIELDS[r.field]} ${MATCHES[r.match]} "${r.value}"`;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Compiles a rule to a test function, or an error message for a bad regex. */
export function compile(r: Rule): ((s: string) => boolean) | string {
  const v = r.value.trim();
  if (r.match === 'regex') {
    try {
      const re = new RegExp(v, 'i');
      return (s) => re.test(s);
    } catch (e) {
      return e instanceof Error ? e.message : 'invalid regex';
    }
  }
  const lower = v.toLowerCase();
  if (r.field === 'domain' && r.match === 'exact') {
    // "example.com" also covers "blog.example.com" and HN's "github.com/user" style.
    return (s) => {
      const d = s.toLowerCase();
      return d === lower || d.endsWith(`.${lower}`) || d.startsWith(`${lower}/`);
    };
  }
  if (r.match === 'exact') return (s) => s.trim().toLowerCase() === lower;
  if (r.match === 'word') {
    const re = new RegExp(`(^|[^\\p{L}\\p{N}_])${escape(v)}($|[^\\p{L}\\p{N}_])`, 'iu');
    return (s) => re.test(s);
  }
  return (s) => s.toLowerCase().includes(lower);
}

const isLive = (r: Rule) => r.enabled && r.value.trim() !== '' && (r.expiresAt === null || r.expiresAt > Date.now());

// ---------------------------------------------------------------------------
// Targets: the stories and comments on the current page

interface Target {
  kind: 'story' | 'comment';
  fields: Partial<Record<Field, string>>;
  rows: HTMLElement[];
  /** Where the "filtered" stub goes for comments. */
  head: HTMLElement | null;
}

const appliesTo = (field: Field, kind: Target['kind']) =>
  field === 'user' || (kind === 'story' ? field === 'title' || field === 'domain' : field === 'text');

function collectTargets(): Target[] {
  const stories: Target[] = listingStories().map((s) => ({
    kind: 'story',
    fields: { title: s.title, domain: s.domain ?? '', user: s.user ?? '' },
    rows: s.rows,
    head: null,
  }));
  const comments: Target[] = Array.from(document.querySelectorAll<HTMLElement>('tr.athing.comtr')).map((row) => ({
    kind: 'comment',
    fields: {
      user: row.querySelector('.comhead a[href^="user?id="]')?.textContent ?? '',
      text: row.querySelector('.commtext')?.textContent ?? '',
    },
    rows: [row],
    head: row.querySelector('.comhead'),
  }));
  return [...stories, ...comments];
}

// ---------------------------------------------------------------------------
// Applying

let showHiddenStories = false;
let lastCounts = new Map<string, number>();
const listeners = new Set<(counts: Map<string, number>) => void>();

/** Subscribe to per-rule match counts after every re-apply (used by the editor). */
export function onApplied(cb: (counts: Map<string, number>) => void): () => void {
  listeners.add(cb);
  cb(lastCounts);
  return () => listeners.delete(cb);
}

const FILTER_CLASSES = ['hnxt-f-hide', 'hnxt-f-shown', 'hnxt-f-dim', 'hnxt-f-hl', 'hnxt-f-stub', 'hnxt-f-open'];

export function applyFilters(rules = getRules()): void {
  for (const el of document.querySelectorAll('.hnxt-f-mark, .hnxt-f-banner')) el.remove();
  for (const el of document.querySelectorAll<HTMLElement>(FILTER_CLASSES.map((c) => `.${c}`).join(','))) {
    el.classList.remove(...FILTER_CLASSES);
    el.style.removeProperty('--hnxt-hl');
  }

  const compiled = rules.filter(isLive).flatMap((r) => {
    const test = compile(r);
    return typeof test === 'string' ? [] : [{ rule: r, test }];
  });
  const counts = new Map<string, number>();
  let hiddenStories = 0;

  for (const t of collectTargets()) {
    const hits = compiled.filter(({ rule, test }) => appliesTo(rule.field, t.kind) && test(t.fields[rule.field] ?? ''));
    if (!hits.length) continue;
    for (const { rule } of hits) counts.set(rule.id, (counts.get(rule.id) ?? 0) + 1);

    const pick = (a: FilterAction) => hits.find((x) => x.rule.action === a)?.rule;
    const hide = pick('hide');
    const dim = pick('dim');
    const hl = pick('highlight');

    if (hl) {
      for (const r of t.rows) {
        r.classList.add('hnxt-f-hl');
        r.style.setProperty('--hnxt-hl', hl.color);
      }
    }
    if (hide && t.kind === 'story') {
      hiddenStories++;
      for (const r of t.rows) r.classList.add(showHiddenStories ? 'hnxt-f-shown' : 'hnxt-f-hide');
      if (showHiddenStories) t.rows[0].querySelector('.titleline')?.append(mark(hide));
    } else if (hide && t.kind === 'comment') {
      // Replies stay visible: they're often worth reading even when the parent isn't.
      const row = t.rows[0];
      row.classList.add('hnxt-f-stub');
      t.head?.append(
        h('span', { class: 'hnxt hnxt-f-mark', title: describe(hide) }, ' [filtered] ',
          action('show', (e) => {
            const open = row.classList.toggle('hnxt-f-open');
            (e.target as HTMLElement).textContent = open ? 'hide' : 'show';
          })),
      );
    } else if (dim) {
      for (const r of t.rows) r.classList.add('hnxt-f-dim');
    }
  }

  if (hiddenStories) storyBanner(hiddenStories);
  lastCounts = counts;
  for (const cb of listeners) cb(counts);
}

function mark(rule: Rule): HTMLElement {
  return h('span', { class: 'hnxt hnxt-badge hnxt-f-mark', title: describe(rule) }, 'filtered');
}

function storyBanner(n: number): void {
  const first = listingStories()[0];
  const table = first?.rows[0].closest('table');
  if (!table) return;
  table.before(
    h('div', { class: 'hnxt hnxt-f-banner' },
      `${n} ${n === 1 ? 'story' : 'stories'} hidden by filters · `,
      action(showHiddenStories ? 'hide them' : 'show them', () => {
        showHiddenStories = !showHiddenStories;
        applyFilters();
      })),
  );
}

// ---------------------------------------------------------------------------
// Setup, and "▾" menu entries for creating rules from what you're looking at

type OpenEditor = (draft: Partial<Rule>) => void;

export function initFilters(openEditor: OpenEditor): void {
  // Drop expired rules so the list doesn't fill up with dead "mute for a week" entries.
  const rules = getRules();
  const live = rules.filter((r) => r.expiresAt === null || r.expiresAt > Date.now());
  if (live.length !== rules.length) saveRules(live);

  registerMenuItems((ctx) => {
    const items: MenuItem[] = [];
    const { user, domain } = ctx;
    if (user) items.push({ label: `Hide all posts by ${user}`, run: () => quickAdd({ field: 'user', match: 'exact', value: user }) });
    if (domain) {
      items.push({ label: `Hide ${domain}`, run: () => quickAdd({ field: 'domain', match: 'exact', value: domain }) });
      // HN shows e.g. "github.com/user" for some hosts; offer the whole site too.
      const host = domain.split('/')[0];
      if (host !== domain) items.push({ label: `Hide all of ${host}`, run: () => quickAdd({ field: 'domain', match: 'exact', value: host }) });
    }
    if (user) items.push({ label: `Highlight ${user}`, run: () => quickAdd({ field: 'user', match: 'exact', value: user, action: 'highlight' }) });
    items.push(ctx.kind === 'story'
      ? { label: 'Filter titles like this…', run: () => openEditor({ field: 'title', match: 'word', value: ctx.selection }) }
      : { label: 'Filter comment text…', run: () => openEditor({ field: 'text', match: 'word', value: ctx.selection }) });
    return items;
  });

  applyFilters(live);
  onChange<Rule[]>(KEY, (r) => applyFilters(r ?? []));
  onStoriesAdded(() => applyFilters());
}

function quickAdd(partial: Partial<Rule>): void {
  const rule = addRule(partial);
  toast(`Added filter: ${describe(rule)}.`, {
    label: 'undo',
    run: () => saveRules(getRules().filter((r) => r.id !== rule.id)),
  });
}
