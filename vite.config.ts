import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';
import pkg from './package.json' with { type: 'json' };

// Userscript managers check this URL for updates; it always points at the newest release.
const releaseUrl = 'https://github.com/enlyth/hn-xt/releases/latest/download/hn-xt.user.js';

export default defineConfig({
  plugins: [
    monkey({
      entry: 'src/main.ts',
      userscript: {
        name: 'HN-XT',
        namespace: 'hn-xt',
        version: pkg.version,
        description: 'Comment sorting, thread watching and filters for Hacker News',
        match: ['https://news.ycombinator.com/*'],
        // Early, so the thread toolbar can be in place before the comments render.
        'run-at': 'document-start',
        connect: ['hacker-news.firebaseio.com'],
        homepageURL: 'https://github.com/enlyth/hn-xt',
        downloadURL: releaseUrl,
        updateURL: releaseUrl,
      },
      build: {
        fileName: 'hn-xt.user.js',
        // A <style> we can find again: main.ts moves it after HN's stylesheet once the page is parsed.
        cssSideEffects: (css: string) => {
          const style = document.createElement('style');
          style.id = 'hnxt-style';
          style.textContent = css;
          (document.head || document.documentElement).append(style);
        },
      },
    }),
  ],
});
