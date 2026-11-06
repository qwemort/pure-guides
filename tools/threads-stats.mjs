// Статистика своих постов в Threads (официальный API, свой аккаунт): просмотры, лайки, ответы по каждому посту.
//   THREADS_TOKEN=... node tools/threads-stats.mjs
// → data/threads-stats.json (только числа и первые слова поста; история по дням),
//   out/threads-stats.md (сводка: какие посты цепляют). Если у токена нет права на статистику —
//   пишет об этом и не падает. Ничего не публикует.
import fs from 'node:fs'; import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const T = process.env.THREADS_TOKEN;
if (!T) { console.log('нет THREADS_TOKEN — пропуск'); process.exit(0); }
const G = 'https://graph.threads.net/v1.0';
const get = async (p, q = {}) => {
  const r = await fetch(`${G}/${p}?${new URLSearchParams({ ...q, access_token: T })}`); const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) { const e = new Error(`${r.status} ${JSON.stringify(j.error || j).slice(0, 240)}`); e.status = r.status; throw e; }
  return j;
};
const today = new Date().toISOString().slice(0, 10);
const file = path.join(ROOT, 'data', 'threads-stats.json');
const db = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { posts: {}, account: [] };
fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true });
const notes = [];

const me = await get('me', { fields: 'id,username' });
const list = await get(`${me.id}/threads`, { fields: 'id,text,timestamp,permalink,media_type', limit: '50' });
const METRICS = ['views', 'likes', 'replies', 'reposts', 'quotes'];
let noInsights = 0;
for (const m of list.data || []) {
  const row = { date: today };
  try {
    const ins = await get(`${m.id}/insights`, { metric: METRICS.join(',') });
    for (const x of ins.data || []) row[x.name] = x.values?.[0]?.value ?? x.total_value?.value ?? 0;
  } catch (e) { noInsights++; if (noInsights <= 2) notes.push(`пост ${m.id}: статистика недоступна (${e.message})`); continue; }
  const p = db.posts[m.id] ||= { ts: m.timestamp, url: m.permalink, text: (m.text || '').replace(/\s+/g, ' ').slice(0, 90), history: [] };
  p.history = p.history.filter((h) => h.date !== today).concat(row);
}
// аккаунт: подписчики
try {
  const u = await get(`${me.id}/threads_insights`, { metric: 'followers_count' });
  const f = u.data?.[0]?.total_value?.value ?? u.data?.[0]?.values?.[0]?.value;
  if (f != null) db.account = (db.account || []).filter((a) => a.date !== today).concat({ date: today, followers: f });
} catch (e) { notes.push(`подписчики недоступны (${e.message})`); }
db.updated = today;
fs.writeFileSync(file, JSON.stringify(db, null, 1));

const last = (p) => p.history[p.history.length - 1] || {};
const rows = Object.values(db.posts).sort((a, b) => (last(b).views || 0) - (last(a).views || 0)).slice(0, 15);
let md = `### Threads @${me.username}, ${today}\n\n`;
const acc = db.account?.[db.account.length - 1]; if (acc) md += `Подписчиков: **${acc.followers}**\n\n`;
if (rows.length) {
  md += '| Просмотры | Лайки | Ответы | Репосты | Дата | Начало поста |\n|---|---|---|---|---|---|\n';
  for (const p of rows) { const l = last(p); md += `| ${l.views ?? '—'} | ${l.likes ?? '—'} | ${l.replies ?? '—'} | ${(l.reposts ?? 0) + (l.quotes ?? 0)} | ${String(p.ts).slice(0, 10)} | [${p.text.slice(0, 60).replace(/\|/g, '/')}](${p.url}) |\n`; }
} else md += 'Статистика по постам не получена.\n';
if (notes.length) md += `\n${notes.map((n) => '- ' + n).join('\n')}\n`;
fs.writeFileSync(path.join(ROOT, 'out', 'threads-stats.md'), md);
console.log(md);
if (noInsights && noInsights === (list.data || []).length) { console.log('::warning::у токена нет права на статистику (threads_manage_insights)'); process.exit(3); }
