#!/usr/bin/env python3
"""Робот-контролёр нового сайта (шаг 7): проверяет готовый dist/ до выкладки. Правила Фазы 1 из плана (R01–R15).
BLOCK = выкладка запрещена (выход 1). WARN = записать и разобрать, но не блокирует.
Запуск: python3 site/check.py            (после site/build.py)
        python3 site/check.py --write    (обновить site/state/manifest.json — список адресов и отпечатков страниц)
"""
import hashlib, json, re, sys
from html.parser import HTMLParser
from pathlib import Path

R = Path(__file__).resolve().parent.parent
DIST = R / 'dist'
STATE = R / 'site/state/manifest.json'
C = json.loads((R / 'site/config.json').read_text(encoding='utf-8'))
BASE = C['base']
LANGP = re.compile(r'^/(' + '|'.join(sorted({l.lower() for l in C['wave0'] + C['gta_only']} - {'en'})) + r')/')
BAD_TEXT = ['{{', '}}', 'undefined', 'NaN', 'Lorem ipsum', 'Certainly!', 'As an AI', 'None</', '>None<']
blocks, warns = [], []
B = lambda r, m: blocks.append(f'{r} {m}')
W = lambda r, m: warns.append(f'{r} {m}')


class Doc(HTMLParser):
    def __init__(s):
        super().__init__(); s.links, s.alts, s.canon, s.h1, s.title, s.text, s.ld, s.meta_robots = [], {}, None, '', '', [], [], ''
        s._in = None; s._main = 0; s.main_text = []
    def handle_starttag(s, tag, a):
        a = dict(a)
        if tag == 'a' and a.get('href'): s.links.append(a['href'])
        if tag == 'link' and a.get('rel') == 'canonical': s.canon = a.get('href')
        if tag == 'link' and a.get('rel') == 'alternate' and a.get('hreflang'): s.alts[a['hreflang']] = a.get('href')
        if tag == 'meta' and a.get('name') == 'robots': s.meta_robots = a.get('content', '')
        if tag in ('h1', 'title'): s._in = tag
        if tag == 'script': s._in = 'ld' if a.get('type') == 'application/ld+json' else 'script'
        if tag == 'main': s._main += 1
    def handle_endtag(s, tag):
        if tag in ('h1', 'title', 'script'): s._in = None
        if tag == 'main': s._main -= 1
    def handle_data(s, d):
        if s._in == 'h1': s.h1 += d
        elif s._in == 'title': s.title += d
        elif s._in == 'ld': s.ld.append(d)
        if s._main and s._in not in ('ld', 'script'): s.main_text.append(d)


def url_of(f):
    rel = f.relative_to(DIST).as_posix()
    return '/' + (rel[:-len('index.html')] if rel.endswith('index.html') else rel)


