#!/usr/bin/env python3
"""Шаг 1 переезда на mutespoilers.com: один тайтл = один файл data/titles/<slug>.json.

Собирает всё про тайтл из старых мест (data/titles.json, data/title-words.json, i18n/titles/<id>.json,
data/games.json) в один файл. Старые файлы НЕ трогает: текущий сайт на github.io собирается как раньше.
Повторный запуск перезаписывает data/titles/ из старых источников (пока они главные).
Запуск: python3 tools/migrate-titles.py
"""
import json, re, sys
from pathlib import Path

R = Path(__file__).resolve().parent.parent
OUT = R / 'data' / 'titles'
MEDIA = {'game': 'games', 'film': 'movies', 'movie': 'movies', 'show': 'tv', 'anime': 'anime'}
LANGS = ['en', 'de', 'es', 'fr', 'it', 'ja', 'ko', 'pl', 'pt-BR', 'ru', 'tr', 'uk', 'zh-CN']


def load(p):
    return json.loads((R / p).read_text(encoding='utf-8'))


def slug_of(page):
    s = re.sub(r'^avoid-', '', page)
    s = re.sub(r'-spoilers$', '', s)
    if not re.fullmatch(r'[a-z0-9]+(-[a-z0-9]+)*', s):
        sys.exit(f'плохой слаг из {page!r}: {s!r}')
    return s


def old_urls(tid, T):
    """Все старые адреса страницы тайтла (для карты 301 на шаге 7). Пути от корня старого сайта."""
    u = {}
    for lang in LANGS:
        own = T.get('paths', {}).get(lang)
        u[lang] = [own or (f"{T['page']}.html" if lang == 'en' else f"{T['page']}.{lang.lower()}.html")]
        if own and lang != 'en':  # у языка был свой адрес, но генератор мог писать и стандартный
            u[lang].append(f"{T['page']}.{lang.lower()}.html")
    u['en'] += [f'block/{tid}.html', f'mute-list/{tid}.html']
    return u


def main():
    titles = load('data/titles.json')['titles']
    words = load('data/title-words.json')
    games = load('data/games.json')
    OUT.mkdir(parents=True, exist_ok=True)
    (R / 'data' / 'vocab.json').write_text(json.dumps(
        {'_note': 'Общие слова уровня «Максимальный» по языкам (одинаковые для всех тайтлов). Из title-words.json.',
         'vocab': words['vocab']}, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')

    seen, report = {}, []
    for tid, T in titles.items():
        media = MEDIA[T['kind']]
        slug = slug_of(T['page'])
        if (media, slug) in seen:
            sys.exit(f'совпадение слага {media}/{slug}: {tid} и {seen[(media, slug)]}')
        seen[(media, slug)] = tid
        W = words['titles'].get(tid, {})
        tx_path = R / 'i18n' / 'titles' / f'{tid}.json'
        texts = json.loads(tx_path.read_text(encoding='utf-8')) if tx_path.exists() else {}
        same_day = [x for x in games if x.get('date') == T.get('release') and
                    MEDIA.get(x.get('kind', 'game')) == MEDIA[T['kind']]]
        g = same_day[0] if len(same_day) == 1 else None

        lists = {}
        for lang in LANGS:
            basic = (W.get('forms', {}).get(lang, []) + W.get('extra', {}).get(lang, []))
            balanced = W.get('names', {}).get(lang, [])
            if basic or balanced:
                lists[lang] = {'basic': basic, 'balanced': balanced}

        rel = T.get('release')
        rec = {
            'id': tid,
            'slug': slug,
            'media': media,
            'url': f'/{media}/{slug}/',
            'names': {l: v['name'] for l, v in texts.items() if isinstance(v, dict) and v.get('name')} or {'en': T['name']},
            'release': {
                'date': rel,
                # честно: «подтверждено» только если дату сверил бот с Wikidata или есть источник
                'status': 'confirmed' if (T.get('qid') or (g and g.get('source'))) else 'unverified',
                'source': (g or {}).get('source') or (f"https://www.wikidata.org/wiki/{T['qid']}" if T.get('qid') else None),
                'platforms': (g or {}).get('platforms'),
            },
            'season': T.get('season'),
            'wikidata': T.get('qid'),
            'checked': T.get('checked'),
            'published': T.get('published'),
            'modified': T.get('modified'),
            'words': lists,
            'spoiler_blocklist': [],          # слова, которых НИКОГДА не должно быть в открытых списках (R07)
            'spoiler_safe_verified': False,   # ставит человек после проверки списков (R07)
            'texts': {l: v for l, v in texts.items()},
            'old_urls': old_urls(tid, T),
            'legacy': {k: T[k] for k in ('page', 'kind', 'tmpl', 'keep_old') if k in T},
            'changelog': [],
        }
        (OUT / f'{slug}.json').write_text(json.dumps(rec, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
        en = lists.get('en', {})
        report.append((media, slug, len(en.get('basic', [])) + len(en.get('balanced', [])),
                       len(lists), len(rec['texts']), rec['release']['status']))

    print(f'{len(report)} тайтлов -> data/titles/')
    for m in sorted({r[0] for r in report}):
        print(f'  {m}: {sum(1 for r in report if r[0] == m)}')
    weak = [r for r in report if r[2] < 12]
    print(f'меньше 12 своих слов (EN, без общих): {len(weak)}', [r[1] for r in weak][:10])
    print('даты подтверждены:', sum(1 for r in report if r[5] == 'confirmed'), 'из', len(report))


if __name__ == '__main__':
    main()
