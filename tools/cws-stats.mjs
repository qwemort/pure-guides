// Статистика Chrome Web Store и Search Console БЕЗ ручных выгрузок (Антон 22.11.2026).
// Официальный Chrome Web Store API v2 (queryMetrics, fetchReviews, fetchStatus) + Search Console API, служебный аккаунт,
// права только на чтение. Каждый день:
//   • новые отзывы, предупреждение/снятие из магазина → сразу Антону в Telegram;
// по понедельникам (или --week):
//   • сводка за 7 дней: пользователи в неделю, установки, удаления по дням, недельный отток; Search Console: клики, показы, топ запросов.
// В публичный репозиторий пишется только то, что и так видно на странице магазина (data/cws-public.json: пользователи, оценки);
// удаления, показы и т. п. — только в Telegram.
// Без ключа (секрет GOOGLE_SA_JSON) или ID издателя (CWS_PUBLISHER_ID) тихо выходит.   node tools/cws-stats.mjs [--week]
import fs from 'node:fs';
import path from 'node:path';
import { googleToken, gget, gpost } from './google-api.mjs';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const WEEK = process.argv.includes('--week') || new Date().getUTCDay() === 1;
fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true });
const OUT = path.join(ROOT, 'out', 'cws-stats.txt');
fs.writeFileSync(OUT, '');
const PUB = process.env.CWS_PUBLISHER_ID;
const GSC_SITE = process.env.GSC_SITE || 'https://qwemort.github.io/pure-guides/';
if (!process.env.GOOGLE_SA_JSON || !PUB) { console.log('нет ключа Google или ID издателя — пропуск (см. инструкцию в чате)'); process.exit(0); }

const STATE = path.join(ROOT, 'data', 'cws-public.json');
const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : { seenReviews: [], items: {} };
const seen = new Set(state.seenReviews || []);
const items = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'store-ids.json'), 'utf8')).targets.filter((t) => t.store === 'chrome' && !t.competitor);
const API = 'https://chromewebstore.googleapis.com/v2';
const day = (d) => ({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });
const ds = (o) => `${String(o.day).padStart(2, '0')}.${String(o.month).padStart(2, '0')}`;

let token;
try { token = await googleToken(['https://www.googleapis.com/auth/chromewebstore.readonly', 'https://www.googleapis.com/auth/webmasters.readonly']); }
catch (e) { fs.writeFileSync(OUT, `⚠️ Статистика магазина: Google не пустил служебный аккаунт (${e.message.slice(0, 150)}). Напиши Claude «глянь статистику магазина».`); console.log(e.message); process.exit(0); }

