// Страницы «How to block <title> spoilers on YouTube, Reddit and X» для каждого готового списка Shield.
//   node tools/gen-block.mjs <путь к words.js из qwemort/pure-spoiler-shield>
// Пишет block/<id>.html, block/index.html и блок в sitemap.xml. Только тайтлы, для которых в Shield есть список:
// страница не обещает того, чего продукт не делает. Mute-list страницы остаются отдельно (слова для X/Threads).
import fs from 'node:fs'; import path from 'node:path'; import vm from 'node:vm';

const SRC = process.argv[2];
if (!SRC || !fs.existsSync(SRC)) { console.error('usage: node tools/gen-block.mjs <words.js>'); process.exit(1); }
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'block');
const FACTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/facts.json'), 'utf8'));
const BASE = 'https://qwemort.github.io/pure-guides/';
const FF = FACTS.links.firefox + '?utm_source=pureguides&amp;utm_medium=block-';
const STORE = FACTS.links.chrome + '?utm_source=pureguides&amp;utm_medium=block-';
const TODAY = new Date().toISOString().slice(0, 10);

let code = fs.readFileSync(SRC, 'utf8').replace('const LIB = [', 'const LIB = g.__LIB = [');
const ctx = { console }; ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(code.replace(/\}\)\(typeof globalThis[^)]*\)|\}\)\(this\)|\}\)\(globalThis\)/, '})(globalThis)'), ctx);
const LIB = ctx.__LIB || (ctx.SS && ctx.SS.__LIB);
if (!Array.isArray(LIB) || !LIB.length) { console.error('LIB is empty'); process.exit(1); }

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const KIND = { game: 'game', movie: 'film', show: 'series', anime: 'anime' };
const DEMO_KIND = { game: 'game', movie: 'movie', show: 'series', anime: 'anime' };
const scripts = (a) => { const s = new Set(); for (const w of a) { if (/[a-z]/i.test(w)) s.add('Latin'); if (/[Ѐ-ӿ]/.test(w)) s.add('Cyrillic'); if (/[぀-ヿ一-鿿]/.test(w)) s.add('Japanese/Chinese'); if (/[가-힯]/.test(w)) s.add('Korean'); } return [...s]; };
const muteHref = (p) => p.id === 'gta6' ? '../gta-6-mute-list.html' : `../mute-list/${p.id}.html`;

function page(p) {
  const L = p.label, k = KIND[p.kind] || 'title';
  const spell = (p.game || []).length, names = new Set([...(p.unique || []), ...(p.common || [])]).size;
  const sc = scripts(p.game || []);
  // люди ищут «GTA 6», а не «GTA VI» (проверка выдачи 10.11.2026): в заголовке и описании пишем так, как ищут
  const T = p.id === 'gta6' ? 'GTA 6' : L, D = p.id === 'gta6' ? 'GTA 6 (GTA VI)' : L;
  const title = `How to block ${T} spoilers on YouTube, Reddit and X`;
  const desc = `YouTube and Reddit can't mute words. Here is what works for ${D} spoilers: a free extension that blurs them, plus what each site lets you turn off.`;
  const url = `${BASE}block/${p.id}.html`;
  const faq = [
    [`Can YouTube block ${L} spoilers by itself?`, `No. YouTube has no word filter. You can tap "Not interested" or "Don't recommend channel" on single videos, but new spoiler thumbnails, Shorts and comments still show up.`],
    [`How do I hide ${L} spoilers on Reddit?`, `Reddit lets you mute whole communities, not words, so posts about ${L} in other subreddits and in search still appear. An extension that reads post titles and comments is the only way to filter by words.`],
    [`Does X (Twitter) have a filter for ${L} spoilers?`, `Yes, X has muted words. It hides posts that contain them, but not the same videos on YouTube or posts on Reddit.`],
    [`Is Pure Spoiler Shield free?`, `Yes, all of it. The ready-made ${L} list, the other ready-made lists and as many titles of your own as you like work on YouTube, Reddit and X, and after one click on Google search, TikTok and Instagram. There is no paid version and no account.`],
    [`Does it collect my data?`, `No. It runs in your browser with no account and no tracking, and its source code is public.`],
  ];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc.slice(0, 158))}">
