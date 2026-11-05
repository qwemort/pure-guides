// Рендер карточки out/card.html → spoiler-danger/<slug>.png (1080×1350, формат Threads/Instagram).
import { createRequire } from 'node:module'; import fs from 'node:fs'; import path from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const post = JSON.parse(fs.readFileSync(path.join(ROOT, 'out', 'post.json'), 'utf8'));
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1350 } });
await p.goto('file://' + path.join(ROOT, 'out', 'card.html')); await p.waitForTimeout(300);
await p.screenshot({ path: path.join(ROOT, 'spoiler-danger', post.slug + '.png') }); await b.close();
console.log('card:', post.slug + '.png');
