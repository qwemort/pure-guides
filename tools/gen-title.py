#!/usr/bin/env python3
"""Страницы тайтлов: одна страница на тайтл, 13 языков.
  python3 tools/gen-title.py        собрать все тайтлы из data/titles.json
Пишет <page>.html (английская) и <page>.<язык>.html, добавляет их в sitemap.xml.
Данные:
  data/titles.json            дата релиза, адрес страницы (даты сверяет Actions title-dates)
  data/title-words.json       слова для мьюта, на всех языках поровну
  i18n/title.<язык>.json      общие тексты страницы (переводятся один раз)
  i18n/titles/<тайтл>.json    свои тексты тайтла по языкам; нет языка — нет страницы на этом языке
Шапку, подвал, блок для телефонов, ссылки на магазины и счётчик ставит потом build.py."""
import datetime as dt, html, json, pathlib, re

R = pathlib.Path(__file__).resolve().parent.parent
BASE = 'https://qwemort.github.io/pure-guides/'
TD = json.loads((R / 'data/titles.json').read_text(encoding='utf-8'))
W = json.loads((R / 'data/title-words.json').read_text(encoding='utf-8'))
LANGS = [l['code'] for l in W['langs']]
CH = 'https://chromewebstore.google.com/detail/aloilpojkoblacapdlknacjiljgjibng?utm_source=pureguides&amp;utm_medium=title-'
FF = 'https://addons.mozilla.org/firefox/addon/pure-spoiler-shield/?utm_source=pureguides&amp;utm_medium=title-'
esc = lambda s: html.escape(s, quote=True)
S_ = {l: json.loads((R / f'i18n/title.{l}.json').read_text(encoding='utf-8')) for l in LANGS}


def fname(page, lang): return f'{page}.html' if lang == 'en' else f'{page}.{lang.lower()}.html'


def tpath(T, lang):  # свой адрес у языка (старые адреса, уже в выдаче), иначе <page>.<язык>.html
    return T.get('paths', {}).get(lang) or fname(T['page'], lang)


def fmt(S, d, long=False, year=False):
    m = (S['months'] if long else S['months_s'])[d.month - 1]
    return S['date_l' if year else 'date_s'].format(d=d.day, m=m, y=d.year)


def chips(ws): return '<div class="chips">' + ''.join(f'<button class="chip" type="button">{esc(w)}</button>' for w in ws) + '</div>'


