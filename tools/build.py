#!/usr/bin/env python3
"""Одна команда сборки сайта pure-guides.
  python3 tools/build.py --words PATH        всё: генераторы тайтлов → факты → шапка/подвал → проверка
  python3 tools/build.py --no-generate       без генераторов (после данных ботов)
  python3 tools/build.py --no-check          без проверки (для ботов: проверка идёт отдельным Action site-check)
  python3 tools/build.py --only facts|chrome|check
Источники правды: data/facts.json (ссылки, версия, дата релиза), templates/*.html (шапка, подвал),
i18n/home.<язык>.json (тексты). Руками правятся только они. Повторный запуск безопасен."""
import argparse, html, json, os, pathlib, re, subprocess, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
ap = argparse.ArgumentParser()
ap.add_argument('--words', default=os.environ.get('WORDS'))
ap.add_argument('--no-generate', action='store_true'); ap.add_argument('--no-check', action='store_true')
ap.add_argument('--only', choices=['generate', 'facts', 'chrome', 'lang', 'check']); ap.add_argument('--lang', default='en')
A = ap.parse_args()
F = json.loads((ROOT / 'data/facts.json').read_text(encoding='utf-8'))
F['lists'] = len([f for f in (ROOT / 'block').glob('*.html') if f.name != 'index.html'])
T = json.loads((ROOT / f'i18n/home.{A.lang}.json').read_text(encoding='utf-8'))
LANGS = {'en': 'English', 'de': 'Deutsch', 'es': 'Español', 'fr': 'Français', 'it': 'Italiano', 'ja': '日本語', 'ko': '한국어', 'pl': 'Polski', 'pt-BR': 'Português', 'ru': 'Русский', 'tr': 'Türkçe', 'uk': 'Українська', 'zh-CN': '简体中文'}
LDIR = lambda l: '' if l == 'en' else l.lower()
HAVE = [l for l in LANGS if (ROOT / f'i18n/home.{l}.json').exists()]
SKIP = tuple(LDIR(l) for l in HAVE if l != 'en') + ('design', 'media', 'img', 'devto', 'queue', 'data', 'fonts', 'i18n', 'tools', 'templates', 'node_modules', '.git')
HREF = r'(?<![\w-])href="'

def pages():
    for f in sorted(ROOT.rglob('*.html')):
        rel = f.relative_to(ROOT)
        if rel.parts[0] in SKIP or len(rel.parts) > 2: continue
        s = f.read_text(encoding='utf-8')
        if '<main' in s and '<body' in s: yield f, rel, s

def link(name, medium=None):
    if name not in F['links']: sys.exit(f'build: нет ссылки «{name}» в data/facts.json')
    u = F['links'][name]
    return u + f'?utm_source=pureguides&amp;utm_medium={medium}' if medium and name in F['utm'] else u

def render(tpl, root, T=T, home=None):
    def rep(m):
        k, a, b = m.groups()
        if k == 'root': return root
        if k == 'home': return home or root or './'
        if k == 'link': return link(a, b)
        if k == 'fact': return html.escape(str(F[a]))
        if k == 't':
            if a not in T: sys.exit(f'build: нет ключа «{a}» в i18n/home.{A.lang}.json')
            return html.escape(T[a], quote=False)
    return re.sub(r'\{\{(root|home|link|fact|t)(?::([\w-]+))?(?::([\w-]+))?\}\}', rep, tpl)

def tag_anchors(s):
    """автометка: любая ссылка на магазин/репозиторий из facts получает data-href (ссылка потом всегда берётся из facts.json)"""
    def tag(m):
        tg = m.group(0)
        if 'data-href=' in tg: return tg
        hm = re.search(HREF + r'([^"]*)"', tg)
        if not hm: return tg
        u = hm.group(1)
        for name, base in F['links'].items():
            if u == base or u.startswith(base + '?'):
                q = re.search(r'utm_medium=([\w-]+)', u)
                return re.sub(r'^<a(\s)', lambda x: f'<a data-href="{name}{":" + q.group(1) if q else ""}"{x.group(1)}', tg, count=1)
        return tg
    return re.sub(r'<a\s[^>]*>', tag, s)

