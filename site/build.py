#!/usr/bin/env python3
"""Станок нового сайта mutespoilers.com (шаг 2 переезда). Старый сайт github.io НЕ трогает.

Читает data/titles/*.json + data/vocab.json + i18n/title.<язык>.json, пишет готовый сайт в dist/:
  /{media}/{slug}/ (EN в корне), /{lang}/{media}/{slug}/, хабы /{media}/, главную (пока простая),
  robots.txt, sitemap.xml (индекс) + sitemap-{lang}.xml, _headers (pages.dev закрыт от Google), _redirects.
Запуск: pip install jinja2 && python3 site/build.py
Дизайн и модули карточки — шаги 3–5 (по скиллу pure-design). Здесь только адреса и структура.
"""
import json, shutil, sys
from pathlib import Path
from xml.sax.saxutils import escape
from jinja2 import Environment, FileSystemLoader, StrictUndefined

R = Path(__file__).resolve().parent.parent
SITE = R / 'site'
DIST = R / 'dist'
C = json.loads((SITE / 'config.json').read_text(encoding='utf-8'))
BASE = C['base']
LABELS = {x['code']: x['label'] for x in json.loads((R / 'data/title-words.json').read_text(encoding='utf-8'))['langs']}
VOCAB = json.loads((R / 'data/vocab.json').read_text(encoding='utf-8'))['vocab']
env = Environment(loader=FileSystemLoader(SITE / 'templates'), autoescape=True, undefined=StrictUndefined,
                  trim_blocks=True, lstrip_blocks=True)


def ucode(lang):            # код в адресе: pt-BR -> pt-br
    return lang.lower()


def prefix(lang):           # EN в корне, остальные /{lang}/
    return '' if lang == 'en' else f'/{ucode(lang)}'


def S(lang):
    p = R / 'i18n' / f'title.{lang}.json'
    return json.loads(p.read_text(encoding='utf-8')) if p.exists() else S('en')


def hub_lang(lang):         # у языков «только GTA 6» своих хабов нет -> английские
    return lang if lang in C['wave0'] else 'en'


def write(path, html):
    f = DIST / path.lstrip('/') / 'index.html' if path.endswith('/') else DIST / path.lstrip('/')
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(html, encoding='utf-8')


def common(lang, page_langs, path_of):
    hl = hub_lang(lang)
    return dict(
        lang_attr=lang,
        home_href=prefix(hl) + '/',
        media_nav=[{'href': f'{prefix(hl)}/{m}/', 'label': C['media'][m].get(hl, C['media'][m]['en'])} for m in C['media']],
        footer_langs=[{'code': l, 'label': LABELS.get(l, l), 'href': path_of(l)} for l in page_langs],
        hreflang=[{'code': l, 'href': BASE + path_of(l)} for l in page_langs] if len(page_langs) > 1 else [],
        x_default=BASE + path_of('en'),
    )


def title_langs(t):
    have = set(t['texts']) & set(t['words'])
    langs = [l for l in C['wave0'] if l in have]
    if t['slug'] == C['gta_slug']:
        langs += [l for l in C['gta_only'] if l in have]
    return langs if 'en' in langs else []


def release_text(t, lang, s):
    r = t['release']
    if not r.get('date'):
        return '—'
    mark = '' if r.get('status') == 'confirmed' else ' (?)'
    return r['date'] + mark   # человеческий формат даты и таблица окон — шаг 3


