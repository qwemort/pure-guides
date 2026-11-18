// Сверка дат релизов из data/titles.json с Wikidata (свойство P577). Без ключей.
//   node tools/check-title-dates.mjs [--dry]
// Меняет дату только если новая: с точностью до дня, не в прошлом, не дальше чем на 400 дней вперёд
// и не отличается от старой больше чем на 120 дней (иначе пишет «подозрительно» и ничего не трогает).
// Печатает отчёт; при изменении пишет changed=true в $GITHUB_OUTPUT.
import fs from 'node:fs'; import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FILE = path.join(ROOT, 'data/titles.json'); const DRY = process.argv.includes('--dry');
const J = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const API = 'https://www.wikidata.org/w/api.php'; const H = { 'User-Agent': 'pure-guides-date-check/1.0 (https://github.com/qwemort/pure-guides)' };
const get = async (q) => { const r = await fetch(`${API}?format=json&origin=*&${new URLSearchParams(q)}`, { headers: H }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };
const today = new Date().toISOString().slice(0, 10); const days = (a, b) => Math.round((new Date(a) - new Date(b)) / 864e5);
let changed = false; const rep = [];
for (const [id, t] of Object.entries(J.titles)) {
  if (!t.release) continue;   // сериалы/аниме без одной даты
  try {
    if (!t.qid) {
      const s = await get({ action: 'wbsearchentities', search: t.name, language: 'en', type: 'item', limit: '10' });
      const hit = (s.search || []).find((x) => /film|movie/i.test(x.description || '') && (x.label || '').toLowerCase() === t.name.toLowerCase());
      if (!hit) { rep.push(`${id}: в Wikidata не нашёл «${t.name}», дату не трогаю`); continue; }
      t.qid = hit.id; changed = true; rep.push(`${id}: нашёл запись ${hit.id} (${hit.description})`);
    }
    const e = await get({ action: 'wbgetclaims', entity: t.qid, property: 'P577' });
    const vals = (e.claims?.P577 || []).map((c) => ({ v: c.mainsnak?.datavalue?.value, us: (c.qualifiers?.P291 || []).some((q) => q.datavalue?.value?.id === 'Q30') }))
      .filter((x) => x.v && x.v.precision >= 11).map((x) => ({ d: x.v.time.replace(/^\+/, '').slice(0, 10), us: x.us }));
    if (!vals.length) { rep.push(`${id}: в Wikidata нет точной даты, оставляю ${t.release}`); t.checked = today; continue; }
    const pick = (vals.filter((x) => x.us).length ? vals.filter((x) => x.us) : vals).map((x) => x.d).sort()[0];
    t.checked = today;
    if (pick === t.release) { rep.push(`${id}: ${pick} без изменений`); continue; }
    if (pick < today || days(pick, today) > 400 || Math.abs(days(pick, t.release)) > 120) { rep.push(`${id}: подозрительная дата ${pick} (сейчас ${t.release}), не применяю`); continue; }
    rep.push(`${id}: дата ${t.release} → ${pick}`); t.release = pick; changed = true;
  } catch (err) { rep.push(`${id}: ошибка ${err.message}`); }
}
console.log(rep.join('\n'));
if (!DRY) fs.writeFileSync(FILE, JSON.stringify(J, null, 1) + '\n');
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\nreport<<EOF\n${rep.join('\n')}\nEOF\n`);
