// Автопост в укр. Threads за 4..1 день до релиза. Кладёт queue/<сегодня UTC>.json; публикует scheduled-post.
// node tools/release-posts.mjs [--date YYYY-MM-DD] [--dry]   (--dry: только показать текст, файл не писать)
// node tools/release-posts.mjs --week   (сводка за 7 дней для Telegram → out/release-week.txt)
// Секреты: GEMINI_API_KEY и/или GITHUB_TOKEN (GitHub Models, бесплатно).
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'release-posts.json'), 'utf8'));
const A = process.argv.slice(2);
const arg = (k) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : ''; };
const TODAY = arg('--date') || new Date().toISOString().slice(0, 10);
const DRY = A.includes('--dry');
const { GITHUB_TOKEN: GH, GEMINI_API_KEY: GK } = process.env;
fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true });
const Q = path.join(ROOT, 'queue');
const day = (s) => Date.parse(s + 'T00:00:00Z') / 864e5;
const titles = () => fs.readdirSync(path.join(ROOT, 'data', 'titles')).filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'titles', f), 'utf8')));

if (A.includes('--week')) {
  const lines = [];
  for (const f of fs.readdirSync(Q).filter((x) => /^\d{4}-\d\d-\d\d\.json$/.test(x)).sort()) {
    const d = f.slice(0, 10); if (day(TODAY) - day(d) > 7 || day(d) > day(TODAY)) continue;
    const p = JSON.parse(fs.readFileSync(path.join(Q, f), 'utf8')); if (!p.release) continue;
    const res = fs.existsSync(path.join(Q, `posted-${d}.txt`)) ? fs.readFileSync(path.join(Q, `posted-${d}.txt`), 'utf8') : '';
    const link = (res.match(/https:\/\/\S+/) || [''])[0];
    lines.push(`${d.slice(8)}.${d.slice(5, 7)} · ${p.release} · ${res ? 'вышло' : 'НЕ вышло'}${link ? ' · ' + link : ''}\n   «${p.threads.split('\n')[0].slice(0, 90)}»`);
  }
  const txt = lines.length ? `🗓 Посты перед релизами за неделю (${lines.length}). Глянь в Threads, всё ли ок:\n\n${lines.join('\n')}` : '';
  fs.writeFileSync(path.join(ROOT, 'out', 'release-week.txt'), txt);
  console.log(txt || 'за неделю постов перед релизами не было'); process.exit(0);
}

const qf = path.join(Q, `${TODAY}.json`);
if (fs.existsSync(qf) && !DRY) { console.log(`на ${TODAY} в очереди уже есть пост, не трогаю`); process.exit(0); }
const cand = titles().filter((t) => t.release?.status === 'confirmed' && t.release?.date)
  .map((t) => ({ t, n: day(t.release.date) - day(TODAY) })).filter((x) => CFG.days[String(x.n)])
  .sort((a, b) => a.n - b.n || a.t.slug.localeCompare(b.t.slug));
if (!cand.length) { console.log(`${TODAY}: релизов через 1–4 дня нет`); process.exit(0); }
const { t, n } = cand[Math.round(day(TODAY)) % cand.length];   // несколько релизов рядом → по очереди по дням

const name = t.names?.uk || t.names?.en;
const nameEn = t.names?.en || name;
const media = { games: 'гра', movies: 'фільм', tv: 'серіал', anime: 'аніме' }[t.media] || '';
const dd = t.release.date.slice(8) + '.' + t.release.date.slice(5, 7);
// слова, которые нельзя писать (возможные спойлеры: имена, сюжет)
const ban = new Set([...(t.spoiler_blocklist || []), ...Object.values(t.words || {}).flatMap((w) => w.balanced || [])].map((x) => x.toLowerCase()));
const SAMPLES = [
  'поставив розширення, яке прибирає спойлери. норм гта 6?',
  'це моє розширення, я його сам зробив 😅 безкоштовне, розмиває спойлери на ютубі, реддіті і в Х. можна вибрати гру, серіал чи аніме',
  'а від яких спойлерів вас найбільше бісить? у мене гта і аніме',
  'якщо з компа то воно блюрить і ТТ і інсту',
  'зробив бота, який щодня вбиває «gta 6» на ютубі і рахує спойлери. щоб не робити це самому',
];
const sys = `Ти пишеш пост у Threads від імені Антона, українця, який сам зробив безкоштовне розширення, що розмиває спойлери.
Пиши українською, як він. Ось його справжні пости:
${SAMPLES.map((s, i) => `${i + 1}. ${s}`).join('\n')}
Правила: усе з маленької літери; 1-3 короткі строки; в кінці часто без крапки; максимум одне емодзі або жодного; без хештегів, без посилань, без тире, без лапок-ялинок, без списків, без «друзі», «погнали», «не просто… а», без трьох прикметників підряд; без мату.
Ніяких подробиць сюжету, персонажів, акторів чи сцен. Тільки назва, дата і твоя думка. Гумор сухий, коротко. Не вигадуй фактів про себе. Люди в threads не розуміють технічних слів («список слів», «мьют-лист», «пресет», «тайтл»). Спочатку біль, яку знає кожен (зіпсували кінцівку, спойлер у стрічці, вже не цікаво дивитися), потім рішення простими словами: що людина робить і що отримує (вписав слова в налаштування, і пости зі спойлерами не показуються). Не пиши «список слів» чи «тайтл». Люди в threads сидять з телефону, а розширення на телефон не ставиться, тому в постах з посиланням рішення одне: слова на моїй сторінці, які вписуєш у налаштування threads, Х чи тт. Розширення не згадуй, якщо завдання прямо не просить. Список слів для мьюту є на сайті, а розширення розмиває спойлери (не плутай). Пиши «через N дні», а не «за N дні». Х і threads пиши так, латиницею.
Відповідай тільки текстом поста.`;
const recent = fs.readdirSync(Q).filter((x) => /^\d{4}-\d\d-\d\d\.json$/.test(x) && x < `${TODAY}.json`).sort().slice(-8)
  .map((f) => JSON.parse(fs.readFileSync(path.join(Q, f), 'utf8'))).filter((p) => p.auto).map((p) => p.threads.split('\n').filter((l) => !l.includes('pure-guides')).join(' / '));
