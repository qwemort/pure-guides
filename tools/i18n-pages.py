#!/usr/bin/env python3
"""Переводы отдельных страниц (гайд GTA 6, block/gta6, демо) на 12 языков.
Источник перевода: i18n/pages/<группа>.<язык>.html. В начале файла блок <!--meta {...} -->
(slug, title, description, og_title, og_description, js), дальше текст <main> на языке страницы.
Страница собирается из английской (head, стили, скрипты), в неё ставится переведённый <main>,
title/description/canonical/JSON-LD; FAQPage в JSON-LD берётся из пар <h3>вопрос</h3><p>ответ</p> в <main>.
Для демо строки в скрипте меняются по словарю "js" (английская строка → перевод).
На всех версиях группы (вместе с английской и ручными uk/pl гайда) ставит hreflang, x-default на английскую,
переключатель языков внизу <main> и записи в sitemap.xml. Повторный запуск ничего не меняет.
Шапку, подвал, ссылки на магазины, блок для телефонов и счётчик потом ставит build.py, как на всех страницах.
  python3 tools/i18n-pages.py"""
import datetime, html, json, os, pathlib, re, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = 'https://qwemort.github.io/pure-guides/'
LANGS = {'en': 'English', 'de': 'Deutsch', 'es': 'Español', 'fr': 'Français', 'it': 'Italiano', 'ja': '日本語', 'ko': '한국어', 'pl': 'Polski',
         'pt-BR': 'Português', 'ru': 'Русский', 'tr': 'Türkçe', 'uk': 'Українська', 'zh-CN': '简体中文'}
GROUPS = {
    # 'guide' (гайд GTA 6) с 18.11.2026 собирает tools/gen-title.py, тайтл gta6
    'block-gta6': {'en': 'block/gta6.html', 'static': {}},
    'demo': {'en': 'demo/index.html', 'static': {}},
}

def die(msg): sys.exit('i18n-pages: ' + msg)
def url(rel): return BASE + (rel[:-len('index.html')] if rel.endswith('index.html') else rel)
def plain(x): return html.unescape(re.sub(r'<[^>]+>', '', x)).strip()

def load(group, lang):
    p = ROOT / 'i18n' / 'pages' / f'{group}.{lang}.html'
    if not p.exists(): return None
    t = p.read_text(encoding='utf-8')
    m = re.match(r'\s*<!--meta\s*(\{[\s\S]*?\})\s*-->\s*', t)
    if not m: die(f'{p.name}: нет блока <!--meta {{...}} -->')
    try: meta = json.loads(m.group(1))
    except ValueError as e: die(f'{p.name}: meta не JSON ({e})')
    for k in ('slug', 'title', 'description'):
        if not meta.get(k): die(f'{p.name}: нет «{k}» в meta')
    return meta, t[m.end():].strip('\n')

