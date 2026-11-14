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
ap.add_argument('--only', choices=['generate', 'facts', 'chrome', 'check']); ap.add_argument('--lang', default='en')
A = ap.parse_args()
F = json.loads((ROOT / 'data/facts.json').read_text(encoding='utf-8'))
F['lists'] = len([f for f in (ROOT / 'block').glob('*.html') if f.name != 'index.html'])
T = json.loads((ROOT / f'i18n/home.{A.lang}.json').read_text(encoding='utf-8'))
SKIP = ('design', 'media', 'img', 'devto', 'queue', 'data', 'fonts', 'i18n', 'tools', 'templates', 'node_modules', '.git')
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

def render(tpl, root):
    def rep(m):
        k, a, b = m.groups()
        if k == 'root': return root
        if k == 'home': return root or './'
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

only = A.only
if only in (None, 'generate') and not A.no_generate: step_generate()
if only in (None, 'facts'): step_facts()
if only in (None, 'chrome'): step_chrome()
if only in (None, 'check') and not A.no_check: step_check()
