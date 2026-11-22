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
sys.path.insert(0, str(Path(__file__).resolve().parent))
import titlepage
import exports

R = Path(__file__).resolve().parent.parent
SITE = R / 'site'
DIST = R / 'dist'
C = json.loads((SITE / 'config.json').read_text(encoding='utf-8'))
BASE = C['base']
LABELS = {x['code']: x['label'] for x in json.loads((R / 'data/title-words.json').read_text(encoding='utf-8'))['langs']}
HUBS = json.loads((R / 'i18n/ms-hubs.json').read_text(encoding='utf-8'))['strings']
GUIDES = json.loads((SITE / 'content/guides.json').read_text(encoding='utf-8'))
PAGES = json.loads((SITE / 'content/pages.json').read_text(encoding='utf-8'))
FACTS = json.loads((R / 'data/facts.json').read_text(encoding='utf-8'))
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


def footer(hl):
    F, Hs, P = PAGES['footer'][hl], HUBS[hl], prefix(hl)
    return [
        {'h': F['cat'], 'links': [{'href': f'{P}/{m}/', 'label': Hs[m + '_h']} for m in C['media']]
         + [{'href': f'{P}/upcoming/', 'label': F['upcoming']}, {'href': f'{P}/out-now/', 'label': F['outnow']}, {'href': f'{P}/calendar/', 'label': Hs['cal_nav']}]},
        {'h': F['tools'], 'links': [{'href': f'{P}/guides/{k}/', 'label': GUIDES['guides'][k]['name']} for k in GUIDES['guides']]
         + [{'href': f'{P}/guides/', 'label': F['guides']}, {'href': f'{P}/extension/', 'label': F['ext']}]},
        {'h': F['proj'], 'links': [{'href': f'{P}/about/', 'label': F['about']}, {'href': f'{P}/methodology/', 'label': F['method']},
                                   {'href': f'{P}/privacy/', 'label': F['privacy']}, {'href': f'{P}/request/', 'label': F['request']}]},
    ]


