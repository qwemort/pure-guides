// Сторож вёрстки (Антон 22.11.2026): раз в день открывает YouTube и Reddit с НАСТОЯЩИМ расширением (щит GTA VI,
// режим «скрывать всё») и проверяет, что карточки про GTA действительно размываются:
//   yt-search   — выдача поиска «gta 6»;   yt-watch — рекомендации справа на странице ролика;
//   yt-endscreen — сетка роликов в конце досмотренного ролика (баг из отзыва 22.11);   reddit-search — поиск Reddit.
// Состояние каждой проверки: ok / broken / unknown (сайт не пустил робота, капча — НЕ поломка расширения).
// Пишет Антону только когда проверка СМЕНИЛА состояние (сломалась или починилась). Память — data/dom-canary.json.
// Скрипт сам по себе не падает: любые сбои сайтов → unknown.   node tools/dom-canary.mjs --ext <распакованное расширение>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const A = process.argv.slice(2);
const EXT = path.resolve(A[A.indexOf('--ext') + 1] || 'ext/shield/release/chrome');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STATE = path.join(ROOT, 'data', 'dom-canary.json');
fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true });
const OUT = path.join(ROOT, 'out', 'dom-canary.txt');
fs.writeFileSync(OUT, '');
const GTA = /\bgta ?(6|vi)\b|grand theft auto/i;
const BLOCK = /before you continue|unusual traffic|captcha|are you a robot|sign in to confirm|blocked by network security|whoa there, pardner/i;
const res = {};   // check → {status, note}

let ctx;
try {
  ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'dc-')), {
    channel: 'chromium', headless: true, viewport: { width: 1366, height: 900 }, locale: 'en-US', timezoneId: 'America/New_York',
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--autoplay-policy=no-user-gesture-required'],
  });
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 20000 });
  await sleep(1500);
  for (const pg of ctx.pages()) if (pg.url().includes('welcome.html')) await pg.close();
  await sw.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: Object.assign({}, settings || {}, { enabled: true, shields: [{ id: 'gta6', preset: 'gta6', mode: 'everything', action: 'blur', on: true }] }) });
  });
} catch (e) {
  console.log(`::warning::браузер с расширением не запустился: ${e.message}`);
  process.exit(0);
}
const p = ctx.pages()[0] || await ctx.newPage();
const blocked = async () => BLOCK.test(await p.evaluate(() => (document.body ? document.body.innerText.slice(0, 4000) : '')).catch(() => '')) || /consent\./.test(p.url());

// Доля карточек про GTA, которые размыты. items: [{title, veiled}]
const verdict = (items, min = 3) => {
  const g = items.filter((x) => GTA.test(x.title));
  if (g.length < min) return { status: 'unknown', note: `карточек про GTA мало (${g.length} из ${items.length})` };
  const v = g.filter((x) => x.veiled).length;
  return { status: v / g.length >= 0.5 ? 'ok' : 'broken', note: `размыто ${v} из ${g.length} карточек про GTA` };
};
const collectYT = (scope) => p.evaluate((scope) => {
  const root = scope ? document.querySelector(scope) : document;
  if (!root) return [];
  const out = [], seen = new Set();
  for (const a of root.querySelectorAll('a[href*="/watch?v="], a[href*="/shorts/"]')) {
    const m = /(?:v=|shorts\/)([\w-]{6,})/.exec(a.getAttribute('href') || ''); if (!m || seen.has(m[1])) continue;
    const card = a.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, yt-lockup-view-model, ytd-reel-item-renderer, ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2') || a;
    const title = (card.querySelector('#video-title, h3, [title]')?.textContent || a.getAttribute('title') || a.textContent || '').trim().replace(/\s+/g, ' ');
    if (!title) continue;
    seen.add(m[1]);
    out.push({ title: title.slice(0, 120), veiled: !!(a.closest('.pss-veil') || card.closest('.pss-veil') || card.querySelector('.pss-veil')) });
  }
  return out;
}, scope);

async function step(name, fn) {
  try { res[name] = await fn(); } catch (e) { res[name] = { status: 'unknown', note: `ошибка проверки: ${String(e.message).split('\n')[0].slice(0, 120)}` }; }
  console.log(`${name}: ${res[name].status} — ${res[name].note}`);
}

