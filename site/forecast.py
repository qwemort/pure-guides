"""Блок «прогноз угрозы» вверху страницы тайтла (28.11.2026, docs/SITE-PLAN.md п. 2, 3, 3a в pure-extensions).
Строится ТОЛЬКО из поля `intel` (робот tools/title-intel.mjs, факты с цитатами, мерж Антона). Нет intel → блока нет.
Пока только английские страницы: тексты блока на других языках добавим отдельно.
"""
import re
from datetime import date
from html import escape

LEVELS = [('quiet', 'Quiet'), ('whispers', 'Whispers'), ('leaking', 'Leaking'), ('everyone_knows', 'Everyone knows')]
MAIN = {'united states', 'us', 'usa', 'worldwide', ''}


def _d(iso):
    try:
        y, m, d = map(int, iso.split('-')); return date(y, m, d)
    except Exception:
        return None


def _fmt(iso):
    x = _d(iso)
    return f"{x.strftime('%b')} {x.day}" if x else ''


def _items(t, facts, today):
    rel = t['release'].get('date')
    out = []
    early = {}
    for f in facts:
        if f['type'] == 'release_country' and f.get('date') and rel and f['date'] < rel and f.get('place', '').lower() not in MAIN:
            early.setdefault(f['date'], []).append(f['place'])
    for f in facts:
        dt, ty, pl = f.get('date', ''), f['type'], f.get('place', '')
        if dt and _d(dt) and _d(dt) < today:
            continue
        when = _fmt(dt) if dt else 'Now'
        if ty == 'world_premiere':
            out.append((dt or '0', f"{when} · world premiere" + (f" in {escape(pl)}" if pl else ''), 'first social reactions can land that night'))
        elif ty == 'review_embargo':
            out.append((dt or '0', f"{when} · reviews go live", 'headlines and thumbnails can name surprises'))
        elif ty == 'social_embargo':
            out.append((dt or '0', f"{when} · first reactions allowed", 'posts from the premiere crowd start that day'))
        elif ty == 'early_screening':
            out.append((dt or '0', f"{when} · early screenings" + (f" ({escape(pl)})" if pl else ''), 'people who saw it start posting'))
        elif ty == 'platform_later':
            out.append((dt or '0', f"{when} · {escape(pl or 'later platform')}", escape(f.get('note', ''))))
        elif ty in ('leak', 'merch_leak'):
            out.append(('0', 'Now · ' + ('toys and merch' if ty == 'merch_leak' else 'leaks'), escape(f.get('note', ''))))
    for dt, places in sorted(early.items()):
        n = (_d(rel) - _d(dt)).days
        out.append((dt, f"{_fmt(dt)} · out in {escape(', '.join(sorted(set(places))[:4]))}",
                    f"full plot online {n} day{'s' if n != 1 else ''} before the US. In the US? Your danger starts {_fmt(dt)}"))
    seen, uniq = set(), []
    for it in sorted(out, key=lambda x: x[0]):
        if it[1] not in seen:
            seen.add(it[1]); uniq.append(it)
    return uniq[:5]