def step_generate():
    if not A.words or not pathlib.Path(A.words).exists():
        print('generate: words.js не найден, генераторы тайтлов пропущены'); return
    for g in ('gen-mutelists.mjs', 'gen-block.mjs'):
        subprocess.run(['node', str(ROOT / 'tools' / g), A.words], check=True, cwd=ROOT)
    F['lists'] = len([f for f in (ROOT / 'block').glob('*.html') if f.name != 'index.html'])

def step_facts():
    n = 0
    def setlink(m):
        tg = m.group(0); name, _, med = re.search(r'data-href="([^"]+)"', tg).group(1).partition(':')
        new = link(name, med or None)
        return re.sub(HREF + r'[^"]*"', lambda x: f'href="{new}"', tg, count=1) if re.search(HREF, tg) else re.sub(r'^<a(\s)', lambda x: f'<a href="{new}"{x.group(1)}', tg, count=1)
    def fact(m):
        if m.group(3) not in F: sys.exit(f'build: нет факта «{m.group(3)}»')
        return m.group(1) + str(F[m.group(3)]) + m.group(5)
    for f, rel, s in pages():
        o = s
        s = tag_anchors(s)
        s = re.sub(r'<a\s[^>]*\bdata-href="[^"]+"[^>]*>', setlink, s)
        s = re.sub(r'(<(\w+)\b[^>]*\bdata-fact="(\w+)"[^>]*>)(.*?)(</\2>)', fact, s, flags=re.S)
        s = re.sub(r'data-release="[^"]*"', f'data-release="{F["release_date"]}"', s)
        s = re.sub(r'<!--n-->[\s\S]*?<!--/n-->', f'<!--n-->{F["lists"]}<!--/n-->', s)
        if s != o: f.write_text(s, encoding='utf-8'); n += 1
    print(f'facts: {n} pages updated')

def step_chrome():
    top, foot = ((ROOT / 'templates' / n).read_text(encoding='utf-8').strip('\n') for n in ('header.html', 'footer.html'))
    n = 0
    for f, rel, s in pages():
        root = '../' * (len(rel.parts) - 1); o = s
        for a, b in (('top', 'top'), ('foot', 'foot')): s = re.sub(rf'<!-- chrome:{a} -->[\s\S]*?<!-- /chrome:{b} -->\n?', '', s)
        s = re.sub(r'<header class="top">[\s\S]*?</header>\n?', '', s)
        s = re.sub(r'<footer[^>]*>[\s\S]*?</footer>\n?', '', s)
        s = re.sub(r'<a class="brand" href="(\.\./|\./)?">Pure guides</a>\n?', '', s)
        s = re.sub(r'(<body[^>]*>\n?)', lambda m: m.group(1) + tag_anchors(render(top, root)) + '\n', s, count=1)
        ft = tag_anchors(render(foot, root)) + '\n'
        s = s.replace('<script src="design/weather.js">', ft + '<script src="design/weather.js">', 1) if '<script src="design/weather.js">' in s else s.replace('</body>', ft + '</body>', 1)
        if s != o: f.write_text(s, encoding='utf-8'); n += 1
    print(f'chrome: {n} pages updated')

def step_check():
    sys.exit(subprocess.call([sys.executable, str(ROOT / 'tools/site-check.py')], cwd=ROOT))


SIMPLE = ['hero_tag','fact_no_network','fact_source_available','demo_head_left','demo_head_right','demo_row1_title','demo_row1_meta','demo_hidden_title','demo_hidden_meta','demo_row4_title','demo_row4_meta','free_num_lists','free_num_locked','free_num_requests','free_li_own_titles','free_li_more_sites','free_li_local_link','weather_h2','weather_p','weather_card_title','weather_loading','weather_foot','titles_h2','titles_intro','titles_request','ext_h2','ext_intro','ext_shield_desc','ext_headers_desc','ext_json_desc','ext_session_desc','ext_chrome_coming','dev_h2','dev_link_cors','dev_link_modheader','dev_link_json','btn_add_chrome_free','nav_spoiler_index','nav_mute_lists','nav_gta_guide','meta_title','meta_description','demo_veil_aria','demo_feed_aria']
JS_KEYS = ('hero_tag_countdown','btn_add_firefox_free','demo_click_again','weather_no_data','wx_')
CJK = ('ja', 'zh-CN')
def plural(lang, n):
    if lang in ('ja', 'ko', 'zh-CN', 'tr'): return 'other'
    if lang in ('ru', 'uk'): return 'one' if n % 10 == 1 and n % 100 != 11 else 'few' if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14 else 'many'
    if lang == 'pl': return 'one' if n == 1 else 'few' if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14 else 'many'
    if lang in ('fr', 'pt-BR'): return 'one' if n in (0, 1) else 'other'
    return 'one' if n == 1 else 'other'
