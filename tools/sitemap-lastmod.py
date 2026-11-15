#!/usr/bin/env python3
"""Проставляет в sitemap.xml честную lastmod: дата последнего коммита файла страницы, но не позже сегодняшнего дня.
Убирает changefreq (Google его игнорирует). Запускается из build.py."""
import re, subprocess, datetime, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = 'https://qwemort.github.io/pure-guides/'
today = datetime.date.today().isoformat()
sm = (ROOT / 'sitemap.xml').read_text(encoding='utf-8')
def fix(m):
    loc = m.group(1)
    rel = loc[len(BASE):] or 'index.html'
    if rel.endswith('/'): rel += 'index.html'
    out = subprocess.run(['git', 'log', '-1', '--format=%cs', '--', rel], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    d = min(out or today, today)
    return f'<url><loc>{loc}</loc><lastmod>{d}</lastmod></url>'
new = re.sub(r'<url><loc>([^<]+)</loc>(?:<lastmod>[^<]*</lastmod>)?(?:<changefreq>[^<]*</changefreq>)?</url>', fix, sm)
(ROOT / 'sitemap.xml').write_text(new, encoding='utf-8')
print('sitemap: lastmod обновлён у', len(re.findall('<url>', new)), 'страниц')
# чистая копия без комментариев под другим именем: на случай, если Search Console «залипла» на статусе старого файла
clean = re.sub(r'<!--.*?-->\n?', '', new, flags=re.S)
(ROOT / 'sitemap-pages.xml').write_text(clean, encoding='utf-8')
