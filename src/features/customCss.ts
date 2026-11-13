import { load, onChange, save } from '../storage';

const KEY = 'customCss';

export const getCustomCss = () => load<string>(KEY, '');
export const setCustomCss = (css: string) => save(KEY, css);

/** The user's own stylesheet, injected last so it wins over HN's and HN-XT's styles. */
export function initCustomCss(): void {
  const style = document.createElement('style');
  style.id = 'hnxt-custom-css';
  const apply = (css: string) => {
    style.textContent = css;
    // Re-append so it stays after any styles added since.
    document.head.append(style);
  };
  apply(getCustomCss());
  onChange<string>(KEY, (css) => apply(css ?? ''));
}
