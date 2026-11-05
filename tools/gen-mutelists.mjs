// Генератор страниц «<название>: mute list» из готовых списков Pure Spoiler Shield.
//   node tools/gen-mutelists.mjs <путь к words.js из qwemort/pure-spoiler-shield>
// Пишет mute-list/<id>.html, mute-list/index.html и блок в sitemap.xml.
// Данные — только из расширения: названия, общие спойлерные слова и имена (имена — отдельно, с предупреждением).
// Никаких дат и фактов о релизах: они меняются, а эти страницы обновляются сами раз в неделю.
import fs from 'node:fs'; import path from 'node:path'; import vm from 'node:vm';

const SRC = process.argv[2];
if (!SRC || !fs.existsSync(SRC)) { console.error('usage: node tools/gen-mutelists.mjs <words.js>'); process.exit(1); }
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'mute-list');
const BASE = 'https://qwemort.github.io/pure-guides/';
const STORE = 'https://chromewebstore.google.com/detail/aloilpojkoblacapdlknacjiljgjibng?utm_source=pureguides&amp;utm_medium=mutelist-';
const TODAY = new Date().toISOString().slice(0, 10);

let code = fs.readFileSync(SRC, 'utf8');
code = code.replace('const LIB = [', 'const LIB = g.__LIB = [');
if (!code.includes('g.__LIB')) { console.error('words.js changed: LIB not found'); process.exit(1); }
const ctx = { console }; ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(code.replace(/\}\)\(typeof globalThis[^)]*\)|\}\)\(this\)|\}\)\(globalThis\)/, '})(globalThis)'), ctx);
const LIB = ctx.__LIB || (ctx.SS && ctx.SS.__LIB);
if (!Array.isArray(LIB) || !LIB.length) { console.error('LIB is empty'); process.exit(1); }

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const latin = (s) => /^[\x20-\x7e]+$/.test(s);
const cyr = (s) => /[Ѐ-ӿ]/.test(s);
const KIND = { game: 'Game', movie: 'Film', show: 'Series', anime: 'Anime' };
const SP = {
  game: ['spoiler', 'spoilers', 'ending', 'final mission', 'leak', 'leaked', 'story', 'twist', 'cutscene'],
  movie: ['spoiler', 'spoilers', 'ending', 'ending explained', 'post credits', 'leak', 'twist', 'who dies'],
  show: ['spoiler', 'spoilers', 'ending', 'finale', 'leak', 'leaks', 'twist', 'who dies'],
  anime: ['spoiler', 'spoilers', 'ending', 'finale', 'leak', 'leaks', 'chapter leak', 'who dies'],
};
const CYR_SP = ['спойлер', 'спойлери', 'спойлеры', 'кінцівка', 'концовка', 'фінал', 'финал', 'злив', 'слив'];
const uniq = (a) => [...new Set(a.map((x) => x.trim()).filter(Boolean))];
const chips = (group, words) => `<div class="chips" data-group="${group}">${words.map(esc).join('|')}</div>`;

