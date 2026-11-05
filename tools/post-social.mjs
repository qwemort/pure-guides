// Публикация «Индекса спойлеров» в Telegram-канал и Bluesky. Каждая площадка работает, только если
// для неё есть секреты; нет секретов — тихо пропускаем. Пишет итог в out/social-result.txt.
//   node tools/post-social.mjs --post out/index-post.json [--tg] [--bsky]
// Без --tg / --bsky только проверяет доступы и ничего не публикует.
//   Telegram: TG_BOT_TOKEN (бот от @BotFather, добавлен админом в канал), TG_CHAT (@имя_канала)
//   Bluesky:  BSKY_HANDLE (имя.bsky.social), BSKY_APP_PASSWORD (Settings → App passwords)
import fs from 'node:fs'; import path from 'node:path';
const A = process.argv.slice(2); const pi = A.indexOf('--post'); const TG = A.includes('--tg'), BS = A.includes('--bsky');
const post = JSON.parse(fs.readFileSync(path.resolve(pi >= 0 ? A[pi + 1] : 'out/index-post.json'), 'utf8'));
const out = []; const env = process.env;
const waitImage = async (url) => { for (let i = 0; i < 20; i++) { const r = await fetch(url, { method: 'HEAD' }).catch(() => null); if (r && r.ok) return true; await new Promise((s) => setTimeout(s, 15000)); } return false; };

// ---------------------------------------------------------------- Telegram
if (env.TG_BOT_TOKEN && env.TG_CHAT) {
  try {
    const api = (m, body) => fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/${m}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) }).then((r) => r.json());
    const me = await api('getMe'); if (!me.ok) throw new Error(me.description);
    if (TG) {
      await waitImage(post.image);
      const caption = `${post.threads}\n\n${post.url}`;
      const r = await api('sendPhoto', { chat_id: env.TG_CHAT, photo: post.image, caption });
      if (!r.ok) throw new Error(r.description);
      out.push(`Telegram: опубликовано в ${env.TG_CHAT}`);
    } else out.push(`Telegram: бот @${me.result.username} рабочий, публикация выключена`);
  } catch (e) { out.push(`Telegram: ошибка — ${String(e.message || e).slice(0, 200)}`); }
} else out.push('Telegram: не подключён (нет TG_BOT_TOKEN / TG_CHAT)');

// ---------------------------------------------------------------- Bluesky
if (env.BSKY_HANDLE && env.BSKY_APP_PASSWORD) {
  try {
    const X = 'https://bsky.social/xrpc/';
    const j = async (r) => { const t = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${r.status} ${t.message || t.error || ''}`); return t; };
    const s = await j(await fetch(X + 'com.atproto.server.createSession', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: env.BSKY_HANDLE, password: env.BSKY_APP_PASSWORD }) }));
    if (BS) {
      await waitImage(post.image_en);
      const img = Buffer.from(await (await fetch(post.image_en)).arrayBuffer());
      const blob = await j(await fetch(X + 'com.atproto.repo.uploadBlob', { method: 'POST', headers: { 'content-type': 'image/png', authorization: 'Bearer ' + s.accessJwt }, body: img }));
      const text = `${post.en}\n\n${post.url}`;
      const enc = new TextEncoder(); const start = enc.encode(text.slice(0, text.lastIndexOf(post.url))).length;
      const record = {
        $type: 'app.bsky.feed.post', text, createdAt: new Date().toISOString(), langs: ['en'],
        facets: [{ index: { byteStart: start, byteEnd: start + enc.encode(post.url).length }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: post.url }] }],
        embed: { $type: 'app.bsky.embed.images', images: [{ image: blob.blob, alt: `GTA 6 spoiler index card: ${post.en.split('\n').slice(0, 3).join(' ')}`, aspectRatio: { width: 1080, height: 1350 } }] },
      };
      await j(await fetch(X + 'com.atproto.repo.createRecord', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + s.accessJwt }, body: JSON.stringify({ repo: s.did, collection: 'app.bsky.feed.post', record }) }));
      out.push(`Bluesky: опубликовано @${env.BSKY_HANDLE}`);
    } else out.push(`Bluesky: вход @${env.BSKY_HANDLE} рабочий, публикация выключена`);
  } catch (e) { out.push(`Bluesky: ошибка — ${String(e.message || e).slice(0, 200)}`); }
} else out.push('Bluesky: не подключён (нет BSKY_HANDLE / BSKY_APP_PASSWORD)');

fs.mkdirSync('out', { recursive: true });
fs.writeFileSync('out/social-result.txt', out.join('\n') + '\n');
console.log(out.join('\n'));
