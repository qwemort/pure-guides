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
const norm = (s) => String(s).toLowerCase().replace(/['’]/g, '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9а-яёіїєґ]+/g, ' ').trim();
function shieldPage(title) {
  const n = norm(title).replace(/ (season|part|cour) \d+$/, '').replace(/ \d+(st|nd|rd|th) season$/, '');
  const has = (a, b) => a === b || (b.length >= 6 && (' ' + a + ' ').includes(' ' + b + ' '));
  const p = LIB.find((x) => has(n, norm(x.label)) || (x.game || []).some((g) => has(n, norm(g))));
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
        const it = by.get(s.id) || { kind: 'series', title: s.name, score: s.weight || 0, source: s.url, eps: [], when: new Date(d + 'T12:00:00Z'), season: e.season, genres: s.genres || [], web: url.includes('/web') };
        it.eps.push(e.number); by.set(s.id, it);
      }
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  // Спойлеры важны для сюжетных сериалов, а не для процедуралов (FBI, NCIS, Chicago Med):
  // берём тайтлы из списков Shield, премьеры сезонов и короткие сюжетные сериалы, без «дело недели».
  const PROC = ['Crime', 'Medical', 'Legal', 'Comedy'];
  const ok = (x) => shieldPage(x.title) || ((x.score >= 80) && (x.eps.includes(1) || x.season <= 5) && !x.genres.some((g) => PROC.includes(g)));
  return [...by.values()].filter(ok).sort((a, b) => (shieldPage(b.title) ? 1e6 : 0) + b.score - (shieldPage(a.title) ? 1e6 : 0) - a.score).slice(0, 6).map((x) => {
    const eps = x.eps.filter((n) => n != null);
    let note = eps.includes(1) ? `season ${x.season} premiere` : eps.length > 1 ? `${eps.length} episodes` : eps.length ? `season ${x.season}, episode ${eps[0]}` : 'new episode';
    if (eps.length > 3 && eps.includes(1)) note = `season ${x.season}, full drop`;
    return { ...x, note };
  });
}

function games() {
  const g = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'games.json'), 'utf8'));
  return g.filter((x) => days.includes(x.date)).map((x) => ({ kind: x.kind || 'game', title: x.title, when: new Date(x.date + 'T12:00:00Z'), note: `release, ${x.platforms}`, source: x.source, mute: x.mute, score: 1e9 }));
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

