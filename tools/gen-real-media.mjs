// Видео «до/после» с НАСТОЯЩЕГО YouTube и НАСТОЯЩЕГО Pure Spoiler Blocker (ничего не подделываем):
// поиск на youtube.com → 0.9 с лента без размытия, центр закрыт нашей подписью (чтобы зритель не словил спойлер с превью)
// → подпись уходит, Shield включается → настоящие спойлерные видео размываются.
//   node tools/gen-real-media.mjs --ext <распакованный Shield для Chrome> --preset gta6 --query "gta 6 ending leak" [--cap "..."] [--slug ...]
// Пишет media/<slug>.mp4 (1080×1920) и media/<slug>-after.png. Если YouTube показал роботу согласие/капчу — выход с кодом 2.
import { createRequire } from 'node:module'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { execFileSync } from 'node:child_process';
const { chromium } = createRequire(import.meta.url)('playwright');
const A = process.argv.slice(2); const opt = (k, d) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : d; };
const EXT = path.resolve(opt('--ext', '')); const preset = opt('--preset', 'gta6'); const query = opt('--query', 'gta 6 ending leak');
const cap = opt('--cap', 'POV: зайшов на ютуб у день релізу'); const slug = opt('--slug', 'real-' + preset);
if (!fs.existsSync(path.join(EXT, 'manifest.json'))) { console.error('нет --ext с manifest.json'); process.exit(1); }
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'); const OUT = path.join(ROOT, 'media'); fs.mkdirSync(OUT, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rm-'));
const W = 1080, H = 1920;
const tLaunch = Date.now(); // запись видео начинается вместе с первой вкладкой, то есть почти сразу после запуска
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'rp-')), {
  channel: 'chromium', headless: true, viewport: { width: W, height: H }, locale: 'en-US', colorScheme: 'dark',
  recordVideo: { dir: tmp, size: { width: W, height: H } },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 20000 });
await new Promise((r) => setTimeout(r, 1500));
for (const pg of ctx.pages()) if (pg.url().includes('welcome.html')) await pg.close();
const setOn = (on) => sw.evaluate(async ([on, preset]) => {
  const { settings } = await chrome.storage.local.get('settings');
  const s = Object.assign({}, settings || {}, { enabled: on, shields: [{ id: preset, preset, mode: 'spoilers', action: 'blur', on: true }] });
  await chrome.storage.local.set({ settings: s });
}, [on, preset]);
await setOn(false);

const p = ctx.pages()[0] || await ctx.newPage();
await p.goto('https://www.youtube.com/results?search_query=' + encodeURIComponent(query), { waitUntil: 'domcontentloaded', timeout: 45000 });
await p.waitForTimeout(8000);
const txt = await p.evaluate(() => document.body ? document.body.innerText.slice(0, 2000) : '');
if (/before you continue|unusual traffic|captcha|are you a robot/i.test(txt) || /consent\./.test(p.url())) { console.error('YouTube показал согласие/капчу — не удалось'); await ctx.close(); process.exit(2); }
// крупнее, как на телефоне; убрать баннеры «войдите»
await p.addStyleTag({ content: 'html{zoom:1.6} ytd-popup-container, tp-yt-iron-overlay-backdrop{display:none!important}' });
await p.waitForTimeout(1200);
// наша подпись поверх центра (это не элемент YouTube — оверлей ролика)
const overlay = (show) => p.evaluate(([show, cap]) => {
  let o = document.getElementById('__cap');
  if (!show) { if (o) o.remove(); return; }
  o = document.createElement('div'); o.id = '__cap'; o.textContent = cap;
  Object.assign(o.style, { position: 'fixed', left: '0', right: '0', top: '8.5%', bottom: '0', zIndex: 2147483647, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 40px',
    background: 'rgba(10,10,14,.9)', color: '#fff', font: '800 34px/1.2 system-ui,-apple-system,Segoe UI,Roboto,sans-serif' });
  document.documentElement.appendChild(o);
}, [show, cap]);
const brand = () => p.evaluate(() => {
  const b = document.createElement('div'); b.textContent = '🛡 Pure Spoiler Blocker · free for Chrome';
  Object.assign(b.style, { position: 'fixed', left: '0', right: '0', bottom: '0', zIndex: 2147483647, padding: '16px', textAlign: 'center', background: 'rgba(13,17,23,.94)', color: '#fff', font: '700 22px system-ui,-apple-system,Segoe UI,Roboto,sans-serif' });
  document.documentElement.appendChild(b);
});
await overlay(true); await brand();
const tStart = (Date.now() - tLaunch) / 1000 + 0.25; // с запасом: лучше потерять кадр, чем показать открытую ленту
await p.waitForTimeout(900);
await overlay(false); await setOn(true);
await p.waitForTimeout(3200);
const veiled = await p.evaluate(() => document.querySelectorAll('.pss-veil').length);
await p.screenshot({ path: path.join(OUT, `${slug}-after.png`) });
await p.waitForTimeout(500);
const vid = p.video(); await ctx.close(); const webm = await vid.path();
// обрезаем загрузку страницы: ролик начинается с подписи
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(tStart.toFixed(2)), '-i', webm, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', path.join(OUT, `${slug}.mp4`)]);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`размыто элементов: ${veiled}; media/${slug}.mp4, media/${slug}-after.png`);
if (!veiled) process.exit(3);