def service_pages(titles, sitemap):
    """Шаг 6: 6 гайдов соцсетей + хаб гайдов, /extension/, /about/, /methodology/, /privacy/, /request/."""
    import datetime as dt
    today = dt.date.today()
    email = FACTS['email']
    CHR = FACTS['links']['chrome'] + '?utm_source=mutespoilers&utm_medium=extension'
    FFX = FACTS['links']['firefox'] + '?utm_source=mutespoilers&utm_medium=extension'
    for lang in C['wave0']:
        P, U, Hs = prefix(lang), GUIDES['ui'][lang], HUBS[lang]
        home_label = C['home'].get(lang, 'Home')
        def emit(slug, tpl, h1, title, desc, parent=None, **kw):
            path = lambda l, slug=slug: f'{prefix(l)}/{slug}/'
            ctx = {**common(lang, C['wave0'], path), 'main_class': 'ms-pg', 'home_label': home_label}
            ctx.update(kw)
            html = env.get_template(tpl).render(**ctx, title=title, description=desc, canonical=BASE + path(lang), h1=h1, parent=parent)
            write(path(lang), html); sitemap.setdefault(lang, []).append((BASE + path(lang), None))
        # ближайшие тайтлы для блока «готовые списки»
        live = [t for t in titles if lang in title_langs(t)]
        def near(t):
            d = t['release'].get('date')
            return abs((dt.date.fromisoformat(d) - today).days) if d else 9999
        lists = [{'href': f"{P}/{t['media']}/{t['slug']}/", 'label': t['names'].get(lang) or t['names']['en']} for t in sorted(live, key=near)[:6]]
        glinks = [{'href': f'{P}/guides/{k}/', 'label': g['name']} for k, g in GUIDES['guides'].items()]
        side_btn = {'href': f'{P}/extension/', 'label': U['ext_btn']}
        for k, g in GUIDES['guides'].items():
            G = g[lang]
            emit(f'guides/{k}', 'page.html', G['h1'], G['h1'], G['lead'], parent={'href': f'{P}/guides/', 'label': U['hub_h']},
                 lead=G['lead'], steps=G['steps'], steps_h=U['steps'], notes=G['notes'], notes_h=U['notes'], blocks=[],
                 side_h=U['lists'], side_links=lists, side_note=U['ext'], side_btn=side_btn, buttons=[], small='')
        emit('guides', 'page.html', U['hub_h'], U['hub_h'], U['hub_p'], lead=U['hub_p'], steps=[], notes=[], blocks=[],
             buttons=[{'cls': 'ms-ghost', 'href': l['href'], 'label': l['label']} for l in glinks], small='',
             side_h=U['lists'], side_links=lists, side_note=U['ext'], side_btn=side_btn)
        E = PAGES['extension'][lang]
        emit('extension', 'page.html', E['h1'], E['title'], E['lead'], lead=E['lead'], steps=[], notes=[], blocks=E['blocks'],
             buttons=[{'cls': 'ms-btn', 'href': CHR, 'label': E['chrome']}, {'cls': 'ms-ghost', 'href': FFX, 'label': E['firefox']},
                      {'cls': 'ms-ghost', 'href': FACTS['links']['source'], 'label': E['source']}],
             small=E['phone'], side_h=U['all_guides'], side_links=glinks, side_note='', side_btn=None,
             jsonld=json.dumps({'@context': 'https://schema.org', '@type': 'SoftwareApplication', 'name': 'Pure Spoiler Blocker',
                                'applicationCategory': 'BrowserApplication', 'operatingSystem': 'Chrome, Firefox',
                                'offers': {'@type': 'Offer', 'price': '0', 'priceCurrency': 'USD'}, 'url': BASE + f'{P}/extension/'}, ensure_ascii=False))
        for slug in ('about', 'methodology', 'privacy'):
            X = PAGES[slug][lang]
            emit(slug, 'page.html', X['h1'], X['title'], X['lead'], lead=X['lead'], steps=[], notes=[],
                 blocks=[(h, t.replace('{email}', email)) for h, t in X['blocks']], buttons=[], small='',
                 side_h=PAGES['footer'][lang]['proj'], side_links=[l for l in footer(lang)[2]['links'] if not l['href'].endswith(f'/{slug}/')], side_note='', side_btn=None)
        Rq = {k: (v.replace('{email}', email) if isinstance(v, str) else v) for k, v in PAGES['request'][lang].items()}
        emit('request', 'request.html', Rq['h1'], Rq['title'], Rq['lead'], lead=Rq['lead'], steps=[], notes=[], blocks=[], buttons=[], small='',
             R=Rq, turnstile_key=C.get('turnstile_sitekey', ''), side_h=PAGES['footer'][lang]['proj'],
             side_links=[l for l in footer(lang)[2]['links'] if not l['href'].endswith('/request/')], side_note='', side_btn=None)


def common(lang, page_langs, path_of):
    hl = hub_lang(lang)
    return dict(
        lang_attr=lang,
        home_href=prefix(hl) + '/',
        media_nav=[{'href': f'{prefix(hl)}/{m}/', 'label': C['media'][m].get(hl, C['media'][m]['en'])} for m in C['media']]
                  + [{'href': f'{prefix(hl)}/calendar/', 'label': HUBS[hl]['cal_nav']}],
        footer_langs=[{'code': l, 'label': LABELS.get(l, l), 'href': path_of(l)} for l in page_langs],
        hreflang=[{'code': l, 'href': BASE + path_of(l)} for l in page_langs] if len(page_langs) > 1 else [],
        x_default=BASE + path_of('en'),
        foot=footer(hl), lang_hub=hl,
        noindex=False,
        copied=S(lang).get('copied', 'Copied'), og_image=BASE + '/img/og.png', nav_label='Sections', main_class='', jsonld='',
    )


