// Разведка по тайтлу (Антон 28.11.2026: «автоматизировать каждый тайтл, шмонать и писать»). План: pure-extensions docs/SITE-PLAN.md п. 3a.
// Для каждого тайтла собирает ФАКТЫ О ТОМ, КОГДА И ОТКУДА ПРИЛЕТЯТ СПОЙЛЕРЫ — без содержания спойлеров:
//   премьера, эмбарго отзывов/реакций, ранние показы, релизы по странам, утечки (тип и дата), мерч/LEGO.
// Источники: Wikidata (даты по странам) + новости (Bing News RSS, запасной Google News RSS) + текст статей.
// ИИ (Gemini) только вытаскивает факты из текста; каждый факт обязан иметь ДОСЛОВНУЮ цитату, которая реально есть в статье
// (проверяет код, не ИИ). Факт из одного источника = «reported», из двух и больше или с официального сайта = «confirmed».
// Слова из spoiler_blocklist/words тайтла в текст факта не пропускаются.
// Пишет поле `intel` в data/titles/<slug>.json. На сайт попадает только через Pull Request, который мержит Антон.
//   node tools/title-intel.mjs [slug ...] [--auto] [--dry]
//   --auto: тайтлы с открытым окном (от -45 до +21 дня к релизу) — каждый день; остальные будущие — по понедельникам.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const TDIR = path.join(ROOT, 'data', 'titles');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'release-posts.json'), 'utf8'));
const { GEMINI_API_KEY: GK } = process.env;
const DRY = process.argv.includes('--dry');
const AUTO = process.argv.includes('--auto');
const ARGS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const OUT = path.join(ROOT, 'out');
fs.mkdirSync(OUT, { recursive: true });
const NOW = Date.now();
const TODAY = new Date(NOW).toISOString().slice(0, 10);
const UA = 'Mozilla/5.0 (compatible; mutespoilers-intel/1.0; +https://mutespoilers.com/about/)';
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const days = (iso) => Math.round((Date.parse(iso) - Date.parse(TODAY)) / 864e5);
const log = [];
const say = (s) => { console.log(s); log.push(s); };

// ---------- выбор тайтлов
const all = fs.readdirSync(TDIR).filter((f) => f.endsWith('.json')).map((f) => ({ f, t: JSON.parse(fs.readFileSync(path.join(TDIR, f), 'utf8')) }));
let pick = all;
if (ARGS.length) pick = all.filter(({ t }) => ARGS.includes(t.slug) || ARGS.includes(t.id));
else if (AUTO) {
  const monday = new Date(NOW).getUTCDay() === 1;
  pick = all.filter(({ t }) => {
    const d = t.release?.date; if (!DAY.test(d || '')) return false;
    const n = days(d);
    return (n <= 45 && n >= -21) || (monday && n > 45 && n <= 400);
  });
}
if (!pick.length) { say('intel: нет тайтлов для разведки'); process.exit(0); }

// ---------- сеть
async function get(url, ms = 20000) {
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: '*/*' }, signal: AbortSignal.timeout(ms), redirect: 'follow' });
  if (!r.ok) throw new Error(`${r.status} ${url.slice(0, 80)}`);
  return { url: r.url, text: await r.text() };
}
const tag = (x, n) => { const m = x.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`, 'i')); return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : ''; };
const unhtml = (s) => s.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;|&#8217;/g, "'").replace(/&quot;|&ldquo;|&rdquo;|&#8220;|&#8221;/g, '"')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/\s+/g, ' ').trim();
const flat = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const norm = (s) => s.toLowerCase().replace(/[‘’`´]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
const ALIAS = { us: 'united states', usa: 'united states', 'u.s.': 'united states', uk: 'united kingdom', 'u.k.': 'united kingdom', 'north america': 'united states' };
const place = (p) => ALIAS[norm(p || '')] || norm(p || '');
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

// Wikidata: дата выхода с уточнением «страна» (P577 + P291)
async function wikidataDates(qid) {
  if (!/^Q\d+$/.test(qid || '')) return [];
  const q = `SELECT ?date ?placeLabel WHERE { wd:${qid} p:P577 ?st . ?st psv:P577 ?v . ?v wikibase:timeValue ?date ; wikibase:timePrecision ?pr . FILTER(?pr >= 11) OPTIONAL { ?st pq:P291 ?place } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`;
  try {
    const { text } = await get(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`);
    return JSON.parse(text).results.bindings.map((b) => ({ date: b.date.value.slice(0, 10), place: b.placeLabel?.value || 'worldwide' }));
  } catch (e) { say(`  wikidata: ${e.message}`); return []; }
}

// Новости: Bing News RSS (прямые ссылки), запасной Google News RSS
async function news(q) {
  const items = [];
  try {
    const { text } = await get(`https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&setlang=en-US&cc=US`);
    for (const it of text.split('<item>').slice(1)) {
      let link = tag(it, 'link').replace(/&amp;/g, '&');
      const m = link.match(/[?&]url=([^&]+)/); if (m) link = decodeURIComponent(m[1]);
      items.push({ title: unhtml(tag(it, 'title')), desc: unhtml(tag(it, 'description')), link, date: tag(it, 'pubDate') });
    }
  } catch (e) { say(`  bing: ${e.message}`); }
  if (!items.length) try {
    const { text } = await get(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`);
    for (const it of text.split('<item>').slice(1)) items.push({ title: unhtml(tag(it, 'title')), desc: unhtml(tag(it, 'description')), link: tag(it, 'link'), date: tag(it, 'pubDate') });
  } catch (e) { say(`  google news: ${e.message}`); }
  return items.filter((x) => x.link && (!x.date || NOW - Date.parse(x.date) < 120 * 864e5));
}