def comps(L, n):
    sp = '' if L['_l'] == 'ja' else ' '; dot = '。' if L['_l'] in CJK else '.'; g = '' if L['_l'] in CJK else ' '
    mark = f'<!--n-->{n}<!--/n-->'
    return {
      'h1': f"{L['hero_h1_before']}{g}<span class=\"cover\">{L['hero_h1_covered']}</span>{dot}",
      'lead': f"{L['hero_lead_before']}{sp}<strong>{L['hero_lead_sites']}</strong>{dot} {L['hero_lead_after']}",
      'also': f'class="small hero-alt">{L["hero_also_for"]}{sp}',
      'free_h2': f"{L['free_h2_before']}{g}<span class=\"cover\">{L['free_h2_covered']}</span>{dot}",
      'local': f"{L['free_li_local_before']}{sp}<a",
      'ready': re.sub(r'\d+', mark, L['fact_ready_lists'], count=1),
      'veil': f"{L['demo_veil_label']} <b>{L['demo_veil_action']}</b>",
      'nothere': f"{L['titles_not_here']} <a",
      'reqdot': f"{L['titles_request']}</a>{dot}",
    }
def esc(t): return html.escape(t, quote=False)
def decorate(s, lang, T, depth):
    pre = '../' * depth
    alts = ''.join(f'<link rel="alternate" hreflang="{l}" href="{BASEURL}{LDIR(l) + "/" if LDIR(l) else ""}">' for l in HAVE) + f'<link rel="alternate" hreflang="x-default" href="{BASEURL}">'
    s = re.sub(r'<!-- hreflang:start -->[\s\S]*?<!-- hreflang:end -->', lambda m: '<!-- hreflang:start -->' + alts + '<!-- hreflang:end -->', s)
    items = ''.join(f'<a href="{pre if l == "en" and depth else ("" if not depth else pre)}{LDIR(l) + "/" if LDIR(l) else ""}" hreflang="{l}" lang="{l}"' + (' aria-current="page"' if l == lang else '') + f'>{LANGS[l]}</a>' for l in HAVE)
    if depth: items = items.replace('href="../' + '', 'href="../')
    bar = f'<nav class="langbar" aria-label="Language"><div class="wrap">{items}</div></nav>'
    s = re.sub(r'<!-- langs:start -->[\s\S]*?<!-- langs:end -->', lambda m: '<!-- langs:start -->' + bar + '<!-- langs:end -->', s)
    jsT = {k: v for k, v in T.items() if k.startswith(JS_KEYS)}; jsT['lang'] = lang
    sc = '<script>window.PURE_I18N=' + json.dumps(jsT, ensure_ascii=False).replace('</', '<\\/') + '</script>'
    return re.sub(r'<!-- i18n:start -->[\s\S]*?<!-- i18n:end -->', lambda m: '<!-- i18n:start -->' + sc + '<!-- i18n:end -->', s)
