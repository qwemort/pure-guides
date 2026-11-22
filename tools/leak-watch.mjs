// Утечка → пост (Антон 22.11.2026). Раз в день читает те же RSS, что news-digest.py.
// Если в заголовке за последние 30 ч есть тайтл из data/titles И слово про слив (leak, datamine, early copies…):
//   1) data/leaks.json: {slug: {date, src, url}} — сайт поднимает тайтл первым в «Спойлер-радар» с меткой «Сливы уже идут» (7 дней);
//   2) пост в укр. Threads голосом Антона «боль → решение» в queue/<сегодня>.json;
//      публикует scheduled-post (04:20 UTC). Если на сегодня уже есть пост перед релизом — поста о сливе нет. Сам слив НИКОГДА не пересказывается: модель видит только название тайтла.
//   3) Антону в Telegram: что нашлось и какой пост встал в очередь (out/leak-watch.txt).
// Один тайтл — не чаще раза в 14 дней.  node tools/leak-watch.mjs [--dry]
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'release-posts.json'), 'utf8'));
const TEST = (process.argv[process.argv.indexOf('--test') + 1] || '');   // --test <slug>: подставить слив вручную, ничего не сохранять
const DRY = process.argv.includes('--dry') || process.argv.includes('--test');
const { GITHUB_TOKEN: GH, GEMINI_API_KEY: GK } = process.env;
const Q = path.join(ROOT, 'queue');
const LEAKS = path.join(ROOT, 'data', 'leaks.json');
const OUT = path.join(ROOT, 'out', 'leak-watch.txt');
fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true });
fs.writeFileSync(OUT, '');
const now = Date.now();
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const TODAY = isoDay(now);

// ленты — из news-digest.py, чтобы список был один
const FEEDS = [...fs.readFileSync(path.join(ROOT, 'tools', 'news-digest.py'), 'utf8').matchAll(/^\s*'([^']+)':\s*'(https?:[^']+)'/gm)].map((m) => ({ src: m[1], url: m[2] }));
const LEAK = /\bleak(s|ed|ing|er|ers)?\b|datamin|(huge|major|massive|big) spoiler|spoiler warning|(build|copy|footage|ending) (is |has )?(online|out)|early cop(y|ies)|street date (broken|break)|spoilers? (are )?(everywhere|online|flood)|ending (has )?(leaked|revealed)|full (game|episode|movie) (leaked|online)/i;
const NOT = /\bscam|crypto|grift|threaten|malware|phishing|password|data breach|hack(ed|er)s? (steal|account)/i;

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const titles = fs.readdirSync(path.join(ROOT, 'data', 'titles')).filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'titles', f), 'utf8')))
  .map((t) => {
    const en = (t.names?.en || '').trim();
    const alts = [en, en.replace(/\s*\(.*?\)\s*/g, ' ').trim()];
    if (/^gta 6$/i.test(en)) alts.push('gta ?(6|vi)', 'grand theft auto (6|vi)');
    const re = new RegExp(`(^|[^a-z0-9])(${[...new Set(alts.filter((a) => a.length >= 4))].map((a) => (a.includes('?') ? a : esc(a))).join('|')})([^a-z0-9]|$)`, 'i');
    return { t, re };
  });