def thin(t):
    """Своего текста нет (только общий шаблон по типу): Google такие страницы считает слабыми. Решение 21.11: noindex, follow."""
    return not t['texts'].get('en', {}).get('lead')


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


def hubs(titles, sitemap):
    """Шаг 4: медиа-хабы, «Скоро выйдет», «Уже вышло», календарь. Только языки Волны 0."""
    import datetime as dt
    today = dt.date.today()
    for lang in C['wave0']:
        s, Hs = S(lang), HUBS[lang]
        live = [t for t in titles if lang in title_langs(t)]
        def card(t):
            d = t['release'].get('date')
            first = t['release'].get('first_anywhere')
            dd = dt.date.fromisoformat(min(d, first) if (d and first) else d) if d else None
            tag = titlepage.fmt(s, dd, False, True).upper() if dd else Hs['ongoing']
            return {'href': f"{prefix(lang)}/{t['media']}/{t['slug']}/", 'name': t['names'].get(lang) or t['names']['en'],
                    'kind': t['legacy'].get('kind', 'film'), 'tag': tag, 'confirmed': t['release'].get('status') == 'confirmed', 'd': dd}
        cards = [card(t) for t in live]
        up = sorted((c for c in cards if c['d'] and c['d'] >= today), key=lambda c: c['d'])
        out = sorted((c for c in cards if c['d'] and today - dt.timedelta(days=30) <= c['d'] < today), key=lambda c: c['d'], reverse=True)
        links = lambda: [{'href': f'{prefix(lang)}/upcoming/', 'label': Hs['see_up']}, {'href': f'{prefix(lang)}/out-now/', 'label': Hs['see_out']},
                         {'href': f'{prefix(lang)}/calendar/', 'label': Hs['cal_nav']}]
        base_ctx = lambda path: {**common(lang, C['wave0'], path), 'main_class': 'ms-hub', 'click': s['click'], 'none': Hs['none'],
                                 'home_label': C['home'].get(lang, 'Home')}
        def page(slug, h1, intro, groups, tpl='hub.html', **kw):
            path = lambda l, slug=slug: f'{prefix(l)}/{slug}/'
            html = env.get_template(tpl).render(**base_ctx(path), title=f'{h1} · mutespoilers', description=intro, canonical=BASE + path(lang),
                                                h1=h1, intro=intro, groups=groups, side_links=links(), **kw)
            write(path(lang), html); sitemap.setdefault(lang, []).append((BASE + path(lang), None))
        for m in C['media']:
            mine = [c for c, t in zip(cards, live) if t['media'] == m]
            soon = sorted((c for c in mine if c['d'] and c['d'] >= today), key=lambda c: c['d'])
            rest = sorted((c for c in mine if c not in soon), key=lambda c: (c['d'] is None, -(c['d'].toordinal() if c['d'] else 0), c['name'].lower()))
            groups = ([{'h': Hs['see_up'], 'cards': soon}] if soon else []) + [{'h': Hs[m + '_h'] if soon else '', 'cards': rest}]
            page(m, Hs[m + '_h'], Hs[m + '_p'], groups)
        page('upcoming', Hs['up_h'], Hs['up_p'], [{'h': '', 'cards': up}])
        page('out-now', Hs['out_h'], Hs['out_p'], [{'h': '', 'cards': out}])
        # календарь: по месяцам, от «спойлеры с» (первый показ в мире раньше США)
        months = {}
        for c, t in zip(cards, live):
            if c['d'] and c['d'] >= today - dt.timedelta(days=7):
                months.setdefault((c['d'].year, c['d'].month), []).append({**c, 'date': titlepage.fmt(s, c['d']), 'media': HUBS[lang][t['media'] + '_h']})
        ml = [{'label': f"{s['months'][m - 1]} {y}", 'rows': sorted(r, key=lambda x: x['d'])} for (y, m), r in sorted(months.items())]
        page('calendar', Hs['cal_h'], Hs['cal_p'], [], tpl='calendar.html', months=ml, unconf=Hs['unconf'])
        home_page(lang, s, Hs, live, cards, today, titles)
        sitemap.setdefault(lang, []).append((BASE + prefix(lang) + '/', None))


