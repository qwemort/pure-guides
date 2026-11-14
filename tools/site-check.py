#!/usr/bin/env python3
"""Проверка сайта pure-guides без ИИ. Запуск: python3 tools/site-check.py [--strict]
Ошибки (✗) = выход 1. Предупреждения (!) не валят проверку, с --strict валят.
Ловит: нет шапки/подвала, битые ссылки, устаревшие факты, число списков не сходится с block/,
страницы вне sitemap, нет title/description/canonical, длинные тире, неполные переводы (i18n/)."""
import re, sys, json, html, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = 'https://qwemort.github.io/pure-guides/'
SKIP = ('design', 'media', 'img', 'devto', 'queue', 'data', 'fonts', 'i18n', 'tools', 'node_modules', '.git')
NOT_SHIELD = {'modheader-alternative.html', 'json-formatter.html', 'cors-credentials-wildcard.html'}  # там Pro = PureHeaders, это правда
err, warn = [], []
E = lambda p, m: err.append(f'✗ {p}: {m}')
W = lambda p, m: warn.append(f'! {p}: {m}')

pages = []
for f in sorted(ROOT.rglob('*.html')):
    rel = f.relative_to(ROOT)
    if rel.parts[0] in SKIP or len(rel.parts) > 2: continue
    t = f.read_text(encoding='utf-8')
    if '<main' in t: pages.append((rel, t))

FACTS = json.loads((ROOT / 'data' / 'facts.json').read_text(encoding='utf-8'))
n_lists = len([f for f in (ROOT / 'block').glob('*.html') if f.name != 'index.html'])

STALE = [  # устаревшие факты про Shield (с версии 1.4.0 всё бесплатно, Pro нет)
    (r'Pro is an optional', 'старый текст про Pro'),
    (r'Pro\.</strong>\s*(A one-time|Jednorazowo|Разово)', 'старый пункт Pro в гайде'),
    (r'\b(three|3) titles of your own', 'лимит «3 своих тайтла» отменён'),
    (r'Seriess|Animes', 'опечатка во множественном числе'),
    (r'\b5[0-9]\b[^<\n]{0,12}ready(?:-made)? lists|\b5[0-9] (?:gotowych list|готових списків|готовых списков)', 'число списков меньше 60'),
]
for rel, t in pages:
    p = str(rel)
    # 1. шапка и подвал
    if '<!-- chrome:top -->' not in t or '<!-- chrome:foot -->' not in t:
        E(p, 'нет общей шапки/подвала (запусти python3 tools/build.py --no-generate)')
    # 2. head
    noindex = 'noindex' in t
    if not re.search(r'<title>[^<]{5,}', t): E(p, 'нет <title>')
    if not noindex:
        if not re.search(r'<meta name="description" content="[^"]{30,}', t): W(p, 'нет meta description')
        m = re.search(r'<link rel="canonical" href="([^"]+)"', t)
        want = BASE + (str(rel.parent) + '/' if rel.name == 'index.html' and str(rel.parent) != '.' else '' if rel.name == 'index.html' else str(rel))
        if not m: W(p, 'нет canonical')
        elif m.group(1) != want: E(p, f'canonical {m.group(1)} ≠ {want}')
    # 3. ссылки
    for h in re.findall(r'(?<![\w-])(?:href|src)="([^"]+)"', t):
        if re.match(r'(https?:|mailto:|webcal:|#|javascript:|data:|tel:)', h) or '{' in h: continue
        path = h.split('#')[0].split('?')[0]
        if not path: continue
        tgt = (ROOT / rel.parent / path).resolve()
        if tgt.is_dir(): tgt = tgt / 'index.html'
        if not tgt.exists(): E(p, f'битая ссылка {h}')
    # 3б. ссылки на магазины/репозиторий должны совпадать с data/facts.json
    for h in re.findall(r'(?<![\w-])href="([^"]+)"', t):
        h = html.unescape(h)
        for nm, base in FACTS['links'].items():
            ident = base.rstrip('/').split('/')[-1]
            if ident in h and h.split('/')[2:3] == base.split('/')[2:3] and not h.startswith(base): E(p, f'ссылка {h} не совпадает с facts.json ({nm})')
    # 3в. метка data-href должна давать ровно ту ссылку, что в href (иначе не запускали build)
    for tg in re.findall(r'<a\s[^>]*\bdata-href="[^"]+"[^>]*>', t):
        nm, _, med = re.search(r'data-href="([^"]+)"', tg).group(1).partition(':')
        hm = re.search(r'(?<![\w-])href="([^"]*)"', tg)
        if nm not in FACTS['links']: E(p, f'data-href={nm}: нет в facts.json'); continue
        want = FACTS['links'][nm] + (f'?utm_source=pureguides&amp;utm_medium={med}' if med and nm in FACTS['utm'] else '')
        if not hm or hm.group(1) != want: E(p, f'ссылка {nm} не совпадает с facts.json (запусти build.py)')
    # 3г. другие ссылки на наши магазины: чужой ID это дрейф или новая ссылка, которой нет в facts.json
    known = {u.split('?')[0].rstrip('/') for u in FACTS['links'].values()}
    for h in re.findall(r'(?<![\w-])href="(https://(?:chromewebstore\.google\.com|addons\.mozilla\.org|microsoftedge\.microsoft\.com)/[^"]+)"', t):
        if html.unescape(h).split('?')[0].rstrip('/') not in known: W(p, f'ссылка на магазин не из facts.json: {h[:90]}')
    # 4. устаревшие факты
    if rel.name not in NOT_SHIELD:
        for rx, why in STALE:
            if re.search(rx, t): E(p, f'устаревший факт: {why}')
    # 5. число списков
    for n in re.findall(r'\b(\d{2})\s+ready(?:-made)?\s+lists', t):
        if int(n) != n_lists: E(p, f'написано {n} ready lists, а в block/ {n_lists}')
    # 7. длинные тире в видимом тексте
    vis = re.sub(r'<(script|style|head)[\s\S]*?</\1>', '', t)
    vis = html.unescape(re.sub(r'<[^>]+>', ' ', vis))
    d = len(re.findall(r'[—–]', vis))
    if d: W(p, f'длинных тире в тексте: {d}')