def page(tid, lang, U, langs_here):
    T, S, u = TD['titles'][tid], S_[lang], U[lang]
    D = W['titles'][tid]
    d = dt.date.fromisoformat(T['release'])
    name = u['name']
    tok = lambda x: x.replace('{D}', fmt(S, d, True, True)).replace('{D0}', fmt(S, d, True))
    full = fmt(S, d, False, True)
    t0, t1, span = d - dt.timedelta(days=17), d + dt.timedelta(days=28), 45
    h1 = S['h1'].format(name=name)
    h1_html = re.sub('([«„《]?)\x00([»”》]?)', lambda m: '<span class="nowrap">' + m.group(1) + esc(name) + m.group(2) + '</span>', esc(S['h1'].format(name='\x00')))
    cover = re.sub(r'\s?:\s', ':<br>', esc(name), count=1)

    def panel(code):
        core = [f'{f} {w}' for f in D['forms'][code] for w in W['vocab'][code]]
        strict = D['forms'][code] + D['extra'][code]
        def grp(title, sub, ws, btn, cls='', ghost=False):
            return f'<div class="t-group{cls}"><h3>{title}</h3><p class="muted">{sub}</p>{chips(ws)}<button class="copyall{" ghost" if ghost else ""}" type="button">{btn}</button></div>'
        nm = f'<details class="t-group"><summary><b>{S["names_h"]}</b> <span class="muted">{S["names_sub"]}</span></summary>{chips(D["names"][code])}<button class="copyall ghost" type="button">{S["copy_names"]}</button></details>'
        return f'<div class="t-lang" data-lang="{code}" lang="{code}"{"" if code == lang else " hidden"}><div class="t-groups">{grp(S["core_h"], S["core_sub"], core, S["copy_core"], " wide")}{grp(S["strict_h"], S["strict_sub"], strict, S["copy_strict"], "", True)}{nm}</div></div>'

    cur = next(l['label'] for l in W['langs'] if l['code'] == lang)
    switch = (f'<div class="t-langbar"><span class="muted">{S["words_in"]}</span><div class="t-lsel"><button class="t-lbtn" type="button" aria-haspopup="true" aria-expanded="false"><span class="t-lcur">{cur}</span></button><div class="t-lmenu" hidden>'
              + ''.join(f'<button type="button" data-lang="{l["code"]}"{" aria-current=true" if l["code"] == lang else ""}>{l["label"]}</button>' for l in W['langs'])
              + f'</div></div><span class="muted t-lnote">{S["same_size"]}</span></div>')
    words = switch + ''.join(panel(l['code']) for l in W['langs'])
    faq = [(tok(q), tok(a)) for q, a in u['faq']]
    faq_html = ''.join(f'<details><summary>{esc(q)}</summary><p>{esc(a)}</p></details>' for q, a in faq)

    rel = []   # «ещё скоро»: другие тайтлы (на этом языке, если есть) и доп. страницы
    for oid, o in TD['titles'].items():
        if oid == tid or o['release'] < dt.date.today().isoformat(): continue   # вышедшие не «скоро»
        on = json.loads((R / f'i18n/titles/{oid}.json').read_text(encoding='utf-8'))
        ol = lang if lang in on else 'en'
        rel.append((tpath(o, ol), on[ol]['name'], fmt(S, dt.date.fromisoformat(o['release']))))
    for o in TD.get('extra', {}).values():
        rel.append((o['page'] + '.html', o['name'], fmt(S, dt.date.fromisoformat(o['release'])) + (', ' + o['note'] if o.get('note') else '')))
    rel_html = ''.join(f'<a href="{h}">{esc(n)} · {esc(x)}</a>' for h, n, x in rel)

    url = BASE + tpath(T, lang)
    alts = ''.join(f'<link rel="alternate" hreflang="{l}" href="{BASE + tpath(T, l)}">\n' for l in langs_here) + f'<link rel="alternate" hreflang="x-default" href="{BASE + tpath(T, "en")}">'
    ttl = u.get('title', h1)
    secs = u.get('sections', [])
    sec_html = ''.join(f'<section id="{x["id"]}"><h2>{esc(x["h"])}</h2>{tok(x["html"])}</section>' for x in secs)
    sec_nav = ''.join(f'<a href="#{x["id"]}">{esc(x["nav"])}</a>' for x in secs)
    desc = tok(u['desc'])
    ld = [{'@context': 'https://schema.org', '@type': 'Article', 'headline': h1, 'description': desc, 'datePublished': T.get('published', T['release']),
           'dateModified': T.get('modified', T.get('published', T['release'])), 'inLanguage': lang, 'image': BASE + 'img/og.png', 'author': {'@type': 'Organization', 'name': 'Pure guides'}, 'mainEntityOfPage': url},
          {'@context': 'https://schema.org', '@type': 'FAQPage', 'inLanguage': lang, 'mainEntity': [{'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in faq]}]
    ldj = ''.join(f'<script type="application/ld+json">{json.dumps(x, ensure_ascii=False)}</script>\n' for x in ld)
    return f'''<!doctype html>
<html lang="{lang}" data-copied="{esc(S["copied"])}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(ttl)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{url}">
{alts}
<meta property="og:type" content="article">
<meta property="og:site_name" content="Pure guides">
<meta property="og:title" content="{esc(ttl)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{BASE}img/og.png">
<link rel="stylesheet" href="style.css">
<link rel="stylesheet" href="title.css">
{ldj}</head>
<body>
<main class="t-wrap">
<div class="t-head">
 <div>
  <p class="t-kicker">{u.get('kicker', S['kicker_film']).format(date=full.upper())}</p>
  <h1>{h1_html}</h1>
  <p class="t-lead">{u['lead']}</p>
 </div>
 <aside class="t-side">
  <div class="cv cv-{T.get('kind', 'film')}"><div class="cv-tag"><i></i>{u.get('cover_tag', S['cover_tag_film']).format(date=full.upper())}</div><div class="cv-h">{cover}</div><div class="cv-line">{esc(u['cover_line'])} <span class="cv-bar">{S['click']}</span></div></div>
  <div class="t-date"><dl>
   <dt>{S['l_release']}</dt><dd>{full}</dd>
   <dt>{S['l_from']}</dt><dd>~{fmt(S, d - dt.timedelta(days=4))} <span class="muted" style="font-weight:400">{S['l_approx']}</span></dd>
   <dt>{S['l_keep']}</dt><dd>{esc(u.get('keep_val', S['keep_val']))}</dd></dl>
   <div class="t-bar"><span style="left:{round(13 / span * 100)}%;width:{round(18 / span * 100)}%"></span><i style="left:{round(17 / span * 100)}%"></i></div>
   <div class="t-scale"><span>{fmt(S, t0)}</span><span>{fmt(S, d)}</span><span>{fmt(S, t1)}</span></div>
  </div>
 </aside>
</div>
<div class="t-body">
 <nav class="t-toc" aria-label="{esc(S['on_this_page'].capitalize())}"><p>{S['on_this_page']}</p><a href="#why">{S['nav_why']}</a><a href="#words">{S['nav_words']}</a><a href="#where">{S['nav_where']}</a>{sec_nav}<a href="#miss">{S['nav_miss']}</a><a href="#faq">{S['nav_faq']}</a></nav>
 <div class="t-main">
  <section id="why"><h2>{esc(u['why_h'])}</h2>{tok(u['why'])}</section>
  <section id="words"><h2>{S['words_h']}</h2><p>{S['words_intro']}</p>
   {words}
  </section>
  <section id="where"><h2>{S['where_h']}</h2>
   <div class="t-plat">
    <div><b>X</b>{S['plat_x']}</div>
    <div><b>Threads, Instagram</b>{S['plat_threads']}</div>
    <div><b>TikTok</b>{S['plat_tiktok']}</div>
    <div class="no"><b data-no="{esc(S['no_mute'])}">YouTube</b>{S['plat_youtube']}</div>
    <div class="no"><b data-no="{esc(S['no_mute'])}">Reddit</b>{S['plat_reddit']}</div>
    <div class="no"><b data-no="{esc(S['no_mute'])}">Discord</b>{S['plat_discord']}</div>
   </div></section>
  {sec_html}
  <section id="miss"><h2>{S['miss_h']}</h2>
   <div class="t-miss">
    <div><b>{S['miss1_b']}</b>{S['miss1']}</div>
    <div><b>{S['miss2_b']}</b>{esc(u['unknown'])}</div>
    <div><b>{S['miss3_b']}</b>{S['miss3']}</div>
   </div></section>
  <section id="faq"><h2>{S['faq_h']}</h2><div class="t-faq">{faq_html}</div></section>
 </div>
 <aside class="t-rail">
  <div class="t-ext"><h3>{S['ext_h']}</h3>
   <div class="t-demo">{esc(u['demo'])}<span class="veil">{S['ext_veil'].format(name=esc(name))}</span></div>
   <p>{S['ext_p'].format(name=esc(name))}</p>
   <a class="cta" href="{CH}{tid}">{S['cta']}</a>
   <small>{S['ext_small'].replace('<a>', f'<a href="{FF}{tid}">')}</small></div>
  <div class="t-rel"><p class="t-kicker">{S['also_h']}</p>{rel_html}</div>
 </aside>
</div>
</main>
<script src="title.js"></script>
</body>
</html>
'''


sm_p = R / 'sitemap.xml'; sm = sm_p.read_text(encoding='utf-8'); n = 0
for tid, T in TD['titles'].items():
    U = json.loads((R / f'i18n/titles/{tid}.json').read_text(encoding='utf-8'))
    here = [l for l in LANGS if l in U]
    for l in here:
        f = tpath(T, l)
        (R / f).write_text(page(tid, l, U, here), encoding='utf-8'); n += 1
        loc = BASE + f
        if f'<loc>{loc}</loc>' not in sm:
            sm = sm.replace('</urlset>', f'<url><loc>{loc}</loc><lastmod>{dt.date.today().isoformat()}</lastmod></url>\n</urlset>')
# старые адреса тайтла (block/, mute-list/) перенаправляем на страницу тайтла и убираем из sitemap
STUB = '''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>{name}: moved</title>
<link rel="canonical" href="{url}">
<meta http-equiv="refresh" content="0; url=../{page}">
<script>location.replace('../{page}'+location.hash)</script>
</head><body><p>This page has moved: <a href="../{page}">{name}</a>.</p></body></html>
'''
for tid, T in TD['titles'].items():
    if T.get('keep_old'): continue   # у тайтла свои живые страницы block/ (например GTA 6), не перенаправляем
    pg = fname(T['page'], 'en'); nm = json.loads((R / f'i18n/titles/{tid}.json').read_text(encoding='utf-8'))['en']['name']
    for d in ('block', 'mute-list'):
        f = R / d / f'{tid}.html'
        if f.exists() or d == 'block':
            f.write_text(STUB.format(name=esc(nm), url=BASE + pg, page=pg), encoding='utf-8')
        sm = re.sub(rf'<url><loc>{re.escape(BASE + d + "/" + tid + ".html")}</loc>[^\n]*</url>\n?', '', sm)
        idx = R / d / 'index.html'
        if idx.exists():
            t = idx.read_text(encoding='utf-8'); t2 = t.replace(f'href="{tid}.html"', f'href="../{pg}"')
            if t2 != t: idx.write_text(t2, encoding='utf-8')
home = R / 'index.html'; h = home.read_text(encoding='utf-8'); h2 = h
for tid, T in TD['titles'].items(): h2 = h2.replace(f'href="block/{tid}.html"', f'href="{fname(T["page"], "en")}"')
if h2 != h: home.write_text(h2, encoding='utf-8')
sm_p.write_text(sm, encoding='utf-8')
print(f'gen-title: {n} pages')
