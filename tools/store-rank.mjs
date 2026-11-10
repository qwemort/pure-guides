// Позиция Pure Spoiler Shield в поиске Chrome Web Store по нескольким запросам (публичные страницы, без входа).
//   node tools/store-rank.mjs   → data/store-rank.json (история по дням) и out/store-rank.md
// Если магазин не отдал список (капча/другая вёрстка) — день пропускается, ничего не пишется.
import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ID = 'aloilpojkoblacapdlknacjiljgjibng';
const QUERIES = ['spoiler blocker', 'hide spoilers', 'spoiler shield', 'block spoilers youtube', 'gta 6 spoiler', 'gta 6 spoiler blocker'];
const today = new Date().toISOString().slice(0, 10);
const b = await chromium.launch(); const ctx = await b.newContext({ locale: 'en-US', viewport: { width: 1280, height: 900 } });
const res = [];
for (const q of QUERIES) {
  const pg = await ctx.newPage();
  try {
    await pg.goto(`https://chromewebstore.google.com/search/${encodeURIComponent(q)}?hl=en`, { waitUntil: 'networkidle', timeout: 45000 });
    await pg.waitForSelector('a[href*="/detail/"]', { timeout: 20000 });
    for (let i = 0; i < 3; i++) { await pg.mouse.wheel(0, 3000); await pg.waitForTimeout(1200); }
    const ids = await pg.$$eval('a[href*="/detail/"]', (as) => as.map((a) => (a.getAttribute('href').match(/\/detail\/(?:[^/]+\/)?([a-p]{32})/) || [])[1]).filter(Boolean));
    const uniq = [...new Set(ids)];
    if (!uniq.length) throw new Error('пустой список');
    const pos = uniq.indexOf(ID);
    res.push({ q, total: uniq.length, rank: pos < 0 ? null : pos + 1 });
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
fs.writeFileSync(path.join(ROOT, 'out', 'store-rank.md'), md);
console.log(md);