<link rel="canonical" href="${url}">
<link rel="stylesheet" href="../style.css">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Pure guides">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc.slice(0, 158))}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${BASE}img/demo.png">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">
${JSON.stringify({ '@context': 'https://schema.org', '@graph': [
    { '@type': 'Article', headline: title, dateModified: TODAY, inLanguage: 'en', author: { '@type': 'Organization', name: 'Pure guides' }, mainEntityOfPage: url },
    { '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
  ] })}
</script>
<style>
.demo{width:100%;height:560px;border:1px solid var(--line);border-radius:14px;background:var(--bg);display:block}
.cta{display:inline-block;background:var(--signal);color:var(--on-signal);border-radius:12px;padding:12px 18px;font-weight:700;text-decoration:none;margin:6px 0 10px}
.short{background:var(--code);border-color:transparent}
</style>
</head>
<body>
<main>
<a class="brand" href="./">← All titles</a>
<div class="hero"><img src="../img/spoilershield.png" alt=""><span class="muted">Spoiler protection · ${esc(k)}</span></div>
<h1>${esc(title)}</h1>
<p class="muted">Updated ${TODAY}</p>

<div class="note short"><strong>Short answer.</strong> YouTube and Reddit have no way to mute words, so ${esc(L)} spoilers in thumbnails, titles and comments get through. A browser extension that reads the page and blurs matching videos, posts and comments is what actually works. I build one, Pure Spoiler Shield: it is free, ships with a ready-made ${esc(L)} list and runs locally.</div>

<p><a class="cta" href="${STORE}${p.id}">Add Pure Spoiler Shield to Chrome, free</a><br><span class="muted">Disclosure: I build it. Also on <a href="${FF}${p.id}">Firefox</a>.</span></p>

<h2>Try it right here</h2>
<p class="muted">A made-up YouTube-style feed with no real spoilers. Switch the Shield on and watch the ${esc(L)} spoiler videos blur while trailers and everything else stay (this is the "spoilers only" level).</p>
<iframe class="demo" src="../demo/?t=${encodeURIComponent(L)}&amp;kind=${DEMO_KIND[p.kind] || 'game'}&amp;embed=1" title="Pure Spoiler Shield demo for ${esc(L)}" loading="lazy"></iframe>

<h2>What the ${esc(L)} list hides</h2>
<ul>
<li><strong>${spell} spellings of the title</strong>${sc.length ? ` (${sc.join(', ')} script)` : ''}, ${p.kind === 'anime' || p.kind === 'show' ? `By default it hides <strong>everything</strong> about ${esc(L)} (for a running season almost any news can spoil); switch the level to "spoilers only" to keep plain news and trailers.` : `By default it hides spoiler talk (ending, leak, twist and the like) and keeps plain news and trailers; switch the level to "everything" to hide all of it.`}</li>
${names ? `<li><strong>${names} character and place names</strong> from the list. Names that belong only to ${esc(L)} are recognised on their own; names that are also ordinary words count only on pages that are already about ${esc(L)}.</li>` : ''}
<li>Works on <strong>YouTube</strong> (home, search, Shorts, comments), <strong>Reddit</strong> (posts and comments) and <strong>X</strong>.</li>
<li>To see a hidden item, click it twice. Nothing is deleted, only covered.</li>
</ul>
<p class="muted">Honest limits: it reads text, so a spoiler that is only inside a thumbnail image, with no words, can slip through. It works in the desktop browser, not in phone apps.</p>

<h2>Set it up in a minute</h2>
<ol>
<li><a href="${STORE}${p.id}">Install Pure Spoiler Shield</a> from the Chrome Web Store.</li>
<li>Open it and turn on <strong>${esc(L)}</strong> in the list of ready-made titles.</li>
<li>Open YouTube or Reddit. Matching cards and comments are blurred right away.</li>
</ol>

<h2>What each site lets you do without an extension</h2>
<ul>
<li><strong>X:</strong> muted words. Copy-ready list: <a href="${muteHref(p)}">${esc(L)} mute list</a>.</li>
<li><strong>Threads:</strong> Settings, Privacy, Hidden words.</li>
<li><strong>YouTube:</strong> "Not interested" and "Don't recommend channel" on single videos only.</li>
<li><strong>Reddit:</strong> mute whole communities, not words.</li>
</ul>

<h2>Questions</h2>
${faq.map(([q, a]) => `<h3>${esc(q)}</h3>\n<p>${esc(a)}</p>`).join('\n')}

<p>Want to talk about the ending without spoiling anyone? Use a <a href="../s/">spoiler link</a>. Missing a title? <a href="https://github.com/qwemort/pure-spoiler-shield/issues/new?template=title-request.yml">Request a list</a>.</p>
<p class="muted">Not affiliated with the creators or rights holders of ${esc(L)}. Titles are trademarks of their owners.</p>
<footer>
<p><a href="./">All titles</a> · <a href="../mute-list/">Mute lists</a> · <a href="../spoiler-danger/">Spoiler danger this week</a> · <a href="../">Pure guides</a></p>
<p>This site has no analytics, no cookies and no trackers.</p>
</footer>
</main>
</body>
</html>
`;
}

fs.mkdirSync(OUT, { recursive: true });
for (const p of LIB) fs.writeFileSync(path.join(OUT, p.id + '.html'), page(p));
const groups = [['game', 'Games'], ['movie', 'Films'], ['show', 'Series'], ['anime', 'Anime']];
fs.writeFileSync(path.join(OUT, 'index.html'), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Block spoilers on YouTube, Reddit and X: ${LIB.length} games, series, films and anime</title>
<meta name="description" content="How to block spoilers for ${LIB.length} games, series, films and anime on YouTube, Reddit and X, where sites can't mute words.">
<link rel="canonical" href="${BASE}block/">
<link rel="stylesheet" href="../style.css">
</head>
<body>
<main>
<a class="brand" href="../">Pure guides</a>
<h1>Block spoilers on YouTube, Reddit and X</h1>
<p>YouTube and Reddit can't mute words. Pick your title to see what works, with a live demo. Updated ${TODAY}.</p>
${groups.map(([k, h]) => { const it = LIB.filter((p) => p.kind === k); return it.length ? `<details class="tgroup tg-${k}"${k === 'game' ? ' open' : ''}><summary><h2 class="titles-h"><span class="cover">${h}</span><span class="tcount">${it.length} lists</span></h2><span class="tchev" aria-hidden="true"></span></summary>\n<ul class="titles">${it.map((p) => `<li><a href="${p.id}.html">${esc(p.label)}</a></li>`).join('')}</ul></details>` : ''; }).join('\n')}
<footer><p><a href="../">Pure guides</a></p><p>This site has no analytics, no cookies and no trackers.</p></footer>
</main>
</body>
</html>
`);
const sm = path.join(ROOT, 'sitemap.xml');
let s = fs.readFileSync(sm, 'utf8').replace(/<!-- block:start -->[\s\S]*?<!-- block:end -->\n?/, '');
s = s.replace('</urlset>', '<!-- block:start -->\n' + [`${BASE}block/`, ...LIB.map((p) => `${BASE}block/${p.id}.html`)]
  .map((u) => `<url><loc>${u}</loc><lastmod>${TODAY}</lastmod></url>`).join('\n') + '\n<!-- block:end -->\n</urlset>');