BASEURL = 'https://qwemort.github.io/pure-guides/'
def step_lang():
    EN = json.loads((ROOT / 'i18n/home.en.json').read_text(encoding='utf-8'))
    src = (ROOT / 'index.html').read_text(encoding='utf-8')
    src = decorate(src, 'en', EN, 0); (ROOT / 'index.html').write_text(src, encoding='utf-8')
    ce = comps({**EN, '_l': 'en'}, F['lists']); miss = []
    for k in SIMPLE:
        if f'>{esc(EN[k])}<' not in src and f'"{html.escape(EN[k])}"' not in src and f'"{EN[k]}"' not in src: miss.append(k)
    for k, v in ce.items():
        if v not in src: miss.append('compose:' + k)
    if miss: sys.exit('build: в index.html нет английского текста из home.en.json (правили руками?): ' + ', '.join(miss))
    for lang in HAVE:
        if lang == 'en': continue
        L = {**json.loads((ROOT / f'i18n/home.{lang}.json').read_text(encoding='utf-8')), '_l': lang}
        s = src
        cl = comps(L, F['lists'])
        for k, v in ce.items(): s = s.replace(v, cl[k])
        for k in SIMPLE:
            s = s.replace(f'>{esc(EN[k])}<', f'>{esc(L[k])}<').replace(f'"{html.escape(EN[k])}"', f'"{html.escape(L[k])}"').replace(f'"{EN[k]}"', f'"{html.escape(L[k])}"')
        s = re.sub(r'(<meta property="og:description" content=")[^"]*"', lambda m: m.group(1) + html.escape(L['meta_description']) + '"', s)
        s = s.replace('<html lang="en"', f'<html lang="{lang}"')
        u = f'{BASEURL}{LDIR(lang)}/'
        s = s.replace(f'<link rel="canonical" href="{BASEURL}">', f'<link rel="canonical" href="{u}">').replace(f'<meta property="og:url" content="{BASEURL}">', f'<meta property="og:url" content="{u}">')
        grp = {'game': 'titles_group_games', 'movie': 'titles_group_films', 'show': 'titles_group_series', 'anime': 'titles_group_anime'}
        def grpfix(m):
            cnt = int(re.search(r'\d+', m.group(3)).group(0)); o = L['titles_count']
            return f'{m.group(1)}<span class="cover">{esc(L[grp[m.group(2)]])}</span><span class="tcount">{esc((o.get(plural(lang, cnt)) or o["other"]).replace("{n}", str(cnt)))}</span>'
        s = re.sub(r'(<details class="tgroup tg-(\w+)"[^>]*><summary><h3 class="titles-h">)<span class="cover">[^<]*</span><span class="tcount">([^<]*)</span>', grpfix, s)
        s = re.sub(r'<!-- chrome:top -->[\s\S]*?<!-- /chrome:top -->\n?', '', s)
        foot_m = re.search(r'<footer[\s\S]*?</footer>\n?(<script src="design/groups.js" defer></script>\n)?<!-- /chrome:foot -->\n?', s)
        s = s.replace(foot_m.group(0), '@@FOOT@@') if foot_m else s
        s = re.sub(r'(?<![\w-])(href|src)="(?!https?:|mailto:|#|\.\./|//)([^"]+)"', lambda m: f'{m.group(1)}="../{m.group(2)}"', s)
        top, foot = ((ROOT / 'templates' / n).read_text(encoding='utf-8').strip('\n') for n in ('header.html', 'footer.html'))
        s = re.sub(r'(<body[^>]*>\n?)', lambda m: m.group(1) + tag_anchors(render(top, '../', L, './')) + '\n', s, count=1)
        s = s.replace('@@FOOT@@', tag_anchors(render(foot, '../', L, './')) + '\n')
        s = decorate(s, lang, L, 1)
        d = ROOT / LDIR(lang); d.mkdir(exist_ok=True)
        (d / 'index.html').write_text(s, encoding='utf-8')
    sm = (ROOT / 'sitemap.xml').read_text(encoding='utf-8')
    for lang in HAVE:
        if lang == 'en': continue
        loc = f'{BASEURL}{LDIR(lang)}/'
        if loc not in sm: sm = sm.replace('</urlset>', f'<url><loc>{loc}</loc><lastmod>{F["release_date"] and __import__("datetime").date.today().isoformat()}</lastmod></url>\n</urlset>')
    (ROOT / 'sitemap.xml').write_text(sm, encoding='utf-8')
    print(f'lang: {len(HAVE) - 1} language pages')

only = A.only
if only in (None, 'generate') and not A.no_generate: step_generate()
if only in (None, 'facts'): step_facts()
if only in (None, 'chrome'): step_chrome()
if only in (None, 'lang'): step_lang()
if only in (None, 'check') and not A.no_check: step_check()
