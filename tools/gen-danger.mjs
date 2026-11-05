// «Spoiler danger this week»: раз в неделю собирает, что выходит за 7 дней, и делает страницу,
// RSS, черновики постов. Запуск:
//   node tools/gen-danger.mjs <words.js из pure-spoiler-shield> [--fixture data/fixture.json] [--from 2026-11-09]
// Источники: AniList (аниме, без ключа), TVmaze (сериалы, без ключа), data/games.json (игры, вручную, с источником).
// Никаких названий серий и описаний: они сами бывают спойлерами. Только название, номер серии, день.
import fs from 'node:fs'; import path from 'node:path'; import vm from 'node:vm';

const args = process.argv.slice(2);
const SRC = args[0];
const opt = (k) => { const i = args.indexOf(k); return i > 0 ? args[i + 1] : null; };
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIR = path.join(ROOT, 'spoiler-danger');
const OUT = path.join(ROOT, 'out');
const BASE = 'https://qwemort.github.io/pure-guides/';
const STORE = 'https://chromewebstore.google.com/detail/aloilpojkoblacapdlknacjiljgjibng?utm_source=pureguides&amp;utm_medium=danger';
const TZ = 'Europe/Warsaw';

// ---------- даты
// по умолчанию: ближайший понедельник (сегодня, если понедельник)
const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
const nextMon = new Date(today.getTime() + ((8 - today.getUTCDay()) % 7) * 864e5);
const from = opt('--from') ? new Date(opt('--from') + 'T00:00:00Z') : nextMon;
const days = [...Array(7)].map((_, i) => new Date(from.getTime() + i * 864e5).toISOString().slice(0, 10));
const to = new Date(from.getTime() + 7 * 864e5);
const SLUG = days[0];
const fmt = (d, o) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, ...o }).format(d);
const RANGE = `${fmt(from, { day: 'numeric', month: 'short' })} to ${fmt(new Date(days[6] + 'T12:00:00Z'), { day: 'numeric', month: 'short', year: 'numeric' })}`;
const dayEn = (d) => fmt(d, { weekday: 'long' });
const UA_DAYS = { Monday: 'в понеділок', Tuesday: 'у вівторок', Wednesday: 'в середу', Thursday: 'в четвер', Friday: "в п'ятницю", Saturday: 'в суботу', Sunday: 'в неділю' };

// ---------- списки Shield (чтобы связать с готовыми mute-list страницами)
let LIB = [];
if (SRC && fs.existsSync(SRC)) {
  let code = fs.readFileSync(SRC, 'utf8').replace('const LIB = [', 'const LIB = g.__LIB = [');
  const ctx = { console }; ctx.globalThis = ctx; vm.createContext(ctx);
  try { vm.runInContext(code.replace(/\}\)\(typeof globalThis[^)]*\)|\}\)\(this\)|\}\)\(globalThis\)/, '})(globalThis)'), ctx); } catch (e) { console.warn('words.js:', e.message); }
  LIB = ctx.__LIB || (ctx.SS && ctx.SS.__LIB) || [];
}
const norm = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9а-яёіїєґ]+/g, ' ').trim();
function shieldPage(title) {
  const n = norm(title);
  const p = LIB.find((x) => norm(x.label) === n || (x.game || []).some((g) => norm(g) === n));
  if (!p) return null;
  return p.id === 'gta6' ? 'gta-6-mute-list.html' : `mute-list/${p.id}.html`;
}

// ---------- сбор данных
async function getJSON(url, init) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { ...init, headers: { 'User-Agent': 'pure-guides weekly (github.com/qwemort/pure-guides)', ...(init && init.headers) } });
      if (r.status === 429) { await new Promise((s) => setTimeout(s, 3000)); continue; }
      if (!r.ok) throw new Error(url + ' ' + r.status);
      return await r.json();
    } catch (e) { if (i === 2) throw e; await new Promise((s) => setTimeout(s, 1500)); }
  }
}