def main():
    if DIST.exists():
        shutil.rmtree(DIST)
    titles = [json.loads(p.read_text(encoding='utf-8')) for p in sorted((R / 'data/titles').glob('*.json'))]
    sitemap = {}          # lang -> [(loc, lastmod)]
    count = 0
    for t in titles:
        langs = title_langs(t)
        if not langs:
            print('пропуск (нет EN):', t['slug']); continue
        path_of = lambda l, t=t: f"{prefix(l)}/{t['media']}/{t['slug']}/"
        for lang in langs:
            s, tx, hl = S(lang), t['texts'][lang], hub_lang(lang)
            name = t['names'].get(lang) or t['names']['en']
            w = t['words'][lang]
            html = env.get_template('title.html').render(
                **common(lang, langs, path_of),
                title=s['h1'].format(name=name), description=tx.get('desc', ''), canonical=BASE + path_of(lang),
                h1=s['h1'].format(name=name), name=name, lead=tx.get('lead', ''), S=s,
                why_h=tx.get('why_h', ''), why=tx.get('why', ''),
                words={'basic': w.get('basic', []), 'balanced': w.get('balanced', []), 'max': VOCAB.get(lang, VOCAB['en'])},
                release_text=release_text(t, lang, s),
                checked_line=f"{t.get('checked') or t.get('modified') or ''}",
                crumbs={'home': prefix(hl) + '/', 'home_label': C['home'].get(hl, 'Home'),
                        'media': f"{prefix(hl)}/{t['media']}/", 'media_label': C['media'][t['media']].get(hl, C['media'][t['media']]['en'])},
            )
            write(path_of(lang), html)
            sitemap.setdefault(lang, []).append((BASE + path_of(lang), t.get('modified') or t.get('published')))
            count += 1

    # хабы и главная (простые, настоящие — шаги 4–5)
    for lang in C['wave0']:
        for m in C['media']:
            items = sorted(({'href': f"{prefix(lang)}/{m}/{t['slug']}/", 'name': t['names'].get(lang) or t['names']['en']}
                            for t in titles if t['media'] == m and lang in title_langs(t)), key=lambda x: x['name'].lower())
            hp = lambda l, m=m: f'{prefix(l)}/{m}/'
            label = C['media'][m].get(lang, C['media'][m]['en'])
            write(hp(lang), env.get_template('hub.html').render(**common(lang, C['wave0'], hp), title=label, description=label,
                                                                canonical=BASE + hp(lang), h1=label, items=items))
            sitemap.setdefault(lang, []).append((BASE + hp(lang), None))
        home = lambda l: f'{prefix(l)}/'
        items = [{'href': f'{prefix(lang)}/{m}/', 'name': C['media'][m].get(lang, C['media'][m]['en'])} for m in C['media']]
        write(home(lang), env.get_template('hub.html').render(**common(lang, C['wave0'], home), title='mutespoilers', description='mutespoilers',
                                                              canonical=BASE + home(lang), h1='mutespoilers', items=items))
        sitemap.setdefault(lang, []).append((BASE + home(lang), None))

    # sitemap: индекс + файл на язык
    for lang, urls in sitemap.items():
        body = ''.join(f'<url><loc>{escape(u)}</loc>' + (f'<lastmod>{d}</lastmod>' if d else '') + '</url>\n' for u, d in urls)
        (DIST / f'sitemap-{ucode(lang)}.xml').write_text(
            '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + body + '</urlset>\n', encoding='utf-8')
    (DIST / 'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
                                      ''.join(f'<sitemap><loc>{BASE}/sitemap-{ucode(l)}.xml</loc></sitemap>\n' for l in sitemap) + '</sitemapindex>\n', encoding='utf-8')
    # robots: явно пускаем поисковики и ИИ-поиск
    (DIST / 'robots.txt').write_text(''.join(f'User-agent: {b}\nAllow: /\n\n' for b in C['bots']) +
                                     f'User-agent: *\nAllow: /\n\nSitemap: {BASE}/sitemap.xml\n', encoding='utf-8')
    # черновой адрес *.pages.dev закрыт от Google ТОЛЬКО заголовком (в HTML noindex нет)
    (DIST / '_headers').write_text('https://:project.pages.dev/*\n  X-Robots-Tag: noindex\n\n'
                                   'https://:version.:project.pages.dev/*\n  X-Robots-Tag: noindex\n', encoding='utf-8')
    # 301 со старых адресов — шаг 7 (карта из data/titles/*.json -> old_urls)
    (DIST / '_redirects').write_text('# карта 301 со старых адресов появится на шаге 7\n', encoding='utf-8')
    total = sum(len(v) for v in sitemap.values())
    print(f'страниц тайтлов: {count}; всего адресов в sitemap: {total}; языки: ' +
          ', '.join(f'{l} {len(v)}' for l, v in sitemap.items()))
    return 0


if __name__ == '__main__':
    sys.exit(main())
