import { SORT_MODES } from '../features/sort';
import {
  ACTIONS, compile, DEFAULT_COLOR, describe, FIELDS, getRules, MATCHES, newRule, onApplied, saveRules,
  type Field, type FilterAction, type Match, type Rule,
} from '../features/filters';
import { downloadBackup, importBackup } from '../features/backup';
import { getCustomCss, setCustomCss } from '../features/customCss';
import { getTags, setTag, tagBadge, TAG_COLORS } from '../features/tags';
import { getSettings, onChange, updateSettings, type Settings } from '../storage';
import { action, h, toast } from './dom';

type Tab = 'general' | 'filters' | 'users' | 'css';

let overlay: HTMLElement | null = null;
let unsubscribe: (() => void) | null = null;

export function closeSettings(): void {
  unsubscribe?.();
  unsubscribe = null;
  overlay?.remove();
  overlay = null;
}

export function openSettings(tab: Tab = 'general', draft?: Partial<Rule>): void {
  closeSettings();
  const body = h('div', { class: 'hnxt-modal-body' });
  const tabs = new Map<Tab, HTMLAnchorElement>();
  const show = (t: Tab) => {
    unsubscribe?.();
    unsubscribe = null;
    for (const [k, a] of tabs) a.classList.toggle('hnxt-active', k === t);
    const render = { general: generalTab, filters: () => filtersTab(draft), users: usersTab, css: cssTab }[t];
    body.replaceChildren(render());
    draft = undefined;
  };
  tabs.set('general', action('general', () => show('general'), { class: 'hnxt-seg' }));
  tabs.set('filters', action('filters', () => show('filters'), { class: 'hnxt-seg' }));
  tabs.set('users', action('user tags', () => show('users'), { class: 'hnxt-seg' }));
  tabs.set('css', action('custom CSS', () => show('css'), { class: 'hnxt-seg' }));

  const modal = h('div', { class: 'hnxt hnxt-modal', role: 'dialog', 'aria-label': 'HN-XT settings' },
    h('div', { class: 'hnxt-modal-head' },
      h('b', null, 'HN-XT'),
      h('span', { class: 'hnxt-tabs' }, ...tabs.values()),
      action('×', closeSettings, { class: 'hnxt-close', title: 'Close (Esc)' })),
    body);

  overlay = h('div', { class: 'hnxt-overlay', onmousedown: (e: MouseEvent) => e.target === overlay && closeSettings() }, modal);
  document.body.append(overlay);
  show(tab);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && overlay) closeSettings();
});

// ---------------------------------------------------------------------------
// General