def render(t, chips, cta_href, lang='en', today=None):
    intel = t.get('intel') or {}
    th, facts = intel.get('threat'), intel.get('facts') or []
    if lang != 'en' or not th or not facts or th.get('level') == 'archive':
        return ''
    today = today or date.today()
    rel = t['release'].get('date')
    lvl = th['level']
    spans = {'quiet': 'over' if lvl != 'quiet' else f"to {_fmt(th['whispers_from'])}",
             'whispers': f"to {_fmt(th['leaking_from'])}",
             'leaking': f"{_fmt(th['leaking_from'])} to {_fmt(th['everyone_knows_from'])}",
             'everyone_knows': f"to {_fmt(th['all_clear'])}"}
    scale = ''.join(f'<li{" class=\"on\"" if k == lvl else ""}>{"<i>now</i>" if k == lvl else ""}<b>{n}</b><span>{spans[k]}</span></li>' for k, n in LEVELS)
    leaks = [f for f in facts if f['type'] in ('leak', 'merch_leak')]
    left = (_d(rel) - today).days if _d(rel) else None
    if leaks:
        why = 'Leaks are already out: ' + '; '.join(escape(f['note'].rstrip('.')) for f in leaks[:2]) + '. Stay off leak accounts and toy news.'
    elif left is not None and left > 0:
        why = f"{left} days to release. Nothing has leaked that we could confirm yet."
    else:
        why = 'It is out. Spoilers are in titles, thumbnails and comments.'
    items = _items(t, facts, today)
    lis = ''.join(f'<li><b>{a}</b><span>{b}</span></li>' for _, a, b in items) or '<li><b>Nothing dated yet</b><span>we check every day</span></li>'
    rows = []
    for f in sorted([f for f in facts if f['type'] == 'release_country' and f.get('date')], key=lambda f: f['date']):
        if len(rows) < 3 and f['place'] not in [r[0] for r in rows]:
            rows.append((f['place'], _fmt(f['date'])))
    hosts = sorted({s['host'] for f in facts for s in f.get('sources', []) if s.get('host')})
    dl = ''.join(f'<div><dt>{escape(p)}</dt><dd>{d}</dd></div>' for p, d in rows)
    dl += f'<div><dt>Checked</dt><dd>{_fmt(intel.get("checked", ""))} · {len(hosts)} sources</dd></div>'
    src = ' · '.join(f'<a href="{escape(s["url"])}" rel="nofollow noopener">{escape(s["host"])}</a>'
                     for s in {s['host']: s for f in facts for s in f.get('sources', []) if s.get('url')}.values())
    chips_html = ''.join(f'<button class="chip q" type="button">{escape(c)}</button>' for c in chips[:6])
    return f'''<section class="fc" aria-label="Spoiler forecast">
<div class="fc-now"><p class="fc-label">Threat now</p><p class="fc-level">{dict(LEVELS)[lvl]}</p>
<ol class="fc-scale" aria-label="Threat scale">{scale}</ol><p class="fc-why">{why}</p></div>
<div class="fc-from"><p class="fc-label">Where it comes from, by date</p><ul>{lis}</ul></div>
<div class="fc-clear"><p class="fc-label">All clear</p><p class="fc-date">{_fmt(th["all_clear"])}</p>
<p class="fc-note">3 weeks after release. Watching later? Keep filters on until you have seen it.</p><dl class="fc-facts">{dl}</dl></div>
</section>
<p class="fc-src muted">Sources: {src}. Dates marked "reported" come from one outlet.</p>
<section class="fc-plan" aria-label="2-minute plan">
<div class="fc-phone"><p class="fc-label">On your phone · 1 minute</p><p>Copy these into muted words. Full lists per app below.</p>
<div class="chips">{chips_html}</div><a class="fc-link" href="#where">X, Instagram, TikTok, Bluesky: step by step</a></div>
<div class="fc-pc"><p class="fc-label">On your computer · 1 click</p><p>Pure Spoiler Blocker has a ready list for this title. It blurs matching videos, posts and comments on YouTube, Reddit and X.</p>
<a class="cta" href="{escape(cta_href)}">Add to Chrome, free</a><small>Also for Firefox. No account, nothing leaves your browser.</small></div>
</section>'''


def inject(main_html, t, lang='en', today=None):
    """Ставит прогноз над двумя колонками: заголовок страницы, потом прогноз, потом остальное."""
    chips = re.findall(r'<button class="chip q" type="button">([^<]+)</button>', main_html)
    cta = re.search(r'<a class="cta" href="([^"]+)"', main_html)
    block = render(t, chips, cta.group(1) if cta else '#', lang, today)
    if not block:
        return main_html
    top = re.search(r'<div class="ms-top">[\s\S]*?</div>\s*', main_html)
    if not top:
        return main_html
    rest = main_html.replace(top.group(0), '', 1)
    head = top.group(0)
    # старые оценки «спойлеры примерно с …» и «держите фильтры N недель» заменяет прогноз — убираем, чтобы не спорили с ним
    head = re.sub(r'\s*Spoilers usually start[^.]*\.', '', head)
    head = re.sub(r'\s*Keep filters on:[^.<]*\.?', '', head)
    head = re.sub(r'<p class="ms-checked[\s\S]*?</p>', '', head)
    return rest.replace('<div class="ms-grid">', head + block + '<div class="ms-grid">', 1)
