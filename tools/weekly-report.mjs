// Недельный отчёт одним сообщением: Threads, индекс спойлеров, позиция в поиске магазина. Читает data/*.json, ничего не публикует.
import fs from 'node:fs'; import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8')); } catch { return d; } };
const th = rd('threads-stats.json', { posts: {}, account: [] }), idx = rd('spoiler-index.json', []), rank = rd('store-rank.json', []);
const day = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const last = (p) => p.history[p.history.length - 1] || {};
let md = `## Недельный отчёт, ${day(0)}\n\n`;
// Threads
const acc = th.account || []; const a1 = acc[acc.length - 1], a0 = acc.find((a) => a.date >= day(8)) || acc[0];
md += `### Threads\n`;
if (a1) md += `Подписчиков: **${a1.followers}**${a0 && a0 !== a1 ? ` (неделю назад ${a0.followers}, ${a1.followers - a0.followers >= 0 ? '+' : ''}${a1.followers - a0.followers})` : ''}\n\n`;
const fresh = Object.values(th.posts).filter((p) => String(p.ts).slice(0, 10) >= day(7)).sort((x, y) => (last(y).views || 0) - (last(x).views || 0));
if (fresh.length) {
  md += `Посты за 7 дней (${fresh.length}), по просмотрам:\n\n| Просмотры | Лайки | Ответы | Пост |\n|---|---|---|---|\n`;
  for (const p of fresh.slice(0, 8)) { const l = last(p); md += `| ${l.views ?? '—'} | ${l.likes ?? '—'} | ${l.replies ?? '—'} | [${p.text.slice(0, 55).replace(/\|/g, '/')}](${p.url}) |\n`; }
  const avg = Math.round(fresh.reduce((s, p) => s + (last(p).views || 0), 0) / fresh.length); md += `\nВ среднем **${avg}** просмотров на пост.\n`;
} else md += 'Новых постов за неделю нет.\n';
// индекс
md += `\n### Индекс спойлеров («gta 6», первые видео)\n`;
const w = idx.filter((x) => x.date >= day(8)); if (w.length) md += w.map((x) => `${x.date.slice(5)}: ${x.main.spoilers}/${x.main.cards}`).join(' · ') + '\n'; else md += 'Замеров за неделю нет.\n';
// поиск магазина
md += `\n### Поиск Chrome Web Store\n`;
const r1 = rank[rank.length - 1]; const r0 = rank.find((x) => x.date >= day(8)) || rank[0];
if (r1) { md += `| Запрос | Сейчас | ${r0 && r0 !== r1 ? r0.date.slice(5) : 'Было'} |\n|---|---|---|\n`; for (const r of r1.results) { const p = r0?.results.find((x) => x.q === r.q); md += `| ${r.q} | ${r.rank ?? 'не в первых ' + r.total} | ${p ? (p.rank ?? '—') : '—'} |\n`; } } else md += 'Данных пока нет.\n';
md += `\n_Панель Chrome (установки, пользователи в неделю) в отчёт не попадает: у неё нет доступа по API, цифры присылает Антон скриншотом._\n`;
fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true }); fs.writeFileSync(path.join(ROOT, 'out', 'weekly-report.md'), md); console.log(md);
