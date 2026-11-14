// Из data/spoiler-index.json: карточки 1080×1350 (uk и en), тексты постов и страница spoiler-index/.
//   node tools/spoiler-index-card.mjs        (нужен playwright для рендера PNG)
// Пишет spoiler-index/<дата>-uk.png, -en.png, latest-uk.png, latest-en.png, index.html и out/index-post.json.
import { createRequire } from 'node:module'; import fs from 'node:fs'; import path from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const BASE = 'https://qwemort.github.io/pure-guides/';
const DIR = path.join(ROOT, 'spoiler-index'); fs.mkdirSync(DIR, { recursive: true });
fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true });
const H = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'spoiler-index.json'), 'utf8'));
if (!H.length) { console.error('история пустая'); process.exit(1); }
const E = H[H.length - 1], P = H.length > 1 ? H[H.length - 2] : null, day = H.length;
const RELEASE = (JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'games.json'), 'utf8')).find((g) => /gta/i.test(g.title)) || {}).date || '2026-11-19';
const dLeft = Math.round((Date.parse(RELEASE) - Date.parse(E.date)) / 864e5);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtDate = (d, lang) => new Date(d + 'T12:00:00Z').toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'en-US', { day: 'numeric', month: 'long', timeZone: 'UTC' });

const L = {
  uk: {
    title: 'ІНДЕКС СПОЙЛЕРІВ', day: `день ${day}`, lead: 'вбиваєш на YouTube просто',
    of: (s, n) => `${s} з ${n}`, unit: 'перших відео вже зі спойлерами*',
    q: 'інші запити', total: 'унікальних спойлерних відео по всіх запитах', chart: 'як змінюється «gta 6»',
    left: dLeft > 0 ? `до релізу ${dLeft} дн.` : dLeft === 0 ? 'сьогодні реліз' : `після релізу ${-dLeft} дн.`,
    foot: '* так їх бачить Pure Spoiler Blocker · рахує бот щодня · YouTube без логіну, США', lq: '«', rq: '»',
  },
  en: {
    title: 'SPOILER INDEX', day: `day ${day}`, lead: 'search YouTube for just',
    of: (s, n) => `${s} of ${n}`, unit: 'top videos already carry spoilers*',
    q: 'other searches', total: 'unique spoiler videos across all searches', chart: 'trend for "gta 6"',
    left: dLeft > 0 ? `${dLeft} days to release` : dLeft === 0 ? 'release day' : `${-dLeft} days after release`,
    foot: '* as Pure Spoiler Blocker sees them · counted daily by a bot · YouTube, no login, US', lq: '"', rq: '"',
  },
};

function chart(lang) {
  const W = 920, Ht = 330, pad = 34;
  const pts = H.slice(-21); const max = Math.max(4, ...pts.map((x) => x.main.spoilers)) * 1.3; // запас сверху для подписи
  const x = (i) => pts.length === 1 ? W / 2 : pad + (i * (W - 2 * pad)) / (pts.length - 1);
  const y = (v) => Ht - pad - (v / max) * (Ht - 2 * pad);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.main.spoilers).toFixed(1)}`).join(' ');
  const area = pts.length > 1 ? `${line} L${x(pts.length - 1).toFixed(1)},${Ht - pad} L${x(0).toFixed(1)},${Ht - pad} Z` : '';
  const ri = pts.findIndex((p) => p.date >= RELEASE);
  const rel = ri > 0 ? `<line x1="${x(ri)}" x2="${x(ri)}" y1="${pad - 10}" y2="${Ht - pad}" stroke="#B38F00" stroke-dasharray="6 6" stroke-width="2"/><text x="${x(ri) + 8}" y="${pad}" fill="#B38F00" font-size="20" font-weight="700">${lang === 'uk' ? 'реліз' : 'release'}</text>` : '';
  const labels = pts.map((p, i) => (i === 0 || i === pts.length - 1) ? `<text x="${x(i)}" y="${Ht - 6}" fill="#666B66" font-size="20" text-anchor="${pts.length === 1 ? 'middle' : i ? 'end' : 'start'}">${esc(fmtDate(p.date, lang))}</text>` : '').join('');
  const last = pts[pts.length - 1];
  return `<svg viewBox="0 0 ${W} ${Ht}" width="${W}" height="${Ht}">
    <line x1="${pad}" x2="${W - pad}" y1="${Ht - pad}" y2="${Ht - pad}" stroke="#E2E4E0" stroke-width="2"/>
    ${area ? `<path d="${area}" fill="rgba(58,62,69,.08)"/>` : ''}
    ${pts.length > 1 ? `<path d="${line}" fill="none" stroke="#3A3E45" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
    ${rel}
    <circle cx="${x(pts.length - 1)}" cy="${y(last.main.spoilers)}" r="10" fill="#3A3E45"/>
    <text x="${x(pts.length - 1) + (pts.length === 1 ? 0 : -16)}" y="${y(last.main.spoilers) - 20}" fill="#2A2D32" font-size="28" font-weight="800" text-anchor="${pts.length === 1 ? 'middle' : 'end'}">${last.main.spoilers}</text>
    ${labels}
  </svg>`;
}

