/*
 * Demo fixture for README screenshots.
 *
 * Run in the page context of a real HN page (front page or any /item page)
 * BEFORE HN-XT runs. It replaces every story, user and comment on the page with
 * made-up content, so screenshots never show real people's posts, then seeds
 * HN-XT's storage (new comments, replies, watched threads, tags, filters) via a
 * localStorage-backed GM_* shim and finally runs the HN-XT build stored in
 * localStorage['hnxt-dev-script'].
 *
 * Usage (from the devtools console or a browser automation tool):
 *   localStorage['hnxt-dev-script'] = <contents of a build of hn-xt.user.js>
 *   eval(<this file>)          // on /news or /item?id=...
 * Remove the "hnxt-" localStorage keys afterwards.
 */
(() => {
  if (window.__hnxtDemo) return 'already';
  window.__hnxtDemo = true;

  const ME = 'demo_user';
  const NOW = Date.now();
  const MIN = 60e3;
  const HOUR = 60 * MIN;

  // ---------------------------------------------------------------- content
  const stories = [
    { id: 9000101, title: 'Show HN: Pocketgrep – grep across all your open browser tabs', domain: 'github.com/mara-k', user: 'mara_k', points: 412, ago: 5, comments: 16 },
    { id: 9000102, title: 'The quiet comeback of the RSS reader', domain: 'example-blog.net', user: 'tamsin', points: 288, ago: 7, comments: 131 },
    { id: 9000103, title: 'Why our build cache made CI slower', domain: 'eng.acme.dev', user: 'jkovac', points: 203, ago: 4, comments: 87 },
    { id: 9000104, title: 'A visual introduction to B-trees', domain: 'datastructures.io', user: 'oddbit', points: 176, ago: 6, comments: 42 },
    { id: 9000105, title: 'Ask HN: How do you keep up with long comment threads?', domain: null, user: 'quietloop', points: 154, ago: 3, comments: 96 },
    { id: 9000106, title: 'New token airdrop promises 400% APY to early holders', domain: 'moonfarm.example', user: 'hypeguy', points: 12, ago: 2, comments: 9 },
    { id: 9000107, title: 'Writing a tiny Forth in 500 lines of C', domain: 'nullptr.blog', user: 'kestrel', points: 141, ago: 8, comments: 38 },
    { id: 9000108, title: 'Postmortem: the day our DNS TTL was zero', domain: 'status.example.com', user: 'ferris_w', points: 133, ago: 9, comments: 57 },
    { id: 9000109, title: 'SQLite as an application file format, ten years on', domain: 'dbnotes.dev', user: 'pg_fan', points: 127, ago: 5, comments: 64 },
    { id: 9000110, title: 'Show HN: A synth you play with your keyboard backlight', domain: 'github.com/lumen-labs', user: 'lumen', points: 98, ago: 3, comments: 21 },
    { id: 9000111, title: 'The economics of small open-source maintainers', domain: 'paperstack.org', user: 'dalia_r', points: 91, ago: 10, comments: 73 },
    { id: 9000112, title: 'I rebuilt my bike computer with an ESP32', domain: 'spokes.example', user: 'spokes', points: 77, ago: 6, comments: 18 },
  ];

  // [id, parent, user, minutes ago, text]; ids grow with time like real HN ids.
  const comments = [
    [9000201, null, 'tamsin', 290, 'This is great. I usually have 80+ tabs open and lose things constantly. Does it search the page text or just titles and URLs?'],
    [9000204, 9000201, 'mara_k', 280, 'Full page text. It indexes the DOM when a tab finishes loading and keeps a small inverted index in extension storage, so search stays instant even with a few hundred tabs.'],
    [9000209, 9000204, ME, 240, 'How big does the index get? I would worry about memory with that many tabs.'],
    [9000223, 9000209, 'mara_k', 25, 'About 40 KB per tab on average. It is capped at 50 MB in total and evicts the least recently used tabs first.'],
    [9000225, 9000209, 'jkovac', 12, 'You could also store trigrams instead of whole words. That keeps it small and gives you partial matches for free.'],
    [9000203, null, 'kestrel', 285, 'Nice project. One request: let me send the results into a new tab group. That is the workflow I always end up wanting.'],
    [9000212, 9000203, 'oddbit', 200, 'Seconded. Tab groups plus search would replace three extensions for me.'],
    [9000226, 9000203, 'mara_k', 9, 'Good idea, it is on the roadmap now.'],
    [9000207, null, 'hypeguy', 260, 'Have you considered launching a token for this? Early users could earn rewards for every search.'],
    [9000214, 9000207, 'quietloop', 230, 'Please don\'t.'],
    [9000210, null, 'ferris_w', 250, 'How does it handle tabs the browser has discarded to save memory? Those don\'t have a live DOM.'],
    [9000216, 9000210, 'mara_k', 190, 'It keeps the last indexed copy, so discarded tabs stay searchable. They show up with a small "sleeping" marker in the results.'],
    [9000228, 9000216, 'ferris_w', 6, 'Perfect, that was my main concern.'],
    [9000218, null, 'dalia_r', 170, 'Is it open source? I want to read the code of anything that sees every page I visit.'],
    [9000219, 9000218, 'mara_k', 160, 'Yes, MIT licensed. The link above is the repo, and nothing ever leaves your machine.'],
    [9000230, null, 'lumen', 3, 'Installed it. The fuzzy matching on URLs is really well done.'],
  ];

  const ago = (minutes) => {
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    const h = Math.round(minutes / 60);
    return `${h} hour${h === 1 ? '' : 's'} ago`;
  };
  const iso = (minutes) => new Date(NOW - minutes * MIN).toISOString().slice(0, 19);
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const url = (s) => (s.domain ? `https://${s.domain}/` : `item?id=${s.id}`);

  function titleline(s) {
    const site = s.domain
      ? `<span class="sitebit comhead"> (<a href="from?site=${s.domain}"><span class="sitestr">${s.domain}</span></a>)</span>`
      : '';
    return `<a href="${url(s)}">${esc(s.title)}</a>${site}`;
  }

  function subline(s, extra = '') {
    const count = s.comments ? `${s.comments}&nbsp;comments` : 'discuss';
    return `<span class="score" id="score_${s.id}">${s.points} points</span> by <a href="user?id=${s.user}" class="hnuser">${s.user}</a> `
      + `<span class="age" title="${iso(s.ago * 60)}"><a href="item?id=${s.id}">${ago(s.ago * 60)}</a></span> <span id="unv_${s.id}"></span>`
      + ` | <a href="hide?id=${s.id}&amp;goto=news">hide</a>${extra} | <a href="item?id=${s.id}">${count}</a>`;
  }

  function fixStoryRow(row, s, rank) {
    row.id = String(s.id);
    const r = row.querySelector('.rank');
    if (r) r.textContent = rank ? `${rank}.` : '';
    const up = row.querySelector('.votelinks a');
    if (up) { up.id = `up_${s.id}`; up.href = '#'; }
    row.querySelector('.titleline').innerHTML = titleline(s);
  }

  function fixHeader() {
    const me = document.getElementById('me');
    if (!me) return;
    me.textContent = ME;
    me.href = `user?id=${ME}`;
    const karma = document.getElementById('karma');
    if (karma) karma.textContent = '1024';
  }

  // ---------------------------------------------------------------- pages
  function buildFrontPage() {
    const rows = [...document.querySelectorAll('tr.athing.submission')];
    rows.forEach((row, i) => {
      const sub = row.nextElementSibling;
      const spacer = sub?.nextElementSibling;
      const s = stories[i];
      if (!s) {
        row.remove(); sub?.remove();
        if (spacer?.classList.contains('spacer')) spacer.remove();
        return;
      }
      fixStoryRow(row, s, i + 1);
      sub.querySelector('.subline').innerHTML = subline(s);
    });
  }

  function buildThread() {
    const s = stories[0];
    const fat = document.querySelector('.fatitem tr.athing.submission');
    fixStoryRow(fat, s, 0);
    fat.parentElement.querySelector('.subline').innerHTML = subline(s, ' | <a href="#">past</a> | <a href="#">favorite</a>');
    const top = document.querySelector('.fatitem .toptext');
    if (top) top.innerHTML = 'I kept losing tabs, so I built a tiny extension that indexes them locally and lets you search with grep-style patterns.';
    document.title = `${s.title} | Hacker News`;

    const table = document.querySelector('table.comment-tree');
    const template = table.querySelector('tr.athing.comtr');
    const tbody = template.parentElement;

    const byId = new Map(comments.map((c) => [c[0], { c, kids: [] }]));
    const roots = [];
    for (const n of byId.values()) (n.c[1] ? byId.get(n.c[1]).kids : roots).push(n);
    const count = (n) => n.kids.reduce((a, k) => a + 1 + count(k), 0);

    // HN's "root | parent | prev | next" links. "next" skips past the subtree.
    const order = [];
    const flatten = (nodes) => nodes.forEach((n) => { order.push(n); flatten(n.kids); });
    flatten(roots);
    const navLinks = (n, siblings) => {
      const [id, parent] = n.c;
      let root = n;
      while (root.c[1]) root = byId.get(root.c[1]);
      const prev = siblings[siblings.indexOf(n) - 1];
      const next = order[order.indexOf(n) + 1 + count(n)];
      const links = [];
      if (parent && byId.get(parent).c[1]) links.push(['root', root.c[0]]);
      if (parent) links.push(['parent', parent]);
      if (prev) links.push(['prev', prev.c[0]]);
      if (next) links.push(['next', next.c[0]]);
      return links.map(([label, target]) => ` | <a href="#${target}" class="clicky" aria-hidden="true">${label}</a>`).join('');
    };

    const out = [];
    const walk = (nodes, depth) => {
      for (const n of nodes) {
        const [id, , user, mins, text] = n.c;
        const row = template.cloneNode(true);
        row.id = String(id);
        row.className = 'athing comtr';
        const ind = row.querySelector('td.ind');
        ind.setAttribute('indent', String(depth));
        ind.querySelector('img')?.setAttribute('width', String(depth * 40));
        const vl = row.querySelector('.votelinks');
        vl.classList.remove('nosee');
        const up = vl.querySelector('a');
        if (up) { up.id = `up_${id}`; up.href = '#'; }
        row.querySelector('.comhead').innerHTML =
          `<a href="user?id=${user}" class="hnuser">${user}</a> <span class="age" title="${iso(mins)}"><a href="item?id=${id}">${ago(mins)}</a></span> `
          + `<span id="unv_${id}"></span><span class="navs">${navLinks(n, nodes)} <a class="togg clicky" id="${id}" n="${count(n) + 1}" href="javascript:void(0)">[–]</a><span class="onstory"></span></span>`;
        const comment = row.querySelector('.comment');
        comment.classList.remove('noshow');
        comment.innerHTML = `<div class="commtext c00">${esc(text)}</div><div class="reply"><p><font size="1"><u><a href="reply?id=${id}&amp;goto=item%3Fid%3D9000101%23${id}" rel="nofollow">reply</a></u></font></p></div>`;
        out.push(row);
        walk(n.kids, depth + 1);
      }
    };
    walk(roots, 0);
    for (const r of [...tbody.querySelectorAll('tr.athing.comtr')]) r.remove();
    tbody.prepend(...out);
  }

  // ---------------------------------------------------------------- HN-XT state
  const P = 'hnxt-test:';
  const L = {};
  const parse = (v) => (v === null || v === undefined ? undefined : JSON.parse(v));
  window.GM_getValue = (k, d) => { const v = localStorage.getItem(P + k); return v === null ? d : JSON.parse(v); };
  window.GM_setValue = (k, v) => { const old = GM_getValue(k); localStorage.setItem(P + k, JSON.stringify(v)); (L[k] || []).forEach((cb) => cb(k, old, v, false)); };
  window.GM_addValueChangeListener = (k, cb) => { (L[k] ??= []).push(cb); return 1; };
  window.addEventListener('storage', (e) => {
    if (e.key && e.key.startsWith(P)) { const k = e.key.slice(P.length); (L[k] || []).forEach((cb) => cb(k, parse(e.oldValue), parse(e.newValue), true)); }
  });
  window.GM_addStyle = (c) => { const st = document.createElement('style'); st.textContent = c; document.head.append(st); return st; };
  window.GM_notification = () => {};
  // No network in the demo: the poll lock below is fresh, and any request just fails.
  window.GM_xmlhttpRequest = (o) => setTimeout(() => o.onerror && o.onerror(), 0);

  // Inline replies: serve a fake reply form for the made-up comments, and
  // never let a POST (an actual reply) leave the page.
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = String(input);
    if ((init.method || 'GET').toUpperCase() !== 'GET') {
      const r = new Response('<html><body>Demo mode: replies are not sent.</body></html>');
      Object.defineProperty(r, 'url', { value: 'https://news.ycombinator.com/comment' });
      return r;
    }
    const m = url.match(/reply\?id=(\d+)/);
    if (m) {
      return new Response(`<form action="comment" method="post"><input type="hidden" name="parent" value="${m[1]}">`
        + `<input type="hidden" name="goto" value="item?id=9000101#${m[1]}"><input type="hidden" name="hmac" value="demo">`
        + '<textarea name="text"></textarea></form>');
    }
    return realFetch(input, init);
  };

  const seed = {
    // Infinite scroll would pull real stories from page 2 into the demo.
    settings: { commentSort: 'default', infiniteScroll: false },
    pollLock: { at: NOW, tab: 'demo' },
    pollStatus: { at: NOW - 2 * MIN },
    visits: {
      9000101: { maxId: 9000220, count: 11, at: NOW - 3 * HOUR },
      9000102: { maxId: 9000190, count: 120, at: NOW - 5 * HOUR },
      9000108: { maxId: 9000150, count: 51, at: NOW - 6 * HOUR },
    },
    watched: {
      9000101: { id: 9000101, title: stories[0].title, seen: 11, latest: 16, addedAt: NOW - 4 * HOUR, checkedAt: NOW - 2 * MIN },
      9000103: { id: 9000103, title: stories[2].title, seen: 80, latest: 87, addedAt: NOW - 3 * HOUR, checkedAt: NOW - 2 * MIN },
      9000104: { id: 9000104, title: stories[3].title, seen: 42, latest: 42, addedAt: NOW - 2 * HOUR, checkedAt: NOW - 2 * MIN },
    },
    replies: {
      user: ME,
      known: {},
      lastPoll: NOW - 2 * MIN,
      unread: [
        { id: 9000225, by: 'jkovac', parent: 9000209, text: comments[4][4], time: NOW - 12 * MIN },
        { id: 9000223, by: 'mara_k', parent: 9000209, text: comments[3][4], time: NOW - 25 * MIN },
        { id: 9000301, by: 'oddbit', parent: 9000150, text: 'Agreed, although the benchmark leaves out cold starts, which is where most of the time goes in practice.', time: NOW - 3 * HOUR },
      ],
    },
    userTags: {
      kestrel: { label: 'compiler dev', color: '#8e44ad' },
      tamsin: { label: 'RSS fan', color: '#16a085' },
    },
    filters: [
      { id: 'f1', enabled: true, field: 'domain', match: 'exact', value: 'moonfarm.example', action: 'hide', color: '#fff3b0', expiresAt: null },
      { id: 'f2', enabled: true, field: 'user', match: 'exact', value: 'hypeguy', action: 'hide', color: '#fff3b0', expiresAt: null },
      { id: 'f3', enabled: true, field: 'title', match: 'word', value: 'SQLite', action: 'highlight', color: '#fff3b0', expiresAt: null },
      { id: 'f4', enabled: true, field: 'text', match: 'regex', value: 'airdrop|APY', action: 'dim', color: '#fff3b0', expiresAt: NOW + 7 * 24 * HOUR },
    ],
  };
  // Optional per-shot overrides, e.g. {"watcherWindow": {"open": true, ...}}.
  Object.assign(seed, JSON.parse(localStorage.getItem('hnxt-demo-extra') || '{}'));
  // HN-XT keys visits by the URL's item id, which is the real thread we're drawing over.
  const pageId = new URLSearchParams(location.search).get('id');
  if (pageId) seed.visits[pageId] = seed.visits[9000101];
  for (const k of Object.keys(localStorage)) if (k.startsWith(P)) localStorage.removeItem(k);
  for (const [k, v] of Object.entries(seed)) localStorage.setItem(P + k, JSON.stringify(v));

  fixHeader();
  if (location.pathname === '/item') buildThread();
  else buildFrontPage();

  (0, eval)(localStorage.getItem('hnxt-dev-script'));
  return 'demo ready';
})();