const tag = (x, n) => { const m = x.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`, 'i')); return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : ''; };
const unent = (s) => s.replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<[^>]+>/g, '');
const hits = [];
for (const f of FEEDS) {
  let xml = '';
  try { xml = await (await fetch(f.url, { signal: AbortSignal.timeout(20000), headers: { 'user-agent': 'Mozilla/5.0 pure-guides leak-watch' } })).text(); }
  catch (e) { console.log(`${f.src}: не открылся (${e.message})`); continue; }
  for (const it of xml.split(/<item[\s>]|<entry[\s>]/i).slice(1)) {
    const title = unent(tag(it, 'title'));
    const link = unent(tag(it, 'link')) || ((it.match(/<link[^>]+href="([^"]+)"/i) || [])[1] || '');
    const when = Date.parse(tag(it, 'pubDate') || tag(it, 'published') || tag(it, 'updated') || tag(it, 'dc:date'));
    if (!title || !when || now - when > 30 * 3600e3) continue;
    if (!LEAK.test(title) || NOT.test(title)) continue;
    for (const { t, re } of titles) if (re.test(title)) hits.push({ t, src: f.src, url: link, when });
  }
}
if (process.argv.includes('--test')) { const x = titles.find((y) => y.t.slug === TEST); if (x) hits.push({ t: x.t, src: 'TEST', url: '', when: now }); }
const leaks = fs.existsSync(LEAKS) ? JSON.parse(fs.readFileSync(LEAKS, 'utf8')) : {};
const fresh = hits.filter((h) => h.src === 'TEST' || !leaks[h.t.slug] || now - Date.parse(leaks[h.t.slug].date) > 14 * 864e5)
  .sort((a, b) => b.when - a.when).filter((h, i, a) => a.findIndex((x) => x.t.slug === h.t.slug) === i);
if (!fresh.length) { console.log(`${TODAY}: новых сливов по тайтлам нет (совпадений всего: ${hits.length})`); process.exit(0); }
const h = fresh[0];   // один пост в день: самый свежий
for (const x of fresh) leaks[x.t.slug] = { date: TODAY, src: x.src, url: x.url };
if (!DRY) fs.writeFileSync(LEAKS, JSON.stringify(leaks, null, 1) + '\n');

// --- пост ---
const slot = fs.existsSync(path.join(Q, `${TODAY}.json`)) && !TEST ? '' : TODAY;   // день занят постом перед релизом → без поста (релиз важнее)
const t = h.t;
const nameEn = t.names?.en || t.slug;
const name = t.names?.uk || nameEn;
const media = { games: 'гра', movies: 'фільм', tv: 'серіал', anime: 'аніме' }[t.media] || '';
const ban = new Set([...(t.spoiler_blocklist || []), ...Object.values(t.words || {}).flatMap((w) => w.balanced || [])].map((x) => String(x).toLowerCase()));
const SAMPLES = [
  'поставив розширення, яке прибирає спойлери. норм гта 6?',
  'а від яких спойлерів вас найбільше бісить? у мене гта і аніме',
  'якщо з компа то воно блюрить і ТТ і інсту',
];
const sys = `Ти пишеш пост у Threads від імені Антона, українця, який сам зробив безкоштовну сторінку зі словами, щоб ховати спойлери. Пиши українською, як він. Його справжні пости:
${SAMPLES.map((s, i) => `${i + 1}. ${s}`).join('\n')}
Правила: усе з маленької літери; 1-3 короткі строки; максимум одне емодзі або жодного; без хештегів, без посилань, без тире, без лапок-ялинок, без списків, без «друзі», «погнали», «не просто… а»; без мату.
Тема: по цьому тайтлу пішли зливи. Ти НЕ знаєш і НЕ пишеш, що саме злили: жодних подробиць сюжету, персонажів, акторів, сцен, кінцівки, джерел, цифр. Тільки факт «пішли зливи / злили» і біль: тепер стрічка буде повна спойлерів і тобі зіпсують усе раніше, ніж подивишся чи пограєш. Потім рішення простими словами: на моїй сторінці є слова саме під цей тайтл, вписуєш їх у налаштування threads, Х чи тт, і пости зі спойлерами не показуються. Не пиши «список слів», «тайтл», «мьют-лист», «пресет». Розширення не згадуй. Х і threads пиши латиницею.
Відповідай тільки текстом поста.`;
const user = `Тайтл: ${nameEn} (українською: ${name}; ${media}). Пиши назву так, як її кажуть люди в стрічці, маленькими літерами.`;

async function gen(msgs) {
  const errs = [];
  if (GK) for (const m of CFG.gemini_models) try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, { method: 'POST', signal: AbortSignal.timeout(40000), headers: { 'x-goog-api-key': GK, 'content-type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: msgs[0].content }] }, contents: [{ role: 'user', parts: [{ text: msgs[1].content }] }], generationConfig: { temperature: 0.9 } }) });
    const j = await r.json(); const out = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
    if (out) return out; errs.push(`gemini ${m}`);
  } catch (e) { errs.push(`gemini ${m}: ${e.message}`); }
  if (GH) for (const url of ['https://models.github.ai/inference/chat/completions', 'https://models.inference.ai.azure.com/chat/completions']) for (const m0 of CFG.models) try {
    const model = url.includes('azure.com') ? m0.replace(/^openai\//, '') : m0;
    const r = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(45000), headers: { authorization: `Bearer ${GH}`, 'content-type': 'application/json' }, body: JSON.stringify({ model, messages: msgs, temperature: 0.9 }) });
    const j = await r.json(); const out = (j.choices?.[0]?.message?.content || '').trim();
    if (out) return out; errs.push(model);
  } catch (e) { errs.push(`${m0}: ${e.message}`); }
  throw new Error('нет ответа модели: ' + errs.join(', '));
}
const clean = (s) => { s = s.replace(/^["'«»\s]+|["'«»\s]+$/g, '').replace(/\n{3,}/g, '\n\n'); return s.charAt(0).toLowerCase() + s.slice(1); };
function check(s) {
  const low = s.toLowerCase();
  if (!/[а-яіїєґ]/i.test(s)) return 'не украинский';
  if (/[—–]/.test(s)) return 'длинное тире';
  if (/#|https?:|www\./.test(s)) return 'хештег или ссылка';
  if ((s.match(/\p{Extended_Pictographic}/gu) || []).length > 1) return 'больше одного эмодзи';
  if (s.split('\n').filter(Boolean).length > 4) return 'больше 4 строк';
  for (const w of ban) if (w.length > 2 && low.includes(w)) return `запрещённое слово «${w}» (возможный спойлер)`;
  if (/друзі|погнали|не просто/.test(low)) return 'штамп ИИ';
  if (!/(злив|злил|злили|лік)/.test(low)) return 'не сказано про слив';
  if (!/(спойлер|зіпсу|кінцівк|фінал|не цікаво)/.test(low)) return 'нет боли';
  if (!/(сховат|ховают|ховає|не бач|не показ|не видно|налаштуван)/.test(low)) return 'нет решения';
  if (/список слів|тайтл|пресет|мьют-лист|розширен/.test(low)) return 'технические слова';
  return '';
}
let text = '', why = '';
if (slot) for (let i = 0; i < 4 && !text; i++) {
  let raw = '';
  try { raw = await gen([{ role: 'system', content: sys }, { role: 'user', content: user + (why ? `\nПопередній варіант не підійшов: ${why}. Напиши інакше.` : '') }]); }
  catch (e) { why = e.message; break; }
  const s = clean(raw); why = check(s); if (!why) text = s; else console.log(`попытка ${i + 1}: ${why} | ${s.replace(/\n/g, ' / ')}`);
}
if (text) text += '\n' + CFG.link.replace('{slug}', t.slug).replace('{media}', t.media);
if (text.length > CFG.max_len) { why = 'слишком длинно'; text = ''; }
const others = fresh.slice(1).map((x) => x.t.names?.en || x.t.slug);
let msg = `🚨 Сливы: ${nameEn} (${h.src}). На сайте тайтл поднят в радар на 7 дней.`;
if (others.length) msg += `\nЕщё сливы (без поста): ${others.join(', ')}.`;
if (!slot) msg += '\nПоста не будет: сегодня уже выходит пост перед релизом.';
else if (text) msg += `\nПост в Threads на ${slot.slice(8)}.${slot.slice(5, 7)} (уйдёт ~5:20 по Варшаве):\n\n${text}\n\nНе нравится — напиши Claude «убери пост ${slot}».`;
else msg += `\nПост не собрался: ${why}.`;
console.log(msg);
if (DRY) process.exit(0);
if (slot && text) fs.writeFileSync(path.join(Q, `${slot}.json`), JSON.stringify({ threads: text, leak: t.slug, auto: true }) + '\n');
fs.writeFileSync(OUT, msg);
