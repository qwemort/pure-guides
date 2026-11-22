// Радар боли (Антон 22.11.2026). Раз в день, ТОЛЬКО ЧТЕНИЕ, никому ничего не пишет и не отвечает:
//   • Bluesky — свежие посты, где люди просят защиту от спойлеров / жалуются, что им заспойлерили;
//   • Hacker News — обсуждения блокировки спойлеров;
//   • Firefox AMO — новые отзывы на НАШЕ расширение и на расширения-конкуренты (1–3★ = их слабые места).
// Новое (не виденное раньше) → одна утренняя сводка Антону в Telegram (out/pain-radar.txt). Отвечает он сам, руками.
// Память о виденном — data/pain-radar.json. Любой недоступный источник просто пропускается.
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const STATE = path.join(ROOT, 'data', 'pain-radar.json');
fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true });
const OUT = path.join(ROOT, 'out', 'pain-radar.txt');
fs.writeFileSync(OUT, '');
const UA = { 'user-agent': 'pure-guides pain-radar (github.com/qwemort/pure-guides)' };
const now = Date.now();
const DAY = 864e5;
const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : { seen: [] };
const seen = new Set(state.seen);
const fresh = (id) => !seen.has(id);
const json = async (u, opt = {}) => { try { const r = await fetch(u, { ...opt, headers: { ...UA, ...(opt.headers || {}) }, signal: AbortSignal.timeout(20000) }); return r.ok ? r.json() : null; } catch { return null; } };
const unent = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&#x2F;/g, '/').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
const clip = (s, n = 160) => unent(s).replace(/\s+/g, ' ').trim().slice(0, n);

// названия наших тайтлов — посты про них поднимаем выше
const TITLES = fs.readdirSync(path.join(ROOT, 'data', 'titles')).filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'titles', f), 'utf8')).names?.en).filter((x) => x && x.length >= 4);
const ours = (t) => TITLES.find((n) => t.toLowerCase().includes(n.toLowerCase())) || '';

// --- Bluesky ---
const bsky = [];
const { BSKY_HANDLE: H, BSKY_APP_PASSWORD: PW } = process.env;
let jwt = '';
if (H && PW) {
  const s = await json('https://bsky.social/xrpc/com.atproto.server.createSession', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: H, password: PW }) });
  jwt = s?.accessJwt || '';
}
const BQ = ['"avoid spoilers"', '"spoiler blocker"', '"mute words" spoilers', '"got spoiled"', '"spoiled it for me"', '"no spoilers please"', '"spoiler free" youtube', 'спойлеры замьютить', 'проспойлерили', 'zespoilerowali'];
for (const q of BQ) {
  const base = jwt ? 'https://bsky.social/xrpc' : 'https://public.api.bsky.app/xrpc';
  const j = await json(`${base}/app.bsky.feed.searchPosts?q=${encodeURIComponent(q)}&sort=latest&limit=25&since=${new Date(now - DAY).toISOString()}`, jwt ? { headers: { authorization: `Bearer ${jwt}` } } : {});
  for (const p of j?.posts || []) {
    const id = 'bsky:' + p.uri;
    const text = p.record?.text || '';
    if (!fresh(id) || !/spoil|спойл|spojl/i.test(text) || /https?:\/\/\S*(pure-guides|mutespoilers)/.test(text) || p.author?.handle === H) continue;
    const rkey = p.uri.split('/').pop();
    bsky.push({ id, text: clip(text), title: ours(text), url: `https://bsky.app/profile/${p.author.handle}/post/${rkey}`, likes: p.likeCount || 0 });
  }
  await new Promise((r) => setTimeout(r, 600));
}
bsky.sort((a, b) => (b.title ? 1 : 0) - (a.title ? 1 : 0) || b.likes - a.likes);

// --- Hacker News ---
const hn = [];
for (const q of ['spoiler blocker', 'avoid spoilers', 'spoilers extension', 'spoiler free']) {
  const j = await json(`https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(q)}&numericFilters=created_at_i>${Math.floor((now - 2 * DAY) / 1000)}`);
  for (const h of j?.hits || []) {
    const id = 'hn:' + h.objectID;
    if (!fresh(id)) continue;
    const text = h.title || h.comment_text || h.story_title || '';
    if (!/(avoid|block|hide|mute|filter|free of|without)\W+(\w+\W+){0,3}spoil|spoil\w*\W+(\w+\W+){0,2}(blocker|filter|extension|free)/i.test(unent(text))) continue;
    if (hn.some((x) => x.id === id)) continue;
    hn.push({ id, text: clip(text.replace(/<[^>]+>/g, ' ')), url: `https://news.ycombinator.com/item?id=${h.objectID}` });
  }
}

// --- Firefox AMO: наши и конкуренты ---
const AMO = { 'pure-spoiler-shield': 'НАШ Pure Spoiler Blocker', 'spoiler-protection-2-0': 'SpoilerProtection 2.0' };
const amo = [];
for (const [slug, name] of Object.entries(AMO)) {
  const j = await json(`https://addons.mozilla.org/api/v5/ratings/rating/?addon=${slug}&page_size=25&sort=created`);
  for (const r of j?.results || []) {
    const id = 'amo:' + r.id;
    if (!fresh(id) || now - Date.parse(r.created) > 30 * DAY) continue;
    amo.push({ id, name, ours: name.startsWith('НАШ'), score: r.score, text: clip(r.body, 200), url: `https://addons.mozilla.org/firefox/addon/${slug}/reviews/` });
  }
}

// --- сводка ---
const parts = [];
if (amo.some((x) => x.ours)) parts.push('⭐ Новый отзыв на НАШЕ расширение (Firefox):\n' + amo.filter((x) => x.ours).map((x) => `${x.score}★ «${x.text}»\n${x.url}`).join('\n'));
if (bsky.length) parts.push(`🦋 Bluesky — люди про спойлеры (${bsky.length}, показаны ${Math.min(6, bsky.length)}):\n` + bsky.slice(0, 6).map((x) => `${x.title ? `[${x.title}] ` : ''}«${x.text}»\n${x.url}`).join('\n'));
if (hn.length) parts.push('🟧 Hacker News:\n' + hn.slice(0, 4).map((x) => `«${x.text}»\n${x.url}`).join('\n'));
const theirs = amo.filter((x) => !x.ours && x.score <= 3);
if (theirs.length) parts.push('🔎 Жалобы на конкурентов (Firefox):\n' + theirs.slice(0, 4).map((x) => `${x.name} ${x.score}★ «${x.text}»`).join('\n'));
const txt = parts.length ? `☕ Радар боли за сутки. Только почитать; отвечай сам, если хочется помочь человеку (без ссылок в каждом ответе).\n\n${parts.join('\n\n')}` : '';

for (const x of [...bsky, ...hn, ...amo]) seen.add(x.id);
fs.writeFileSync(STATE, JSON.stringify({ seen: [...seen].slice(-3000) }) + '\n');
fs.writeFileSync(OUT, txt);
console.log(`bluesky ${bsky.length} (вход: ${jwt ? 'да' : 'нет'}), hn ${hn.length}, amo ${amo.length}`);
console.log(txt || 'нового нет');