// ---------- страница (en, uk, pl)
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// чередуем сериалы и аниме, чтобы в карточку и пост попали оба
const mix = []; for (let i = 0; i < 8; i++) { if (data.series[i]) mix.push(data.series[i]); if (data.anime[i]) mix.push(data.anime[i]); }
const all = [...data.games, ...mix];
const label = { game: 'Game', movie: 'Film', series: 'Series', anime: 'Anime' };
const dayOf = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d); // YYYY-MM-DD
const top = all.slice(0, 3).map((x) => x.title);
const CAL = `${BASE}spoiler-danger/calendar.ics`;
const WEBCAL = CAL.replace('https://', 'webcal://');
const GCAL = 'https://calendar.google.com/calendar/render?cid=' + encodeURIComponent(WEBCAL);
const LANGS = {
  en: { dir: '', loc: 'en-GB', kind: label, h: (r) => `Spoiler danger this week: ${r}`,
    desc: (r, t) => `What comes out ${r} (${t}) and copy-ready words to mute on X and Threads. No spoilers on the page.`,
    intro: 'Not watching or playing on day one? These come out this week, so spoilers will be everywhere. Mute the words before people start posting. <strong>No spoilers on this page</strong>: no episode titles, no plot, only names and dates. Tap a word to copy it, or copy a whole group.',
    sec: { game: 'Games', movie: 'Films', series: 'Series', anime: 'Anime' }, source: 'source', full: 'full mute list', copy: 'Copy', soon: 'Coming soon', mute: 'Mute list',
    where: 'Where to paste them', x: '<strong>X:</strong> Settings and privacy, Privacy and safety, Mute and block, Muted words.', th: '<strong>Threads:</strong> Settings, Privacy, Hidden words.', yt: '<strong>YouTube and Reddit</strong> have no mute by words.',
    cal: `<strong>Get this in your calendar.</strong> Subscribe once and every release lands in your calendar with a link to what to mute. It updates itself every week. <a href="${GCAL}">Google Calendar</a> · <a href="${WEBCAL}">Apple / Outlook</a> · <a href="${CAL}">.ics file</a>`,
    note: (st) => `<strong>For YouTube and Reddit.</strong> I build a free browser extension, Pure Spoiler Shield, that blurs videos, posts and comments with spoiler words for the titles you pick, on YouTube, Reddit and X. It runs locally, no account, no tracking, <a href="https://github.com/qwemort/pure-spoiler-shield">source is public</a>. It reads text, so a spoiler only inside an image can slip through. <a href="${st}">Get it for Chrome</a> or <a href="{R}demo/">see the demo</a>. Disclosure: I build it.`,
    link: 'Need to talk about an ending without ruining it for others? Use a <a href="{R}s/">spoiler link</a>: people see a blurred text and choose to reveal it.',
    foot: `Schedules: <a href="https://anilist.co/">AniList</a> (anime), <a href="https://www.tvmaze.com/">TVmaze</a> (series, CC BY-SA), games from the linked sources. Times shown for ${TZ}. Ranked by popularity on those sites. Not affiliated with any of the titles. Missing something? <a href="https://github.com/qwemort/pure-spoiler-shield/issues/new?template=title-request.yml">Request a list</a>.`,
    all: 'All weeks', nt: '', extra: [] },
  uk: { dir: 'uk/', loc: 'uk-UA', kind: { game: 'Гра', movie: 'Фільм', series: 'Серіал', anime: 'Аніме' }, h: (r) => `Небезпека спойлерів цього тижня: ${r}`,
    desc: (r, t) => `Що виходить ${r} (${t}) і слова, які варто замьютити в X і Threads. Без спойлерів на сторінці.`,
    intro: 'Не дивишся або не граєш у день виходу? Ось що виходить цього тижня, тож спойлери будуть усюди. Замьють слова, поки люди не почали постити. <strong>На сторінці немає спойлерів</strong>: ні назв серій, ні сюжету, тільки назви і дати. Натисни на слово, щоб скопіювати, або скопіюй групу.',
    sec: { game: 'Ігри', movie: 'Фільми', series: 'Серіали', anime: 'Аніме' }, source: 'джерело', full: 'повний список', copy: 'Скопіювати', soon: 'Скоро', mute: 'Список для мьюту',
    where: 'Куди вставляти', x: '<strong>X:</strong> Налаштування і приватність → Приватність і безпека → Ігнорування і блокування → Ігноровані слова.', th: '<strong>Threads:</strong> Налаштування → Конфіденційність → Приховані слова.', yt: '<strong>На YouTube і Reddit</strong> мьюту за словами немає.',
    cal: `<strong>Додай у свій календар.</strong> Підпишись один раз, і кожен реліз з’явиться в календарі з посиланням, що замьютити. Оновлюється сам щотижня. <a href="${GCAL}">Google Календар</a> · <a href="${WEBCAL}">Apple / Outlook</a> · <a href="${CAL}">файл .ics</a>`,
    note: (st) => `<strong>Для YouTube і Reddit.</strong> Я роблю безкоштовне розширення Pure Spoiler Shield: воно розмиває відео, пости й коментарі зі спойлерними словами для тайтлів, які ти обереш, на YouTube, Reddit і X. Працює локально, без акаунта і стеження, <a href="https://github.com/qwemort/pure-spoiler-shield">код відкритий для перегляду</a>. Воно читає текст, тож спойлер лише на картинці може проскочити. <a href="${st}">Встановити для Chrome</a> або <a href="{R}demo/">подивитись демо</a>. Чесно: розширення моє.`,
    link: 'Хочеш обговорити кінцівку і нікому не зіпсувати? Зроби <a href="{R}s/">спойлер-посилання</a>: люди побачать розмитий текст і самі вирішать, чи відкривати.',
    foot: `Розклад: <a href="https://anilist.co/">AniList</a> (аніме), <a href="https://www.tvmaze.com/">TVmaze</a> (серіали, CC BY-SA), ігри з указаних джерел. Час за ${TZ}. Не пов’язано з правовласниками. Чогось бракує? <a href="https://github.com/qwemort/pure-spoiler-shield/issues/new?template=title-request.yml">Попроси список</a>.`,
    all: 'Усі тижні (англ.)', extra: ['спойлер', 'кінцівка', 'фінал'],
    nt: [[/^release, in cinemas$/, 'у кінотеатрах'], [/^episodes (\d+) to (\d+)$/, 'серії $1–$2'], [/^episode (\d+)$/, 'серія $1'], [/^season (\d+) premiere$/, 'прем’єра сезону $1'], [/^season (\d+), episode (\d+)$/, 'сезон $1, серія $2'], [/^(\d+) episodes$/, '$1 серій'], [/^season (\d+), full drop$/, 'сезон $1, усі серії одразу'], [/^release, (.*)$/, 'реліз, $1'], [/^new episode$/, 'нова серія']] },
  pl: { dir: 'pl/', loc: 'pl-PL', kind: { game: 'Gra', movie: 'Film', series: 'Serial', anime: 'Anime' }, h: (r) => `Spoilery w tym tygodniu: ${r}`,
    desc: (r, t) => `Co wychodzi ${r} (${t}) i słowa do wyciszenia na X i Threads. Bez spoilerów na stronie.`,
    intro: 'Nie oglądasz albo nie grasz w dniu premiery? To wychodzi w tym tygodniu, więc spoilery będą wszędzie. Wycisz słowa, zanim ludzie zaczną pisać. <strong>Na stronie nie ma spoilerów</strong>: bez tytułów odcinków i fabuły, tylko nazwy i daty. Kliknij słowo, aby je skopiować, albo skopiuj całą grupę.',
    sec: { game: 'Gry', movie: 'Filmy', series: 'Seriale', anime: 'Anime' }, source: 'źródło', full: 'pełna lista', copy: 'Kopiuj', soon: 'Wkrótce', mute: 'Lista do wyciszenia',
    where: 'Gdzie je wkleić', x: '<strong>X:</strong> Ustawienia i prywatność → Prywatność i bezpieczeństwo → Wyciszanie i blokowanie → Wyciszone słowa.', th: '<strong>Threads:</strong> Ustawienia → Prywatność → Ukryte słowa.', yt: '<strong>YouTube i Reddit</strong> nie mają wyciszania słów.',
    cal: `<strong>Dodaj do kalendarza.</strong> Zasubskrybuj raz, a każda premiera pojawi się w kalendarzu z linkiem, co wyciszyć. Aktualizuje się sam co tydzień. <a href="${GCAL}">Kalendarz Google</a> · <a href="${WEBCAL}">Apple / Outlook</a> · <a href="${CAL}">plik .ics</a>`,
    note: (st) => `<strong>Dla YouTube i Reddita.</strong> Robię darmowe rozszerzenie Pure Spoiler Shield: rozmywa filmy, posty i komentarze ze spoilerami do wybranych tytułów na YouTube, Reddicie i X. Działa lokalnie, bez konta i śledzenia, <a href="https://github.com/qwemort/pure-spoiler-shield">kod jest publiczny</a>. Czyta tekst, więc spoiler tylko na obrazku może się prześlizgnąć. <a href="${st}">Pobierz dla Chrome</a> albo <a href="{R}demo/">zobacz demo</a>. Uczciwie: to moje rozszerzenie.`,
    link: 'Chcesz pogadać o zakończeniu i nikomu nie zepsuć? Zrób <a href="{R}s/">link ze spoilerem</a>: ludzie zobaczą rozmyty tekst i sami zdecydują.',
    foot: `Harmonogram: <a href="https://anilist.co/">AniList</a> (anime), <a href="https://www.tvmaze.com/">TVmaze</a> (seriale, CC BY-SA), gry z podanych źródeł. Czas: ${TZ}. Bez powiązań z właścicielami praw. Czegoś brakuje? <a href="https://github.com/qwemort/pure-spoiler-shield/issues/new?template=title-request.yml">Poproś o listę</a>.`,
    all: 'Wszystkie tygodnie (ang.)', extra: ['spoiler', 'zakończenie', 'finał'],
    nt: [[/^release, in cinemas$/, 'w kinach'], [/^episodes (\d+) to (\d+)$/, 'odcinki $1–$2'], [/^episode (\d+)$/, 'odcinek $1'], [/^season (\d+) premiere$/, 'premiera sezonu $1'], [/^season (\d+), episode (\d+)$/, 'sezon $1, odcinek $2'], [/^(\d+) episodes$/, '$1 odcinków'], [/^season (\d+), full drop$/, 'sezon $1, wszystkie odcinki naraz'], [/^release, (.*)$/, 'premiera, $1'], [/^new episode$/, 'nowy odcinek']] },
};
const urlOf = (lg) => `${BASE}spoiler-danger/${LANGS[lg].dir}${SLUG}.html`;
const url = urlOf('en');
const soonList = soon();
function render(lg) {
  const L = LANGS[lg], R = lg === 'en' ? '../' : '../../';
  const fmtL = (d, o) => new Intl.DateTimeFormat(L.loc, { timeZone: TZ, ...o }).format(d);
  const range = `${fmtL(from, { day: 'numeric', month: 'short' })} – ${fmtL(new Date(days[6] + 'T12:00:00Z'), { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const note = (n) => { for (const [re, to] of (L.nt || [])) if (re.test(n)) return n.replace(re, to); return n; };
  const store = STORE + '-' + lg;
  const words = (it) => {
    const t = it.title.replace(/\s*(season|part|cour)\s*\d+$/i, '').replace(/[:!?]/g, '').trim();
    const end = it.kind === 'game' ? ['ending', 'leak'] : it.kind === 'movie' ? ['ending', 'post credits', 'leak'] : ['finale', 'ending', 'leak'];
    return [...new Set([...L.extra.map((w) => `${t} ${w}`), `${t} spoiler`, `${t} spoilers`, ...end.map((w) => `${t} ${w}`)])];
  };
  const row = (it, i) => {
    const mute = it.mute || shieldPage(it.title) || (it.alt && shieldPage(it.alt));
    return `<div class="item">
<h3>${esc(it.title)}</h3>
<p class="muted">${L.kind[it.kind]} · ${fmtL(it.when, { weekday: 'long' })} · ${esc(note(it.note))} · <a href="${esc(it.source)}" rel="nofollow">${L.source}</a>${mute ? ` · <a href="${R}${mute}">${L.full}</a>` : ''}</p>
<div class="chips" data-group="g${i}">${words(it).map(esc).join('|')}</div>
<button class="copyall" data-copy="g${i}">${L.copy}</button>
</div>`;
  };
  const section = (k) => {
    const items = all.map((x, i) => [x, i]).filter(([x]) => x.kind === k);
    return items.length ? `<h2>${L.sec[k]}</h2>\n${items.map(([x, i]) => row(x, i)).join('\n')}` : '';
  };
  const title = L.h(range), desc = L.desc(range, top.join(', ')).slice(0, 158), u = urlOf(lg);
  const alts = Object.keys(LANGS).map((k) => `<link rel="alternate" hreflang="${k}" href="${urlOf(k)}">`).join('\n') + `\n<link rel="alternate" hreflang="x-default" href="${urlOf('en')}">`;
  const switcher = Object.keys(LANGS).map((k) => k === lg ? `<strong>${k.toUpperCase()}</strong>` : `<a href="${R}spoiler-danger/${LANGS[k].dir}${SLUG}.html">${k.toUpperCase()}</a>`).join(' · ');
  return { range, html: `<!doctype html>
<html lang="${lg}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${u}">
${alts}
<link rel="alternate" type="application/rss+xml" title="Spoiler danger weekly" href="${BASE}feed.xml">
<link rel="stylesheet" href="${R}style.css">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Pure guides">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${u}">
<meta property="og:image" content="${BASE}spoiler-danger/${SLUG}.png">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">
${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Article', headline: title, datePublished: SLUG, dateModified: SLUG, inLanguage: lg, image: `${BASE}spoiler-danger/${SLUG}.png`, author: { '@type': 'Organization', name: 'Pure guides' }, mainEntityOfPage: u })}
</script>
<style>
.item{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 16px;margin:12px 0}
.item h3{margin:0 0 2px;font-size:1.1rem}.item p{margin:0}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 6px}
.chip{background:var(--bg);color:var(--text);border:1px solid var(--line);border-radius:999px;padding:5px 11px;font:14px/1.3 inherit;cursor:pointer}
.chip:hover{border-color:var(--accent)}.chip.done{border-color:var(--accent);color:var(--accent)}
.copyall{background:var(--accent);color:#06281b;border:0;border-radius:10px;padding:6px 12px;font:inherit;font-size:.9rem;font-weight:600;cursor:pointer}
.lang{float:right;font-size:.9rem;color:var(--muted)}.lang a{color:var(--muted)}
#toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--card);border:1px solid var(--accent);border-radius:10px;padding:8px 14px;opacity:0;transition:opacity .2s;pointer-events:none}#toast.on{opacity:1}
</style>
</head>
<body>
<main>
<a class="brand" href="${R}spoiler-danger/">← ${L.all}</a> <span class="lang">${switcher}</span>
<div class="hero"><img src="${R}img/spoilershield.png" alt=""><span class="muted">Weekly · Monday</span></div>
<h1>${esc(title)}</h1>
<p>${L.intro}</p>
<figure><img src="${R}spoiler-danger/${SLUG}.png" alt="${esc(title)}: ${esc(top.join(', '))}" width="1080" height="1350" loading="lazy"></figure>
<div class="note">${L.cal}</div>
${section('game')}
${section('movie')}
${section('series')}
${section('anime')}
${soonList.length ? `<h2>${L.soon}</h2>\n<ul>${soonList.map((g) => `<li><strong>${esc(g.title)}</strong>, ${esc(g.date)} (${esc(g.platforms)}). <a href="${R}${g.mute}">${L.mute}</a></li>`).join('')}</ul>` : ''}
<h2>${L.where}</h2>
<ul>
<li>${L.x}</li>
<li>${L.th}</li>
<li>${L.yt}</li>
</ul>
<div class="note">${L.note(store).replace(/\{R\}/g, R)}</div>
<p>${L.link.replace(/\{R\}/g, R)}</p>
<p class="muted">${L.foot}</p>
<footer>
<p><a href="${R}spoiler-danger/">${L.all}</a> · <a href="${R}feed.xml">RSS</a> · <a href="${CAL}">Calendar</a> · <a href="${R}mute-list/">Mute lists</a> · <a href="${R}">Pure guides</a></p>
<p>This site has no analytics, no cookies and no trackers.</p>
</footer>
</main>
<div id="toast" role="status" aria-live="polite"></div>
<script src="${R}mutelist.js"></script>
</body>
</html>
` };
}
let RANGE;
for (const lg of Object.keys(LANGS)) {
  const r = render(lg);
  if (lg === 'en') RANGE = r.range;
  fs.mkdirSync(path.join(DIR, LANGS[lg].dir), { recursive: true });
  fs.writeFileSync(path.join(DIR, LANGS[lg].dir, SLUG + '.html'), r.html);
}
fs.writeFileSync(path.join(DIR, SLUG + '.json'), JSON.stringify({ range: RANGE, items: all.map((x) => ({ kind: x.kind, title: x.title, date: dayOf(x.when), day: dayEn(x.when), note: x.note, mute: x.mute || shieldPage(x.title) || (x.alt && shieldPage(x.alt)) || null, source: x.source })) }, null, 1));
fs.copyFileSync(path.join(DIR, SLUG + '.json'), path.join(DIR, 'latest.json')); // для «спойлерной погоды» на главной

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
<div class="note">${LANGS.en.cal}</div>
<p class="muted">Also in <a href="uk/${weeks[0].slug}.html">Ukrainian</a> and <a href="pl/${weeks[0].slug}.html">Polish</a>.</p>
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
  .flatMap((u) => u.endsWith('.html') ? [u, u.replace('/spoiler-danger/', '/spoiler-danger/uk/'), u.replace('/spoiler-danger/', '/spoiler-danger/pl/')] : [u])
  .filter((u) => fs.existsSync(path.join(ROOT, u.replace(BASE, '') || 'index.html')) || u.endsWith('/'))
  .map((u) => `<url><loc>${u}</loc><lastmod>${weeks[0].slug}</lastmod></url>`).join('\n') + '\n<!-- danger:end -->\n</urlset>');
fs.writeFileSync(sm, s);

// ---------- календарь (.ics): последние 8 недель + будущие игры; подписка обновляется сама
const icsEsc = (t) => String(t).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const fold = (line) => { const out = []; let cur = ''; for (const ch of line) { if (Buffer.byteLength(cur + ch) > 73) { out.push(cur); cur = ' ' + ch; } else cur += ch; } out.push(cur); return out.join('\r\n'); };
const ev = [];
const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
const addEv = (date, sum, desc, link, uid) => {
  const d = date.replace(/-/g, ''); const nx = new Date(date + 'T12:00:00Z'); nx.setUTCDate(nx.getUTCDate() + 1);
  ev.push(['BEGIN:VEVENT', `UID:${uid}@qwemort.github.io`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${nx.toISOString().slice(0, 10).replace(/-/g, '')}`,
    `SUMMARY:${icsEsc(sum)}`, `DESCRIPTION:${icsEsc(desc)}`, `URL:${link}`, 'TRANSP:TRANSPARENT', 'END:VEVENT'].map(fold).join('\r\n'));
};
const seenUid = new Set();
for (const w of weeks.slice(0, 8)) for (const it of w.items) {
  if (!it.date) continue;
  const uid = `${it.date}-${norm(it.title).replace(/ /g, '-')}`; if (seenUid.has(uid)) continue; seenUid.add(uid);
  const link = it.mute ? BASE + it.mute : `${BASE}spoiler-danger/${w.slug}.html`;
  addEv(it.date, `🛡 ${it.title} · ${it.note}`, `Spoiler danger: ${it.title} (${it.note}). Words to mute on X and Threads: ${link}\nAll of this week: ${BASE}spoiler-danger/${w.slug}.html`, link, uid);
}
for (const g of JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'games.json'), 'utf8'))) {
  const uid = `${g.date}-${norm(g.title).replace(/ /g, '-')}`; if (seenUid.has(uid) || g.date < days[0]) continue; seenUid.add(uid);
  addEv(g.date, `🛡 ${g.title} · release`, `Spoiler danger: ${g.title} comes out (${g.platforms}). Words to mute: ${BASE}${g.mute}`, BASE + g.mute, uid);
}
fs.writeFileSync(path.join(DIR, 'calendar.ics'), ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Pure guides//Spoiler danger//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
  'X-WR-CALNAME:Spoiler danger', 'X-WR-CALDESC:Game, series and anime releases with what to mute. No spoilers.', `X-WR-TIMEZONE:${TZ}`,
  'REFRESH-INTERVAL;VALUE=DURATION:P1D', 'X-PUBLISHED-TTL:P1D', ...ev, 'END:VCALENDAR'].join('\r\n') + '\r\n');