function generalTab(): HTMLElement {
  const s = getSettings();
  const set = (patch: Partial<Settings>) => {
    updateSettings(patch);
    toast('Saved. Applies on the next page load.');
  };
  const check = (key: keyof Settings, label: string, hint?: string) =>
    h('label', { class: 'hnxt-row' },
      h('input', { type: 'checkbox', checked: !!s[key], onchange: (e: Event) => set({ [key]: (e.target as HTMLInputElement).checked }) }),
      ' ', label, hint && h('span', { class: 'hnxt-muted' }, ` — ${hint}`));
  const num = (key: 'pollMinutes' | 'replyLookbackDays', label: string, unit: string, min: number, max: number) =>
    h('label', { class: 'hnxt-row' }, label, ' ',
      h('input', {
        type: 'number', min, max, value: String(s[key]), class: 'hnxt-num',
        onchange: (e: Event) => {
          const v = Math.min(max, Math.max(min, Number((e.target as HTMLInputElement).value) || min));
          (e.target as HTMLInputElement).value = String(v);
          set({ [key]: v });
        },
      }), ` ${unit}`);

  return h('div', null,
    h('h3', null, 'Comments'),
    h('label', { class: 'hnxt-row' }, 'Default sort for threads ',
      h('select', { onchange: (e: Event) => set({ commentSort: (e.target as HTMLSelectElement).value as Settings['commentSort'] }) },
        ...SORT_MODES.map((m) => h('option', { value: m.mode, selected: s.commentSort === m.mode }, m.label))),
      h('span', { class: 'hnxt-muted' }, ' — the sort bar on a thread changes only that thread')),
    check('opBadge', 'Mark the original poster with an OP badge'),
    check('highlightNew', 'Highlight comments that are new since your last visit'),
    check('nextNewKey', 'N / Shift+N jumps to the next / previous new comment'),
    check('highlightRepliesToMe', 'Highlight replies to your comments'),
    check('highlightOwn', 'Mark your own comments with a blue stripe'),
    check('inlineReply', 'Reply to comments in place', "select text first to quote it; Ctrl+click \"reply\" opens HN's page"),
    h('h3', null, 'Story lists'),
    check('newCountsOnListings', 'Show "+N" new comments on story lists', 'for threads you have opened'),
    check('infiniteScroll', 'Load the next page automatically when you scroll to the bottom', 'instead of clicking "More"'),
    h('h3', null, 'Watcher'),
    num('pollMinutes', 'Check watched threads and replies every', 'minutes', 1, 60),
    check('notifyReplies', 'Desktop notification when someone replies to you'),
    check('watcherStartDetached', 'Always open the watcher as a floating window', 'on every page'),
    num('replyLookbackDays', 'Look for replies to your posts from the last', 'days', 1, 60),
    h('p', { class: 'hnxt-muted' },
      'Checks run while any HN tab is open, using the official HN API (only one tab polls at a time).'),
    backupSection(),
  );
}

function backupSection(): HTMLElement {
  const file = h('input', {
    type: 'file', accept: 'application/json,.json', hidden: true,
    onchange: async () => {
      const f = file.files?.[0];
      file.value = '';
      if (!f) return;
      try {
        const restored = importBackup(await f.text());
        toast(`Restored ${restored.join(', ')}. Reloading…`);
        setTimeout(() => location.reload(), 1200);
      } catch (e) {
        toast(`Import failed: ${e instanceof Error ? e.message : e}. Nothing was changed.`);
      }
    },
  });
  return h('div', null,
    h('h3', null, 'Backup'),
    h('p', { class: 'hnxt-muted' },
      'One JSON file with your settings, filters, user tags, custom CSS, watched threads and visit history. ',
      'Importing replaces those sections with the ones in the file.'),
    h('div', { class: 'hnxt-footer' },
      action('export to file', downloadBackup, { class: 'hnxt-button' }),
      action('import from file…', () => file.click(), { class: 'hnxt-button' }),
      file),
  );
}

// ---------------------------------------------------------------------------
// Filters

