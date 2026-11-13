import { load, onChange, save } from '../storage';

const KEY = 'customCss';

export const getCustomCss = () => load<string>(KEY, '');
export const setCustomCss = (css: string) => save(KEY, css);

const style = document.createElement('style');
style.id = 'hnxt-custom-css';

/**
 * The user's own stylesheet. Injected at document-start so there's no flash of
 * unstyled page, then moved to the end of <head> once HN's stylesheet exists
 * (see `placeStyles`), so it wins over HN's and HN-XT's styles.
 */
export function initCustomCss(): void {
  style.textContent = getCustomCss();
  (document.head || document.documentElement).append(style);
  onChange<string>(KEY, (css) => {
    style.textContent = css ?? '';
  });
}

/** Puts HN-XT's styles, then the user's, after everything HN loaded. */
export function placeStyles(): void {
  const ours = document.getElementById('hnxt-style');
  if (ours) document.head.append(ours);
  document.head.append(style);
}