# 6. sitemap
sm = (ROOT / 'sitemap.xml').read_text(encoding='utf-8') if (ROOT / 'sitemap.xml').exists() else ''
locs = set(re.findall(r'<loc>([^<]+)</loc>', sm))
for rel, t in pages:
    if 'noindex' in t: continue
    u = BASE + (str(rel.parent) + '/' if rel.name == 'index.html' and str(rel.parent) != '.' else '' if rel.name == 'index.html' else str(rel))
    if u not in locs: W(str(rel), 'нет в sitemap.xml')
for u in sorted(locs):
    r = u.replace(BASE, '')
    tgt = ROOT / (r + 'index.html' if r.endswith('/') or r == '' else r)
    if not tgt.exists(): E('sitemap.xml', f'ссылка на несуществующую страницу {u}')

# 8. переводы i18n/home.<lang>.json против home.en.json
PROT = ['Pure Spoiler Shield', 'PureHeaders', 'PureJSON', 'PureSession', 'ModHeader', 'YouTube', 'Reddit', 'GTA VI', 'GTA 6',
        'TVmaze', 'AniList', 'Instagram', 'TikTok', 'Google', 'Chrome', 'Firefox', 'Edge', 'CORS', 'JSON', 'Allow-Origin', 'Shield']
need = {'ru': {'one', 'few', 'many', 'other'}, 'uk': {'one', 'few', 'many', 'other'}, 'pl': {'one', 'few', 'many', 'other'}}
en_p = ROOT / 'i18n' / 'home.en.json'
if en_p.exists():
    en = json.loads(en_p.read_text(encoding='utf-8'))
    ph = lambda s: set(re.findall(r'\{(\w+)\}', s))
    langs = sorted(f.stem.split('.')[1] for f in (ROOT / 'i18n').glob('home.*.json') if f.stem != 'home.en')
    for lg in langs:
        tr = json.loads((ROOT / 'i18n' / f'home.{lg}.json').read_text(encoding='utf-8')); P = f'i18n/home.{lg}.json'
        for k in en:
            if k not in tr: E(P, f'нет ключа {k}'); continue
            a, b = en[k], tr[k]
            if isinstance(a, dict):
                if not isinstance(b, dict) or 'other' not in b: E(P, f'{k}: нужен объект с категориями множественного числа'); continue
                for c in need.get(lg.split('-')[0], {'other'}) - set(b): E(P, f'{k}: нет формы {c}')
                for c, v in b.items():
                    if ph(a['other']) != ph(v) and not (c == 'one' and ph(v) <= ph(a['other'])): E(P, f'{k}.{c}: плейсхолдеры {ph(v)} ≠ {ph(a["other"])}')
                vals = list(b.values())
            else:
                if not isinstance(b, str) or not b.strip(): E(P, f'{k}: пусто'); continue
                if ph(a) != ph(b): E(P, f'{k}: плейсхолдеры {ph(b)} ≠ {ph(a)}')
                if ('<b>' in a) != ('<b>' in b): E(P, f'{k}: тег <b> потерян или лишний')
                if k.startswith('btn_') and len(b) > len(a) * 1.3 + 2: W(P, f'{k}: длиннее английского больше чем на 30%')
                vals = [b]
            src = ' '.join(a.values()) if isinstance(a, dict) else a
            for term in PROT:
                if term in src and not any(term in v for v in vals): E(P, f'{k}: потеряно «{term}»')
            for v in vals:
                if re.search(r'[—–]', v): W(P, f'{k}: длинное тире')
        for k in tr:
            if k not in en: W(P, f'лишний ключ {k}')

out = err + warn
print('\n'.join(out) if out else 'OK')
print(f'\nСтраниц: {len(pages)}, списков в block/: {n_lists}, ошибок: {len(err)}, предупреждений: {len(warn)}')
sys.exit(1 if err or (warn and '--strict' in sys.argv) else 0)
