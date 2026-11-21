"""Страница тайтла нового сайта (шаг 3). Вид = утверждённый дизайн A (style.css + title.css, 18.11),
плюс модули MVP: BLUF, таблица дат со статусом, блок соцсетей (X очередью, строкой, корни), сверка, соседи, @graph.
Тексты: i18n/title.<язык>.json (общие), i18n/ms-title.json (новые строки), data/titles/<slug>.json (свои)."""
import datetime as dt, json, re
from html import escape as _e
from pathlib import Path

R = Path(__file__).resolve().parent.parent
MS = json.loads((R / 'i18n/ms-title.json').read_text(encoding='utf-8'))['strings']
TYPE = {'games': 'VideoGame', 'movies': 'Movie', 'tv': 'TVSeries', 'anime': 'TVSeries'}
CH = 'https://chromewebstore.google.com/detail/aloilpojkoblacapdlknacjiljgjibng?utm_source=mutespoilers&utm_medium=title&utm_campaign='
FF = 'https://addons.mozilla.org/firefox/addon/pure-spoiler-shield/?utm_source=mutespoilers&utm_medium=title&utm_campaign='


def esc(s): return _e(str(s), quote=True)


def fmt(S, d, long=False, year=False):
    m = (S['months'] if long else S['months_s'])[d.month - 1]
    return S['date_l' if year else 'date_s'].format(d=d.day, m=m, y=d.year)


def chips(ws, cls='chip'):
    return '<div class="chips">' + ''.join(f'<button class="{cls}" type="button">{esc(w)}</button>' for w in ws) + '</div>'


def gen_texts(t, lang, S, name):
    """Общие тексты по типу + свои тексты тайтла (свои важнее). Как в старом gen-title.py."""
    L = t['legacy']
    kind = L.get('tmpl') or {'movie': 'film'}.get(L.get('kind', 'film'), L.get('kind', 'film'))
    gen = json.loads(json.dumps(S['gen'][kind]).replace('{name}', name.replace('"', '\\"')))
    if not t['release'].get('date'):
        gen = {**gen, **{k[3:]: v for k, v in gen.items() if k.startswith('nd_')}}
    return kind, {**gen, **t['texts'][lang]}