def home_page(lang, s, Hs, live, cards, today, titles):
    """Шаг 5: главная. Фиксированный бюджет: 6 карточек радара, ≤8 строк календаря, 4 плитки, ~45 ссылок."""
    import datetime as dt
    T, P = Hs['home'], prefix(lang)
    vocab_n = len(VOCAB.get(lang, VOCAB['en']))
    def words_n(t):
        w = t['words'][lang]; f = w.get('basic', [])
        return min(len(f), 3) * vocab_n + len(f) + len(w.get('balanced', []))
    def win(c):
        d = c['d']
        if d is None: return ''
        if d <= today: return T['frm'].format(d=titlepage.fmt(s, d - dt.timedelta(days=4)))
        return T['frm'].format(d=titlepage.fmt(s, d - dt.timedelta(days=4)))
    # сливы (tools/leak-watch.mjs → data/leaks.json): тайтл со свежим сливом (≤7 дней) идёт первым с меткой T['leak']
    lf = R / 'data/leaks.json'
    leaks = json.loads(lf.read_text(encoding='utf-8')) if lf.exists() else {}
    hot = {k for k, v in leaks.items() if 0 <= (today - dt.date.fromisoformat(v['date'])).days <= 7}
    leaked = [(c, t) for c, t in zip(cards, live) if t['slug'] in hot][:3]
    pairs = [(c, t) for c, t in zip(cards, live) if t['slug'] not in hot and c['d'] and -21 <= (c['d'] - today).days <= 45]
    pairs.sort(key=lambda p: abs((p[0]['d'] - today).days))
    radar = []
    for c, t in leaked + pairs[:6 - len(leaked)]:
        n = (c['d'] - today).days if c['d'] else 0
        trig = T['leak'] if t['slug'] in hot else (T['out'] if n < 0 else (T['today'] if n == 0 else T['in_d'].format(n=n)))
        radar.append({**c, 'media': Hs[t['media'] + '_h'], 'trigger': trig, 'window': win(c), 'words': T['words'].format(n=words_n(t)),
                      'hot': t['slug'] in hot})
    radar.sort(key=lambda r: (not r['hot'], r['d'] or today))
    fmap = {'games': 'g', 'movies': 'mt', 'tv': 'mt', 'anime': 'an'}
    cal = sorted(({**c, 'date': titlepage.fmt(s, c['d']), 'media': Hs[t['media'] + '_h'], 'f': fmap[t['media']]}
                  for c, t in zip(cards, live) if c['d'] and 0 <= (c['d'] - today).days <= 30), key=lambda r: r['d'])[:8]
    index = []
    for c, t in zip(cards, live):
        al = set(t['names'].values()) | {t['slug'].replace('-', ' ')}
        for w in t['words'].values(): al |= set(w.get('basic', []))
        index.append({'n': c['name'], 'a': sorted(al), 'u': c['href'], 'm': Hs[t['media'] + '_h'], 'd': titlepage.fmt(s, c['d'], False, True) if c['d'] else ''})
    chips = [{'href': r['href'], 'name': r['name']} for r in sorted(radar, key=lambda r: len(r['name'])) if len(r['name']) <= 22][:5]
    media = [{'k': m, 'href': f'{P}/{m}/', 'label': Hs[m + '_h'], 'count': sum(1 for t in live if t['media'] == m)} for m in C['media']]
    conf = sum(1 for t in live if t['release'].get('status') == 'confirmed')
    pulse = T['pulse'].format(n=len(live), c=conf, d=titlepage.fmt(s, today, False, True))
    guides = [{'href': f'{P}/guides/{k}/', 'label': v} for k, v in (('x', 'X'), ('tiktok', 'TikTok'), ('instagram', 'Instagram'), ('threads', 'Threads'), ('bluesky', 'Bluesky'), ('youtube', 'YouTube'))]
    home = lambda l: f'{prefix(l)}/'
    ctx = {**common(lang, C['wave0'], home), 'main_class': 'ms-home'}
    html = env.get_template('home.html').render(**ctx, title=T['title'], description=T['desc'], canonical=BASE + home(lang), T=T,
        index=json.dumps(index, ensure_ascii=False).replace('</', '<\\/'), chips=chips, radar=radar, cal=cal, media=media, pulse=pulse, guides=guides,
        filters=[{'k': 'all', 'label': T['all']}, {'k': 'g', 'label': T['g']}, {'k': 'mt', 'label': T['mt']}, {'k': 'an', 'label': T['an']}],
        req_href=f'{P}/request/', ext_href=f'{P}/extension/', guides_href=f'{P}/guides/', cal_href=f'{P}/calendar/')
    write(home(lang), html)


