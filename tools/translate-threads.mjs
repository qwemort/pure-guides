// Перевод постов украинского Threads на английский аккаунт (Azure OpenAI), текстовые посты.
//   node tools/translate-threads.mjs                 по умолчанию черновик: ничего не публикует
//   node tools/translate-threads.mjs --last 5        черновик по последним 5 постам (без записи состояния)
//   node tools/translate-threads.mjs --publish       публикует новые посты на английский аккаунт
// Секреты: THREADS_TOKEN (укр.), THREADS_TOKEN_EN (англ.), AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_KEY, AZURE_OPENAI_DEPLOYMENT.
// Состояние: data/threads-en-done.json. Первый запуск запоминает время и ничего не переводит из старого.
// Пропускает: посты с картинкой/видео, ответы (их API не отдаёт в списке), посты по правилам skip_regex, уже обработанные.
import fs from 'node:fs'; import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'threads-en.json'), 'utf8'));
const G = process.env.THREADS_API_BASE || 'https://graph.threads.net/v1.0';
const A = process.argv.slice(2);
const PUBLISH = A.includes('--publish');
const li = A.indexOf('--last'); const LAST = li >= 0 ? Math.max(1, +A[li + 1] || 5) : 0;
const { THREADS_TOKEN: TU, THREADS_TOKEN_EN: TE, AZURE_OPENAI_ENDPOINT: AE, AZURE_OPENAI_KEY: AK, AZURE_OPENAI_DEPLOYMENT: AD } = process.env;
fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true });
const draft = [];
const say = (s) => { console.log(s); draft.push(s); };
const done = () => fs.writeFileSync(path.join(ROOT, 'out', 'threads-en-draft.md'), draft.join('\n') + '\n');
if (!TU) { say('нет THREADS_TOKEN: пропуск'); done(); process.exit(0); }
if (PUBLISH && !TE) { say('нет THREADS_TOKEN_EN: публикация невозможна'); done(); process.exit(0); }

const call = async (url, opt = {}) => {
  const r = await fetch(url, opt); const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`${r.status} ${JSON.stringify(j.error || j).slice(0, 300)}`);
  return j;
};
const get = (token, p, q = {}) => call(`${G}/${p}?${new URLSearchParams({ ...q, access_token: token })}`);
const post = (token, p, q) => call(`${G}/${p}?${new URLSearchParams({ ...q, access_token: token })}`, { method: 'POST' });

const SYSTEM = `You translate short social media posts from Ukrainian into English for the personal Threads account of a solo developer who builds a spoiler-blocking browser extension.
Keep the voice: casual, short lines, same line breaks, dry humor. Start with a lowercase letter, usually no period at the end. Keep the emoji that are in the source, add none, no hashtags.
Never use dashes as punctuation (use a comma or a period). Keep the product name Pure Spoiler Blocker and write 'gta 6' in lowercase. Do not add, remove or change facts, numbers or links.
Output only the translation, nothing else.`;
const SHOTS = [
  ['це моє розширення, я його сам зробив 😅 безкоштовне, розмиває спойлери на ютубі, реддіті і в Х. можна вибрати гру, серіал чи аніме',
   'this is my extension, i made it myself 😅 free, blurs spoilers on youtube, reddit and x. you can pick a game, a show or an anime'],
  ['а від яких спойлерів вас найбільше бісить? у мене гта і аніме', "which spoilers annoy you the most? for me it's gta and anime"],
];
async function translate(text) {
  if (!AE || !AK || !AD) throw new Error('нет AZURE_OPENAI_ENDPOINT / KEY / DEPLOYMENT');
  const msgs = [{ role: 'system', content: SYSTEM }];
  for (const [u, e] of SHOTS) msgs.push({ role: 'user', content: u }, { role: 'assistant', content: e });
  msgs.push({ role: 'user', content: text });
  const j = await call(`${AE.replace(/\/$/, '')}/openai/deployments/${AD}/chat/completions?api-version=${CFG.api_version}`,
    { method: 'POST', headers: { 'api-key': AK, 'content-type': 'application/json' }, body: JSON.stringify({ messages: msgs, temperature: 0.3, max_tokens: 400 }) });
  return (j.choices?.[0]?.message?.content || '').trim();
}
function check(src, en) {
  if (!en) return 'пустой перевод';
  if (/[—–]/.test(en)) return 'длинное тире в переводе';
  const urls = (s) => (s.match(/https?:\/\/\S+/g) || []).sort().join('|');
  if (urls(src) !== urls(en)) return 'ссылки в переводе не совпали с оригиналом';
  if (/[а-яіїєґ]/i.test(en)) return 'в переводе остались украинские буквы';
  if ((en + (CFG.suffix || '')).length > CFG.max_len) return `длиннее ${CFG.max_len} символов`;
  return '';
}