let watchUrl = '';
await step('yt-search', async () => {
  await p.goto('https://www.youtube.com/results?search_query=gta+6', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(7000);
  if (await blocked()) return { status: 'unknown', note: 'YouTube не пустил робота' };
  for (let i = 0; i < 3; i++) { await p.mouse.wheel(0, 2000); await sleep(1500); }
  await p.evaluate(() => window.scrollTo(0, 0)); await sleep(4000);
  watchUrl = await p.evaluate(() => { const a = [...document.querySelectorAll('ytd-video-renderer a#thumbnail[href*="/watch?v="]')].find((x) => /gta|grand theft/i.test(x.closest('ytd-video-renderer')?.textContent || '')); return a ? new URL(a.getAttribute('href'), location.href).href : ''; });
  return verdict(await collectYT('ytd-search, #contents'));
});

await step('yt-watch', async () => {
  if (!watchUrl) return { status: 'unknown', note: 'не нашёлся ролик про GTA для открытия' };
  await p.goto(watchUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(9000);
  if (await blocked()) return { status: 'unknown', note: 'YouTube не пустил робота' };
  return verdict(await collectYT('#secondary, #related'));
});

await step('yt-endscreen', async () => {
  if (!watchUrl) return { status: 'unknown', note: 'нет ролика' };
  // реклама перед роликом: ждём до 40 с, пока она кончится
  for (let i = 0; i < 20; i++) { if (!(await p.evaluate(() => !!document.querySelector('.ad-showing')))) break; await sleep(2000); }
  const ok = await p.evaluate(async () => {
    const v = document.querySelector('video'); if (!v || !isFinite(v.duration) || v.duration < 20) return false;
    v.muted = true; v.currentTime = v.duration - 1.5; await v.play().catch(() => {}); return true;
  });
  if (!ok) return { status: 'unknown', note: 'плеер не дал перемотать (реклама или прямой эфир)' };
  await sleep(4500);
  const tiles = await p.evaluate(() => [...document.querySelectorAll('.html5-video-player a[href*="/watch?v="]')]
    .filter((a) => { const r = a.getBoundingClientRect(); return r.width > 40 && r.height > 30; })
    .map((a) => ({ title: (a.querySelector('[class*="title"]')?.textContent || a.getAttribute('aria-label') || a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120), veiled: !!(a.closest('.pss-veil') || a.querySelector('.pss-veil')) })));
  if (!tiles.length) return { status: 'unknown', note: 'сетка в конце ролика не появилась (могло включиться следующее видео)' };
  return verdict(tiles, 1);
});

await step('reddit-search', async () => {
  await p.goto('https://www.reddit.com/search/?q=gta+6', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(8000);
  if (await blocked()) return { status: 'unknown', note: 'Reddit не пускает роботов с GitHub' };
  const items = await p.evaluate(() => [...document.querySelectorAll('a[href*="/comments/"]')].map((a) => {
    const card = a.closest('shreddit-post, faceplate-tracker, search-telemetry-tracker, article, li') || a;
    return { title: (a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120), veiled: !!(a.closest('.pss-veil') || card.closest('.pss-veil') || card.querySelector('.pss-veil')) };
  }).filter((x) => x.title.length > 8));
  return verdict(items);
});
await ctx.close().catch(() => {});

// --- что изменилось с прошлого раза ---
const NAMES = { 'yt-search': 'YouTube: поиск', 'yt-watch': 'YouTube: рекомендации у ролика', 'yt-endscreen': 'YouTube: сетка в конце ролика', 'reddit-search': 'Reddit: поиск' };
const prev = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {};
const today = new Date().toISOString().slice(0, 10);
const next = { ...prev };
const broke = [], fixed = [];
for (const [k, r] of Object.entries(res)) {
  if (r.status === 'unknown') continue;               // не знаем — прошлое состояние не трогаем
  const was = prev[k]?.status;
  if (r.status === 'broken' && was !== 'broken') broke.push(`• ${NAMES[k]}: ${r.note}`);
  if (r.status === 'ok' && was === 'broken') fixed.push(`• ${NAMES[k]}`);
  next[k] = { status: r.status, since: r.status === was ? prev[k].since : today, note: r.note };
}
fs.writeFileSync(STATE, JSON.stringify(next, null, 1) + '\n');
let txt = '';
if (broke.length) txt += `🧩 Расширение перестало скрывать спойлеры (проверка робота):\n${broke.join('\n')}\nНапиши Claude «глянь сторож вёрстки».`;
if (fixed.length) txt += `${txt ? '\n\n' : ''}✅ Снова скрывает:\n${fixed.join('\n')}`;
fs.writeFileSync(OUT, txt);
console.log(txt || 'изменений нет');
