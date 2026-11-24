// Страховка расписания (Антон 23.11.2026): GitHub по правилам может задерживать и ПРОПУСКАТЬ запуски по cron
// (23.11 пропал почти весь день). Каждые ~2 часа: для каждой задачи из JOBS находим последний момент, когда она
// должна была запуститься по своему cron; если с тех пор не было ни одного запуска (любого) и прошло больше 75 минут —
// запускаем её вручную (workflow_dispatch) с теми же настройками, что у запуска по расписанию.
// Задачи, которые ПУБЛИКУЮТ от имени Антона (посты), добираются только если data/catch-up.json → allow_posts: true.
// Порядок: если пропущен release-posts, сначала он, а публикатор и leak-watch — в следующий проход.
//   node tools/catch-up.mjs [--dry]
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const REPO = process.env.GITHUB_REPOSITORY || 'qwemort/pure-guides';
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const DRY = process.argv.includes('--dry');
const CFG = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'catch-up.json'), 'utf8')); } catch { return {}; } })();

// file → настройки ручного запуска, повторяющие запуск по расписанию; post: true — публикует от имени Антона
const JOBS = {
  'release-posts.yml': { inputs: { dry: 'false', week: 'false' }, crons: ['47 2 * * *'] },   // только ежедневный пост (не сводку пн)
  'scheduled-post.yml': { post: true, after: ['release-posts.yml'] },
  'leak-watch.yml': { post: true, inputs: { dry: 'false' }, after: ['release-posts.yml'] },
  'cws-stats.yml': { inputs: { week: 'false' } },          // сводку по понедельникам скрипт включает сам
  'dom-canary.yml': {}, 'pain-radar.yml': {}, 'store-rank.yml': {}, 'store-stats.yml': {}, 'threads-stats.yml': {}, 'watchdog.yml': {},
  'anime-radar.yml': {}, 'mutelists.yml': {}, 'news.yml': {}, 'spoiler-danger.yml': {}, 'title-dates.yml': {}, 'weekly-report.yml': {},
  'fp-fuzzer.yml': {}, 'privacy-proof.yml': {},
};
const api = async (p, opt = {}) => {
  const r = await fetch(`https://api.github.com/repos/${REPO}/${p}`, { ...opt, headers: { authorization: `Bearer ${TOKEN}`, accept: 'application/vnd.github+json', 'content-type': 'application/json' } });
  if (r.status === 204) return {};
  if (!r.ok) throw new Error(`${p}: HTTP ${r.status} ${(await r.text()).slice(0, 120)}`);
  return r.json();
};
const field = (f, v, max) => f === '*' || f.split(',').some((part) => {
  const [rng, step] = part.split('/'); const st = +(step || 1);
  const [a, b] = rng === '*' ? [0, max] : rng.includes('-') ? rng.split('-').map(Number) : [+rng, step ? max : +rng];
  return v >= a && v <= b && (v - a) % st === 0;
});
function lastScheduled(cron, now) {                         // последний момент ≤ now, подходящий под «m h dom mon dow» (UTC)
  const [m, h, , , dow] = cron.split(/\s+/);
  const t = new Date(now); t.setUTCSeconds(0, 0);
  for (let i = 0; i < 24 * 9; i++) {
    const c = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), t.getUTCHours() - i, +m));
    if (c > now) continue;
    if (field(h, c.getUTCHours(), 23) && field(dow, c.getUTCDay(), 6)) return c;
  }
  return null;
}
const now = new Date();
const missed = [];
for (const [file, job] of Object.entries(JOBS)) {
  let crons = job.crons;
  if (!crons) {
    try { crons = [...fs.readFileSync(path.join(ROOT, '.github', 'workflows', file), 'utf8').matchAll(/cron:\s*'([^']+)'/g)].map((x) => x[1]); } catch { continue; }
  }
  const last = crons.map((c) => lastScheduled(c, now)).filter(Boolean).sort((a, b) => b - a)[0];
  if (!last || now - last < 75 * 60e3) continue;            // ещё не время беспокоиться
  const since = new Date(last - 10 * 60e3).toISOString();
  const runs = (await api(`actions/workflows/${file}/runs?per_page=5&created=>=${since}`)).workflow_runs || [];
  if (runs.length) continue;                                 // был запуск (по расписанию, вручную, идёт сейчас)
  missed.push({ file, job, last });
}
const missedFiles = new Set(missed.map((x) => x.file));
const done = [], held = [];
for (const { file, job, last } of missed) {
  const tag = `${file.replace('.yml', '')} (должна была ${last.toISOString().slice(5, 16).replace('T', ' ')} UTC)`;
  if (job.post && !CFG.allow_posts) { held.push(tag + ' — публикует, жду разрешения Антона'); continue; }
  if ((job.after || []).some((d) => missedFiles.has(d))) { held.push(tag + ' — после ' + job.after.join(', ')); continue; }
  if (DRY) { done.push(tag + ' [проба]'); continue; }
  if (done.length) await new Promise((r) => setTimeout(r, 45000));   // по одной с паузой: иначе задачи толкаются при сохранении в репозиторий
  try { await api(`actions/workflows/${file}/dispatches`, { method: 'POST', body: JSON.stringify({ ref: 'main', inputs: job.inputs || {} }) }); done.push(tag); }
  catch (e) { held.push(`${tag} — не запустилась: ${e.message}`); }
}
console.log(done.length ? `догнал: ${done.join('; ')}` : 'всё по расписанию, догонять нечего');
if (held.length) console.log(`отложено: ${held.join('; ')}`);
fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'out', 'catch-up.txt'), held.some((h) => h.includes('жду разрешения')) ? `⏰ GitHub пропустил запуск по расписанию: ${held.filter((h) => h.includes('жду разрешения')).join('; ')}. Напиши Claude «добери посты», если надо опубликовать.` : '');
