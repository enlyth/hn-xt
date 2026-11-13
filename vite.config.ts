import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';

export default defineConfig({
  plugins: [
    monkey({
      entry: 'src/main.ts',
      userscript: {
        name: 'HN-XT',
        namespace: 'hn-xt',
        version: '0.1.0',
        description: 'Comment sorting, thread watching and filters for Hacker News',
        match: ['https://news.ycombinator.com/*'],
        'run-at': 'document-end',
        connect: ['hacker-news.firebaseio.com'],
      },
      build: {
        fileName: 'hn-xt.user.js',
      },
    }),
  ],
});