const stateFile = path.join(ROOT, 'data', 'threads-en-done.json');
const st = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : null;
const save = (s) => fs.writeFileSync(stateFile, JSON.stringify(s, null, 2) + '\n');

const me = await get(TU, 'me', { fields: 'id,username' });
const list = (await get(TU, `${me.id}/threads`, { fields: 'id,text,timestamp,media_type', limit: '25' })).data || [];
say(`# Перевод Threads: укр. @${me.username} → англ. (${PUBLISH ? 'ПУБЛИКАЦИЯ' : 'черновик, ничего не публикуется'})`);

if (!st && !LAST) {
  save({ since: new Date().toISOString(), done: {} });
  say('Первый запуск: запомнил время, старые посты не трогаю. Переводиться будут только посты, вышедшие после этого момента.');
  done(); process.exit(0);
}
const since = st ? new Date(st.since).getTime() : 0;
const state = st || { since: new Date().toISOString(), done: {} };
const skipRe = (CFG.skip_regex || []).map((r) => new RegExp(r, 'i'));
let queue = list.filter((m) => LAST || (new Date(m.timestamp).getTime() > since && !state.done[m.id]));
if (LAST) queue = queue.slice(0, LAST);
queue.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
if (!queue.length) { say('Новых постов нет.'); done(); process.exit(0); }

let me_en = null;
for (const m of queue) {
  const head = `\n## ${m.timestamp} (${m.id})`;
  const reason = m.media_type && m.media_type !== 'TEXT_POST' ? `пропуск: пост с медиа (${m.media_type})`
    : !m.text ? 'пропуск: нет текста' : skipRe.some((r) => r.test(m.text)) ? 'пропуск: правило skip_regex (пост бота)' : '';
  say(head);
  if (reason) { say(reason); if (!LAST) state.done[m.id] = { skipped: reason }; continue; }
  say(`UA: ${m.text}`);
  let en;
  try { en = await translate(m.text); } catch (e) { say(`ошибка перевода: ${e.message}`); continue; }
  const bad = check(m.text, en);
  if (bad) { say(`EN (отклонён: ${bad}): ${en}`); if (!LAST) state.done[m.id] = { skipped: bad }; continue; }
  const final = en + (CFG.suffix || '');
  say(`EN: ${final}`);
  if (PUBLISH && !LAST) {
    try {
      me_en ||= await get(TE, 'me', { fields: 'id,username' });
      const c = await post(TE, `${me_en.id}/threads`, { media_type: 'TEXT', text: final });
      await new Promise((s) => setTimeout(s, 30000));
      const p = await post(TE, `${me_en.id}/threads_publish`, { creation_id: c.id });
      state.done[m.id] = { en_id: p.id, at: new Date().toISOString() };
      say(`опубликовано на @${me_en.username}: ${p.id}`);
      save(state);
    } catch (e) { say(`ошибка публикации: ${e.message}`); }
  }
}
if (!LAST) save(state);
if (PUBLISH && TE) {
  try { const rf = await call(`https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${encodeURIComponent(TE)}`);
    if (rf.access_token && rf.access_token !== TE) fs.writeFileSync(path.join(ROOT, 'out', 'new-token-en.txt'), rf.access_token); } catch (e) { say(`продление токена EN: ${e.message}`); }
}
done();
