#!/usr/bin/env python3
"""Сводка новостей для Claude: раз в 4 дня собирает новости игр, сериалов и аниме из открытых RSS
и кладёт в news/latest.md (+ news/<дата>.md). Ничего не постит. Читает Claude в начале сессии.

Что отбирается: GTA 6 / Rockstar (утечки, ПК-версия, переносы), тайтлы из списков Shield,
и всё про спойлеры/утечки. Список тайтлов берётся из публичного words.js Shield (если передан путь).
  python3 tools/news-digest.py [путь к words.js]
"""
import os, re, sys, json, html, datetime, urllib.request, email.utils
import xml.etree.ElementTree as ET

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DIR = os.path.join(ROOT, 'news')
DAYS = 8  # раз в неделю, с запасом на сдвиг запуска
FEEDS = {
    'PC Gamer': 'https://www.pcgamer.com/rss/',
    'GameSpot': 'https://www.gamespot.com/feeds/news/',
    'Eurogamer': 'https://www.eurogamer.net/feed',
    'Rock Paper Shotgun': 'https://www.rockpapershotgun.com/feed',
    'VGC': 'https://www.videogameschronicle.com/feed/',
    'Polygon': 'https://www.polygon.com/rss/index.xml',
    'Kotaku': 'https://kotaku.com/rss',
    'GamesRadar': 'https://www.gamesradar.com/feeds.xml',
    'Anime News Network': 'https://www.animenewsnetwork.com/all/rss.xml?ann-edition=w',
    'TVLine': 'https://tvline.com/feed/',
}
GTA = re.compile(r'\bgta ?(6|vi)\b|grand theft auto (6|vi)|rockstar', re.I)
HOT = re.compile(r'leak|spoil|ending|finale|delay|release date|pc (version|port|release)|early cop|street date|embargo|review', re.I)
log = []


def titles(path):
    if not path or not os.path.exists(path):
        return []
    code = open(path, encoding='utf-8').read()
    labels = re.findall(r"label: '([^']+)'", code)
    return [l for l in labels if len(l) >= 4]


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'pure-news-digest/1.0 (github.com/qwemort)'})
    with urllib.request.urlopen(req, timeout=25) as r:
        return r.read()


def when(s):
    if not s:
        return None
    try:
        return email.utils.parsedate_to_datetime(s).astimezone(datetime.timezone.utc)
    except Exception:
        try:
            return datetime.datetime.fromisoformat(s.replace('Z', '+00:00')).astimezone(datetime.timezone.utc)
        except Exception:
            return None


def clean(s, n=220):
    s = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s or ''))).strip()
    return s if len(s) <= n else s[:n - 1] + '…'


def items(xml):
    root = ET.fromstring(xml)
    ns = {'a': 'http://www.w3.org/2005/Atom'}
    for it in root.iter('item'):
        yield (it.findtext('title'), it.findtext('link'), it.findtext('pubDate') or it.findtext('{http://purl.org/dc/elements/1.1/}date'), it.findtext('description'))
    for it in root.findall('a:entry', ns):
        link = it.find('a:link', ns)
        yield (it.findtext('a:title', namespaces=ns), link.get('href') if link is not None else '', it.findtext('a:updated', namespaces=ns) or it.findtext('a:published', namespaces=ns), it.findtext('a:summary', namespaces=ns))


def main():
    shield = titles(sys.argv[1] if len(sys.argv) > 1 else None)
    tre = re.compile(r'\b(' + '|'.join(re.escape(t) for t in sorted(shield, key=len, reverse=True)) + r')\b', re.I) if shield else None
    since = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=DAYS)
    found, seen = [], set()
    for src, url in FEEDS.items():
        try:
            n = 0
            for title, link, date, desc in items(fetch(url)):
                d = when(date)
                if not title or not link or (d and d < since) or link in seen:
                    continue
                text = f'{title} {desc or ""}'
                score, tags = 0, []
                if GTA.search(text):
                    score += 5; tags.append('GTA')
                m = tre.search(text) if tre else None
                if m:
                    score += 3; tags.append(m.group(0))
                if HOT.search(text):
                    score += 2 if score else 0
                    if score: tags.append('утечка/спойлер/дата')
                if score:
                    seen.add(link); n += 1
                    found.append({'score': score, 'src': src, 'title': clean(title, 160), 'link': link.strip(),
                                  'date': d.strftime('%d.%m') if d else '', 'tags': tags, 'desc': clean(desc)})
            log.append(f'{src}: ок, подходящих {n}')
        except Exception as e:
            log.append(f'{src}: не удалось ({str(e)[:80]})')
    found.sort(key=lambda x: -x['score'])
    today = datetime.date.today().isoformat()
    gta = [f for f in found if 'GTA' in f['tags']]
    rest = [f for f in found if 'GTA' not in f['tags']]
    fmt = lambda f: f"- **{f['date']} · {f['src']}** — [{f['title']}]({f['link']})" + (f" _({', '.join(f['tags'])})_" if f['tags'] else '') + (f"\n  {f['desc']}" if f['desc'] else '')
    L = [f'# Новости для Claude — {today}', '',
         f'Собрано из открытых RSS за последние {DAYS} дней (tools/news-digest.py, раз в 4 дня). Не постится никуда.',
         'Как использовать: найти инфоповоды для Антона (утечки GTA, ПК-версия, финалы, переносы), предложить тексты в чате, обновить страницы pure-guides, если факт изменился.', '',
         f'## GTA 6 / Rockstar ({len(gta)})', *(map(fmt, gta[:25]) if gta else ['- ничего']), '',
         f'## Тайтлы из списков Shield и спойлеры ({len(rest)})', *(map(fmt, rest[:30]) if rest else ['- ничего']), '',
         '## Источники', *[f'- {x}' for x in log]]
    os.makedirs(DIR, exist_ok=True)
    body = '\n'.join(L) + '\n'
    open(os.path.join(DIR, f'{today}.md'), 'w', encoding='utf-8').write(body)
    open(os.path.join(DIR, 'latest.md'), 'w', encoding='utf-8').write(body)
    # храним 60 дней
    for f in os.listdir(DIR):
        m = re.match(r'(\d{4}-\d{2}-\d{2})\.md$', f)
        if m and m.group(1) < (datetime.date.today() - datetime.timedelta(days=60)).isoformat():
            os.remove(os.path.join(DIR, f))
    print('\n'.join(log)); print(f'GTA: {len(gta)}, прочее: {len(rest)}')


if __name__ == '__main__':
    main()