async function gemini(system, user) {
  if (!GK) throw new Error('нет GEMINI_API_KEY');
  const errs = [];
  for (const m of CFG.gemini_models) try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
      method: 'POST', signal: AbortSignal.timeout(90000), headers: { 'x-goog-api-key': GK, 'content-type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' } }) });
    const j = await r.json();
    const out = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
    if (out) return out;
    errs.push(`${m}: ${j.error?.message || 'пусто'}`);
  } catch (e) { errs.push(`${m}: ${e.message}`); }
  throw new Error(errs.join('; '));
}

const TYPES = ['world_premiere', 'review_embargo', 'social_embargo', 'early_screening', 'release_country', 'leak', 'merch_leak', 'platform_later'];
const SYSTEM = `You extract SPOILER-TIMING facts about one title from news articles, for a site that helps people avoid spoilers.
Return JSON: {"facts":[{"type":one of ${JSON.stringify(TYPES)},"date":"YYYY-MM-DD or empty","place":"country/city/platform or empty","note":"max 12 words, plain English","quote":"verbatim sentence fragment copied from the article, 8-30 words","url":"article url given above"}]}
Rules:
- Only facts about WHEN or WHERE spoilers can appear: premiere, review/social embargo, early or fan screenings, release dates by country, a later platform (e.g. PC after consoles), that a leak happened (type of material and date only), toy/LEGO/merch reveals.
- NEVER write plot, ending, deaths, cameos, character names, twists or what a leak showed. For leaks write only the kind of material, e.g. "footage leaked online", "LEGO set names revealed characters".
- "quote" must be copied exactly from the article text. If you cannot quote it, drop the fact.
- Use the article's own dates; convert to YYYY-MM-DD. If the article only says "reportedly", keep it but say "reportedly" in note.
- Ignore single-cinema or local events (one theater, one city festival) and re-releases of older films; keep only nationwide, worldwide or platform-wide dates.
- Country names in full English (United States, United Kingdom), not abbreviations.
- No facts about box office, reviews' opinions, casting news or trailers' content.`;

const PLOT = [' dies', ' death of', 'killed', ' kills ', 'twist is', 'ending is', 'cameo by', 'cameo from', 'post-credits scene shows', 'returns as', 'is revealed to be'];
const LEAKY = (t) => [...new Set([...(t.spoiler_blocklist || []).map((w) => String(w).toLowerCase()).filter((w) => w.length >= 4), ...PLOT])];