function card(lang) {
  const t = L[lang]; const m = E.main; const pct = m.cards ? Math.round((100 * m.spoilers) / m.cards) : 0;
  const delta = P ? E.main.spoilers - P.main.spoilers : null;
  const dtxt = delta === null ? '' : delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : '±0';
  const rows = E.queries.slice(1).map((q) => `<div class="row"><span class="qq">${t.lq}${esc(q.q)}${t.rq}</span><span class="bar"><i style="width:${q.cards ? (100 * q.spoilers) / q.cards : 0}%"></i></span><b>${q.spoilers}/${q.cards}</b></div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8">
<style>
@font-face{font-family:Archivo;font-weight:700;src:url(file://${ROOT}/fonts/archivo-latin-700-normal.woff2)}
@font-face{font-family:Archivo;font-weight:900;src:url(file://${ROOT}/fonts/archivo-latin-900-normal.woff2)}
*{box-sizing:border-box;margin:0}
body{width:1080px;height:1350px;background:#F4F5F3;color:#2A2D32;font-family:system-ui,"DejaVu Sans",sans-serif;padding:64px 80px;display:flex;flex-direction:column;position:relative;overflow:hidden}
.top{display:flex;justify-content:space-between;align-items:center}
.title{font:700 40px/1.1 Archivo,sans-serif}
.title small{display:block;font:500 22px/1.3 ui-monospace,"DejaVu Sans Mono",monospace;color:#666B66;margin-top:8px}
.pill{background:#F6D860;color:#2A2D32;font-weight:700;font-size:26px;padding:12px 22px;border-radius:999px}
.lead{margin-top:58px;font-size:34px;color:#666B66;font-weight:600}
.lead b{color:#2A2D32;background:#FFFFFF;border:2px solid #E2E4E0;border-radius:12px;padding:4px 16px;margin-left:8px}
.big{display:flex;align-items:flex-end;gap:26px;margin-top:26px}
.num{font:900 190px/1 Archivo,sans-serif;color:#F4F5F3;background:#3A3E45;border-radius:24px;padding:8px 36px 16px;letter-spacing:-.03em}
.num span{color:#C9CCC6;font-size:100px;letter-spacing:-.02em}
.delta{font:700 40px/1 Archivo,sans-serif;color:${delta > 0 ? '#2A2D32' : '#666B66'};margin-bottom:24px}
.unit{font-size:40px;font-weight:700;margin-top:22px;line-height:1.2}
.unit em{font-style:normal;color:#666B66;font-weight:600}
.sec{margin-top:46px;font:500 22px/1.3 ui-monospace,"DejaVu Sans Mono",monospace;color:#666B66}
.row{display:grid;grid-template-columns:330px 1fr 110px;gap:22px;align-items:center;margin-top:16px;font-size:30px}
.qq{font-weight:600}
.bar{height:20px;background:#E2E4E0;border-radius:999px;overflow:hidden}
.bar i{display:block;height:100%;background:#3A3E45;border-radius:999px}
.row b{text-align:right;font-weight:700}
.chart{margin-top:18px}
.total{font-size:26px;color:#666B66;margin-top:8px}.total b{color:#2A2D32}
.foot{margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end;font-size:20px;color:#666B66;gap:24px}
.foot span{max-width:640px}
.foot b{color:#2A2D32;font:700 26px/1 Archivo,sans-serif;white-space:nowrap;display:flex;align-items:center;gap:10px}
.foot b:before{content:"";width:34px;height:12px;border-radius:6px;background:#3A3E45}
</style></head><body>
<div class="top"><div class="title">${t.title} · GTA VI<small>${esc(t.day)} · ${esc(fmtDate(E.date, lang))}</small></div><div class="pill">${esc(t.left)}</div></div>
<div class="lead">${t.lead}<b>${esc(m.q)}</b></div>
<div class="big"><div class="num">${m.spoilers}<span>/${m.cards}</span></div>${dtxt ? `<div class="delta">${dtxt}</div>` : ''}</div>
<div class="unit">${t.unit} <em>(${pct}%)</em></div>
<div class="sec">${t.q}</div>
${rows}
<div class="sec">${t.chart}</div>
<div class="chart">${chart(lang)}</div>
<div class="total"><b>${E.unique_spoilers}</b> ${t.total}</div>
<div class="foot"><span>${esc(t.foot)}</span><b>Pure Spoiler Blocker</b></div>
</body></html>`;
}

// ---------------------------------------------------------------- тексты постов (стиль Антона: коротко, с маленькой буквы, с иронией)
function texts() {
  const m = E.main, d = P ? m.spoilers - P.main.spoilers : null;
  const left = dLeft > 0 ? `до релізу ${dLeft} дн.` : dLeft === 0 ? 'реліз сьогодні' : `після релізу ${-dLeft} дн.`;
  const leftEn = dLeft > 0 ? `${dLeft} days to release` : dLeft === 0 ? 'release day' : `${-dLeft} days after release`;
  let uk, en;
  if (day === 1) {
    uk = `зробив бота, який щодня вбиває «gta 6» на ютубі і рахує спойлери. щоб не робити це самому\n\nсьогодні: ${m.spoilers} з ${m.cards} перших відео вже зі спойлерами\n${left}\n\nзавтра порахує знову. подивимось, як воно росте`;
    en = `made a bot that searches "gta 6" on youtube every day and counts the spoilers, so I don't have to\n\ntoday: ${m.spoilers} of the top ${m.cards} videos already have spoilers\n${leftEn}\n\nit counts again tomorrow`;
  } else if (dLeft === 0) {
    uk = `реліз. індекс спойлерів gta 6, день ${day}\n\n«gta 6» на ютубі: ${m.spoilers} з ${m.cards} відео зі спойлерами (вчора ${P.main.spoilers})\n\nдалі буде тільки гірше. бережіть себе`;
    en = `release day. gta 6 spoiler index, day ${day}\n\n"gta 6" on youtube: ${m.spoilers} of ${m.cards} videos with spoilers (yesterday ${P.main.spoilers})\n\nit only gets worse from here`;
  } else {
    const mood = d > 0 ? 'росте. я попереджав' : d < 0 ? 'менше ніж учора. підозріло' : 'стабільно. поки що';
    const moodEn = d > 0 ? 'going up. told you' : d < 0 ? 'fewer than yesterday. suspicious' : 'flat. for now';
    uk = `індекс спойлерів gta 6, день ${day}\n\n«gta 6» на ютубі: ${m.spoilers} з ${m.cards} відео зі спойлерами (вчора ${P.main.spoilers})\n${left}\n\n${mood}`;
    en = `gta 6 spoiler index, day ${day}\n\n"gta 6" on youtube: ${m.spoilers} of ${m.cards} videos with spoilers (yesterday ${P.main.spoilers})\n${leftEn}\n\n${moodEn}`;
  }
  const intro = `зробив бота, який щодня вбиває «gta 6» на ютубі і рахує спойлери. щоб не робити це самому\n\nсьогодні: ${m.spoilers} з ${m.cards} перших відео вже зі спойлерами\n${left}\n\nзавтра порахує знову. подивимось, як воно росте`;
  return { uk, en, intro };
}

// ---------------------------------------------------------------- страница (для поиска и ИИ-помощников: открытые числа и метод)
function page() {
  const rows = H.slice().reverse().map((x) => `<tr><td>${x.date}</td><td><strong>${x.main.spoilers}</strong> / ${x.main.cards}</td>${x.queries.slice(1).map((q) => `<td>${q.spoilers} / ${q.cards}</td>`).join('')}<td>${x.unique_spoilers}</td></tr>`).join('\n');
  const title = 'GTA 6 Spoiler Index: how many YouTube results carry spoilers, counted daily';
  const desc = `Today ${E.main.spoilers} of the top ${E.main.cards} YouTube results for "gta 6" carry spoilers. Counted every day by a bot with no login, from ${H[0].date}.`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${BASE}spoiler-index/">
<link rel="stylesheet" href="../style.css">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${BASE}spoiler-index/latest-en.png">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Dataset', name: 'GTA 6 Spoiler Index', description: desc, url: `${BASE}spoiler-index/`, temporalCoverage: `${H[0].date}/${E.date}`, isAccessibleForFree: true, license: 'https://creativecommons.org/licenses/by/4.0/', creator: { '@type': 'Organization', name: 'Pure guides' }, distribution: { '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: `${BASE}data/spoiler-index.json` } })}</script>
</head>
<body>
<main>
<a class="brand" href="../">← Pure guides</a>
<h1>GTA 6 Spoiler Index</h1>
<p class="muted">Updated ${E.date} · day ${day} · ${esc(L.en.left)}</p>
<div class="note tldr"><strong>Today:</strong> search YouTube for just "gta 6" and <strong>${E.main.spoilers} of the top ${E.main.cards}</strong> videos already carry spoilers. Across all four searches below there are <strong>${E.unique_spoilers}</strong> unique spoiler videos.</div>
<figure><img src="latest-en.png" alt="GTA 6 spoiler index card for ${E.date}" width="1080" height="1350"></figure>
<h2>Every day</h2>
<table><tr><th>Date</th>${E.queries.map((q) => `<th>"${esc(q.q)}"</th>`).join('')}<th>Unique spoiler videos</th></tr>
${rows}
</table>
<p>Raw numbers: <a href="../data/spoiler-index.json">spoiler-index.json</a> (free to reuse with a link back).</p>
<h2>How it is counted</h2>
<ul>
<li>Once a day a bot opens youtube.com in a clean browser with <strong>no account and no history</strong> (US, English), runs the same four searches and takes the first ${E.main.cards} videos of each, Shorts included, ads excluded.</li>
<li>A video counts as a spoiler when <a href="https://chromewebstore.google.com/detail/aloilpojkoblacapdlknacjiljgjibng?utm_source=pureguides&amp;utm_medium=spoiler-index">Pure Spoiler Blocker</a> with its default GTA VI list on the "spoilers only" level would blur it: GTA VI plus words like ending, leak, story, twist or a character name. Plain trailers and news do not count.</li>
<li>It reads titles and text, not images, so it can miss a spoiler that is only in a thumbnail. The same searches run every day, so the trend is comparable even where single videos are judged wrong.</li>
<li>Video titles are not published here, because they are the spoilers.</li>
</ul>
<p class="muted">Disclosure: I build Pure Spoiler Blocker. Not affiliated with Rockstar Games or Take-Two.</p>
<footer><p><a href="../spoiler-danger/">Spoiler danger this week</a> · <a href="../block/gta6.html">How to block GTA 6 spoilers</a> · <a href="../">Pure guides</a></p><p>This site has no analytics, no cookies and no trackers.</p></footer>
</main>
</body>
</html>
`;
}

const b = await chromium.launch();
for (const lang of ['uk', 'en']) {
  const html = path.join(ROOT, 'out', `index-card-${lang}.html`); fs.writeFileSync(html, card(lang));
  const pg = await b.newPage({ viewport: { width: 1080, height: 1350 } });
  await pg.goto('file://' + html, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
  await pg.evaluate(() => document.fonts && document.fonts.ready); await pg.waitForTimeout(300);
  for (const f of [`${E.date}-${lang}.png`, `latest-${lang}.png`]) await pg.screenshot({ path: path.join(DIR, f) });
  await pg.close();
}
await b.close();
// храним картинки 45 дней (история чисел — навсегда в JSON)
for (const f of fs.readdirSync(DIR)) { const m = /^(\d{4}-\d{2}-\d{2})-(uk|en)\.png$/.exec(f); if (m && Date.parse(E.date) - Date.parse(m[1]) > 45 * 864e5) fs.rmSync(path.join(DIR, f)); }
fs.writeFileSync(path.join(DIR, 'index.html'), page());
const T = texts();
fs.writeFileSync(path.join(ROOT, 'out', 'index-post.json'), JSON.stringify({ slug: E.date, day, url: `${BASE}spoiler-index/`, threads: T.uk, intro: T.intro, en: T.en, image: `${BASE}spoiler-index/${E.date}-uk.png`, image_en: `${BASE}spoiler-index/${E.date}-en.png` }, null, 1));
console.log(`день ${day}: ${E.main.spoilers}/${E.main.cards}, уникальных ${E.unique_spoilers}; ${T.uk.split('\n')[0]}`);