const user = `Тайтл: ${nameEn} (українською: ${name}; ${media}), виходить ${dd}. Пиши назву так, як її зазвичай кажуть люди в стрічці (часто оригінал англійською), маленькими літерами. Завдання: ${CFG.days[String(n)]}.${recent.length ? `\nНе повторюй формулювання з попередніх постів:\n${recent.join('\n')}` : ''}`;

async function gen(msgs) {
  const errs = [];
  if (GK) for (const m of CFG.gemini_models) try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, { method: 'POST', signal: AbortSignal.timeout(40000), headers: { 'x-goog-api-key': GK, 'content-type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: msgs[0].content }] }, contents: [{ role: 'user', parts: [{ text: msgs[1].content }] }], generationConfig: { temperature: 0.9 } }) });
    const j = await r.json(); const out = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
    if (out) return out; errs.push(`gemini ${m}: ${JSON.stringify(j.error || {}).slice(0, 120)}`);
  } catch (e) { errs.push(`gemini ${m}: ${e.message}`); }
  if (GH) for (const url of ['https://models.github.ai/inference/chat/completions', 'https://models.inference.ai.azure.com/chat/completions']) for (const m0 of CFG.models) try {
    const model = url.includes('azure.com') ? m0.replace(/^openai\//, '') : m0;
    const r = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(45000), headers: { authorization: `Bearer ${GH}`, 'content-type': 'application/json' }, body: JSON.stringify({ model, messages: msgs, temperature: 0.9 }) });
    const j = await r.json(); const out = (j.choices?.[0]?.message?.content || '').trim();
    if (out) return out; errs.push(`${model}: ${JSON.stringify(j.error || {}).slice(0, 120)}`);
  } catch (e) { errs.push(`${m0}: ${e.message}`); }
  throw new Error('нет ответа модели:\n  ' + errs.join('\n  '));
}
function clean(s) {
  s = s.replace(/^["'«»\s]+|["'«»\s]+$/g, '').replace(/\n{3,}/g, '\n\n');
  return s.charAt(0).toLowerCase() + s.slice(1);
}
const needExplain = n === 4 || n === 2;
function check(s) {
  const low = s.toLowerCase();
  if (!/[а-яіїєґ]/i.test(s)) return 'не украинский';
  if (/[—–]/.test(s)) return 'длинное тире';
  if (/#|https?:|www\./.test(s)) return 'хештег или ссылка';
  if ((s.match(/\p{Extended_Pictographic}/gu) || []).length > 1) return 'больше одного эмодзи';
  if (s.split('\n').filter(Boolean).length > 4) return 'больше 4 строк';
  for (const w of ban) if (w.length > 2 && low.includes(w)) return `запрещённое слово «${w}» (возможный спойлер)`;
  if (/друзі|погнали|не просто/.test(low)) return 'штамп ИИ';
  if (needExplain && !/(сховат|ховают|ховає|не бач|не показ|не видно|розмива|зника)/.test(low)) return 'не сказано, что человек получает';
  if (!/(спойлер|зіпсу|кінцівк|фінал|поворот|сюрприз|нема сенсу|немає сенсу|не цікаво)/.test(low)) return 'нет боли (спойлеры/испортили)';
  if (/список слів|тайтл|пресет|мьют-лист/.test(low)) return 'технические слова';
  if (/(сайт|розширен)/.test(low) && !/(мьют|замьют|сховат|не бач|не показ|не видно|розмива|блюр|копіює|встав)/.test(low)) return 'сайт или расширение упомянуты без объяснения';
  return '';
}
let text = '', why = '';
for (let i = 0; i < 4 && !text; i++) {
  let raw = '';
  try { raw = await gen([{ role: 'system', content: sys }, { role: 'user', content: user + (why ? `\nПопередній варіант не підійшов: ${why}. Напиши інакше.` : '') }]); }
  catch (e) { why = 'модель не ответила'; console.log(e.message); break; }
  const s = clean(raw);
  why = check(s); if (!why) text = s; else console.log(`попытка ${i + 1}: ${why}\n  ${s.replace(/\n/g, ' / ')}`);
}
if (!text) { if (!DRY) fs.writeFileSync(path.join(ROOT, 'out', 'release-fail.txt'), `⚠️ Пост перед релизом «${name}» на ${TODAY} не собрался: ${why}`); console.log('не получилось, пропуск'); process.exit(0); }
if (n === 4 || n === 2) text += '\n' + CFG.link.replace('{slug}', t.slug).replace('{media}', t.media);
if (text.length > CFG.max_len) { console.log('слишком длинно, пропуск'); process.exit(0); }
console.log(`${TODAY} · ${t.slug} · за ${n} дн.\n---\n${text}\n---`);
if (!DRY) fs.writeFileSync(qf, JSON.stringify({ threads: text, release: t.slug, days_before: n, auto: true }) + '\n');