function filtersTab(draft?: Partial<Rule>): HTMLElement {
  let rules = getRules();
  if (draft) rules = [...rules, newRule(draft)];

  let timer: number | undefined;
  const persist = (now = false) => {
    clearTimeout(timer);
    const go = () => saveRules(rules);
    if (now) go();
    else timer = window.setTimeout(go, 250);
  };
  if (draft) persist(true);

  const list = h('div', { class: 'hnxt-rules' });
  const countEls = new Map<string, HTMLElement>();

  const render = () => {
    countEls.clear();
    list.replaceChildren(
      ...(rules.length
        ? rules.map(ruleRow)
        : [h('p', { class: 'hnxt-muted' }, 'No filters yet. Add one below, or use the ▾ menu next to any story or comment.')]),
    );
  };

  function ruleRow(r: Rule): HTMLElement {
    const update = (patch: Partial<Rule>, rerender = false) => {
      Object.assign(r, patch);
      persist();
      validate();
      if (rerender) render();
    };
    const select = <T extends string>(options: Record<T, string>, value: T, onPick: (v: T) => void, filterKeys?: (k: T) => boolean) =>
      h('select', { onchange: (e: Event) => onPick((e.target as HTMLSelectElement).value as T) },
        ...(Object.keys(options) as T[]).filter((k) => !filterKeys || filterKeys(k)).map((k) => h('option', { value: k, selected: k === value }, options[k])));

    const value = h('input', {
      type: 'text', value: r.value, placeholder: r.match === 'regex' ? 'regular expression' : 'text',
      class: 'hnxt-value', oninput: (e: Event) => update({ value: (e.target as HTMLInputElement).value }),
    });
    const validate = () => {
      const res = compile(r);
      value.classList.toggle('hnxt-invalid', typeof res === 'string');
      value.title = typeof res === 'string' ? res : '';
    };
    validate();

    const count = h('span', { class: 'hnxt-count', title: 'Matches on this page' });
    countEls.set(r.id, count);

    const expiry = h('select', {
      title: 'Remove this filter automatically after a while',
      onchange: (e: Event) => {
        const v = (e.target as HTMLSelectElement).value;
        if (v !== 'keep') update({ expiresAt: v === 'never' ? null : Date.now() + Number(v) * 86400_000 });
      },
    },
      r.expiresAt ? h('option', { value: 'keep', selected: true }, `ends in ${Math.max(1, Math.ceil((r.expiresAt - Date.now()) / 86400_000))}d`) : null,
      h('option', { value: 'never', selected: !r.expiresAt }, 'forever'),
      h('option', { value: '1' }, 'for 1 day'),
      h('option', { value: '7' }, 'for 7 days'),
      h('option', { value: '30' }, 'for 30 days'),
    );

    return h('div', { class: `hnxt-rule${r.enabled ? '' : ' hnxt-disabled'}`, title: describe(r) },
      h('input', { type: 'checkbox', checked: r.enabled, title: 'Enabled', onchange: (e: Event) => update({ enabled: (e.target as HTMLInputElement).checked }, true) }),
      select<Field>(FIELDS, r.field, (v) => update({ field: v }, true)),
      select<Match>(MATCHES, r.match, (v) => update({ match: v }, true)),
      value,
      h('span', { class: 'hnxt-arrow' }, '→'),
      select<FilterAction>(ACTIONS, r.action, (v) => update({ action: v }, true)),
      r.action === 'highlight'
        ? h('input', { type: 'color', value: r.color || DEFAULT_COLOR, title: 'Highlight colour', oninput: (e: Event) => update({ color: (e.target as HTMLInputElement).value }) })
        : null,
      expiry,
      count,
      action('×', () => {
        rules = rules.filter((x) => x !== r);
        persist(true);
        render();
      }, { class: 'hnxt-close', title: 'Delete filter' }),
    );
  }

  render();
  unsubscribe = onApplied((counts) => {
    for (const [id, el] of countEls) {
      const n = counts.get(id) ?? 0;
      el.textContent = n ? `${n} here` : '';
    }
  });
  if (draft) queueMicrotask(() => list.querySelector<HTMLInputElement>('.hnxt-rule:last-child .hnxt-value')?.focus());

  const io = h('textarea', { class: 'hnxt-io', rows: 5, placeholder: 'Paste exported filters (JSON) here' });
  const ioBox = h('div', { class: 'hnxt-iobox', hidden: true }, io,
    h('div', null,
      action('import pasted filters', () => {
        try {
          const parsed: unknown = JSON.parse(io.value);
          if (!Array.isArray(parsed)) throw new Error('expected a JSON array');
          const imported = parsed
            .filter((x): x is Rule => {
              const r = x as Rule;
              return !!r && typeof r.value === 'string' && r.field in FIELDS && r.match in MATCHES && r.action in ACTIONS;
            })
            .map((x) => newRule({ ...x, id: newRule().id }));
          rules = [...rules, ...imported];
          persist(true);
          render();
          io.value = '';
          toast(`Imported ${imported.length} filters.`);
        } catch (e) {
          toast(`Import failed: ${e instanceof Error ? e.message : e}`);
        }
      }, { class: 'hnxt-button' })));

  return h('div', null,
    h('p', { class: 'hnxt-muted' },
      'Filters apply on every page as you edit. "username" rules cover stories and comments. ',
      '"is" on a site also matches its subdomains.'),
    list,
    h('div', { class: 'hnxt-footer' },
      action('+ add filter', () => {
        rules = [...rules, newRule()];
        persist(true);
        render();
        list.querySelector<HTMLInputElement>('.hnxt-rule:last-child .hnxt-value')?.focus();
      }, { class: 'hnxt-button' }),
      h('span', { class: 'hnxt-spacer' }),
      action('export', async () => {
        const json = JSON.stringify(rules.map(({ id: _id, ...r }) => r), null, 1);
        io.value = json;
        ioBox.hidden = false;
        try {
          await navigator.clipboard.writeText(json);
          toast('Filters copied to clipboard.');
        } catch {
          toast('Copy the JSON from the box below.');
        }
      }),
      ' · ',
      action('import', () => {
        ioBox.hidden = !ioBox.hidden;
        io.focus();
      })),
    ioBox,
  );
}