def render_main(t, lang, S, titles, path_of_title, today=None):
    today = today or dt.date.today()
    M = MS.get(lang, MS['en'])
    name = t['names'].get(lang) or t['names']['en']
    kind, u = gen_texts(t, lang, S, name)
    rel = t['release']
    d = dt.date.fromisoformat(rel['date']) if rel.get('date') else None
    first = dt.date.fromisoformat(rel['first_anywhere']) if rel.get('first_anywhere') else None
    start = min(d, first) if d and first else d
    tok = (lambda x: x.replace('{D}', fmt(S, d, True, True)).replace('{D0}', fmt(S, d, True))) if d else (lambda x: x)
    full = fmt(S, d, False, True) if d else ''
    keep = u.get('keep_val', S['keep_season'] if t.get('season') and t['season'].get('every') else S['keep_val'])
    conf = rel.get('status') == 'confirmed'
    st = lambda ok: f'<span class="ms-st{" ok" if ok else ""}">{esc(M["st_conf"] if ok else M["st_est"])}</span>'

    # BLUF: свой лид + одно предложение из подтверждённых полей (без свободной генерации)
    if not d:
        bluf_tail = M['bluf_nd']
    elif today >= d:
        bluf_tail = M['bluf_out'].format(date=full, keep=keep)
    else:
        bluf_tail = M['bluf_soon'].format(date=full, **{'from': fmt(S, start - dt.timedelta(days=4)), 'keep': keep})

    # таблица дат (#release-timeline)
    rows = []
    if d:
        if first and first < d:
            rows.append((M['ev_first'], fmt(S, first, False, True), st(conf)))
            rows.append((M['ev_us'], full, st(conf)))
        else:
            rows.append((S['l_out'] if today >= d else S['l_release'], full, st(conf)))
        if today < d:
            rows.append((S['l_from'], '~' + fmt(S, start - dt.timedelta(days=4)), st(False)))
        else:
            rows.append((S['l_now'], S['now_val'], ''))
    else:
        rows.append((S['l_now'], S['nd_now_' + kind] if ('nd_now_' + kind) in S else S['now_val'], ''))
    rows.append((S['l_keep'], keep, ''))
    table = ('<table class="ms-dates"><thead><tr><th scope="col">' + esc(M['t_event']) + '</th><th scope="col">' + esc(M['t_date']) +
             '</th><th scope="col">' + esc(M['t_status']) + '</th></tr></thead><tbody>' +
             ''.join(f'<tr><th scope="row">{esc(a)}</th><td>{esc(b)}</td><td>{c}</td></tr>' for a, b, c in rows) + '</tbody></table>')
    bar = ''
    if d and not (today >= d and (today - d).days > 45):
        lo, hi = start - dt.timedelta(days=17), d + dt.timedelta(days=28)
        sp = (hi - lo).days
        pc = lambda x: round(min(max((x - lo).days, 0), sp) / sp * 100)
        a, b = start - dt.timedelta(days=4), d + dt.timedelta(days=14)
        mark = min(max(today, lo), hi) if today >= d else d
        bar = (f'<div class="t-bar" aria-hidden="true"><span style="left:{pc(a)}%;width:{max(pc(b) - pc(a), 2)}%"></span><i style="left:{pc(mark)}%"></i></div>'
               f'<div class="t-scale" aria-hidden="true"><span>{fmt(S, lo)}</span><span>{fmt(S, mark)}</span><span>{fmt(S, hi)}</span></div>')
    src = (f' · <a href="{esc(rel["source"])}" rel="nofollow">{esc(M["src"])}</a>' if rel.get('source') else '') if conf else ' · ' + esc(M['unconf'])
    checked = esc(M['checked'].format(date=fmt(S, dt.date.fromisoformat(t['checked']), False, True))) if t.get('checked') else ''

    # слова
    W = t['words'][lang]
    vocab = json.loads((R / 'data/vocab.json').read_text(encoding='utf-8'))['vocab'].get(lang)
    forms = W['basic'][:3]
    core = [f'{f} {w}' for f in forms for w in vocab]
    strict = W['basic']
    names = W.get('balanced', [])
    line = ', '.join((strict + core)[:25])
    roots = strict + [f'{forms[0]} {w}' for w in vocab][:8] if forms else strict

    def grp(title, sub, ws, btn, cls='', ghost=False):
        return f'<div class="t-group{cls}"><h3>{esc(title)}</h3><p class="muted">{esc(sub)}</p>{chips(ws)}<button class="copyall{" ghost" if ghost else ""}" type="button">{esc(btn)}</button></div>'
    nm = (f'<details class="t-group"><summary><b>{esc(S["names_h"])}</b> <span class="muted">{esc(S["names_sub"])}</span></summary>{chips(names)}'
          f'<button class="copyall ghost" type="button">{esc(S["copy_names"])}</button></details>') if names else ''
    words = f'<div class="t-groups">{grp(S["core_h"], S["core_sub"], core, S["copy_core"], " wide")}{grp(S["strict_h"], S["strict_sub"], strict, S["copy_strict"], "", True)}{nm}</div>'

    # блок соцсетей: вкладки, на телефоне идёт первым действием
    mail = 'mailto:?subject=' + re.sub(' ', '%20', 'Pure Spoiler Blocker') + '&body=' + (CH + t['slug']).replace('&', '%26').replace('?', '%3F').replace('=', '%3D')
    def queue(ws):
        return (f'<div class="ms-queue" data-key="ms:{t["slug"]}:{lang}" data-done="{esc(M["x_done"])}">' + chips(ws, 'chip q') +
                f'<p class="ms-qline"><span class="ms-count" aria-live="polite"></span> <button type="button" class="ms-reset">{esc(M["x_reset"])}</button></p></div>')
    one = lambda ws: f'<p class="ms-line">{esc(ws)}</p><button class="copyall ms-copyline" type="button" data-text="{esc(ws)}">{esc(M["copy_line"])}</button>'
    tabs = [
        ('x', 'X', f'<p>{S["plat_x"]}</p><p class="muted">{esc(M["x_how"])}</p>' + queue(core)),
        ('threads', 'Threads · Instagram', f'<p>{S["plat_threads"]}</p><p class="muted">{esc(M["line_how"])}</p>' + one(line)),
        ('tiktok', 'TikTok', f'<p>{S["plat_tiktok"]}</p><p class="muted">{esc(M["tt_how"])}</p>' + one(', '.join(roots))),
        ('bluesky', 'Bluesky', f'<p>{esc(M["bsky"])}</p><p class="muted">{esc(M["x_how"]).replace("X", "Bluesky")}</p>' + queue(strict + core[:8])),
        ('youtube', 'YouTube', f'<p><b data-no="{esc(S["no_mute"])}">YouTube</b> {S["plat_youtube"]}</p><p>{esc(M["yt_more"])}</p>'
                               f'<a class="ms-mail" href="{esc(mail)}">{esc(M["send_pc"])}</a>'),
    ]
    tabbar = '<div class="ms-tabs" role="tablist">' + ''.join(
        f'<button role="tab" type="button" id="tab-{k}" aria-controls="pane-{k}" aria-selected="{"true" if i == 0 else "false"}"{"" if i == 0 else " tabindex=\"-1\""}>{esc(lab)}</button>'
        for i, (k, lab, _) in enumerate(tabs)) + '</div>'
    panes = ''.join(f'<div role="tabpanel" id="pane-{k}" aria-labelledby="tab-{k}"{"" if i == 0 else " hidden"}>{body}</div>' for i, (k, _, body) in enumerate(tabs))
    where = (f'<section id="where" class="ms-where"><h2>{esc(S["where_h"])}</h2><p class="muted">{esc(M["where_sub"])}</p>{tabbar}{panes}'
             f'<p class="ms-also muted"><b>Reddit</b> {S["plat_reddit"]}</p></section>')

    # соседи (модуль 8): тот же тип, ближайшие даты
    def near(o):
        od = o['release'].get('date')
        return (0 if o['media'] == t['media'] else 1, abs((dt.date.fromisoformat(od) - d).days) if (od and d) else 9999, o['slug'])
    others = sorted((o for o in titles if o['slug'] != t['slug'] and lang in o['words'] and lang in o['texts']), key=near)[:5]
    rel_html = ''.join(f'<a href="{path_of_title(o, lang)}">{esc(o["names"].get(lang) or o["names"]["en"])}'
                       + (f' · {esc(fmt(S, dt.date.fromisoformat(o["release"]["date"])))}' if o['release'].get('date') else '') + '</a>' for o in others)

    faq = [(tok(q), tok(a)) for q, a in u.get('faq', [])]
    faq_html = ''.join(f'<details><summary>{esc(q)}</summary><p>{esc(a)}</p></details>' for q, a in faq)
    secs = u.get('sections', [])
    sec_html = ''.join(f'<section id="{x["id"]}"><h2>{esc(x["h"])}</h2>{tok(x["html"])}</section>' for x in secs)
    sec_nav = ''.join(f'<a href="#{x["id"]}">{esc(x["nav"])}</a>' for x in secs)
    h1 = S['h1'].format(name=name)
    h1_html = re.sub('([«„《]?)\x00([»”》]?)', lambda m: ('<span class="nowrap">' if len(name) <= 24 else '<span>') + m.group(1) + esc(name) + m.group(2) + '</span>', esc(S['h1'].format(name='\x00')))
    cover = re.sub(r'\s?:\s', ':<br>', esc(name), count=1)
    kicker = u.get('kicker', S['kicker_film']).format(date=full.upper()).rstrip(' ·')
    cover_tag = u.get('cover_tag', S['cover_tag_film']).format(date=full.upper()).rstrip(' ·')

    main = f'''
<div class="t-head">
 <div>
  <p class="t-kicker">{esc(kicker)}</p>
  <h1>{h1_html}</h1>
  <p class="t-lead ms-bluf">{u["lead"]} {esc(bluf_tail)}</p>
  <p class="ms-checked muted">{checked}{src}</p>
  {where}
 </div>
 <aside class="t-side">
  <div class="cv cv-{t["legacy"].get("kind", "film")}" aria-hidden="true"><div class="cv-tag"><i></i>{esc(cover_tag)}</div><div class="cv-h">{cover}</div><div class="cv-line">{esc(u["cover_line"])} <span class="cv-bar">{esc(S["click"])}</span></div></div>
  <div class="t-date" id="release-timeline">{table}{bar}</div>
 </aside>
</div>
<div class="t-body">
 <nav class="t-toc" aria-label="{esc(S["on_this_page"].capitalize())}"><p>{esc(S["on_this_page"])}</p><a href="#where">{esc(S["nav_where"])}</a><a href="#mute-words">{esc(S["nav_words"])}</a><a href="#why">{esc(S["nav_why"])}</a>{sec_nav}<a href="#miss">{esc(S["nav_miss"])}</a>{f'<a href="#faq">{esc(S["nav_faq"])}</a>' if faq else ''}</nav>
 <div class="t-main">
  <section id="mute-words"><h2>{esc(S["words_h"])}</h2><p>{S["words_intro"]}</p>
   {words}
   <button type="button" class="ms-share" data-ok="{esc(S["copied"])}">{esc(M["share"])}</button>
  </section>
  <section id="why"><h2>{esc(u["why_h"])}</h2>{tok(u["why"])}</section>
  {sec_html}
  <section id="miss"><h2>{esc(S["miss_h"])}</h2>
   <div class="t-miss">
    <div><b>{S["miss1_b"]}</b>{S["miss1"]}</div>
    <div><b>{S["miss2_b"]}</b>{esc(u["unknown"])}</div>
    <div><b>{S["miss3_b"]}</b>{S["miss3"]}</div>
   </div></section>
  {f'<section id="faq"><h2>{esc(S["faq_h"])}</h2><div class="t-faq">{faq_html}</div></section>' if faq else ''}
 </div>
 <aside class="t-rail">
  <div class="t-ext"><h3>{esc(S["ext_h"])}</h3>
   <div class="t-demo">{esc(u["demo"])}<span class="veil">{S["ext_veil"].format(name=esc(name))}</span></div>
   <p>{S["ext_p"].format(name=esc(name))}</p>
   <a class="cta" href="{CH}{t["slug"]}">{esc(S["cta"])}</a>
   <small>{S["ext_small"].replace("<a>", f'<a href="{FF}{t["slug"]}">')}</small></div>
  <div class="t-rel"><p class="t-kicker">{esc(S["also_h"])}</p>{rel_html}</div>
 </aside>
</div>'''
    # JSON-LD @graph: крошки + произведение (sameAs Wikidata) + страница. FAQPage только если вопросы свои у тайтла.
    return main, dict(h1=h1, desc=tok(u['desc']), title=u.get('title', h1), faq=faq if 'faq' in t['texts'][lang] else [],
                      name=name, release=(rel.get('date') if conf else None))