async function intelFor(t) {
  const name = t.names?.en || t.slug;
  say(`\n# ${name} (${t.slug}), релиз ${t.release?.date || '?'}`);
  const qs = /^game/.test(t.media || '')
    ? [`"${name}" release date`, `"${name}" leak`, `"${name}" review embargo`, `"${name}" PC release`, `"${name}" early access`]
    : [`"${name}" world premiere`, `"${name}" review embargo`, `"${name}" UK release date`, `"${name}" international release`, `"${name}" leak`, `"${name}" leaked footage`, `"${name}" early screenings`, `"${name}" LEGO leak`];
  if (/^(anime|tv)/.test(t.media || '')) qs.push(`"${name}" episode schedule`, `"${name}" manga leaks`);
  const seen = new Map();
  for (const q of qs) for (const it of await news(q)) if (!seen.has(it.link) && norm(it.title + ' ' + it.desc).includes(norm(name).split(':')[0])) seen.set(it.link, it);
  const items = [...seen.values()].slice(0, 24);
  say(`  новостей: ${seen.size}, берём ${items.length}`);
  const docs = [];
  for (const it of items) {
    try {
      const { url, text } = await get(it.link, 15000);
      const body = unhtml(text);
      if (body.length > 800) docs.push({ url, title: it.title, text: body.slice(0, 9000) });
    } catch { docs.push({ url: it.link, title: it.title, text: `${it.title}. ${it.desc}` }); }   // нет доступа к статье — работаем по заголовку и анонсу
    if (docs.length >= 16) break;
  }
  const wd = await wikidataDates(t.wikidata?.id || t.wikidata);
  let facts = [];
  if (docs.length) {
    const user = `Title: ${name} (${t.media}). US/main release: ${t.release?.date || 'unknown'}. Today: ${TODAY}.\n\n` +
      docs.map((d, i) => `--- ARTICLE ${i + 1}\nurl: ${d.url}\ntitle: ${d.title}\ntext: ${d.text}`).join('\n\n');
    try { facts = JSON.parse(await gemini(SYSTEM, user)).facts || []; } catch (e) { say(`  ИИ: ${e.message}`); }
  }
  // ---- проверки кодом (не ИИ)
  const leaky = LEAKY(t);
  const ok = [];
  for (const f of facts) {
    const d = [docs.find((x) => x.url === f.url), ...docs].find((x) => x && flat(x.text).includes(flat(f.quote)));
    if (!TYPES.includes(f.type)) continue;
    if (!d || !f.quote || flat(f.quote).length < 20 || !flat(d.text).includes(flat(f.quote))) { say(`  ✗ цитаты нет в статье: ${f.type} ${f.note}`); continue; }
    if (f.date && !DAY.test(f.date)) f.date = '';
    const txt = ' ' + norm(`${f.note} ${f.place}`) + ' ';
    const hit = leaky.find((w) => txt.includes(w));
    if (hit) { say(`  ✗ спойлер-слово «${hit}» в факте, выброшен`); continue; }
    ok.push({ type: f.type, date: f.date || '', place: (f.place || '').slice(0, 60), note: (f.note || '').slice(0, 120), quote: f.quote.slice(0, 240), url: d.url, host: host(d.url) });
  }
  // склейка одинаковых фактов: тип + дата + место
  const groups = new Map();
  for (const f of ok) {
    const k = `${f.type}|${f.date}|${place(f.place)}`;
    const g = groups.get(k) || { ...f, sources: [] };
    if (!g.sources.find((s) => s.host === f.host)) g.sources.push({ host: f.host, url: f.url, quote: f.quote });
    groups.set(k, g);
  }
  for (const w of wd) {
    const k = `release_country|${w.date}|${place(w.place)}`;
    const g = groups.get(k) || { type: 'release_country', date: w.date, place: w.place, note: `release in ${w.place}`, sources: [] };
    g.sources.push({ host: 'wikidata.org', url: `https://www.wikidata.org/wiki/${t.wikidata?.id || t.wikidata}`, quote: '' });
    groups.set(k, g);
  }
  const out = [...groups.values()].map(({ quote, url, host: h, ...g }) => ({ ...g, status: g.sources.length >= 2 ? 'confirmed' : 'reported' }))
    .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
  say(`  фактов прошло проверку: ${out.length} (отброшено ${facts.length - ok.length})`);
  for (const f of out) say(`  · ${f.date || '—'} ${f.type} ${f.place} — ${f.note} [${f.status}, ${f.sources.map((s) => s.host).join(', ')}]`);
  return { checked: TODAY, facts: out, threat: threat(t, out) };
}

// Уровень угрозы: окно 14 до / 21 после (Антон 28.11) + поправки по реальным событиям
function threat(t, facts) {
  const rel = t.release?.date; if (!DAY.test(rel || '')) return null;
  const add = (iso, n) => new Date(Date.parse(iso) + n * 864e5).toISOString().slice(0, 10);
  const dated = facts.filter((f) => f.date);
  const firstOut = [...dated.filter((f) => ['world_premiere', 'early_screening', 'release_country', 'social_embargo', 'review_embargo'].includes(f.type)).map((f) => f.date), rel].sort()[0];
  const leaking = [add(rel, -3), firstOut].sort()[0];
  const whispers = add(rel, -14);
  const clear = add(rel, 21);
  const hasLeak = facts.some((f) => f.type === 'leak' || f.type === 'merch_leak');
  let level = 'quiet';
  if (TODAY >= clear) level = 'archive';
  else if (TODAY >= add(rel, 8)) level = 'everyone_knows';
  else if (TODAY >= leaking) level = 'leaking';
  else if (TODAY >= whispers || hasLeak) level = 'whispers';
  return { level, whispers_from: hasLeak && TODAY < whispers ? TODAY : whispers, leaking_from: leaking, everyone_knows_from: add(rel, 8), all_clear: clear, first_out: firstOut };
}

// ---------- запуск
const changed = [];
for (const { f, t } of pick) {
  try {
    const intel = await intelFor(t);
    if (!intel.facts.length) { say('  нечего записать'); continue; }
    const before = JSON.stringify((t.intel || {}).facts || []);
    if (before === JSON.stringify(intel.facts) && JSON.stringify(t.intel?.threat) === JSON.stringify(intel.threat)) { say('  без изменений'); continue; }
    t.intel = intel;
    if (!DRY) fs.writeFileSync(path.join(TDIR, f), JSON.stringify(t, null, 2) + '\n');
    changed.push(t.names?.en || t.slug);
  } catch (e) { say(`  сбой: ${e.message}`); }
}
fs.writeFileSync(path.join(OUT, 'title-intel.md'), log.join('\n') + '\n');
fs.writeFileSync(path.join(OUT, 'title-intel-changed.txt'), changed.join('\n'));
say(`\nintel: изменено тайтлов ${changed.length}${DRY ? ' (dry, не записано)' : ''}`);