def ld_fix(obj, title, lang, u, faq):
    if isinstance(obj, list): return [ld_fix(x, title, lang, u, faq) for x in obj]
    if not isinstance(obj, dict): return obj
    o = {k: ld_fix(v, title, lang, u, faq) for k, v in obj.items()}
    if o.get('@type') == 'Article':
        o['headline'] = title; o['inLanguage'] = lang; o['mainEntityOfPage'] = u
    if o.get('@type') == 'FAQPage':
        if not faq: die(f'{u}: в английской странице есть FAQPage, а в переводе нет пар <h3>/<p>')
        o['mainEntity'] = [{'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in faq]
    return o

def attr(s, rx, val):
    return re.sub(rx, lambda m: m.group(1) + html.escape(val, quote=True) + '"', s, count=1)

def build(group, lang, base_rel, meta, body):
    s = (ROOT / base_rel).read_text(encoding='utf-8')
    rel = meta['slug']; u = url(rel)
    if os.path.dirname(rel) != os.path.dirname(base_rel):   # страница переезжает из block/ в корень: пути без ../
        if os.path.dirname(base_rel) and not os.path.dirname(rel): s = re.sub(r'((?<![\w-])(?:href|src)=")\.\./', r'\1', s)
        else: die(f'{rel}: неожиданная папка')
    s = s.replace('<html lang="en"', f'<html lang="{lang}"', 1)
    s = re.sub(r'<title>[^<]*</title>', lambda m: f'<title>{html.escape(meta["title"], quote=False)}</title>', s, count=1)
    s = attr(s, r'(<meta name="description" content=")[^"]*"', meta['description'])
    s = attr(s, r'(<meta property="og:title" content=")[^"]*"', meta.get('og_title') or meta['title'])
    s = attr(s, r'(<meta property="og:description" content=")[^"]*"', meta.get('og_description') or meta['description'])
    s = attr(s, r'(<link rel="canonical" href=")[^"]*"', u)
    s = attr(s, r'(<meta property="og:url" content=")[^"]*"', u)
    faq = [(plain(q), plain(a)) for q, a in re.findall(r'<h3>([\s\S]*?)</h3>\s*<p>([\s\S]*?)</p>', body)]
    def ld(m):
        compact = '\n' not in m.group(1).strip() and '", "' not in m.group(1)
        o = ld_fix(json.loads(m.group(1)), meta['title'], lang, u, faq)
        return m.group(0).replace(m.group(1), '\n' + json.dumps(o, ensure_ascii=False, separators=(',', ':') if compact else None) + '\n')
    s = re.sub(r'<script type="application/ld\+json">([\s\S]*?)</script>', ld, s)
    i, j = s.find('<main>'), s.find('</main>')
    if i < 0 or j < 0: die(f'{base_rel}: нет <main>')
    head, tail = s[:i], s[j:]
    for en, tr in (meta.get('js') or {}).items():
        if en not in tail: die(f'{group}.{lang}: в скрипте английской страницы нет строки «{en}»')
        tail = tail.replace(en, tr)
    return rel, head + '<main>\n' + body + '\n' + tail

def cluster(s, rel, members):
    links = ''.join(f'<link rel="alternate" hreflang="{l}" href="{url(r)}">\n' for l, r in members) + f'<link rel="alternate" hreflang="x-default" href="{url(members[0][1])}">\n'
    s = re.sub(r'<link rel="alternate" hreflang="[^"]+" href="[^"]*">\n?', '', s)
    s = re.sub(r'(<link rel="canonical" href="[^"]*">\n)', lambda m: m.group(1) + links, s, count=1)
    here = os.path.dirname(rel) or '.'
    items = []
    for l, r in members:
        if r == rel: items.append(f'<span lang="{l}">{LANGS[l]}</span>'); continue
        h = os.path.relpath(r, here).replace(os.sep, '/')
        if h.endswith('index.html'): h = h[:-len('index.html')] or './'
        items.append(f'<a href="{h}" hreflang="{l}" lang="{l}">{LANGS[l]}</a>')
    sw = '<!-- langs:start --><p class="muted langs">' + ' · '.join(items) + '</p><!-- langs:end -->\n'
    s = re.sub(r'<!-- langs:start -->[\s\S]*?<!-- langs:end -->\n?', '', s)
    j = s.rfind('</main>')
    return s[:j] + sw + s[j:]

def main():
    sm_p = ROOT / 'sitemap.xml'; sm = sm_p.read_text(encoding='utf-8'); n = 0; built = 0
    for group, g in GROUPS.items():
        members, pages = [('en', g['en'])], {}
        for lang in LANGS:
            if lang == 'en': continue
            if lang in g['static']: members.append((lang, g['static'][lang])); continue
            src = load(group, lang)
            if not src: continue
            rel, s = build(group, lang, g['en'], *src)
            members.append((lang, rel)); pages[rel] = s
        if len(members) == 1: continue
        for lang, rel in members:
            p = ROOT / rel
            s = pages.get(rel) or p.read_text(encoding='utf-8')
            s = cluster(s, rel, members)
            if not p.exists() or p.read_text(encoding='utf-8') != s:   # переводы пишутся каждый раз, build.py потом доводит их до того же вида
                p.write_text(s, encoding='utf-8'); n += 1
            if f'<loc>{url(rel)}</loc>' not in sm:
                sm = sm.replace('</urlset>', f'<url><loc>{url(rel)}</loc><lastmod>{datetime.date.today().isoformat()}</lastmod></url>\n</urlset>')
        built += len(pages)
    sm_p.write_text(sm, encoding='utf-8')
    print(f'i18n-pages: {built} переводов, обновлено файлов: {n}')

if __name__ == '__main__': main()