fs.writeFileSync(sm, s);

// Главная: чипы тайтлов (между маркерами) и число списков (между <!--n--> и <!--/n-->) обновляются сами.
const home = path.join(ROOT, 'index.html');
if (fs.existsSync(home)) {
  const chips = groups.map(([k, t]) => { const it = LIB.filter((p) => p.kind === k); return it.length ? `<details class="tgroup tg-${k}"${k === 'game' ? ' open' : ''}><summary><h3 class="titles-h"><span class="cover">${t}</span><span class="tcount">${it.length} lists</span></h3><span class="tchev" aria-hidden="true"></span></summary>\n<ul class="titles">${it.map((p) => `<li><a href="block/${p.id}.html">${esc(p.label)}</a></li>`).join('')}</ul></details>` : ''; }).join('\n');
  let h = fs.readFileSync(home, 'utf8');
  h = h.replace(/<!-- titles:start -->[\s\S]*?<!-- titles:end -->/, `<!-- titles:start -->\n${chips}\n<!-- titles:end -->`);
  h = h.replace(/<!--n-->[\s\S]*?<!--\/n-->/g, `<!--n-->${LIB.length}<!--/n-->`);
  fs.writeFileSync(home, h);
  console.log('home: chips updated');
}
console.log(`block pages: ${LIB.length} + index`);
