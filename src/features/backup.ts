import { load, save } from '../storage';

/**
 * Everything worth carrying to another browser, as one JSON document.
 * Transient state (poll lock/status, reply bookkeeping) is left out on purpose.
 */
const KEYS = {
  settings: 'settings',
  filters: 'filters',
  userTags: 'user tags',
  customCss: 'custom CSS',
  watched: 'watched threads',
  visits: 'thread visit history',
  watcherWindow: 'watcher window position',
  threadSort: 'per-thread sort choices',
} as const;

type Key = keyof typeof KEYS;
const FORMAT = 'hn-xt-backup';

export interface Backup {
  format: typeof FORMAT;
  version: 1;
  exportedAt: string;
  data: Partial<Record<Key, unknown>>;
}

export function exportBackup(): Backup {
  const data: Backup['data'] = {};
  for (const k of Object.keys(KEYS) as Key[]) {
    const v = load<unknown>(k, undefined);
    if (v !== undefined) data[k] = v;
  }
  return { format: FORMAT, version: 1, exportedAt: new Date().toISOString(), data };
}

export function downloadBackup(): void {
  const json = JSON.stringify(exportBackup(), null, 2);
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `hn-xt-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Restores a backup, replacing each section it contains and leaving the
 * others alone. Returns the names of what was restored.
 */
export function importBackup(text: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('not valid JSON');
  }
  const b = parsed as Partial<Backup>;
  if (!b || b.format !== FORMAT || typeof b.data !== 'object' || !b.data) throw new Error('not an HN-XT backup file');

  const checks: Record<Key, (v: unknown) => boolean> = {
    settings: isObject,
    filters: Array.isArray,
    userTags: isObject,
    customCss: (v) => typeof v === 'string',
    watched: isObject,
    visits: isObject,
    watcherWindow: isObject,
    threadSort: isObject,
  };
  // Validate everything before writing anything, so a bad file changes nothing.
  for (const k of Object.keys(KEYS) as Key[]) {
    const v = (b.data as Record<string, unknown>)[k];
    if (v === undefined) continue;
    if (!checks[k](v)) throw new Error(`"${k}" has the wrong shape`);
  }
  const restored: string[] = [];
  for (const k of Object.keys(KEYS) as Key[]) {
    const v = (b.data as Record<string, unknown>)[k];
    if (v === undefined) continue;
    save(k, v);
    restored.push(KEYS[k]);
  }
  return restored;
}

function isObject(v: unknown): boolean {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
