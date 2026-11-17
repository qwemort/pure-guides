import re, html, json, pathlib
# Страница тайтла: python3 tools/gen-title.py. Слова: data/title-words.json (13 языков, в каждом поровну).
R = pathlib.Path(__file__).resolve().parent.parent
W = json.loads((R / 'data/title-words.json').read_text(encoding='utf-8'))
src = (R / 'avoid-gta-6-spoilers.html').read_text()
def rel(s): return re.sub(r'(?<![\w-])(href|src)="(?!https?:|mailto:|#|//)([^"]+)"', lambda m: f'{m.group(1)}="../../{m.group(2)}"', s)
HEAD = rel(re.search(r'<header class="top">[\s\S]*?</header>', src).group(0))
FOOT = rel(re.search(r'<footer class="foot">[\s\S]*?</footer>', src).group(0))
MH = re.search(r'<!-- mobile-handoff -->[\s\S]*?<!-- /mobile-handoff -->', src).group(0)
CH = 'https://chromewebstore.google.com/detail/aloilpojkoblacapdlknacjiljgjibng?utm_source=pureguides&amp;utm_medium='
FF = 'https://addons.mozilla.org/firefox/addon/pure-spoiler-shield/?utm_source=pureguides&amp;utm_medium='

def groups(slug):
    s = (R / 'mute-list' / f'{slug}.html').read_text()
    return {m.group(1): m.group(2).split('|') for m in re.finditer(r'<div class="chips" data-group="(\w+)">([^<]*)</div>', s)}

def chips(ws): return '<div class="chips">' + ''.join(f'<button class="chip" type="button">{html.escape(w)}</button>' for w in ws) + '</div>'

def page(t):
    D = W['titles'][t['list']]
    def panel(code):
        forms, words = D['forms'][code], W['vocab'][code]
        core = [f'{f} {w}' for f in forms for w in words]
        strict = forms + D['extra'][code]
        def grp(title, sub, ws, btn, cls='', ghost=False):
            return f'<div class="t-group{cls}"><h3>{title}</h3><p class="muted">{sub}</p>{chips(ws)}<button class="copyall{" ghost" if ghost else ""}" type="button">{btn}</button></div>'
        nm = f'<details class="t-group"><summary><b>Names (careful)</b> <span class="muted">a name can be a spoiler on its own, open only if you know them</span></summary>{chips(D["names"][code])}<button class="copyall ghost" type="button">Copy names</button></details>'
        return f'<div class="t-lang" data-lang="{code}" lang="{code}"{"" if code == "en" else " hidden"}><div class="t-groups">{grp("Core", "Hides spoiler talk, keeps news and trailers.", core, "Copy core list", " wide")}{grp("Strict mode", "Every spelling of the title. Hides almost everything.", strict, "Copy strict list", "", True)}{nm}</div></div>'
    langs = W['langs']
    switch = '<div class="t-langbar"><span class="muted">Words in</span><div class="t-lsel"><button class="t-lbtn" type="button" aria-haspopup="true" aria-expanded="false"><span class="t-lcur">English</span></button><div class="t-lmenu" hidden>' + ''.join(f'<button type="button" data-lang="{l["code"]}"{" aria-current=true" if l["code"]=="en" else ""}>{l["label"]}</button>' for l in langs) + '</div></div><span class="muted t-lnote">Same list size in every language.</span></div>'
    words_html = switch + ''.join(panel(l['code']) for l in langs)
    faq = ''.join(f'<details><summary>{html.escape(q)}</summary><p>{html.escape(a)}</p></details>' for q, a in t['faq'])
    rel_ = ''.join(f'<a href="{h}">{html.escape(x)}</a>' for h, x in t['related'])
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>{html.escape(t['h1'])} (draft)</title>
<link rel="stylesheet" href="../../style.css"><link rel="stylesheet" href="title.css"><link rel="stylesheet" href="cover.css"><link rel="stylesheet" href="lang.css">
</head><body>
{HEAD}
<div class="t-wrap">
<div class="t-head">
 <div>
  <p class="t-kicker">{t['kicker']}</p>
  <h1>{t['h1_html']}</h1>
  <p class="t-lead">{t['lead']}</p>
  {MH}
 </div>
 <aside class="t-side">
  <div class="cv cv-{t['kind']}"><div class="cv-tag"><i></i>{t['cover_tag']}</div><div class="cv-h">{t['cover_title']}</div><div class="cv-line">{t['cover_line']} <span class="cv-bar">Click to show</span></div></div>
  <div class="t-date"><dl>
   <dt>Release</dt><dd>{t['release']}</dd>
   <dt>Spoilers from</dt><dd>{t['from']} <span class="muted" style="font-weight:400">(approx.)</span></dd>
   <dt>Keep filters on</dt><dd>{t['keep']}</dd></dl>
   <div class="t-bar"><span style="left:{t['bar'][0]}%;width:{t['bar'][1]}%"></span><i style="left:{t['bar'][2]}%"></i></div>
   <div class="t-scale">{''.join(f'<span>{x}</span>' for x in t['scale'])}</div>
  </div>
 </aside>
