# data/titles/ — один тайтл = один файл (шаг 1 переезда на mutespoilers.com, 21.11.2026)

Собирается из старых файлов скриптом `python3 tools/migrate-titles.py`. Пока старый сайт на github.io живёт,
главные источники — старые (`data/titles.json`, `data/title-words.json`, `i18n/titles/`); этот набор перезаписывается.
После переезда главным станет этот набор, а старые файлы уберём.

Поля: `slug`, `media` (games|movies|tv|anime), `url` (новый адрес), `names` по языкам, `release` {date, status: confirmed|unverified, source, platforms},
`season`, `wikidata`, `words` {язык: {basic, balanced}} (уровень «Максимальный» общий: `data/vocab.json`),
`spoiler_blocklist` и `spoiler_safe_verified` (проверка R07), `texts` (тексты страницы по языкам), `old_urls` (для карты 301), `changelog`.