async function anime() {
  const q = `query($s:Int,$e:Int,$p:Int){Page(page:$p,perPage:50){pageInfo{hasNextPage}
    airingSchedules(airingAt_greater:$s,airingAt_lesser:$e,sort:TIME){airingAt episode
    media{id title{romaji english} popularity isAdult format siteUrl}}}}`;
  const by = new Map();
  for (let p = 1; p <= 8; p++) {
    const j = await getJSON('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: q, variables: { s: Math.floor(from / 1000), e: Math.floor(to / 1000), p } }) });
    const pg = j.data.Page;
    for (const a of pg.airingSchedules) {
      const m = a.media;
      if (!m || m.isAdult || !['TV', 'TV_SHORT', 'ONA', 'MOVIE'].includes(m.format)) continue;
      const it = by.get(m.id) || { kind: 'anime', title: m.title.english || m.title.romaji, alt: m.title.romaji, score: m.popularity || 0, source: m.siteUrl, eps: [], when: new Date(a.airingAt * 1000) };
      it.eps.push(a.episode); by.set(m.id, it);
    }
    if (!pg.pageInfo.hasNextPage) break;
  }
  return [...by.values()].sort((a, b) => b.score - a.score).slice(0, 8)
    .map((x) => ({ ...x, note: x.eps.length > 1 ? `episodes ${Math.min(...x.eps)} to ${Math.max(...x.eps)}` : `episode ${x.eps[0]}` }));
}

async function series() {
  const by = new Map();
  for (const d of days) {
    for (const url of [`https://api.tvmaze.com/schedule?country=US&date=${d}`, `https://api.tvmaze.com/schedule/web?date=${d}`]) {
      const list = await getJSON(url);
      for (const e of list) {
        const s = e.show || (e._embedded && e._embedded.show);
        if (!s || s.language !== 'English' || !['Scripted', 'Animation'].includes(s.type)) continue;
        const it = by.get(s.id) || { kind: 'series', title: s.name, score: s.weight || 0, source: s.url, eps: [], when: new Date(d + 'T12:00:00Z'), season: e.season };
        it.eps.push(e.number); by.set(s.id, it);
      }
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  return [...by.values()].filter((x) => x.score >= 60).sort((a, b) => b.score - a.score).slice(0, 8).map((x) => {
    const eps = x.eps.filter((n) => n != null);
    let note = eps.includes(1) ? `season ${x.season} premiere` : eps.length > 1 ? `${eps.length} episodes` : eps.length ? `season ${x.season}, episode ${eps[0]}` : 'new episode';
    if (eps.length > 3 && eps.includes(1)) note = `season ${x.season}, full drop`;
    return { ...x, note };
  });
}

function games() {
  const g = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'games.json'), 'utf8'));
  return g.filter((x) => days.includes(x.date)).map((x) => ({ kind: 'game', title: x.title, when: new Date(x.date + 'T12:00:00Z'), note: `release, ${x.platforms}`, source: x.source, mute: x.mute, score: 1e9 }));
}
function soon() {
  const g = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'games.json'), 'utf8'));
  return g.filter((x) => x.date > days[6] && (new Date(x.date) - to) < 21 * 864e5);
}

let data;
const fx = opt('--fixture');
if (fx) {
  data = JSON.parse(fs.readFileSync(fx, 'utf8'));
  for (const k of ['anime', 'series']) data[k] = data[k].map((x) => ({ ...x, when: new Date(x.when) }));
  data.games = games();
} else {
  const errs = [];
  const safe = async (f, name) => { try { return await f(); } catch (e) { errs.push(`${name}: ${e.message}`); return []; } };
  data = { games: games(), series: await safe(series, 'TVmaze'), anime: await safe(anime, 'AniList') };
  if (errs.length) console.warn('sources failed:', errs.join('; '));
  if (!data.series.length && !data.anime.length) { console.error('both sources empty, nothing to publish'); process.exit(1); }
}

