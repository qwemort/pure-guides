// Запасной замер «Индекса спойлеров» через ОФИЦИАЛЬНЫЙ YouTube Data API (Антон 22.11.2026).
// Включается, когда YouTube не пустил браузер-робота (капча/«подтвердите, что вы не бот»).
// Те же запросы и N, что в tools/spoiler-index.mjs; те же названия и описания видео проверяет НАСТОЯЩИЙ движок
// расширения (src/lib/words.js, список gta6, режим «только спойлеры»). Отличие: API не показывает Shorts-полку так,
// как страница, поэтому в записи стоит source: 'api' — на графике такие дни помечаются.
//   node tools/spoiler-index-api.mjs --ext ext/shield [--n 40]      (секрет YOUTUBE_API_KEY)
// Квота: 4 запроса search.list = 400 единиц из 10 000 бесплатных в день.  Выход 0 — записано, 2 — не вышло.
import fs from 'node:fs';
import path from 'node:path';
const A = process.argv.slice(2); const opt = (k, d) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : d; };
const SRC = path.resolve(opt('--ext', 'ext/shield')); const N = Math.min(50, +opt('--n', 40));
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const KEY = process.env.YOUTUBE_API_KEY;
const DRY = A.includes('--dry');   // проба: посчитать и показать, ничего не записывать
if (!KEY) { console.error('нет YOUTUBE_API_KEY — запасной замер невозможен'); process.exit(2); }
const QUERIES = (fs.readFileSync(path.join(ROOT, 'tools', 'spoiler-index.mjs'), 'utf8').match(/const QUERIES = (\[[^\]]+\])/) || [])[1];
const QS = QUERIES ? JSON.parse(QUERIES.replace(/'/g, '"')) : ['gta 6', 'gta 6 ending', 'gta 6 story', 'gta 6 leak'];
await import(path.join(SRC, 'src', 'lib', 'words.js'));
const SS = globalThis.SS; const P = SS.preset('gta6');
const version = JSON.parse(fs.readFileSync(path.join(SRC, 'manifests', 'manifest.chrome.json'), 'utf8')).version || '';
const unent = (s) => String(s || '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const today = new Date().toISOString().slice(0, 10);

const per = [], details = [];
for (const q of QS) {
  const u = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=${N}&regionCode=US&relevanceLanguage=en&q=${encodeURIComponent(q)}&key=${KEY}`;
  let j;
  try { j = await (await fetch(u, { signal: AbortSignal.timeout(20000) })).json(); } catch (e) { console.error(`«${q}»: сеть (${e.message})`); process.exit(2); }
  if (j.error) { console.error(`«${q}»: API ответил ошибкой ${j.error.code} ${String(j.error.message).slice(0, 120)}`); process.exit(2); }
  const items = (j.items || []).map((it) => {
    const title = unent(it.snippet?.title), desc = unent(it.snippet?.description);
    const spoiler = !!SS.judge(SS.normalize(`${title} ${desc}`), P, 'spoilers', false, null);
    return { id: it.id?.videoId, short: false, spoiler, title: title.slice(0, 140) };
  }).filter((x) => x.id);
  per.push({ q, cards: items.length, spoilers: items.filter((x) => x.spoiler).length });
  details.push({ q, items });
  console.log(`«${q}»: ${per.at(-1).spoilers} из ${per.at(-1).cards} (API)`);
}
if (per[0].cards < 15) { console.error(`API вернул мало видео (${per[0].cards}) — день пропущен`); process.exit(2); }
const uniq = new Set(), uniqAll = new Set();
for (const d of details) for (const it of d.items) { uniqAll.add(it.id); if (it.spoiler) uniq.add(it.id); }
const entry = { date: today, main: { q: QS[0], cards: per[0].cards, spoilers: per[0].spoilers }, unique_spoilers: uniq.size, unique_videos: uniqAll.size, queries: per, shield: version, where: 'YouTube Data API, US', source: 'api' };
if (DRY) { console.log(`проба (API): главный ${entry.main.spoilers}/${entry.main.cards}, уникальных спойлерных ${entry.unique_spoilers} из ${entry.unique_videos}; ничего не записано`); process.exit(0); }
const F = path.join(ROOT, 'data', 'spoiler-index.json');
const hist = fs.existsSync(F) ? JSON.parse(fs.readFileSync(F, 'utf8')) : [];
fs.writeFileSync(F, JSON.stringify(hist.filter((x) => x.date !== today).concat(entry).sort((a, b) => a.date.localeCompare(b.date)), null, 1) + '\n');
fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'out', 'index-details.json'), JSON.stringify({ entry, details }, null, 1));
console.log(`главный (API): ${entry.main.spoilers}/${entry.main.cards}; уникальных спойлерных: ${entry.unique_spoilers} из ${entry.unique_videos}`);
