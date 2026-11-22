// Радар манги для аниме (Антон 22.11.2026, исследование №6). Раз в неделю, только чтение, без ключей:
//   AniList — у каких аниме из каталога на ближайшие 7 дней выходят серии (номер и дата) и есть ли у них манга-первоисточник;
//   MangaDex — новые главы этой манги за последние 7 дней (главная угроза для тех, кто смотрит только аниме).
// → одна сводка Антону в Telegram (поводы для постов «манга уже ушла вперёд, береги серию N») + data/anime-radar.json.
// Любой недоступный источник просто пропускается.   node tools/anime-radar.mjs
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true });
const OUT = path.join(ROOT, 'out', 'anime-radar.txt');
fs.writeFileSync(OUT, '');
const UA = { 'user-agent': 'pure-guides anime-radar (github.com/qwemort/pure-guides)', 'content-type': 'application/json', accept: 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = Date.now(), WEEK = 7 * 864e5;
const MAP = path.join(ROOT, 'data', 'anime-radar.json');
const saved = fs.existsSync(MAP) ? JSON.parse(fs.readFileSync(MAP, 'utf8')) : { ids: {} };

const titles = fs.readdirSync(path.join(ROOT, 'data', 'titles')).filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'titles', f), 'utf8'))).filter((t) => t.media === 'anime');

const Q = `query ($id: Int, $s: String) { Media(id: $id, search: $s, type: ANIME, sort: [POPULARITY_DESC]) {
  id title { romaji english } status nextAiringEpisode { episode airingAt }
  relations { edges { relationType node { id type format status title { romaji english } } } } } }`;
async function anilist(vars) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch('https://graphql.anilist.co', { method: 'POST', headers: UA, body: JSON.stringify({ query: Q, variables: vars }), signal: AbortSignal.timeout(20000) });
      if (r.status === 429) { await sleep(65000); continue; }
      const j = await r.json(); return j?.data?.Media || null;
    } catch { await sleep(3000); }
  }
  return null;
}
async function mangadexNew(name) {
  try {
    const m = await (await fetch(`https://api.mangadex.org/manga?title=${encodeURIComponent(name)}&limit=1&order[relevance]=desc`, { headers: UA, signal: AbortSignal.timeout(20000) })).json();
    const id = m?.data?.[0]?.id; if (!id) return null;
    await sleep(1200);
    const since = new Date(now - WEEK).toISOString().slice(0, 19);
    const f = await (await fetch(`https://api.mangadex.org/manga/${id}/feed?translatedLanguage[]=en&order[chapter]=desc&limit=5&publishAtSince=${since}`, { headers: UA, signal: AbortSignal.timeout(20000) })).json();
    const ch = (f?.data || []).map((c) => c.attributes?.chapter).filter(Boolean);
    return ch.length ? Math.max(...ch.map(Number).filter((x) => !isNaN(x))) : 0;
  } catch { return null; }
}

const rows = [];
for (const t of titles) {
  const name = t.names?.en || t.slug;
  const known = saved.ids[t.slug];
  const m = await anilist(known ? { id: known } : { s: name });
  await sleep(2500);
  if (!m) continue;
  saved.ids[t.slug] = m.id;
  const src = (m.relations?.edges || []).find((e) => e.relationType === 'SOURCE' && e.node.type === 'MANGA');
  const ep = m.nextAiringEpisode && m.nextAiringEpisode.airingAt * 1000 - now <= WEEK ? m.nextAiringEpisode : null;
  let ch = null;
  if (src && ep) { ch = await mangadexNew(src.node.title.english || src.node.title.romaji); await sleep(1500); }
  rows.push({ slug: t.slug, name, anilist: m.id, status: m.status, ep: ep ? { n: ep.episode, at: new Date(ep.airingAt * 1000).toISOString() } : null,
    manga: src ? { title: src.node.title.english || src.node.title.romaji, status: src.node.status, new_chapter: ch } : null });
}
fs.writeFileSync(MAP, JSON.stringify({ updated: new Date(now).toISOString().slice(0, 10), ids: saved.ids, week: rows.filter((r) => r.ep) }, null, 1) + '\n');
if (!rows.length) { console.log('::warning::AniList не ответил — неделя пропущена'); process.exit(0); }

const dd = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
const week = rows.filter((r) => r.ep).sort((a, b) => a.ep.at.localeCompare(b.ep.at));
const lines = week.map((r) => {
  let s = `• ${dd(r.ep.at)} ${r.name}: серия ${r.ep.n}`;
  if (r.manga?.new_chapter) s += ` · манга: новая глава ${r.manga.new_chapter} за неделю, сливы глав уже в ленте`;
  else if (r.manga) s += ` · по манге (${r.manga.status === 'FINISHED' ? 'манга закончена, концовка известна' : 'манга идёт и впереди аниме'})`;
  return s;
});
const txt = lines.length ? `🍥 Аниме на этой неделе (${lines.length} из ${titles.length} в каталоге). Поводы для постов: кто смотрит только аниме, тем спойлерят из манги.\n\n${lines.join('\n')}` : '';
fs.writeFileSync(OUT, txt);
console.log(`AniList ответил по ${rows.length} из ${titles.length}`);
console.log(txt || 'на этой неделе серий нет');