def main():
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir()
    for f in ('style.css', 'title.css', 'title.js'):          # утверждённый вид A: общие файлы старого сайта
        shutil.copy(R / f, DIST / f)
    for f in (SITE / 'static').iterdir():
        shutil.copy(f, DIST / f.name)
    shutil.copytree(R / 'fonts', DIST / 'fonts', ignore=shutil.ignore_patterns('*.txt'))
    (DIST / 'img').mkdir(); shutil.copy(R / 'img/og.png', DIST / 'img/og.png')
    titles = [json.loads(p.read_text(encoding='utf-8')) for p in sorted((R / 'data/titles').glob('*.json'))]
    print(f'списков для модераторов и uBlock: {exports.build(titles, DIST, BASE)}')
    sitemap = {}          # lang -> [(loc, lastmod)]
    count = 0
    for t in titles:
        langs = title_langs(t)
        if not langs:
            print('пропуск (нет EN):', t['slug']); continue
        path_of = lambda l, t=t: f"{prefix(l)}/{t['media']}/{t['slug']}/"
        for lang in langs:
            s, hl = S(lang), hub_lang(lang)
            name = t['names'].get(lang) or t['names']['en']
            main_html, info = titlepage.render_main(t, lang, s, titles, lambda o, l: f"{prefix(l if l in title_langs(o) else 'en')}/{o['media']}/{o['slug']}/")
            crumbs = {'home': prefix(hl) + '/', 'home_label': C['home'].get(hl, 'Home'),
                      'media': f"{prefix(hl)}/{t['media']}/", 'media_label': C['media'][t['media']].get(hl, C['media'][t['media']]['en'])}
            ctx = common(lang, langs, path_of); ctx['main_class'] = 't-wrap ms-title'
            ctx['noindex'] = thin(t)   # R04: только шаблонный текст -> страница живёт для людей, но не в индексе
            ctx['jsonld'] = titlepage.jsonld(t, lang, info, BASE + path_of(lang),
                                             [(crumbs['home_label'], crumbs['home']), (crumbs['media_label'], crumbs['media']), (name, path_of(lang))], BASE)
            html = env.get_template('title.html').render(**ctx, title=info['title'], description=info['desc'], canonical=BASE + path_of(lang),
                                                         name=name, main_html=main_html, crumbs=crumbs)
            write(path_of(lang), html)
            if not thin(t):
                sitemap.setdefault(lang, []).append((BASE + path_of(lang), t.get('modified') or t.get('published')))
            count += 1

    hubs(titles, sitemap)
    service_pages(titles, sitemap)

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
    # 301 со всех старых адресов github.io (шаг 7)
    import redirects
    n301 = redirects.write(DIST, redirects.build(titles, title_langs, prefix, C['wave0']))
    print('правил 301:', n301)
    total = sum(len(v) for v in sitemap.values())
    print(f'страниц тайтлов: {count}; всего адресов в sitemap: {total}; языки: ' +
          ', '.join(f'{l} {len(v)}' for l, v in sitemap.items()))
    return 0


if __name__ == '__main__':
    sys.exit(main())
