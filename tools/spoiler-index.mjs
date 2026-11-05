// «Индекс спойлеров GTA 6»: раз в день открываем НАСТОЯЩИЙ YouTube (без логина, как новый человек),
// вбиваем одни и те же запросы и считаем, сколько из первых N видео НАСТОЯЩИЙ Pure Spoiler Shield
// (режим «только спойлеры», список gta6) закрыл бы. Ничего не подделываем и не подкручиваем.
//   node tools/spoiler-index.mjs --ext <распакованный Shield для Chrome> [--n 40]
// Пишет data/spoiler-index.json (история, публичная: только числа) и out/index-details.json
// (названия видео — ТОЛЬКО для проверки в artifact, в репозиторий не коммитится: там спойлеры).
// Коды выхода: 0 — ок; 2 — YouTube показал капчу/согласие или пустую выдачу (день пропускаем, ничего не пишем).
import { createRequire } from 'node:module'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const { chromium } = createRequire(import.meta.url)('playwright');
const A = process.argv.slice(2); const opt = (k, d) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : d; };
const EXT = path.resolve(opt('--ext', '')); const N = +opt('--n', 40);
if (!fs.existsSync(path.join(EXT, 'manifest.json'))) { console.error('нет --ext с manifest.json'); process.exit(1); }
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
// Запросы НЕ менять без нужды: иначе дни станут несравнимы. Первый — главный (то, что вбивает обычный человек).
const QUERIES = ['gta 6', 'gta 6 ending', 'gta 6 story', 'gta 6 leak'];
const CARD = 'ytd-video-renderer, ytd-reel-item-renderer, ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2, yt-lockup-view-model';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = new Date().toISOString().slice(0, 10);

const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'si-')), {
  channel: 'chromium', headless: true, viewport: { width: 1280, height: 1600 }, locale: 'en-US', timezoneId: 'America/New_York',
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 20000 });
await sleep(1500);
for (const pg of ctx.pages()) if (pg.url().includes('welcome.html')) await pg.close();
// ровно настройка по умолчанию у нового пользователя: GTA VI, «только спойлеры», размытие
await sw.evaluate(async () => {
  const { settings } = await chrome.storage.local.get('settings');
  await chrome.storage.local.set({ settings: Object.assign({}, settings || {}, { enabled: true, shields: [{ id: 'gta6', preset: 'gta6', mode: 'spoilers', action: 'blur', on: true }] }) });
});
const version = await sw.evaluate(() => chrome.runtime.getManifest().version);
const p = ctx.pages()[0] || await ctx.newPage();

async function measure(q) {
  await p.goto('https://www.youtube.com/results?search_query=' + encodeURIComponent(q), { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(6000);
  const txt = await p.evaluate(() => (document.body ? document.body.innerText.slice(0, 3000) : ''));
  if (/before you continue|unusual traffic|captcha|are you a robot|sign in to confirm/i.test(txt) || /consent\./.test(p.url())) return { blocked: true };
  // докручиваем, пока не наберём N карточек (YouTube догружает выдачу при прокрутке)
  for (let i = 0; i < 12; i++) {
    const n = await p.evaluate((sel) => document.querySelectorAll(sel).length, CARD);
    if (n >= N + 5) break;
    await p.mouse.wheel(0, 2400); await sleep(1600);
  }
  await p.evaluate(() => window.scrollTo(0, 0)); await sleep(3500); // Shield успевает обработать догруженное
  return p.evaluate(([sel, N]) => {
    const all = [...document.querySelectorAll(sel)].filter((el) => !el.parentElement.closest(sel) && !el.closest('ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer'));
    const items = [];
    const seen = new Set();
    for (const el of all) {
      const a = el.querySelector('a[href*="/watch?v="], a[href*="/shorts/"]'); if (!a) continue;
      const m = /(?:v=|shorts\/)([\w-]{6,})/.exec(a.getAttribute('href')); if (!m || seen.has(m[1])) continue;
      seen.add(m[1]);
      const title = (el.querySelector('#video-title, h3, [title]')?.textContent || a.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 140);
      const spoiler = !!(el.closest('.pss-veil') || el.querySelector('.pss-veil'));
      items.push({ id: m[1], short: /\/shorts\//.test(a.getAttribute('href')), spoiler, title });
      if (items.length >= N) break;
    }
    return { cards: items.length, spoilers: items.filter((x) => x.spoiler).length, items };
  }, [CARD, N]);
}

const per = [], details = [];
for (const q of QUERIES) {
  let r = await measure(q);
  if (r.blocked) { await sleep(30000); r = await measure(q); }
  if (r.blocked) { console.error(`YouTube показал капчу/согласие на «${q}» — день пропущен`); await ctx.close(); process.exit(2); }
  per.push({ q, cards: r.cards, spoilers: r.spoilers });
  details.push({ q, items: r.items });
  console.log(`«${q}»: ${r.spoilers} из ${r.cards}`);
}
await ctx.close();
if (per[0].cards < 15) { console.error(`слишком мало видео в выдаче (${per[0].cards}) — похоже, YouTube отдал не ту страницу; день пропущен`); process.exit(2); }

// уникальные спойлерные видео по всем запросам (одно видео в двух выдачах считаем один раз)
const uniq = new Set(), uniqAll = new Set();
for (const d of details) for (const it of d.items) { uniqAll.add(it.id); if (it.spoiler) uniq.add(it.id); }
const entry = { date: today, main: { q: QUERIES[0], cards: per[0].cards, spoilers: per[0].spoilers }, unique_spoilers: uniq.size, unique_videos: uniqAll.size, queries: per, shield: version, where: 'youtube.com, US, no login' };

const F = path.join(ROOT, 'data', 'spoiler-index.json');
const hist = fs.existsSync(F) ? JSON.parse(fs.readFileSync(F, 'utf8')) : [];
const out = hist.filter((x) => x.date !== today).concat(entry).sort((a, b) => a.date.localeCompare(b.date));
fs.writeFileSync(F, JSON.stringify(out, null, 1) + '\n');
fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'out', 'index-details.json'), JSON.stringify({ entry, details }, null, 1));
console.log(`главный: ${entry.main.spoilers}/${entry.main.cards}; уникальных спойлерных: ${entry.unique_spoilers} из ${entry.unique_videos}; Shield ${version}`);