def jsonld(t, lang, info, url, crumbs, base):
    work = {'@type': TYPE[t['media']] if not (t['media'] == 'anime' and t['legacy'].get('kind') == 'film') else 'Movie',
            '@id': f'{base}/{t["media"]}/{t["slug"]}/#work', 'name': t['names'].get('en')}
    if t.get('wikidata'): work['sameAs'] = [f'https://www.wikidata.org/wiki/{t["wikidata"]}']
    if info['release']: work['datePublished'] = info['release']
    page = {'@type': 'WebPage', '@id': url + '#page', 'url': url, 'name': info['title'], 'description': info['desc'], 'inLanguage': lang,
            'about': {'@id': work['@id']}, 'datePublished': t.get('published'), 'dateModified': t.get('modified') or t.get('published'),
            'publisher': {'@type': 'Organization', 'name': 'mutespoilers', 'url': base + '/'}}
    bc = {'@type': 'BreadcrumbList', 'itemListElement': [{'@type': 'ListItem', 'position': i + 1, 'name': n, 'item': base + h} for i, (n, h) in enumerate(crumbs)]}
    g = [bc, work, page]
    if info['faq']:
        g.append({'@type': 'FAQPage', 'inLanguage': lang, 'mainEntity': [{'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in info['faq']]})
    return json.dumps({'@context': 'https://schema.org', '@graph': g}, ensure_ascii=False)
