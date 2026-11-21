// Шаг 1б переезда: один проход по data/titles/*.json -> Wikidata. Без ключей, только открытые данные (CC0).
//   node tools/enrich-titles.mjs
// 1) Находит запись тайтла (qid) по названию и типу (игра / фильм / сериал / аниме).
// 2) Дата: берёт точную дату выхода (P577, для сериалов P580). Совпала с нашей -> status confirmed + источник.
//    Не совпала -> НИЧЕГО не меняет, пишет в отчёт (решает человек).
// 3) Имена героев (P674) -> words.<язык>.balanced_suggested (не в живой список!), только если своих имён нет
//    и тайтл уже вышел (у невышедших в списке персонажей может быть сюрприз-спойлер).
// Отчёт: out/enrich-report.md.
import fs from 'node:fs'; import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIR = path.join(ROOT, 'data/titles');
const API = 'https://www.wikidata.org/w/api.php';
const H = { 'User-Agent': 'mutespoilers-enrich/1.0 (https://github.com/qwemort/pure-guides)' };
const LANGS = { en: 'en', ru: 'ru', pl: 'pl', 'pt-BR': 'pt-br', uk: 'uk', de: 'de', fr: 'fr', es: 'es', it: 'it', tr: 'tr', ja: 'ja', ko: 'ko', 'zh-CN': 'zh' };
const DESC = {
  games: /video game/i,
  movies: /\bfilm\b|movie/i,
  tv: /television series|tv series|miniseries|web series|streaming series|drama series/i,
  anime: /anime|television series|manga|animated/i,
};
const today = new Date().toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(q) {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(`${API}?format=json&${new URLSearchParams(q)}`, { headers: H });
    if (r.ok) return r.json();
    await sleep(1500 * (i + 1));
  }
  throw new Error('Wikidata не ответила');
}
const norm = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const dateOf = (claims, prop) => (claims?.[prop] || [])
  .map((c) => c.mainsnak?.datavalue?.value).filter((v) => v && v.precision >= 11)
  .map((v) => v.time.replace(/^\+/, '').slice(0, 10)).sort();

async function findQid(t) {
  const names = [...new Set([t.names?.en, t.slug.replace(/-/g, ' ')].filter(Boolean))];
  for (const name of names) {
    const s = await get({ action: 'wbsearchentities', search: name, language: 'en', type: 'item', limit: '15' });
    const hits = (s.search || []).filter((x) => DESC[t.media].test(x.description || ''));
    const exact = hits.find((x) => norm(x.label) === norm(name) || (x.aliases || []).some((a) => norm(a) === norm(name)));
    const hit = exact || (hits.length === 1 ? hits[0] : null);
    if (hit) return { qid: hit.id, label: hit.label, desc: hit.description, exact: !!exact };
  }
  return null;
}

const rep = { confirmed: [], differs: [], nodate: [], notfound: [], names: [], errors: [] };
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
for (const f of files) {
  const p = path.join(DIR, f); const t = JSON.parse(fs.readFileSync(p, 'utf8'));
  const label = t.names?.en || t.slug;
  try {
    let found = null;
    if (!t.wikidata) {
      found = await findQid(t);
      if (!found) { rep.notfound.push(`${label} (${t.media})`); continue; }
      t.wikidata = found.qid;
      if (!found.exact) t.wikidata_check = `найдено не по точному названию: «${found.label}», ${found.desc}`;
    }
    const e = await get({ action: 'wbgetentities', ids: t.wikidata, props: 'claims|labels', languages: 'en' });
    const ent = e.entities?.[t.wikidata]; const claims = ent?.claims || {};
    const wl = ent?.labels?.en?.value || '';
    const wd = dateOf(claims, 'P577')[0] || dateOf(claims, 'P580')[0] || null;
    const ours = t.release?.date || null;
    t.release = t.release || {};
    t.release.wikidata_date = wd;
    if (wd && ours && wd === ours) {
      t.release.status = 'confirmed'; t.release.source = `https://www.wikidata.org/wiki/${t.wikidata}`;
      rep.confirmed.push(`${label}: ${ours}`);
    } else if (wd && ours) {
      rep.differs.push(`${label}: у нас ${ours}, в Wikidata ${wd} (${wl}, ${t.wikidata})`);
    } else {
      rep.nodate.push(`${label}: у нас ${ours || '—'}, в Wikidata точной даты нет (${t.wikidata})`);
    }
    // имена героев
    const hasNames = Object.values(t.words || {}).some((w) => (w.balanced || []).length);
    const released = wd ? wd <= today : (ours ? ours <= today : t.media === 'anime' || t.media === 'tv');
    const chars = (claims.P674 || []).map((c) => c.mainsnak?.datavalue?.value?.id).filter(Boolean).slice(0, 10);
    if (!hasNames && released && chars.length) {
      const L = await get({ action: 'wbgetentities', ids: chars.join('|'), props: 'labels', languages: Object.values(LANGS).join('|') });
      for (const [code, wcode] of Object.entries(LANGS)) {
        const list = chars.map((id) => L.entities?.[id]?.labels?.[wcode]?.value || L.entities?.[id]?.labels?.en?.value)
          .filter(Boolean).map((s) => s.toLowerCase());
        if (list.length) { t.words[code] = t.words[code] || { basic: [], balanced: [] }; t.words[code].balanced_suggested = [...new Set(list)]; }
      }
      rep.names.push(`${label}: ${t.words.en?.balanced_suggested?.join(', ')}`);
    }
    t.checked = today;
    fs.writeFileSync(p, JSON.stringify(t, null, 1) + '\n');
    await sleep(300);
  } catch (err) { rep.errors.push(`${label}: ${err.message}`); }
}
const sec = (h, a) => `## ${h} (${a.length})\n` + (a.length ? a.map((x) => `- ${x}`).join('\n') : '- нет') + '\n';
const md = `# Шаг 1б: сверка с Wikidata, ${today}\n\n` + sec('Дата подтверждена', rep.confirmed) + '\n' +
  sec('Дата расходится — решает человек, ничего не менял', rep.differs) + '\n' + sec('Нет точной даты в Wikidata', rep.nodate) + '\n' +
  sec('Не нашёл в Wikidata', rep.notfound) + '\n' + sec('Предложены имена героев (balanced_suggested, на проверку)', rep.names) + '\n' + sec('Ошибки', rep.errors);
fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'out/enrich-report.md'), md);
console.log(md);
