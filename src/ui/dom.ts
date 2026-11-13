type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, unknown> | null;

/**
 * Minimal element factory. `on*` keys become listeners, `class` sets the class
 * name, `value`/`checked`/`selected` are set as properties, anything else is an attribute.
 */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs ?? {})) {
    if (val === undefined || val === null || val === false) continue;
    if (key.startsWith('on') && typeof val === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), val as EventListener);
    } else if (key === 'class') {
      el.className = String(val);
    } else if (key === 'value' || key === 'checked' || key === 'selected') {
      (el as unknown as Record<string, unknown>)[key] = val;
    } else {
      el.setAttribute(key, val === true ? '' : String(val));
    }
  }
  append(el, children);
  return el;
}

export function append(el: Element, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'number' ? String(c) : c);
  }
}

/** A link that runs a handler instead of navigating. */
export function action(text: string, onClick: (e: MouseEvent) => void, attrs: Attrs = {}): HTMLAnchorElement {
  return h('a', {
    href: '#',
    ...attrs,
    onclick: (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onClick(e);
    },
  }, text);
}

export function timeAgo(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const hr = Math.round(m / 60);
  if (hr < 48) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

let toastTimer: number | undefined;

/** A small transient message in the corner, with an optional action (e.g. undo). */
export function toast(message: string, act?: { label: string; run: () => void }): void {
  document.querySelector('.hnxt-toast')?.remove();
  const el = h('div', { class: 'hnxt hnxt-toast' }, message);
  if (act) {
    el.append(' ', action(act.label, () => {
      act.run();
      el.remove();
    }));
  }
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.remove(), 6000);
}
