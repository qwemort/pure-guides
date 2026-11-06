// «Сигнал о поломке»: раз в день настоящий Pure Spoiler Shield открывает настоящие сайты (без логина) и спрашивает
// у самого себя (тот же самотест, что в окне расширения), находит ли он карточки. Если ссылок на видео/посты много,
// а карточек 0 — сайт, скорее всего, поменял вёрстку → issue «Shield: проверка сайтов» для Claude.
//   node tools/site-health.mjs --ext <распакованный Shield для Chrome>
// Пишет out/site-health.json и out/site-health.md. Код выхода всегда 0 (это сигнал, а не сборка).
// Сайты, которые требуют входа или показывают капчу, помечаются «не проверено» — это не поломка.
import { createRequire } from 'node:module'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const { chromium } = createRequire(import.meta.url)('playwright');
const A = process.argv.slice(2); const opt = (k, d) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : d; };
const SRC = path.resolve(opt('--ext', ''));
if (!fs.existsSync(path.join(SRC, 'manifest.json'))) { console.error('нет --ext с manifest.json'); process.exit(1); }
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// копия расширения, которой сразу дан доступ к Google/TikTok/Instagram (в магазине это делает кнопка в окне)
const EXT = fs.mkdtempSync(path.join(os.tmpdir(), 'sh-ext-'));
fs.cpSync(SRC, EXT, { recursive: true });
const man = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
man.host_permissions = [...new Set([...(man.host_permissions || []), '*://*.google.com/*', '*://*.tiktok.com/*', '*://*.instagram.com/*'])];
fs.writeFileSync(path.join(EXT, 'manifest.json'), JSON.stringify(man));

const SITES = [
  { site: 'youtube', url: 'https://www.youtube.com/results?search_query=gta+6' },
  { site: 'reddit', url: 'https://www.reddit.com/search/?q=gta+6' },
  { site: 'x', url: 'https://x.com/search?q=gta%206&f=live' },
  { site: 'google', url: 'https://www.google.com/search?q=gta+6+ending&hl=en' },
  { site: 'tiktok', url: 'https://www.tiktok.com/search?q=gta%206' },
  { site: 'instagram', url: 'https://www.instagram.com/explore/tags/gta6/' },
];
const WALL = /before you continue|unusual traffic|captcha|are you a robot|sign in to confirm|log in|sign up|войти|blocked by network security|verify you are human|our systems have detected/i;

const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'sh-')), {
  channel: 'chromium', headless: true, viewport: { width: 1280, height: 1400 }, locale: 'en-US', timezoneId: 'America/New_York',
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 20000 });
await sleep(2500);
for (const pg of ctx.pages()) if (pg.url().includes('welcome.html')) await pg.close();
const version = await sw.evaluate(() => chrome.runtime.getManifest().version);
await sw.evaluate(async () => {
  const { settings } = await chrome.storage.local.get('settings');
  await chrome.storage.local.set({ settings: Object.assign({}, settings || {}, { enabled: true, shields: [{ id: 'gta6', preset: 'gta6', mode: 'spoilers', action: 'blur', on: true }] }) });
  try { await chrome.runtime.sendMessage({ type: 'pss:syncMore' }); } catch (e) { /* 1.1 has no such message */ }
});
await sleep(800);

const out = [];
for (const s of SITES) {
  const p = await ctx.newPage();
  let r = { site: s.site, status: 'error' };
  try {
    await p.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(7000);
    await p.mouse.wheel(0, 1600); await sleep(2500);
    const txt = await p.evaluate(() => (document.body ? document.body.innerText.slice(0, 4000) : ''));
    const h = await sw.evaluate(async (u) => {
      const tabs = await chrome.tabs.query({});
      const t = tabs.find((x) => (x.url || '').startsWith(u));
      if (!t) return null;
      try { return await chrome.tabs.sendMessage(t.id, { type: 'pss:pageCount' }); } catch (e) { return { noScript: true }; }
    }, new URL(p.url()).origin);
    if (!h || h.noScript) r = { site: s.site, status: 'no-script' };
    else if (h.cards === undefined) r = { site: s.site, status: 'old-version', hidden: h.count };
    else if (h.changed) r = { site: s.site, status: 'changed', cards: h.cards, items: h.items, links: h.probe, hidden: h.count };
    else if (h.cards + h.items === 0 && WALL.test(txt)) r = { site: s.site, status: 'wall', links: h.probe };
    else r = { site: s.site, status: h.cards + h.items > 0 ? 'ok' : 'empty', cards: h.cards, items: h.items, links: h.probe, hidden: h.count };
  } catch (e) { r = { site: s.site, status: 'error', error: String(e.message || e).split('\n')[0].slice(0, 120) }; }
  out.push(r);
  console.log(JSON.stringify(r));
  await p.close();
}
await ctx.close();

const today = new Date().toISOString().slice(0, 10);
const ICON = { ok: '✅', changed: '❗', wall: '🔒', empty: '·', 'no-script': '·', 'old-version': '·', error: '⚠️' };
const WORD = { ok: 'карточки находятся', changed: 'ПОХОЖЕ, ВЁРСТКА ИЗМЕНИЛАСЬ — ссылок много, карточек 0', wall: 'просит вход/капчу — не проверено', empty: 'пустая страница', 'no-script': 'скрипт не запустился', 'old-version': 'опубликована старая версия без самотеста', error: 'ошибка загрузки' };
const md = [`### Проверка сайтов ${today} (Shield ${version})`, '', ...out.map((r) => `- ${ICON[r.status] || '·'} **${r.site}**: ${WORD[r.status] || r.status}` + (r.cards !== undefined ? ` (карточек ${r.cards}, по ссылкам ${r.items}, ссылок ${r.links}, скрыто ${r.hidden})` : '') + (r.error ? ` — ${r.error}` : ''))].join('\n');
fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'out', 'site-health.json'), JSON.stringify({ date: today, version, sites: out }, null, 1));
fs.writeFileSync(path.join(ROOT, 'out', 'site-health.md'), md + '\n');
fs.writeFileSync(path.join(ROOT, 'out', 'site-health-broken.txt'), out.some((r) => r.status === 'changed') ? '1' : '0');
console.log(md);
