#!/usr/bin/env python3
"""Одна шапка и один подвал на всех страницах сайта.
   python3 tools/site-chrome.py   (запускать после любого генератора страниц; повторный запуск безопасен)
Меню и группы подвала правятся только здесь."""
import pathlib, re
ROOT = pathlib.Path(__file__).resolve().parent.parent
CH = 'https://chromewebstore.google.com/detail/aloilpojkoblacapdlknacjiljgjibng?utm_source=pureguides&amp;utm_medium='
FF = 'https://addons.mozilla.org/firefox/addon/pure-spoiler-shield/?utm_source=pureguides&amp;utm_medium='
SRC = 'https://github.com/qwemort/pure-spoiler-shield'

def top(r):
    return f'''<!-- chrome:top -->
<header class="top">
  <div class="wrap">
    <a class="logo" href="{r or './'}"><span class="bar" aria-hidden="true"></span>Pure Spoiler Shield</a>
    <nav class="nav" aria-label="Sections">
      <a href="{r}block/">Titles</a>
      <a href="{r}mute-list/">Mute lists</a>
      <a href="{r}spoiler-index/">Spoiler index</a>
      <a href="{r}avoid-gta-6-spoilers.html">GTA 6 guide</a>
    </nav>
    <a class="get" href="{CH}top">Add to Chrome</a>
  </div>
</header>
<!-- /chrome:top -->'''

def foot(r):
    return f'''<!-- chrome:foot -->
<footer class="foot">
  <div class="wrap">
    <div class="fgrid">
      <div><p class="fh">Pure Spoiler Shield</p><ul>
        <li><a href="{CH}foot">Add to Chrome</a></li>
        <li><a href="{FF}foot">Add to Firefox</a></li>
        <li><a href="{r}demo/">Try the demo</a></li>
        <li><a href="{SRC}">Source code</a></li></ul></div>
      <div><p class="fh">Lists and data</p><ul>
        <li><a href="{r}block/">Block spoilers by title</a></li>
        <li><a href="{r}mute-list/">Mute lists for X and Threads</a></li>
        <li><a href="{r}spoiler-index/">GTA 6 spoiler index</a></li>
        <li><a href="{r}spoiler-danger/">Spoiler danger this week</a></li>
        <li><a href="{r}s/">Spoiler link</a></li></ul></div>
      <div><p class="fh">Guides</p><ul>
        <li><a href="{r}avoid-gta-6-spoilers.html">How to avoid GTA 6 spoilers</a></li>
        <li><a href="{r}jak-uniknac-spoilerow-gta-6.html" hreflang="pl">Po polsku</a></li>
        <li><a href="{r}yak-unyknuty-spoileriv-gta-6.html" hreflang="uk">Українською</a></li>
        <li><a href="{r}gta-6-pc-release-date.html">GTA 6 PC release date</a></li></ul></div>
      <div><p class="fh">More from Pure</p><ul>
        <li><a href="{r or './'}#extensions">All extensions</a></li>
        <li><a href="{r or './'}#dev">For developers</a></li></ul></div>
    </div>
    <p class="foot-note">No analytics, no cookies, no trackers. Fonts are hosted here. Contact: <a href="mailto:papana44444@gmail.com">papana44444@gmail.com</a></p>
  </div>
</footer>
<!-- /chrome:foot -->'''

n = 0
for f in sorted(ROOT.rglob('*.html')):
    rel = f.relative_to(ROOT)
    if rel.parts[0] in ('design', 'media', 'img', 'devto', 'queue', 'data') or len(rel.parts) > 2: continue
    s = f.read_text(encoding='utf-8')
    if '<main' not in s or '<body' not in s: continue
    r = '../' * (len(rel.parts) - 1)
    o = s
    s = re.sub(r'<!-- chrome:top -->[\s\S]*?<!-- /chrome:top -->\n?', '', s)
    s = re.sub(r'<!-- chrome:foot -->[\s\S]*?<!-- /chrome:foot -->\n?', '', s)
    s = re.sub(r'<header class="top">[\s\S]*?</header>\n?', '', s)          # старая шапка главной
    s = re.sub(r'<footer[^>]*>[\s\S]*?</footer>\n?', '', s)                 # старые подвалы
    s = re.sub(r'<a class="brand" href="(\.\./|\./)?">Pure guides</a>\n?', '', s)  # дубль шапки
    s = re.sub(r'(<body[^>]*>\n?)', lambda m: m.group(1) + top(r) + '\n', s, count=1)
    s = s.replace('</body>', foot(r) + '\n</body>', 1) if '<script src="design/weather.js">' not in s else s.replace('<script src="design/weather.js">', foot(r) + '\n<script src="design/weather.js">', 1)
    if s != o: f.write_text(s, encoding='utf-8'); n += 1
print(f'site-chrome: {n} pages updated')