// ---------- страница
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const words = (it) => {
  const t = it.title.replace(/[:!?]/g, '').trim();
  const end = it.kind === 'game' ? ['ending', 'leak'] : ['finale', 'ending', 'leak'];
  return [`${t} spoiler`, `${t} spoilers`, ...end.map((w) => `${t} ${w}`)];
};
const all = [...data.games, ...data.series, ...data.anime];
const label = { game: 'Game', series: 'Series', anime: 'Anime' };
const row = (it, i) => {
  const mute = it.mute || shieldPage(it.title) || (it.alt && shieldPage(it.alt));
  return `<div class="item">
<h3>${esc(it.title)}</h3>
<p class="muted">${label[it.kind]} · ${dayEn(it.when)} · ${esc(it.note)} · <a href="${esc(it.source)}" rel="nofollow">source</a>${mute ? ` · <a href="../${mute}">full mute list</a>` : ''}</p>
<div class="chips" data-group="g${i}">${words(it).map(esc).join('|')}</div>
<button class="copyall" data-copy="g${i}">Copy</button>
</div>`;
};
const section = (k, h) => {
  const items = all.map((x, i) => [x, i]).filter(([x]) => x.kind === k);
  return items.length ? `<h2>${h}</h2>\n${items.map(([x, i]) => row(x, i)).join('\n')}` : '';
};
const top = all.slice(0, 3).map((x) => x.title);
const title = `Spoiler danger this week: ${RANGE}`;
const desc = `What comes out ${RANGE} (${top.join(', ')}) and copy-ready words to mute on X and Threads. No spoilers on the page.`;
const url = `${BASE}spoiler-danger/${SLUG}.html`;
const soonList = soon();
const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc.slice(0, 158))}">
<link rel="canonical" href="${url}">
<link rel="alternate" type="application/rss+xml" title="Spoiler danger weekly" href="${BASE}feed.xml">
<link rel="stylesheet" href="../style.css">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Pure guides">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc.slice(0, 158))}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${BASE}spoiler-danger/${SLUG}.png">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">
${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Article', headline: title, datePublished: SLUG, dateModified: SLUG, inLanguage: 'en', image: `${BASE}spoiler-danger/${SLUG}.png`, author: { '@type': 'Organization', name: 'Pure guides' }, mainEntityOfPage: url })}
</script>
<style>
.item{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 16px;margin:12px 0}
.item h3{margin:0 0 2px;font-size:1.1rem}.item p{margin:0}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 6px}
.chip{background:var(--bg);color:var(--text);border:1px solid var(--line);border-radius:999px;padding:5px 11px;font:14px/1.3 inherit;cursor:pointer}
.chip:hover{border-color:var(--accent)}.chip.done{border-color:var(--accent);color:var(--accent)}
.copyall{background:var(--accent);color:#06281b;border:0;border-radius:10px;padding:6px 12px;font:inherit;font-size:.9rem;font-weight:600;cursor:pointer}
#toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--card);border:1px solid var(--accent);border-radius:10px;padding:8px 14px;opacity:0;transition:opacity .2s;pointer-events:none}#toast.on{opacity:1}
</style>
</head>
<body>
<main>
<a class="brand" href="./">← All weeks</a>
<div class="hero"><img src="../img/spoilershield.png" alt=""><span class="muted">Weekly · every Monday</span></div>
<h1>${esc(title)}</h1>
<p>Not watching or playing on day one? These come out this week, so spoilers will be everywhere. Mute the words before people start posting. <strong>No spoilers on this page</strong>: no episode titles, no plot, only names and dates. Tap a word to copy it, or copy a whole group.</p>
<figure><img src="${SLUG}.png" alt="Spoiler danger this week: ${esc(top.join(', '))}" width="1080" height="1350" loading="lazy"></figure>
${section('game', 'Games')}
${section('series', 'Series')}
${section('anime', 'Anime')}
${soonList.length ? `<h2>Coming soon</h2>\n<ul>${soonList.map((g) => `<li><strong>${esc(g.title)}</strong>, ${esc(g.date)} (${esc(g.platforms)}). <a href="../${g.mute}">Mute list</a></li>`).join('')}</ul>` : ''}
<h2>Where to paste them</h2>
<ul>
<li><strong>X:</strong> Settings and privacy, Privacy and safety, Mute and block, Muted words.</li>
<li><strong>Threads:</strong> Settings, Privacy, Hidden words.</li>
<li><strong>YouTube and Reddit</strong> have no mute by words.</li>
</ul>
<div class="note"><strong>For YouTube and Reddit.</strong> I build a free browser extension, Pure Spoiler Shield, that blurs videos, posts and comments with spoiler words for the titles you pick, on YouTube, Reddit and X. It runs locally, no account, no tracking, <a href="https://github.com/qwemort/pure-spoiler-shield">source is public</a>. It reads text, so a spoiler only inside an image can slip through. <a href="${STORE}">Get it for Chrome</a>. Disclosure: I build it.</div>
<p class="muted">Schedules: <a href="https://anilist.co/">AniList</a> (anime), <a href="https://www.tvmaze.com/">TVmaze</a> (series, CC BY-SA), games from the linked sources. Times shown for ${TZ}. Ranked by popularity on those sites, top 8. Not affiliated with any of the titles. Missing something? <a href="https://github.com/qwemort/pure-spoiler-shield/issues/new?template=title-request.yml">Request a list</a>.</p>
<footer>
<p><a href="./">All weeks</a> · <a href="../feed.xml">RSS</a> · <a href="../mute-list/">Mute lists</a> · <a href="../">Pure guides</a></p>
<p>This site has no analytics, no cookies and no trackers.</p>
</footer>
</main>
<div id="toast" role="status" aria-live="polite"></div>
<script src="../mutelist.js"></script>
</body>
</html>
`;
fs.mkdirSync(DIR, { recursive: true });
fs.writeFileSync(path.join(DIR, SLUG + '.html'), page);
fs.writeFileSync(path.join(DIR, SLUG + '.json'), JSON.stringify({ range: RANGE, items: all.map((x) => ({ kind: x.kind, title: x.title, day: dayEn(x.when), note: x.note })) }, null, 1));

// ---------- индекс, RSS, sitemap
const weeks = fs.readdirSync(DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse()
  .map((f) => ({ slug: f.slice(0, 10), ...JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')) }));
fs.writeFileSync(path.join(DIR, 'index.html'), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Spoiler danger: what comes out each week</title>
<meta name="description" content="Every Monday: the games, series and anime coming out that week, with copy-ready words to mute on X and Threads.">
<link rel="canonical" href="${BASE}spoiler-danger/">
<link rel="alternate" type="application/rss+xml" title="Spoiler danger weekly" href="${BASE}feed.xml">
<link rel="stylesheet" href="../style.css">
</head>
<body>
<main>
<a class="brand" href="../">← Pure guides</a>
<h1>Spoiler danger, every week</h1>
<p>Every Monday: what comes out that week and the words to mute so it doesn't get spoiled for you. No spoilers on the pages. <a href="../feed.xml">RSS</a>.</p>
${weeks.map((w) => `<a class="card-link" href="${w.slug}.html"><strong>${esc(w.range)}</strong><span>${esc(w.items.slice(0, 5).map((i) => i.title).join(', '))}</span></a>`).join('\n')}
<footer><p><a href="../">Pure guides</a></p><p>This site has no analytics, no cookies and no trackers.</p></footer>
</main>
</body>
</html>
`);
const rfc = (s) => new Date(s + 'T07:00:00Z').toUTCString();
fs.writeFileSync(path.join(ROOT, 'feed.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>Spoiler danger weekly</title><link>${BASE}spoiler-danger/</link>
<description>What comes out each week and what to mute. No spoilers.</description><language>en</language>
${weeks.slice(0, 20).map((w) => `<item><title>${esc('Spoiler danger: ' + w.range)}</title><link>${BASE}spoiler-danger/${w.slug}.html</link><guid>${BASE}spoiler-danger/${w.slug}.html</guid><pubDate>${rfc(w.slug)}</pubDate><description>${esc(w.items.slice(0, 8).map((i) => i.title).join(', '))}</description></item>`).join('\n')}
</channel></rss>
`);
const sm = path.join(ROOT, 'sitemap.xml');
let s = fs.readFileSync(sm, 'utf8').replace(/<!-- danger:start -->[\s\S]*?<!-- danger:end -->\n?/, '');
s = s.replace('</urlset>', '<!-- danger:start -->\n' + [`${BASE}spoiler-danger/`, ...weeks.map((w) => `${BASE}spoiler-danger/${w.slug}.html`)]
  .map((u) => `<url><loc>${u}</loc><lastmod>${weeks[0].slug}</lastmod></url>`).join('\n') + '\n<!-- danger:end -->\n</urlset>');
fs.writeFileSync(sm, s);

// ---------- карточка (HTML для render-card.mjs) и тексты постов
fs.mkdirSync(OUT, { recursive: true });
const cardItems = all.slice(0, 7);
fs.writeFileSync(path.join(OUT, 'card.html'), `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}body{width:1080px;height:1350px;background:#0d1117;color:#e6edf3;font-family:Inter,"Segoe UI",Roboto,system-ui,sans-serif;padding:84px 80px;display:flex;flex-direction:column}
.k{color:#7ee0b5;font-weight:700;letter-spacing:.14em;font-size:30px}.h{font-size:92px;font-weight:800;line-height:1.02;margin:18px 0 10px}
.r{color:#9da7b3;font-size:36px;margin-bottom:46px}.it{display:flex;align-items:center;gap:22px;padding:22px 0;border-top:2px solid #2a313c}
.t{font-size:44px;font-weight:700;flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.d{color:#9da7b3;font-size:30px;white-space:nowrap}
.tag{font-size:24px;font-weight:700;color:#06281b;background:#7ee0b5;border-radius:10px;padding:6px 12px}
.f{margin-top:auto;color:#9da7b3;font-size:30px;line-height:1.4}.f b{color:#e6edf3}
</style></head><body>
<div class="k">SPOILER DANGER</div><div class="h">This week</div><div class="r">${esc(RANGE)}</div>
${cardItems.map((x) => `<div class="it"><span class="tag">${label[x.kind].toUpperCase()}</span><span class="t">${esc(x.title)}</span><span class="d">${dayEn(x.when).slice(0, 3)}</span></div>`).join('')}
<div class="f">Words to mute on X and Threads, no spoilers:<br><b>qwemort.github.io/pure-guides</b></div>
</body></html>`);

// Тексты в стиле Антона: короткие, без «нейро-оборотов», вариант меняется каждую неделю.
const first = all[0], t3 = top.slice(0, 3).join(', '), more = Math.max(0, all.length - 3);
const ua = (d) => UA_DAYS[dayEn(d)] || '';
const T = [
  `цього тижня виходить ${t3}${more ? ` і ще ${more}` : ''}. якщо не дивишся в день виходу, краще замьютити слова заздалегідь. зібрав що мьютити по кожному: ${url}`,
  `тиждень небезпечний для спойлерів: ${t3}. список слів для мьюту в threads і x тут ${url}\n\nщо з цього дивитесь?`,
  `${first.title} виходить ${ua(first.when)}. хто дивиться пізніше, тримайте слова щоб не наспойлерили ${url}`,
  `кожен понеділок збираю що виходить за тиждень і що замьютити. цього разу ${t3}. ${url}\nчогось нема? пишіть, додам`,
  `якщо ${first.title} в тебе не в день виходу, цей тиждень мінне поле. що мьютити: ${url}`,
  `на ютубі і реддіті мьюту по словах взагалі нема, тому я колись зробив розширення яке блюрить спойлери. а для threads ось слова на цей тиждень (${t3}): ${url}`,
  `що виходить цього тижня: ${all.slice(0, 5).map((x) => x.title).join(', ')}. слова для мьюту по кожному тут ${url}\nале спойлер на картинці не зловить жоден мьют, тому обережно`,
];
const wk = Math.floor(from.getTime() / (7 * 864e5));
let threads = T[wk % T.length];
if ([...threads].length > 480) threads = T[1];
const x = `Spoiler danger this week: ${t3}. Copy-ready words to mute, no spoilers on the page: ${url}`;
fs.writeFileSync(path.join(OUT, 'post.json'), JSON.stringify({ slug: SLUG, url, image: `${BASE}spoiler-danger/${SLUG}.png`, threads, x }, null, 1));
console.log(`week ${SLUG}: ${data.games.length} games, ${data.series.length} series, ${data.anime.length} anime`);
console.log(threads);
