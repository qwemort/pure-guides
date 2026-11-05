// Видео и картинки «до/после» с демо-ленты (выдуманные видео, настоящая логика размытия Shield).
//   node tools/gen-demo-media.mjs --title "GTA VI" --kind game [--cap "подпись сверху"] [--slug gta-vi] [--base http://localhost:8765/]
// Пишет media/<slug>.mp4 (1080×1920, ~6 с), media/<slug>-before.png и media/<slug>-after.png (1080×1350).
// Нужны playwright и ffmpeg. Настоящие страницы YouTube не подделываем — только наша демо-лента.
import { createRequire } from 'node:module'; import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process'; import os from 'node:os';
const { chromium } = createRequire(import.meta.url)('playwright');
const A = process.argv.slice(2); const opt = (k, d) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : d; };
const title = opt('--title'); if (!title) { console.error('need --title'); process.exit(1); }
const kind = opt('--kind', 'game'), cap = opt('--cap', ''), base = opt('--base', 'http://localhost:8765/');
const slug = opt('--slug', title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'media'); fs.mkdirSync(OUT, { recursive: true });
const url = `${base}demo/?rec=1&t=${encodeURIComponent(title)}&kind=${kind}` + (cap ? `&cap=${encodeURIComponent(cap)}` : '');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-'));
const b = await chromium.launch();

// 1) картинки до/после (формат поста 4:5)
const p1 = await b.newPage({ viewport: { width: 540, height: 675 }, deviceScaleFactor: 2, colorScheme: 'dark' });
await p1.goto(url); await p1.waitForTimeout(500);
await p1.screenshot({ path: path.join(OUT, `${slug}-before.png`) });
await p1.evaluate(() => window.__shield(true)); await p1.waitForTimeout(500);
await p1.screenshot({ path: path.join(OUT, `${slug}-after.png`) });
await p1.close();

// 2) вертикальное видео: выкл → вкл (размытие) → двойной клик по одной карточке не делаем, только «первый клик» (подсказка)
// видео пишется в размере окна, поэтому окно 1080×1920, а страница увеличена вдвое (как телефон 540×960)
const ctx = await b.newContext({ viewport: { width: 1080, height: 1920 }, colorScheme: 'dark', recordVideo: { dir: tmp, size: { width: 1080, height: 1920 } } });
const p = await ctx.newPage();
await p.goto(url); await p.addStyleTag({ content: 'html{zoom:2}' }); await p.waitForTimeout(1800);
await p.evaluate(() => window.__shield(true)); await p.waitForTimeout(2600);
const veil = await p.$('.v.veil'); if (veil) { await veil.click(); await p.waitForTimeout(1600); }
await p.waitForTimeout(600);
const vid = p.video(); await ctx.close(); const webm = await vid.path(); await b.close();
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-ss', '0.4', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', path.join(OUT, `${slug}.mp4`)]);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`media/${slug}.mp4, media/${slug}-before.png, media/${slug}-after.png`);