// ---------------------------------------------------------------------------
// User tags

function usersTab(): HTMLElement {
  const list = h('div', { class: 'hnxt-rules' });
  const render = () => {
    const tags = getTags();
    const users = Object.keys(tags).sort((a, b) => a.localeCompare(b));
    list.replaceChildren(...(users.length
      ? users.map((user) => {
          const t = tags[user];
          return h('div', { class: 'hnxt-rule' },
            h('a', { href: `user?id=${encodeURIComponent(user)}`, class: 'hnxt-user' }, user),
            tagBadge(t),
            h('span', { class: 'hnxt-spacer' }),
            h('input', {
              type: 'text', value: t.label, maxlength: 24, title: 'Label',
              onchange: (e: Event) => setTag(user, { ...t, label: (e.target as HTMLInputElement).value }),
            }),
            h('input', {
              type: 'color', value: t.color, title: 'Colour',
              onchange: (e: Event) => setTag(user, { ...t, color: (e.target as HTMLInputElement).value }),
            }),
            action('×', () => setTag(user, null), { class: 'hnxt-close', title: 'Remove tag' }));
        })
      : [h('p', { class: 'hnxt-muted' }, 'No tagged users yet. Use "Tag user…" in the ▾ menu next to any story or comment, or add one below.')]));
  };
  render();
  onChange('userTags', () => overlay && render());

  const name = h('input', { type: 'text', placeholder: 'username' });
  const label = h('input', { type: 'text', placeholder: 'label', maxlength: 24 });
  const color = h('input', { type: 'color', value: TAG_COLORS[5] });
  const add = () => {
    const user = name.value.trim();
    if (!user || !label.value.trim()) return toast('Enter a username and a label.');
    setTag(user, { label: label.value, color: color.value });
    name.value = label.value = '';
  };
  return h('div', null,
    h('p', { class: 'hnxt-muted' }, 'Tags are private to you and show next to the username everywhere on HN. Usernames are case-sensitive.'),
    list,
    h('div', { class: 'hnxt-rule' }, name, label, color, action('+ add tag', add, { class: 'hnxt-button' })),
  );
}

// ---------------------------------------------------------------------------
// Custom CSS

function cssTab(): HTMLElement {
  let timer: number | undefined;
  const area = h('textarea', {
    class: 'hnxt-css', rows: 16, spellcheck: 'false',
    placeholder: '/* Your CSS, applied live to every HN page */\n.commtext { font-size: 10pt; line-height: 1.5; }',
    value: getCustomCss(),
    oninput: () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => setCustomCss(area.value), 300);
    },
  });
  return h('div', null,
    h('p', { class: 'hnxt-muted' },
      "Applied live as you type, after HN's and HN-XT's own styles. Useful hooks: ",
      h('code', null, '.hnxt-new'), ', ', h('code', null, '.hnxt-tome'), ', ', h('code', null, '.hnxt-op'), ', ',
      h('code', null, '.hnxt-tag'), ', ', h('code', null, '.hnxt-toolbar'), ', and the colour variables on ',
      h('code', null, ':root'), ' (', h('code', null, '--hnxt-accent'), ', ', h('code', null, '--hnxt-new'), ', ', h('code', null, '--hnxt-tome'), ').'),
    area,
  );
}