</div>
<div class="t-body">
 <nav class="t-toc" aria-label="On this page"><p>ON THIS PAGE</p><a href="#why">Why it is hard</a><a href="#words">Words to mute</a><a href="#where">Where to paste</a><a href="#miss">What no filter catches</a><a href="#faq">Questions</a></nav>
 <div class="t-main">
  <section id="why"><h2>{t['why_h']}</h2>{t['why']}</section>
  <section id="words"><h2>Words to mute</h2><p>No spoilers in these lists: titles, spellings and general words like "ending". Tap a word to copy it, or copy a group (one per line).</p>
   {words_html}
  </section>
  <section id="where"><h2>Where to paste them</h2>
   <div class="t-plat">
    <div><b>X</b>Settings and privacy, Privacy and safety, Mute and block, Muted words. Pick "Forever".</div>
    <div><b>Threads, Instagram</b>Settings, Privacy, Hidden words, custom words and phrases.</div>
    <div><b>TikTok</b>Settings and privacy, Content preferences, Filter keywords. Captions and hashtags only.</div>
    <div class="no"><b>YouTube</b>"Not interested" and "Don't recommend channel". Skip comments and Shorts.</div>
    <div class="no"><b>Reddit</b>Mute communities from their menu. Titles in r/popular still get through.</div>
    <div class="no"><b>Discord</b>Mute busy servers and channels for the first weeks.</div>
   </div></section>
  <section id="miss"><h2>What no filter catches</h2>
   <div class="t-miss">
    <div><b>Images and frames</b>A thumbnail can show the twist with no words at all.</div>
    <div><b>Unknown names</b>{t['unknown']}</div>
    <div><b>People</b>Friends and group chats. Tell them early you have not seen it.</div>
   </div></section>
  <section id="faq"><h2>Questions</h2><div class="t-faq">{faq}</div></section>
 </div>
 <aside class="t-rail">
  <div class="t-ext"><h3>Where words can't be muted</h3>
   <div class="t-demo">{t['demo_title']}<span class="veil">May spoil {html.escape(t['name'])} · Click to show</span></div>
   <p>Pure Spoiler Blocker has a ready list for {html.escape(t['name'])}. It blurs matching videos, posts and comments on YouTube, Reddit and X, and keeps trailers and news.</p>
   <a class="cta" href="{CH}title-{t['list']}">Add to Chrome, free</a>
   <small>Also <a href="{FF}title-{t['list']}">for Firefox</a>. Checked in your browser, no account. Reads text only, desktop browsers only. I build it.</small></div>
  <div class="t-rel"><p class="t-kicker">ALSO IN DECEMBER</p>{rel_}</div>
 </aside>
