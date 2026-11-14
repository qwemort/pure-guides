#!/usr/bin/env python3
"""Cloudflare Web Analytics: вставляет счётчик (templates/analytics.html) перед </body> на всех опубликованных страницах.
Без cookies и без личных данных. Не ставим на s/ (спойлер-ссылка хранит текст после #, туда никакие скрипты не нужны),
в design/ (черновики), в служебные папки. Повторный запуск ничего не дублирует.
  python3 tools/analytics.py          вставить, где нет
  python3 tools/analytics.py --check  только проверить (код выхода 1, если где-то нет)"""
import sys, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
SNIP = (ROOT / 'templates' / 'analytics.html').read_text(encoding='utf-8').strip()
MARK = '<!-- Cloudflare Web Analytics -->'
SKIP = ('s', 'design', 'media', 'img', 'devto', 'queue', 'data', 'fonts', 'i18n', 'tools', 'templates', 'node_modules', '.git', 'ext')

def targets():
    for f in sorted(ROOT.rglob('*.html')):
        rel = f.relative_to(ROOT)
        if rel.parts[0] in SKIP: continue
        s = f.read_text(encoding='utf-8')
        if '</body>' in s and 'noindex' not in s: yield f, s

def run(check=False):
    missing = []; n = 0
    for f, s in targets():
        if MARK in s: continue
        missing.append(str(f.relative_to(ROOT)))
        if check: continue
        i = s.rindex('</body>')
        f.write_text(s[:i] + SNIP + '\n' + s[i:], encoding='utf-8'); n += 1
    return missing, n

if __name__ == '__main__':
    chk = '--check' in sys.argv
    missing, n = run(chk)
    if chk:
        print(f'analytics: без счётчика {len(missing)} страниц', missing[:5]); sys.exit(1 if missing else 0)
    print(f'analytics: добавлено на {n} страниц')
