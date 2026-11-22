// Сторож автоматики: раз в день смотрит все workflow этого репозитория.
// Задача упала 2 запуска подряд → ОДНО сообщение Антону в Telegram (с причиной из лога).
// Задача снова прошла после такого сбоя → одно сообщение «починилось». Иначе тишина.
// Состояние (о чём уже сказали) — data/watchdog.json. Секреты: GITHUB_TOKEN, TELEGRAM_* (через tools/notify.mjs).
//   node tools/watchdog.mjs          → out/watchdog.txt (текст для Telegram, пусто = молчать)
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const REPO = process.env.GITHUB_REPOSITORY || 'qwemort/pure-guides';
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const SKIP = new Set(['watchdog', 'notify-runs', 'pages-build-deployment', 'tg-hello', 'bsky-hello']);
const STATE = path.join(ROOT, 'data', 'watchdog.json');
const api = async (p, raw = false) => {
  const r = await fetch(`https://api.github.com/repos/${REPO}/${p}`, { headers: { authorization: `Bearer ${TOKEN}`, accept: 'application/vnd.github+json' } });
  if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`);
  return raw ? r.text() : r.json();
};
const ru = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

async function reason(runId) {
  try {
    const jobs = (await api(`actions/runs/${runId}/jobs`)).jobs || [];
    const job = jobs.find((j) => j.conclusion === 'failure');
    if (!job) return '';
    const log = (await api(`actions/jobs/${job.id}/logs`, true)).replace(/\x1b\[[0-9;]*m/g, '').split('\n').map((l) => l.replace(/^\S+Z /, ''));
    const hit = log.filter((l) => /##\[error\]|Error:|fatal:|Traceback|Exception/.test(l) && !/exit code \d/.test(l));
    return (hit.pop() || '').replace('##[error]', '').trim().slice(0, 180);
  } catch { return ''; }
}

const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {};
const flows = (await api('actions/workflows?per_page=100')).workflows.filter((w) => w.state === 'active');
const broken = [], fixed = [];
for (const w of flows) {
  const name = path.basename(w.path, '.yml');
  if (SKIP.has(name) || SKIP.has(w.name)) continue;
  const runs = ((await api(`actions/workflows/${w.id}/runs?per_page=10&status=completed`)).workflow_runs || [])
    .filter((r) => r.conclusion === 'success' || r.conclusion === 'failure');
  if (!runs.length) continue;
  let streak = 0;
  for (const r of runs) { if (r.conclusion === 'failure') streak++; else break; }
  if (streak >= 2) {
    const since = runs[streak - 1].created_at;
    if (state[name]?.since !== since) {
      broken.push({ name, streak, since, url: runs[0].html_url, why: await reason(runs[0].id) });
      state[name] = { since, told: new Date().toISOString().slice(0, 10) };
    }
  } else if (streak === 0 && state[name]) {
    fixed.push(name); delete state[name];
  }
}
let txt = '';
if (broken.length) txt += `🛠 Сломалась автоматика pure-guides (${broken.length}). Напиши Claude: «глянь сторожа».\n\n`
  + broken.map((b) => `• ${b.name}: не работает с ${ru(b.since)}, ${b.streak}${b.streak >= 10 ? '+' : ''} раз подряд${b.why ? `\n  причина: ${b.why}` : ''}\n  ${b.url}`).join('\n');
if (fixed.length) txt += `${txt ? '\n\n' : ''}✅ Снова работает: ${fixed.join(', ')}`;
fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'out', 'watchdog.txt'), txt);
fs.writeFileSync(STATE, JSON.stringify(state, null, 1) + '\n');
console.log(txt || 'всё работает, молчу');