// ---------- кандидаты в новые списки Shield: тайтл в топе недели, а готового списка нет
const CP = path.join(ROOT, 'data', 'candidates.json');
const cand = fs.existsSync(CP) ? JSON.parse(fs.readFileSync(CP, 'utf8')) : {};
for (const it of all) {
  if (it.mute || shieldPage(it.title) || (it.alt && shieldPage(it.alt))) continue;
  const c = cand[it.title] || { kind: it.kind, source: it.source, weeks: [] };
  if (!c.weeks.includes(SLUG)) c.weeks.push(SLUG);
  c.weeks = c.weeks.sort().slice(-12); c.ready = c.weeks.length >= 2; cand[it.title] = c;
}
fs.writeFileSync(CP, JSON.stringify(Object.fromEntries(Object.entries(cand).sort((a, b) => b[1].weeks.length - a[1].weeks.length)), null, 1) + '\n');

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
const uurl = urlOf('uk');
const ua = (d) => UA_DAYS[dayEn(d)] || '';
const T = [
  `цього тижня виходить ${t3}${more ? ` і ще ${more}` : ''}. якщо не дивишся в день виходу, краще замьютити слова заздалегідь. зібрав що мьютити по кожному: ${uurl}`,
  `тиждень небезпечний для спойлерів: ${t3}. список слів для мьюту в threads і x тут ${uurl}\n\nщо з цього дивитесь?`,
  `${first.title} виходить ${ua(first.when)}. хто дивиться пізніше, тримайте слова щоб не наспойлерили ${uurl}`,
  `кожен понеділок збираю що виходить за тиждень і що замьютити. цього разу ${t3}. ${uurl}\nчогось нема? пишіть, додам`,
  `якщо ${first.title} в тебе не в день виходу, цей тиждень мінне поле. що мьютити: ${uurl}`,
  `на ютубі і реддіті мьюту по словах взагалі нема, тому я зробив розширення яке блюрить спойлери. а для threads ось слова на цей тиждень (${t3}): ${uurl}`,
  `що виходить цього тижня: ${all.slice(0, 5).map((x) => x.title).join(', ')}. слова для мьюту по кожному тут ${uurl}\nале спойлер на картинці не зловить жоден мьют, тому обережно`,
];
const wk = Math.floor(from.getTime() / (7 * 864e5));
let threads = T[wk % T.length];
if ([...threads].length > 480) threads = T[1];
// люди не знают, где в Threads прятать слова: говорим прямо
const HOW = '\n\nде ховати: налаштування → конфіденційність → приховані слова';
if ([...(threads + HOW)].length <= 490) threads += HOW;
const x = `Spoiler danger this week: ${t3}. Copy-ready words to mute, no spoilers on the page: ${url}`;
fs.writeFileSync(path.join(OUT, 'post.json'), JSON.stringify({ slug: SLUG, url, image: `${BASE}spoiler-danger/${SLUG}.png`, threads, x }, null, 1));
console.log(`week ${SLUG}: ${data.games.length} games, ${data.series.length} series, ${data.anime.length} anime`);
console.log(threads);