</div>
</div>
{FOOT}
<script src="chips.js"></script><script src="lang.js"></script>
</body></html>'''

T = [dict(list='dune-3', name='Dune: Part Three', kind='film', file='dune.html',
  h1='How to avoid Dune: Part Three spoilers', h1_html='How to avoid <span class="nowrap">Dune: Part Three</span> spoilers',
  lead='It adapts <em>Dune Messiah</em>, a novel from 1969, so the story is already out there. What to mute, where, and what no setting can catch.',
  cover_title='Dune:<br>Part Three', cover_line='The ending',
  why_h='The book is the biggest spoiler',
  why='<p>For most films spoilers start at the premiere. For this one they already exist: plot summaries of Dune Messiah are one search away, and book readers bring them up under trailers, in "what to expect" videos and in casting news. If you have not read it, treat anything that mentions Messiah as a spoiler.</p><p>Film details then arrive a few days before {D0} from premieres and press screenings, and "book vs movie" breakdowns appear on opening night. Do not mute plain "Dune": it also hides Dune: Prophecy and unrelated news.</p>',
  unknown='Changes the film makes to the book cannot be predicted.',
  demo_title='Dune Part Three: the ending explained',
  faq=[('When does Dune: Part Three come out?', 'It is scheduled for cinemas on {D}.'), ('Is it based on a book?', 'Yes, on Dune Messiah by Frank Herbert (1969), so the main story is widely discussed online.'), ('Which words should I mute?', 'The film title and Dune Messiah, with words like ending, spoilers, who dies and book vs movie.'), ('Can I mute words on YouTube?', 'No. YouTube has no keyword mute. In a desktop browser an extension can do it.')],
  related=[('doomsday.html', 'Avengers: Doomsday · {X:avengers-doomsday}'), ('../../avoid-apothecary-diaries-movie-spoilers.html', 'The Apothecary Diaries movie · Dec 11, Japan'), ('../../avoid-gta-6-spoilers.html', 'GTA VI · out Nov 19')]),
 dict(list='avengers-doomsday', name='Avengers: Doomsday', kind='film', file='doomsday.html',
  h1='How to avoid Avengers: Doomsday spoilers', h1_html='How to avoid <span class="nowrap">Avengers: Doomsday</span> spoilers',
  lead='With a Marvel team-up the risk is not only the ending, it is who shows up. One cameo in a thumbnail can be the surprise of the whole film.',
  cover_title='Avengers:<br>Doomsday', cover_line='Who shows up',
  why_h='Cameos travel faster than plot',
  why='<p>Big team-up films are spoiled by casting. "Who appears" and "who dies" spread as short captions and reaction thumbnails, often with no warning. Post-credits scenes are another favourite, because they hint at the next film.</p><p>Reports say Marvel plans advance screenings before {D0}, and release dates differ by country, so expect leaks several days early. Muting every hero name hides half the internet, so mute the title with story words instead.</p>',
  unknown='Characters and actors kept secret before release cannot be listed in advance.',
  demo_title='Avengers Doomsday: every cameo, ranked',
  faq=[('When does Avengers: Doomsday come out?', 'It is scheduled for cinemas on December 18, 2026. Some reports mention advance screenings a little earlier.'), ('Which words should I mute?', 'The title with ending, leak, cameo, post-credits scene and who dies. Muting only "Avengers" also hides news you may want.'), ('How long should I avoid spoilers?', 'The first two weeks after release are the riskiest, when reactions and memes are everywhere.'), ('Can I mute words on YouTube?', 'No. YouTube has no keyword mute. In a desktop browser an extension can do it.')],
  related=[('dune.html', 'Dune: Part Three · {X:dune-3}'), ('../../avoid-apothecary-diaries-movie-spoilers.html', 'The Apothecary Diaries movie · Dec 11, Japan'), ('../../avoid-gta-6-spoilers.html', 'GTA VI · out Nov 19')])]

import datetime as dt
TD = json.loads((R / 'data/titles.json').read_text(encoding='utf-8'))['titles']
def fmt(d, long=False): return f"{d.strftime('%B' if long else '%b')} {d.day}"
def with_dates(t):
    d = dt.date.fromisoformat(TD[t['list']]['release']); a = d - dt.timedelta(days=4); e = d + dt.timedelta(days=14)
    t0, t1, span = d - dt.timedelta(days=17), d + dt.timedelta(days=28), 45
    tok = {'{D}': f'{fmt(d, True)}, {d.year}', '{D0}': fmt(d, True)}
    def sub(x):
        if isinstance(x, str):
            for k, v in tok.items(): x = x.replace(k, v)
            return re.sub(r'\{X:([\w-]+)\}', lambda m: fmt(dt.date.fromisoformat(TD[m.group(1)]['release'])), x)
        if isinstance(x, (list, tuple)): return type(x)(sub(i) for i in x)
        return x
    t = {k: sub(v) for k, v in t.items()}
    t.update(kicker=f"FILM · IN CINEMAS {fmt(d).upper()}, {d.year}", cover_tag=f"FILM · {fmt(d).upper()}, {d.year}", release=f"{fmt(d)}, {d.year}",
      **{'from': '~' + fmt(a)}, keep='2 weeks after', bar=[round(13 / span * 100), round(18 / span * 100), round(17 / span * 100)], scale=[fmt(t0), fmt(d), fmt(t1)])
    return t
for t in T: (R / 'design/title' / t['file']).write_text(page(with_dates(t)))

print('ok')
