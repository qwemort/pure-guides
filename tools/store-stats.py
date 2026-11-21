#!/usr/bin/env python3
"""Публичная статистика магазинов -> data/store-stats.csv (одна строка на расширение и магазин в день).

Перенесено из приватного pure-extensions 21.11.2026 (там кончились бесплатные минуты Actions).
Берёт ID и slug из data/store-ids.json. Пишет ТОЛЬКО то, что и так видно на публичных страницах магазинов.
Изменения (новая оценка, версия, обновление страницы) -> out/store-alerts.txt -> Telegram (не issue: репо публичный).
Источники (публичные, без входа в аккаунт):
  Chrome  - страница https://chromewebstore.google.com/detail/<id>?hl=en  ("N users", "X out of 5", "N ratings")
  Edge    - https://microsoftedge.microsoft.com/addons/getproductdetailsbycrxid/<id>  (activeInstallCount, averageRating, ratingCount)
  Firefox - https://addons.mozilla.org/api/v5/addons/addon/<slug>/  (average_daily_users, ratings)
Запуск: python3 tools/store-stats.py   (в облаке Claude сеть закрыта — запускается GitHub Actions раз в день)
Это только публичные цифры. Показы, просмотры страницы, источники (utm) — только в кабинетах разработчика.
"""
import csv, datetime, json, os, re, sys, urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'data', 'store-stats.csv')
UA = {'User-Agent': 'pure-extensions-stats/1.0 (+https://github.com/qwemort)', 'Accept-Language': 'en-US,en;q=0.9'}
FIELDS = ['date', 'name', 'store', 'id', 'users', 'rating', 'ratings', 'version', 'updated', 'note']
ALERTS = os.path.join(ROOT, 'out', 'store-alerts.txt')
MONTHS = r'(January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4}'


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read().decode('utf-8', 'replace')


def num(s):
    return int(re.sub(r'[^\d]', '', s)) if s and re.search(r'\d', s) else ''


def chrome(cid):
    html = get(f'https://chromewebstore.google.com/detail/{cid}?hl=en')
    users = re.search(r'([\d,]+)\+?\s+users?\b', html)
    rating = re.search(r'([\d.]+) out of 5', html)
    ratings = re.search(r'([\d,.]+[KkMm]?)\s+ratings?\b', html)
    version = re.search(r'Version</div>\s*<div[^>]*>([\d.]+)<', html) or re.search(r'"version"\s*:\s*"([\d.]+)"', html)
    i = html.find('Updated'); upd = re.search(MONTHS, html[i:i + 400]) if i >= 0 else None
    return dict(users=num(users.group(1)) if users else '', rating=rating.group(1) if rating else '',
                ratings=(0 if 'No ratings' in html else (ratings.group(1) if ratings else '')),
                version=version.group(1) if version else '', updated=upd.group(0) if upd else '')


def edge(eid):
    d = json.loads(get(f'https://microsoftedge.microsoft.com/addons/getproductdetailsbycrxid/{eid}'))
    return dict(users=d.get('activeInstallCount', ''), rating=d.get('averageRating', ''), ratings=d.get('ratingCount', ''),
                version=d.get('version', ''), updated=str(int(float(d['lastUpdateDate']))) if d.get('lastUpdateDate') else '')


def firefox(slug):
    d = json.loads(get(f'https://addons.mozilla.org/api/v5/addons/addon/{slug}/'))
    r = d.get('ratings') or {}
    return dict(users=d.get('average_daily_users', ''), rating=r.get('average', ''), ratings=r.get('count', ''),
                version=(d.get('current_version') or {}).get('version', ''), updated=d.get('last_updated', ''))


def targets(ids):
    fn = {'chrome': chrome, 'edge': edge, 'firefox': firefox}
    for t in ids['targets']:
        yield t['name'], t['store'], t['id'], fn[t['store']]


def main():
    reg = json.load(open(os.path.join(ROOT, 'data', 'store-ids.json'), encoding='utf-8'))
    today = datetime.date.today().isoformat()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    old = []
    if os.path.exists(OUT):
        with open(OUT, encoding='utf-8', newline='') as f:
            old = [r for r in csv.DictReader(f) if r['date'] != today]   # перезапуск в тот же день — заменяем строки дня
    rows, bad = [], 0
    for name, store, sid, fn in targets(reg):
        try:
            v = fn(sid); note = ''
        except Exception as ex:
            v = dict(users='', rating='', ratings='', version='', updated=''); note = 'error: ' + str(ex)[:80]; bad += 1
        rows.append(dict(date=today, name=name, store=store, id=sid, note=note, **v))
        print(f'{store:8} {name:22} users={v["users"]!s:>6} rating={v["rating"]!s:>4} ({v["ratings"]}) v{v["version"]} {note}')
    with open(OUT, 'w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=FIELDS); w.writeheader(); w.writerows(old + rows)
    print(f'{len(rows)} строк за {today} -> data/store-stats.csv (ошибок: {bad})')
    # сторож: сравнить с последней прошлой записью того же расширения и магазина
    last = {}
    for r in old:
        last[(r['name'], r['store'])] = r
    msgs = []
    for r in rows:
        p = last.get((r['name'], r['store']))
        if not p or r['note']:
            continue
        where = f"{r['name']} ({r['store']})"
        if str(r['ratings']) not in ('', str(p.get('ratings', ''))) and p.get('ratings', '') != '':
            msgs.append(f"- {where}: оценок было {p['ratings']}, стало {r['ratings']} (средняя {r['rating']}). Прочитать и ответить на отзыв.")
        if r['version'] and p.get('version') and r['version'] != p['version']:
            msgs.append(f"- {where}: в магазине новая версия {r['version']} (была {p['version']}).")
        if r['updated'] and p.get('updated') and r['updated'] != p['updated']:
            msgs.append(f"- {where}: страница в магазине обновлена ({p['updated']} → {r['updated']}). Возможно, одобрили описание или версию.")
    if msgs:
        os.makedirs(os.path.dirname(ALERTS), exist_ok=True)
        open(ALERTS, 'w', encoding='utf-8').write('Магазины, изменения за ' + today + ':\n' + '\n'.join(msgs) + '\n')
        print('\n'.join(msgs))
    return 1 if rows and bad == len(rows) else 0


if __name__ == '__main__':
    sys.exit(main())
