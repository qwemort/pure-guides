// Позиция Pure Spoiler Blocker в поиске Chrome Web Store по нескольким запросам (публичные страницы, без входа).
//   node tools/store-rank.mjs   → data/store-rank.json (история по дням) и out/store-rank.md
// Если магазин не отдал список (капча/другая вёрстка) — день пропускается, ничего не пишется.
import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ID = 'aloilpojkoblacapdlknacjiljgjibng';
const QUERIES = ['spoiler blocker', 'pure spoiler blocker', 'mute spoilers', 'block spoilers', 'hide spoilers', 'spoiler filter', 'no spoilers', 'movie spoiler blocker', 'spoiler blocker youtube', 'block spoilers youtube', 'hide spoilers youtube', 'spoiler blocker reddit', 'gta 6 spoiler', 'gta 6 spoiler blocker'];
const today = new Date().toISOString().slice(0, 10);
const b = await chromium.launch(); const ctx = await b.newContext({ locale: 'en-US', viewport: { width: 1280, height: 900 } });
const res = [];
for (const q of QUERIES) {
  const pg = await ctx.newPage();
  try {
    await pg.goto(`https://chromewebstore.google.com/search/${encodeURIComponent(q)}?hl=en`, { waitUntil: 'networkidle', timeout: 45000 });
    await pg.waitForSelector('a[href*="/detail/"]', { timeout: 20000 });
    for (let i = 0; i < 3; i++) { await pg.mouse.wheel(0, 3000); await pg.waitForTimeout(1200); }
    const items = await pg.$$eval('a[href*="/detail/"]', (as) => as.map((a) => {
      const id = ((a.getAttribute('href') || '').match(/\/detail\/(?:[^/]+\/)?([a-p]{32})/) || [])[1];
      // карточка = самый верхний предок, где ссылки ведут только на это же расширение
      let card = a;
      while (card.parentElement) {
        const ids = new Set([...card.parentElement.querySelectorAll('a[href*="/detail/"]')].map((x) => ((x.getAttribute('href') || '').match(/([a-p]{32})/) || [])[1]));
        if (ids.size > 1) break;
        card = card.parentElement;
      }
      const lines = (card.innerText || '').split('\n').map((t) => t.trim()).filter(Boolean);
      const name = lines.find((t) => t.length > 2 && !/^[\d.,]+$/.test(t) && !/^(featured|extension|users?)$/i.test(t)) || a.getAttribute('aria-label') || '';
      const users = (lines.find((t) => /users?$/i.test(t)) || '').replace(/\s*users?$/i, '');
      const rating = (lines.find((t) => /^[0-5]\.\d$/.test(t)) || '');
      return { id, name: name.slice(0, 60), users, rating };
    }).filter((x) => x.id));
    const seen = new Map();
    for (const it of items) if (!seen.has(it.id) || (!seen.get(it.id).name && it.name)) seen.set(it.id, it);
    const list = [...seen.values()];
    if (!list.length) throw new Error('пустой список');
    const pos = list.findIndex((x) => x.id === ID);
    res.push({ q, total: list.length, rank: pos < 0 ? null : pos + 1, top: list.slice(0, 10) });
  } catch (e) { console.log(`«${q}»: не вышло (${String(e.message).slice(0, 80)})`); }
  await pg.close();
}
await b.close();
if (!res.length) { console.log('::warning::магазин не отдал ни один список — день пропущен'); process.exit(0); }
const file = path.join(ROOT, 'data', 'store-rank.json');
const db = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
const out = db.filter((x) => x.date !== today).concat({ date: today, results: res });
fs.writeFileSync(file, JSON.stringify(out, null, 1));
fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true });
const prev = out.length > 1 ? out[out.length - 2].results : [];
let md = `### Позиция в поиске Chrome Web Store, ${today}\n\n| Запрос | Место | Было | Всего в выдаче |\n|---|---|---|---|\n`;
for (const r of res) { const p = prev.find((x) => x.q === r.q); md += `| ${r.q} | ${r.rank ?? 'не в первых ' + r.total} | ${p ? (p.rank ?? '—') : '—'} | ${r.total} |\n`; }
md += '\n### Кто в первой пятёрке\n\n';
for (const r of res) md += `- **${r.q}:** ${(r.top || []).slice(0, 5).map((x, i) => `${i + 1}. ${x.id === ID ? 'МЫ' : (x.name || x.id.slice(0, 8))}`).join('; ')}\n`;
fs.writeFileSync(path.join(ROOT, 'out', 'store-rank.md'), md);
console.log(md);