function page(p) {
  const lat = uniq(p.game.filter(latin)).slice(0, 3);
  const cy = uniq(p.game.filter(cyr)).slice(0, 3);
  const core = uniq(lat.flatMap((t) => (SP[p.kind] || SP.game).map((w) => `${t} ${w}`)));
  const other = uniq(cy.flatMap((t) => CYR_SP.slice(0, 5).map((w) => `${t} ${w}`)));
  const strict = uniq(p.game).slice(0, 14);
  const names = uniq([...(p.unique || []), ...(p.common || [])]).slice(0, 16);
  const title = `${p.label} mute list: words to mute on X and Threads`;
  const desc = `Copy-ready words to mute on X and Threads so ${p.label} doesn't get spoiled for you. No spoilers in the list itself.`;
  const url = `${BASE}mute-list/${p.id}.html`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<link rel="stylesheet" href="../style.css">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Pure guides">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${BASE}img/og.png">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">
${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Article', headline: title, dateModified: TODAY, inLanguage: 'en', author: { '@type': 'Organization', name: 'Pure guides' }, mainEntityOfPage: url })}
</script>
<style>
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 6px}
.chip{background:var(--card);color:var(--text);border:1px solid var(--line);border-radius:999px;padding:6px 12px;font:15px/1.3 inherit;cursor:pointer}
.chip:hover{border-color:var(--accent)}.chip.done{border-color:var(--accent);color:var(--accent)}
.copyall{background:var(--accent);color:#06281b;border:0;border-radius:10px;padding:8px 14px;font:inherit;font-weight:600;cursor:pointer;margin:4px 0 18px}
#toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--card);border:1px solid var(--accent);border-radius:10px;padding:8px 14px;opacity:0;transition:opacity .2s;pointer-events:none}#toast.on{opacity:1}
</style>
</head>
<body>
<main>
<a class="brand" href="./">← All mute lists</a>
<div class="hero"><img src="../img/spoilershield.png" alt=""><span class="muted">${KIND[p.kind] || 'Title'} · copy-ready mute list</span></div>
<h1>${esc(p.label)} mute list: words to mute on X and Threads</h1>
<p class="muted">Updated ${TODAY} · free to copy and share, no credit needed</p>
<p>Not caught up on <strong>${esc(p.label)}</strong> yet? Mute these words before people start posting about it. <strong>The list contains no spoilers</strong>: only the title, its common spellings and general words like "ending". Tap a word to copy it, or copy a whole group (one per line).</p>

<h2>1. Core: mute these</h2>
<p class="muted">Hides spoiler talk, keeps most news and trailers.</p>
${chips('core', core)}
<button class="copyall" data-copy="core">Copy core list</button>
${other.length ? `<h2>2. Ukrainian and Russian</h2>\n${chips('other', other)}\n<button class="copyall" data-copy="other">Copy this list</button>` : ''}

<h2>${other.length ? 3 : 2}. Strict mode</h2>
<p class="muted">Every spelling of the title. Hides almost everything about it, including harmless news.</p>
${chips('strict', strict)}
<button class="copyall" data-copy="strict">Copy strict list</button>
${names.length ? `<h2>Names (careful)</h2>
<p class="muted">Character and place names used in the extension's list. A name can be a spoiler on its own if you have not seen it yet, so open this only if you already know them.</p>
<details><summary>Show names</summary>
${chips('names', names)}
<button class="copyall" data-copy="names">Copy names</button>
</details>` : ''}

<h2>Where to paste them</h2>
<ul>
<li><strong>X:</strong> Settings and privacy, Privacy and safety, Mute and block, Muted words. Add one word or phrase at a time.</li>
<li><strong>Threads:</strong> Settings, Privacy, Hidden words, custom words and phrases.</li>
<li><strong>YouTube and Reddit</strong> have no mute by words. See the <a href="../avoid-gta-6-spoilers.html">spoiler guide</a> for what still helps there.</li>
</ul>

<div class="note"><strong>The gap no mute list covers.</strong> YouTube thumbnails, Shorts, Reddit post titles and comments are where spoilers usually land, and neither site lets you mute words. Pure Spoiler Shield, a free browser extension I build, blurs videos, posts and comments that look like spoilers for ${esc(p.label)} (it ships with this exact list) on YouTube, Reddit and X. It runs locally, no account, no tracking, <a href="https://github.com/qwemort/pure-spoiler-shield">source is public</a>. It reads text, so a spoiler only inside an image can slip through. <a href="${STORE}${p.id}">Get it for Chrome</a>. Disclosure: I build it.</div>
<p>Waiting for something else? <a href="https://github.com/qwemort/pure-spoiler-shield/issues/new?template=title-request.yml">Request a list for another title</a>.</p>
<p class="muted">Not affiliated with the creators or rights holders of ${esc(p.label)}. Titles are trademarks of their owners.</p>

<footer>
<p><a href="./">All mute lists</a> · <a href="../">Pure guides</a> · <a href="mailto:papana44444@gmail.com">papana44444@gmail.com</a></p>
<p>This site has no analytics, no cookies and no trackers.</p>
</footer>
</main>
<div id="toast" role="status" aria-live="polite"></div>
<script src="../mutelist.js"></script>
</body>
</html>
`;
}

fs.mkdirSync(OUT, { recursive: true });
const made = [];
for (const p of LIB) {
  if (p.id === 'gta6') continue;               // GTA 6 has its own hand-written page
  fs.writeFileSync(path.join(OUT, p.id + '.html'), page(p));
  made.push(p);
}
const groups = ['game', 'movie', 'show', 'anime'];
const list = groups.map((k) => {
  const items = made.filter((p) => p.kind === k);
  if (!items.length) return '';
  return `<h2>${KIND[k]}s</h2>\n<ul>\n${items.map((p) => `<li><a href="${p.id}.html">${esc(p.label)}</a></li>`).join('\n')}\n</ul>`;
}).join('\n');
fs.writeFileSync(path.join(OUT, 'index.html'), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Spoiler mute lists for games, series, films and anime</title>
<meta name="description" content="Copy-ready words to mute on X and Threads for ${made.length + 1} games, series, films and anime. No spoilers in the lists.">
<link rel="canonical" href="${BASE}mute-list/">
<link rel="stylesheet" href="../style.css">
</head>
<body>
<main>
<a class="brand" href="../">← Pure guides</a>
<h1>Spoiler mute lists</h1>
<p>Copy-ready words to mute on X and Threads, one page per title. No spoilers in the lists. Updated ${TODAY}.</p>
<ul><li><a href="../gta-6-mute-list.html">GTA VI</a> (with Ukrainian, Polish and Russian words)</li></ul>
${list}
<p>Your title is not here? <a href="https://github.com/qwemort/pure-spoiler-shield/issues/new?template=title-request.yml">Request it</a>, no spoilers in the request please. Requests close automatically when the list ships.</p>
<footer>
<p><a href="../">Pure guides</a> · <a href="mailto:papana44444@gmail.com">papana44444@gmail.com</a></p>
<p>This site has no analytics, no cookies and no trackers.</p>
</footer>
</main>
</body>
</html>
`);
// sitemap block
const sm = path.join(ROOT, 'sitemap.xml');
let s = fs.readFileSync(sm, 'utf8').replace(/<!-- mutelists:start -->[\s\S]*?<!-- mutelists:end -->\n?/, '');
const block = '<!-- mutelists:start -->\n' + [`${BASE}mute-list/`, ...made.map((p) => `${BASE}mute-list/${p.id}.html`)]
  .map((u) => `<url><loc>${u}</loc><lastmod>${TODAY}</lastmod></url>`).join('\n') + '\n<!-- mutelists:end -->\n';
s = s.replace('</urlset>', block + '</urlset>');
fs.writeFileSync(sm, s);
console.log(`pages: ${made.length} + index`);
