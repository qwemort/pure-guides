// Тест на ложные срабатывания (Антон 22.11.2026). Раз в неделю: ~1000 свежих НЕ-развлекательных заголовков
// (Google News: мир, бизнес, технологии, наука, здоровье на 6 языках + Hacker News) прогоняются через НАСТОЯЩИЙ
// движок расширения (ext/shield/src/lib/words.js, SS.judge) по всем 60 тайтлам в двух режимах.
// Любое срабатывание = расширение спрятало бы обычную новость → кандидат на правку списка (поле not/game).
// Никогда не падает из-за чужих сайтов: недоступная лента пропускается. → out/fp-fuzzer.txt (пусто = молчать)
//   node tools/fp-fuzzer.mjs [--ext ext/shield]
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const A = process.argv.slice(2);
const EXT = path.resolve(ROOT, A.includes('--ext') ? A[A.indexOf('--ext') + 1] : 'ext/shield');
fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true });
const OUT = path.join(ROOT, 'out', 'fp-fuzzer.txt');
fs.writeFileSync(OUT, '');

await import(path.join(EXT, 'src', 'lib', 'words.js'));
const SS = globalThis.SS;
const LANGS = [['en-US', 'US', 'US:en'], ['ru', 'RU', 'RU:ru'], ['pl', 'PL', 'PL:pl'], ['de', 'DE', 'DE:de'], ['pt-BR', 'BR', 'BR:pt-419'], ['uk', 'UA', 'UA:uk']];
const TOPICS = ['WORLD', 'BUSINESS', 'TECHNOLOGY', 'SCIENCE', 'HEALTH'];
const urls = [];
for (const [hl, gl, ceid] of LANGS) for (const t of TOPICS) urls.push(`https://news.google.com/rss/headlines/section/topic/${t}?hl=${hl}&gl=${gl}&ceid=${ceid}`);
const get = async (u) => { try { const r = await fetch(u, { signal: AbortSignal.timeout(20000), headers: { 'user-agent': 'Mozilla/5.0 (pure-guides fp-fuzzer; github.com/qwemort/pure-guides)' } }); return r.ok ? r.text() : ''; } catch { return ''; } };
const unent = (s) => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<[^>]+>/g, '').trim();
const heads = new Set();
for (const u of urls) {
  const xml = await get(u);
  for (const m of xml.matchAll(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>/g)) heads.add(unent(m[1]).replace(/\s+-\s+[^-]{2,40}$/, ''));   // « - Reuters» в конце убрать
  await new Promise((r) => setTimeout(r, 400));
}
try {
  const j = JSON.parse(await get('https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=300') || '{}');
  for (const h of j.hits || []) if (h.title) heads.add(h.title);
} catch { /* HN недоступен — без него */ }
const list = [...heads].filter((h) => h.length > 8);
console.log(`заголовков: ${list.length}`);
if (list.length < 100) { console.log('::warning::слишком мало заголовков (ленты недоступны) — неделя пропущена'); process.exit(0); }

// заголовок про игры/кино/аниме — это не ложное срабатывание (его и надо скрывать), такие не считаем
const ENT = /\b(games?|gaming|gamer|video ?games?|ps5|ps6|playstation|xbox|nintendo|switch 2|steam|pc port|rockstar|trailer|teaser|season|episode|series|show|tv|netflix|hbo|disney|prime video|crunchyroll|anime|manga|movie|film|box office|cinema|marvel|dc|actor|actress|cast|director|spoilers?|remake|dlc|boss|quest|mission|cutscene|ending|finale|gameplay|review|walkthrough|guide|gta|grand theft auto|zelda|pok[eé]mon|elden ring|cyberpunk|witcher|halo|mario|minecraft|fortnite|call of duty|red dead)\b|игр|сериал|сезон|серия|фильм|кино|аниме|трейлер|актёр|актер|gr[ay]\b|serial|film|anime|zwiastun|spiel|staffel|folge|jogo|série|filme|гра\b|серіал|фільм/i;
const ids = SS.LIBRARY.map((x) => x.id);
const hits = {};   // id → {mode → [заголовки]}
for (const h of list) {
  if (ENT.test(h)) continue;
  const n = SS.normalize(h);
  for (const id of ids) {
    const p = SS.preset(id);
    for (const mode of ['spoilers', 'everything']) {
      if (SS.judge(n, p, mode, false, null)) { ((hits[id] ||= {})[mode] ||= []).push(h); break; }   // spoilers строже, если там — everything не дублируем
    }
  }
}
const label = (id) => (SS.LIBRARY.find((x) => x.id === id) || {}).label || id;
const keys = Object.keys(hits).sort((a, b) => (hits[b].spoilers ? 1 : 0) - (hits[a].spoilers ? 1 : 0));
const lines = [];
for (const id of keys) {
  const s = hits[id].spoilers || [], e = hits[id].everything || [];
  lines.push(`• ${label(id)}: ${s.length ? `обычный режим ${s.length}` : ''}${s.length && e.length ? ', ' : ''}${e.length ? `«скрывать всё» ${e.length}` : ''}\n  ${[...s, ...e].slice(0, 2).map((x) => `«${x.slice(0, 90)}»`).join('\n  ')}`);
}
const txt = lines.length
  ? `🧪 Тест ложных срабатываний: из ${list.filter((h) => !ENT.test(h)).length} обычных новостей (не про игры и кино) расширение спрятало бы ${keys.reduce((a, k) => a + (hits[k].spoilers || []).length + (hits[k].everything || []).length, 0)} (тайтлов: ${keys.length}). Напиши Claude «глянь ложные срабатывания» — поправит списки в следующей версии.\n\n${lines.slice(0, 15).join('\n')}`
  : '';
fs.writeFileSync(OUT, txt);
fs.writeFileSync(path.join(ROOT, 'out', 'fp-fuzzer.json'), JSON.stringify({ date: new Date().toISOString().slice(0, 10), headlines: list.length, hits }, null, 1));
console.log(txt || 'ложных срабатываний нет');
