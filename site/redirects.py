"""Шаг 7: карта 301 со всех старых адресов qwemort.github.io/pure-guides/* на новый сайт.

GitHub (свой домен в настройках Pages) переводит старый путь 1:1 на mutespoilers.com/<тот же путь>,
а этот файл (_redirects на Cloudflare Pages) переводит его на новую страницу. Без сброса на главную, где есть пара.
"""
import json, re
from pathlib import Path

R = Path(__file__).resolve().parent.parent
SKIP_DIRS = {'dist', 'site', 'i18n', 'templates', 'design', 'node_modules', '.git', 'fonts', 'img', 'media', 'devto', 'queue', 'data', 'tools', 'functions'}
LANG_OF = lambda code: {'pt-br': 'pt-BR', 'zh-cn': 'zh-CN'}.get(code.lower(), code.lower())


def old_pages():
    for f in sorted(R.rglob('*.html')):
        rel = f.relative_to(R)
        if rel.parts[0] in SKIP_DIRS:
            continue
        yield '/' + rel.as_posix(), f


def html_lang(f):
    m = re.search(r'<html[^>]*\blang="([^"]+)"', f.read_text(encoding='utf-8', errors='ignore')[:2000])
    return LANG_OF(m.group(1)) if m else 'en'


def build(titles, title_langs, prefix, wave0):
    """titles: список data/titles/*.json; title_langs(t) -> языки, на которых страница есть; prefix(lang) -> '' или '/ru'."""
    rules = {}
    new = lambda t, l: f"{prefix(l if l in title_langs(t) else 'en')}/{t['media']}/{t['slug']}/"
    gta = next(t for t in titles if t['slug'] == 'gta-6')
    for t in titles:
        for lang, olds in t['old_urls'].items():
            for o in olds:
                rules['/' + o] = new(t, lang)
    for path, f in old_pages():
        if path in rules:
            continue
        parts = path.strip('/').split('/')
        name = parts[-1]
        lang = html_lang(f)
        hl = lang if lang in wave0 else 'en'
        if len(parts) == 2 and name == 'index.html' and len(parts[0]) <= 5 and parts[0] not in ('s', 'demo', 'play', 'block'):
            rules[path] = prefix(LANG_OF(parts[0])) + '/' if LANG_OF(parts[0]) in wave0 else '/'   # старые главные языков
            rules['/' + parts[0] + '/'] = rules[path]
        elif path == '/index.html':
            continue                                     # корень остаётся корнем
        elif re.search(r'gta-?6|gta-vi', name):
            rules[path] = new(gta, lang)                 # все гайды GTA 6 (twitch-kick, дата на ПК, mute-list...)
        elif parts[0] == 'spoiler-danger':
            rules[path] = prefix(hl) + '/calendar/'
        elif parts[0] == 'spoiler-index':
            rules[path] = prefix(hl) + '/out-now/'
        elif parts[0] == 'mute-list':
            rules[path] = prefix(hl) + '/guides/'
        elif parts[0] in ('block', 'play', 's'):
            rules[path] = prefix(hl) + '/'
        elif parts[0] == 'demo':
            rules[path] = prefix(hl) + '/extension/'
        else:
            rules[path] = prefix(hl) + '/'
    # папки со старым index.html тоже открывали без имени файла
    for p in list(rules):
        if p.endswith('/index.html'):
            rules.setdefault(p[:-len('index.html')], rules[p])
    rules = {k: v for k, v in rules.items() if k != v}
    return rules


def write(dist, rules):
    lines = ['# 301 со старого сайта qwemort.github.io/pure-guides/ (генерирует site/redirects.py, руками не править)']
    lines += [f'{k} {v} 301' for k, v in sorted(rules.items())]
    # новые страницы, которые старые автоматики продолжают делать после переезда (26.11.2026)
    lines += ['/spoiler-danger/* /calendar/ 301', '/spoiler-index/* /out-now/ 301', '/mute-list/* /guides/ 301']
    (dist / '_redirects').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    return len(rules)