const alerts = [], week = [];
for (const it of items) {
  const name = `publishers/${PUB}/items/${it.id}`;
  // статус: предупреждение или снятие
  try {
    const s = await gget(`${API}/${name}:fetchStatus`, token);
    const flags = JSON.stringify(s);
    if (/"warned"\s*:\s*true|"takenDown"\s*:\s*true/i.test(flags)) alerts.push(`🚨 ${it.name}: магазин пометил расширение (${/takenDown"\s*:\s*true/i.test(flags) ? 'СНЯТО' : 'предупреждение'}). Срочно глянь почту и кабинет.`);
  } catch (e) { console.log(`${it.name} статус: ${e.message}`); }
  // новые отзывы
  try {
    const r = await gget(`${API}/${name}:fetchReviews?pageSize=50&orderBy=${encodeURIComponent('createTime desc')}`, token);
    const fresh = (r.reviews || []).filter((x) => !seen.has(x.name));
    for (const x of fresh) seen.add(x.name);
    if (fresh.length && (state.seenReviews || []).length) {
      for (const x of fresh.slice(0, 5)) alerts.push(`⭐ ${it.name}: новый отзыв ${x.rating ?? x.starRating ?? '?'}★${x.text || x.comment ? ` «${String(x.text || x.comment).replace(/\s+/g, ' ').slice(0, 220)}»` : ''}`);
    }
  } catch (e) { console.log(`${it.name} отзывы: ${e.message}`); }
  // метрики за 14 дней
  try {
    const to = new Date(Date.now() - 864e5), from = new Date(Date.now() - 15 * 864e5);
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(day(from))) q.append(`timeSpec.firstDate.${k}`, v);
    for (const [k, v] of Object.entries(day(to))) q.append(`timeSpec.lastDate.${k}`, v);
    for (const m of ['users-7d', 'installs', 'uninstalls', 'impressions', 'page-views']) q.append('metrics', m);
    q.append('pageSize', '100');
    const r = await gget(`${API}/${name}:queryMetrics?${q}`, token);
    const rows = (r.metricRows || []).map((row) => ({ date: row.date, v: Object.fromEntries((row.metricValues || []).map((m) => [m.metric, Number(m.value || 0)])) }))
      .sort((a, b) => (a.date.year - b.date.year) || (a.date.month - b.date.month) || (a.date.day - b.date.day));
    if (!rows.length) continue;
    const last = rows[rows.length - 1], wk = rows.slice(-7);
    const sum = (k) => wk.reduce((a, x) => a + (x.v[k] || 0), 0);
    const u = last.v['users-7d'] || 0;
    state.items[it.name] = { date: ds(last.date), users_7d: u };
    const inst = sum('installs'), un = sum('uninstalls');
    const prevU = rows.length > 7 ? rows[rows.length - 8].v['users-7d'] || 0 : 0;
    const churn = prevU ? Math.max(0, Math.round(((prevU + inst - u) / prevU) * 100)) : null;
    week.push(`${it.name} (по ${ds(last.date)}): в неделю ${u}${prevU ? ` (было ${prevU})` : ''}; за 7 дней +${inst} установок, −${un} удалений; показы ${sum('impressions')}, открыли карточку ${sum('page-views')}${churn !== null ? `; недельный отток ≈${churn}%` : ''}\n  по дням: ${wk.map((x) => `${ds(x.date)} +${x.v.installs || 0}/−${x.v.uninstalls || 0}`).join(', ')}`);
  } catch (e) { console.log(`${it.name} метрики: ${e.message}`); week.push(`${it.name}: метрики не получены (${e.message.slice(0, 100)})`); }
}

let gsc = '';
if (WEEK) try {
  const end = new Date(Date.now() - 3 * 864e5), start = new Date(Date.now() - 9 * 864e5);
  const iso = (d) => d.toISOString().slice(0, 10);
  const base = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GSC_SITE)}/searchAnalytics/query`;
  const tot = await gpost(base, token, { startDate: iso(start), endDate: iso(end), dimensions: [] });
  const top = await gpost(base, token, { startDate: iso(start), endDate: iso(end), dimensions: ['query'], rowLimit: 8 });
  const t = tot.rows?.[0] || {};
  gsc = `🔎 Search Console ${iso(start).slice(8)}.${iso(start).slice(5, 7)}–${iso(end).slice(8)}.${iso(end).slice(5, 7)}: ${t.clicks || 0} кликов, ${t.impressions || 0} показов, позиция ${t.position ? t.position.toFixed(1) : '—'}\n` +
    (top.rows || []).map((r) => `  «${r.keys[0]}» ${r.clicks}/${r.impressions}`).join('\n');
} catch (e) { gsc = `🔎 Search Console: не получилось (${e.message.slice(0, 120)}). Проверь, что служебный аккаунт добавлен пользователем в Search Console.`; }

state.seenReviews = [...seen].slice(-2000);
fs.writeFileSync(STATE, JSON.stringify(state, null, 1) + '\n');
let txt = alerts.join('\n');
if (WEEK && week.length) txt += `${txt ? '\n\n' : ''}📊 Chrome за неделю:\n${week.join('\n')}${gsc ? `\n\n${gsc}` : ''}`;
fs.writeFileSync(OUT, txt);
console.log(txt ? 'есть что отправить' : 'тихо');   // цифры в публичный лог не печатаем
