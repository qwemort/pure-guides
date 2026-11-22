// Публичное доказательство «расширение ничего не отправляет» (Антон 22.11.2026, исследование №9).
// Раз в неделю: настоящее расширение (сборка из открытого репозитория qwemort/pure-spoiler-shield) в Chromium,
// прослушка ВСЕХ сетевых запросов, которые начинает расширение: из фонового скрипта (service worker),
// из скриптов на страницах (по стеку вызова chrome-extension://…) и из его собственных окон (popup, welcome).
// Сначала самопроверка: расширение делает один тестовый запрос — ловушка обязана его увидеть, иначе отчёт недействителен.
// Итог → privacy-proof/README.md (публично на GitHub) и data/privacy-proof.json. Тревога Антону — только если запросов > 0
// или самопроверка не прошла.   node tools/privacy-proof.mjs --ext <распакованное расширение>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const A = process.argv.slice(2);
const EXT = path.resolve(A[A.indexOf('--ext') + 1] || 'ext/shield/release/chrome');
const SRC_SHA = process.env.SHIELD_SHA || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true });
const OUT = path.join(ROOT, 'out', 'privacy-proof.txt');
fs.writeFileSync(OUT, '');
const PROBE = 'https://example.com/pure-privacy-probe';
const hits = [];   // {from, url}
const isExt = (u) => /^chrome-extension:\/\//.test(u || '');

let ctx, sw, extId, version;
try {
  ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'pp-')), {
    channel: 'chromium', headless: true, viewport: { width: 1366, height: 900 }, locale: 'en-US',
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 20000 });
  extId = new URL(sw.url()).host;
  version = await sw.evaluate(() => chrome.runtime.getManifest().version);
} catch (e) { console.log(`::warning::браузер с расширением не запустился: ${e.message}`); process.exit(0); }

// 1) фоновый скрипт: всё, что уходит из service worker расширения
ctx.on('request', (r) => { try { const w = r.serviceWorker(); if (w && isExt(w.url()) && !isExt(r.url())) hits.push({ from: 'background', url: r.url() }); } catch {} });   // только СВОЙ фон расширения, не service worker самих сайтов

// 2) страницы: CDP видит стек вызова — запрос, начатый кодом chrome-extension://, это запрос расширения
async function watch(page, label) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  cdp.on('Network.requestWillBeSent', (e) => {
    if (isExt(e.request.url) || e.request.url.startsWith('data:')) return;
    const fr = [...(e.initiator?.stack?.callFrames || []), ...(e.initiator?.stack?.parent?.callFrames || [])];
    const own = isExt(e.initiator?.url) || fr.some((f) => isExt(f.url)) || isExt(e.documentURL);
    if (own) hits.push({ from: label, url: e.request.url });
  });
}

// самопроверка ловушки: тестовый запрос из фона расширения
await sw.evaluate((u) => fetch(u, { mode: 'no-cors' }).catch(() => {}), PROBE);
await sleep(3000);
const probeSeen = hits.some((h) => h.url.startsWith(PROBE));
for (let i = hits.length - 1; i >= 0; i--) if (hits[i].url.startsWith(PROBE)) hits.splice(i, 1);

await sw.evaluate(async () => {
  const { settings } = await chrome.storage.local.get('settings');
  await chrome.storage.local.set({ settings: Object.assign({}, settings || {}, { enabled: true, shields: [{ id: 'gta6', preset: 'gta6', mode: 'everything', action: 'blur', on: true }] }) });
});
const visited = [];
const PAGES = [
  ['YouTube', 'https://www.youtube.com/results?search_query=gta+6'],
  ['YouTube (главная)', 'https://www.youtube.com/'],
  ['Reddit', 'https://www.reddit.com/r/GTA6/'],
  ['X', 'https://x.com/search?q=gta%206'],
  ['окно расширения', `chrome-extension://${extId}/popup.html`],
  ['приветствие расширения', `chrome-extension://${extId}/welcome.html`],
];
for (const [label, url] of PAGES) {
  const p = await ctx.newPage();
  try {
    await watch(p, label);
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(6000);
    for (let i = 0; i < 3; i++) { await p.mouse.wheel(0, 1800); await sleep(1200); }
    await sleep(3000);
    visited.push(label);
  } catch (e) { console.log(`${label}: не открылось (${String(e.message).split('\n')[0].slice(0, 80)})`); }
  await p.close().catch(() => {});
}
await ctx.close().catch(() => {});

const today = new Date().toISOString().slice(0, 10);
const uniq = [...new Map(hits.map((h) => [h.from + h.url, h])).values()];
const ok = probeSeen && uniq.length === 0;
const rec = { date: today, version, source_commit: SRC_SHA, probe_detected: probeSeen, pages: visited, extension_requests: uniq.length, requests: uniq.slice(0, 50) };
fs.writeFileSync(path.join(ROOT, 'data', 'privacy-proof.json'), JSON.stringify(rec, null, 1) + '\n');
fs.mkdirSync(path.join(ROOT, 'privacy-proof'), { recursive: true });
const run = process.env.GITHUB_RUN_ID ? `https://github.com/qwemort/pure-guides/actions/runs/${process.env.GITHUB_RUN_ID}` : '';
fs.writeFileSync(path.join(ROOT, 'privacy-proof', 'README.md'),
`# Pure Spoiler Blocker: network check

**${ok ? '✅ 0 network requests made by the extension' : probeSeen ? `❌ ${uniq.length} request(s) made by the extension` : '⚠️ check invalid: the detector did not see its own test request'}**

Last run: ${today}. Extension version: ${version}.${SRC_SHA ? ` Built from [qwemort/pure-spoiler-shield@${SRC_SHA.slice(0, 7)}](https://github.com/qwemort/pure-spoiler-shield/tree/${SRC_SHA}).` : ''}${run ? ` [Run log](${run}).` : ''}

How it works (every week, automatically, code: [tools/privacy-proof.mjs](../tools/privacy-proof.mjs)):

1. The extension is built from its public source and loaded into a real Chromium browser.
2. **Self-test:** the extension's background script sends one test request on purpose. The check is valid only if the detector sees it. Result: ${probeSeen ? 'seen ✅' : 'NOT seen ⚠️'}.
3. With a spoiler shield turned on, the browser opens: ${visited.join(', ') || 'no pages (sites were unreachable)'}.
4. Every request started by the extension is counted: from its background script, from its code running on those pages (detected by the call stack), and from its own windows.

Requests by the extension: **${uniq.length}**${uniq.length ? '\n\n' + uniq.slice(0, 20).map((h) => `- ${h.from}: ${h.url}`).join('\n') : ''}

Pages themselves (YouTube, Reddit, X) of course make their own requests; those are not the extension's and are not counted.
`);
const txt = ok ? '' : probeSeen
  ? `🚨 Проверка приватности: расширение сделало ${uniq.length} сетевых запроса(ов)! Напиши Claude «глянь проверку приватности».\n${uniq.slice(0, 5).map((h) => `${h.from}: ${h.url.slice(0, 100)}`).join('\n')}`
  : '⚠️ Проверка приватности недействительна: ловушка не увидела тестовый запрос. Напиши Claude «глянь проверку приватности».';
fs.writeFileSync(OUT, txt);
console.log(`самопроверка: ${probeSeen ? 'ок' : 'НЕТ'}; страницы: ${visited.join(', ')}; запросов расширения: ${uniq.length}`);
console.log(txt || 'итог: 0 запросов');
