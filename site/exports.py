"""Готовые списки для модераторов и uBlock (Антон 22.11.2026, исследование №1).

Для каждого тайтла: dist/lists/<slug>/
  discord.txt          — Discord AutoMod: (A) regex «только спойлеры» (имя рядом со спойлер-словом), (B) ключевые слова «скрыть всё»;
  reddit-automod.yaml  — Reddit AutoModerator: пометить пост как спойлер и сообщить модераторам;
  ublock.txt           — uBlock Origin: скрыть карточки YouTube/Reddit, где имя стоит рядом со спойлер-словом.
Слова — английские (basic + balanced) из data/titles, спойлер-слова — data/vocab.json (en).
Ограничения Discord: ключевое слово ≤ 60 символов, ≤ 1000 слов; regex ≤ 260 символов (Rust regex, без lookaround).
"""
import re



def _rx(s):
    s = re.sub(r'([.^$*+?()\[\]{}|\\])', r'\\\1', s.lower().strip())
    return re.sub(r'\s+', r'\\s+', s)


def _alts(words, budget=10**6):
    """Варианты через |, в исходном порядке (сначала названия, потом имена), пока влезают в budget."""
    out, n = [], 0
    for w in dict.fromkeys(x.lower().strip() for x in words if x and len(x.strip()) >= 3):
        r = _rx(w)
        if n + len(r) + 1 > budget:
            continue
        out.append(r); n += len(r) + 1
    return '|'.join(out)


SPO = ['spoiler', 'spoilers', 'ending', 'dies', 'died', 'death', 'killed', 'finale', 'twist', 'leak', 'leaked', 'post credits', 'who dies']
GAP = r'\W+(?:\w+\W+){0,5}'


def combo(names, vocab, limit=None):
    """limit (Discord, 260): только «имя … спойлер-слово»; без limit — оба порядка и все слова."""
    if limit:
        spo = _alts(SPO, 80)
        nm = _alts(names, limit - len(spo) - len(GAP) - 10)
        return f'(?:{nm}){GAP}(?:{spo})'
    spo = _alts(vocab + SPO)
    nm = _alts(names)
    return f'(?:{nm}){GAP}(?:{spo})|(?:{spo}){GAP}(?:{nm})'


def build(titles, dist, base):
    import json
    from pathlib import Path
    R = Path(__file__).resolve().parent.parent
    vocab = json.loads((R / 'data/vocab.json').read_text(encoding='utf-8'))['vocab']['en']
    n = 0
    for t in titles:
        W = t.get('words', {}).get('en')
        if not W:
            continue
        names = [w for w in W.get('basic', []) + W.get('balanced', []) if w]
        if not names:
            continue
        name = t['names'].get('en') or t['slug']
        page = base.rstrip('/') + t['url']
        rx = combo(names, vocab)
        rxd = combo(names, vocab, 260)
        kw = [w for w in dict.fromkeys(x.lower() for x in names) if len(w) <= 60][:1000]
        d = dist / 'lists' / t['slug']
        d.mkdir(parents=True, exist_ok=True)
        (d / 'discord.txt').write_text(
            f'{name}: spoiler filter for Discord AutoMod\n'
            f'From {page} (free, updated with each release). Made by Pure Spoiler Blocker.\n\n'
            f'Server Settings > AutoMod > Block Custom Words.\n\n'
            f'OPTION A. Spoilers only (people can still talk about {name}).\n'
            f'Paste this line into "Regex patterns":\n\n{rxd}\n\n'
            f'OPTION B. Hide every mention (for general channels during release week).\n'
            f'Paste this into "Keywords":\n\n{", ".join(kw)}\n', encoding='utf-8')
        q = rx.replace("'", "''")
        (d / 'reddit-automod.yaml').write_text(
            f'---\n'
            f'# {name}: spoiler filter for Reddit AutoModerator\n'
            f'# From {page} (free, updated with each release). Made by Pure Spoiler Blocker.\n'
            f'# Mod Tools > Automations > AutoModerator: paste below your existing rules.\n'
            f'type: submission\n'
            f"title+body (includes, regex): ['{q}']\n"
            f'set_spoiler: true\n'
            f'action: report\n'
            f'action_reason: "Possible {name} spoiler"\n'
            f'---\n'
            f'type: comment\n'
            f"body (includes, regex): ['{q}']\n"
            f'action: report\n'
            f'action_reason: "Possible {name} spoiler in a comment"\n', encoding='utf-8')
        sel_yt = ['ytd-rich-item-renderer', 'ytd-video-renderer', 'ytd-compact-video-renderer', 'yt-lockup-view-model', 'ytd-reel-item-renderer']
        sel_rd = ['shreddit-post', 'shreddit-comment']
        js = rx.replace('/', r'\/')
        (d / 'ublock.txt').write_text(
            f'! Title: {name} spoilers (mutespoilers)\n'
            f'! Homepage: {page}\n'
            f'! Hides YouTube and Reddit items where {name} appears next to a spoiler word.\n'
            f'! Want a soft blur you can click to reveal, and episode progress? Pure Spoiler Blocker does that.\n'
            + ''.join(f'www.youtube.com##{s}:has-text(/{js}/i)\n' for s in sel_yt)
            + ''.join(f'www.reddit.com##{s}:has-text(/{js}/i)\n' for s in sel_rd), encoding='utf-8')
        n += 1
    return n