def main():
    if not DIST.exists():
        sys.exit('нет dist/: сначала python3 site/build.py')
    pages = {}
    for f in sorted(DIST.rglob('*.html')):
        raw = f.read_text(encoding='utf-8')
        d = Doc(); d.feed(raw)
        pages[url_of(f)] = (f, raw, d)
    exists = lambda u: u in pages or (DIST / u.lstrip('/')).is_file()
    titles = [json.loads(p.read_text(encoding='utf-8')) for p in sorted((R / 'data/titles').glob('*.json'))]
    tmap = {f"/{t['media']}/{t['slug']}/": t for t in titles}
    vocab = json.loads((R / 'data/vocab.json').read_text(encoding='utf-8'))['vocab']

    # R02 размер
    for f in DIST.rglob('*'):
        if f.is_file() and f.suffix == '.html' and f.stat().st_size > 1_500_000: B('R02', f'{f} больше 1,5 МБ')
        if f.is_file() and f.suffix in ('.png', '.jpg', '.jpeg', '.webp') and f.stat().st_size > 1_000_000: B('R02', f'{f} картинка больше 1 МБ')

    seen = {}
    inbound = {u: 0 for u in pages}
    for u, (f, raw, d) in pages.items():
        lang = re.search(r'<html lang="([^"]+)"', raw).group(1)
        main_txt = re.sub(r'\s+', ' ', ' '.join(d.main_text)).strip()
        # R03 утечки шаблонов (только видимый текст и заголовки)
        for bad in BAD_TEXT:
            if bad in main_txt or bad in d.title or bad in d.h1: B('R03', f'{u}: «{bad}» в тексте')
        # R14 случайный noindex
        key0 = LANGP.sub('/', u)
        if 'noindex' in d.meta_robots and key0 not in tmap: B('R14', f'{u}: noindex в HTML')
        # R11 canonical
        if d.canon != BASE + u: B('R11', f'{u}: canonical {d.canon}')
        # R11 hreflang в обе стороны
        if d.alts:
            if 'x-default' not in d.alts: B('R11', f'{u}: нет x-default')
            for code, href in d.alts.items():
                v = href.replace(BASE, '')
                if v not in pages: B('R11', f'{u}: hreflang {code} → нет страницы {v}'); continue
                if code != 'x-default' and pages[v][2].alts.get(lang) != BASE + u: B('R11', f'{u}: {v} не ссылается обратно ({lang})')
        # R12 битые внутренние ссылки + входящие
        for h in d.links:
            if h.startswith('/'):
                h0 = h.split('#')[0].split('?')[0]
                if not exists(h0): B('R12', f'{u}: битая ссылка {h0}')
                elif h0 in inbound and h0 != u: inbound[h0] += 1
        # R13 мусорные адреса
        if re.search(r'/tag/|/search', u): B('R13', f'{u}: запрещённый адрес')
        # R06 уникальность внутри языка
        for kind, val in (('title', d.title.strip()), ('h1', d.h1.strip()), ('первые 120', main_txt[:120])):
            key = (lang, kind, val)
            if val and key in seen: B('R06', f'{u}: одинаковый {kind} с {seen[key]}')
            seen[key] = u
        # R08 JSON-LD
        for blob in d.ld:
            try:
                j = json.loads(blob)
            except Exception as e:
                B('R08', f'{u}: JSON-LD не читается ({e})'); continue
            for node in j.get('@graph', [j]):
                if node.get('@type') == 'WebPage' and node.get('url') != BASE + u: B('R08', f'{u}: WebPage.url {node.get("url")}')
        # страницы тайтлов
        key = LANGP.sub('/', u)
        t = tmap.get(key)
        if t:
            lg = {'pt-br': 'pt-BR'}.get(lang.lower(), lang) if lang != 'pt-BR' else lang
            # R01 главное в сыром HTML
            bluf = re.search(r'class="t-lead ms-bluf">(.*?)</p>', raw, re.S)
            nw = len(re.sub(r'<[^>]+>', ' ', bluf.group(1)).split()) if bluf else 0
            if nw < 35: (B if lang == 'en' else W)('R01', f'{u}: сводка {nw} слов (<35)')
            if 'class="ms-dates"' not in raw: B('R01', f'{u}: нет таблицы дат')
            if raw.count('class="chip') < 12: B('R01', f'{u}: слов в HTML меньше 12')
            # R04 порог данных: без своего текста страница обязана быть noindex; слов не меньше 12
            w = t['words'].get(lg, {})
            nwords = len(w.get('basic', [])) + len(w.get('balanced', [])) + len(vocab.get(lg, []))
            thin = not t['texts'].get('en', {}).get('lead')
            if thin and 'noindex' not in d.meta_robots: B('R04', f'{u}: только шаблонный текст, а страница открыта для индекса')
            if not thin and 'noindex' in d.meta_robots: B('R04', f'{u}: свой текст есть, но стоит noindex')
            if thin: W('R04', f'{key}: закрыт от индекса, пока нет своего текста')
            if nwords < 12: B('R04', f'{u}: слов {nwords} (<12)')
            # R07 спойлеры в списках
            chips = ' | '.join(re.findall(r'class="chip[^"]*" type="button">([^<]+)<', raw)).lower()
            for bad in t.get('spoiler_blocklist', []):
                if bad.lower() in chips: B('R07', f'{u}: запрещённое слово «{bad}» в списке')
            if not t.get('spoiler_safe_verified'): W('R07', f'{key}: списки ещё не отмечены человеком как проверенные')
            # R08 паритет даты
            for blob in d.ld:
                for node in json.loads(blob).get('@graph', []):
                    if node.get('@type') in ('VideoGame', 'Movie', 'TVSeries') and node.get('datePublished') and node['datePublished'] != t['release'].get('date'):
                        B('R08', f'{u}: datePublished {node["datePublished"]} ≠ {t["release"].get("date")}')
    for u, n in inbound.items():
        if n == 0 and u != '/': W('R12', f'{u}: ни одной входящей ссылки')

    # R14 robots и sitemap
    robots = (DIST / 'robots.txt').read_text(encoding='utf-8')
    for bot in ('Googlebot', 'Bingbot', 'OAI-SearchBot', 'ClaudeBot', 'PerplexityBot'):
        if f'User-agent: {bot}\nAllow: /' not in robots: B('R14', f'robots.txt не пускает {bot}')
    if 'Disallow: /\n' in robots: B('R14', 'robots.txt закрывает сайт')
    sm_urls = set()
    for sm in DIST.glob('sitemap-*.xml'):
        locs = re.findall(r'<loc>([^<]+)</loc>', sm.read_text(encoding='utf-8'))
        if len(locs) > 45000: B('R14', f'{sm.name}: больше 45 000 адресов')
        for loc in locs:
            p = loc.replace(BASE, '')
            sm_urls.add(p)
            if '?' in p: B('R13', f'{sm.name}: адрес с параметрами {p}')
            if p not in pages: B('R14', f'{sm.name}: {p} нет в сборке')
    for u, (f, raw, d) in pages.items():
        if u not in sm_urls and 'noindex' not in d.meta_robots: B('R14', f'{u}: нет в sitemap')
        if u in sm_urls and 'noindex' in d.meta_robots: B('R14', f'{u}: noindex, но в sitemap')

    # R09 + R15: сравнение с прошлой сборкой
    redirects = {l.split()[0] for l in (DIST / '_redirects').read_text(encoding='utf-8').splitlines() if l and not l.startswith('#')}
    now = {u: {'h': hashlib.sha256(re.sub(r'\s+', ' ', ' '.join(d.main_text)).encode()).hexdigest()[:16],
               'm': (re.search(r'"dateModified": "([^"]+)"', raw) or [None, None])[1]} for u, (f, raw, d) in pages.items()}
    if STATE.exists():
        old = json.loads(STATE.read_text(encoding='utf-8'))['pages']
        for u, o in old.items():
            if u not in now and u not in redirects: B('R15', f'{u} пропал без 301')
            elif u in now and o['m'] and now[u]['m'] and now[u]['m'] != o['m'] and now[u]['h'] == o['h']:
                B('R09', f'{u}: дата обновления сменилась, а текст нет')
    if '--write' in sys.argv:
        STATE.parent.mkdir(parents=True, exist_ok=True)
        STATE.write_text(json.dumps({'_note': 'Отпечаток прошлой сборки для R09/R15. Обновляет site/check.py --write.', 'pages': now}, ensure_ascii=False, indent=0) + '\n', encoding='utf-8')

    for x in blocks[:60]: print('✗', x)
    wr = {}
    for x in warns: wr.setdefault(x.split()[0], []).append(x)
    for r, xs in wr.items(): print(f'! {r}: {len(xs)} предупр., например: {xs[0]}')
    print(f'\nСтраниц: {len(pages)}, правил 301: {len(redirects)}, блокирующих ошибок: {len(blocks)}, предупреждений: {len(warns)}')
    return 1 if blocks else 0


if __name__ == '__main__':
    sys.exit(main())
