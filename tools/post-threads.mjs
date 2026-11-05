// Публикация в Threads через официальный API (свой аккаунт, тестер своего приложения Meta).
//   THREADS_TOKEN=... node tools/post-threads.mjs
// Берёт out/post.json (текст + картинка). Потом продлевает токен (живёт 60 дней) и пишет новый
// в out/new-token.txt — workflow сам сохраняет его в Secrets, если задан GH_PAT.
import fs from 'node:fs'; import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const T = process.env.THREADS_TOKEN;
if (!T) { console.log('нет THREADS_TOKEN — пропуск'); process.exit(0); }
const G = 'https://graph.threads.net/v1.0';
const call = async (url, method = 'GET') => {
  const r = await fetch(url, { method }); const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`${r.status} ${JSON.stringify(j.error || j).slice(0, 300)}`);
  return j;
};
const post = JSON.parse(fs.readFileSync(path.join(ROOT, 'out', 'post.json'), 'utf8'));
const me = await call(`${G}/me?fields=id,username&access_token=${encodeURIComponent(T)}`);
if (process.argv.includes('--publish')) {
  // картинка должна уже открываться по публичной ссылке (GitHub Pages)
  for (let i = 0; i < 20; i++) { const r = await fetch(post.image, { method: 'HEAD' }); if (r.ok) break; await new Promise((s) => setTimeout(s, 15000)); }
  const q = new URLSearchParams({ media_type: 'IMAGE', image_url: post.image, text: post.threads, access_token: T });
  const c = await call(`${G}/${me.id}/threads?${q}`, 'POST');
  await new Promise((s) => setTimeout(s, 35000));
  const p = await call(`${G}/${me.id}/threads_publish?${new URLSearchParams({ creation_id: c.id, access_token: T })}`, 'POST');
  console.log(`опубликовано в Threads @${me.username}: ${p.id}`);
  fs.writeFileSync(path.join(ROOT, 'out', 'threads-result.txt'), `опубликовано @${me.username}, id ${p.id}`);
} else {
  console.log(`токен рабочий, аккаунт @${me.username}`);
  fs.writeFileSync(path.join(ROOT, 'out', 'threads-result.txt'), `токен рабочий (@${me.username}), автопостинг выключен — это черновик`);
}
const rf = await call(`https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${encodeURIComponent(T)}`);
const daysLeft = Math.round((rf.expires_in || 0) / 86400);
console.log(`токен продлён, дней: ${daysLeft}`);
if (rf.access_token && rf.access_token !== T) fs.writeFileSync(path.join(ROOT, 'out', 'new-token.txt'), rf.access_token);
// проверено: 2026-11-05
