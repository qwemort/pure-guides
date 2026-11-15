# Промпт: перевод 3 страниц сайта на 12 языков (новый чат)

Читай ТОЛЬКО START-NEW-CHAT.md и CLAUDE.md в qwemort/pure-extensions, потом этот файл. Отвечай по-русски, коротко, технические решения принимай сам.

Задача: перевести на 12 языков (de es fr it ja ko pl pt-br ru tr uk zh-cn) три страницы pure-guides, которые сейчас только на английском:
1. avoid-gta-6-spoilers.html (главный гайд, уже есть uk и pl: yak-unyknuty-spoileriv-gta-6.html, jak-uniknac-spoilerow-gta-6.html; нужны остальные 10, uk/pl не трогать, но включить в hreflang)
2. block/gta6.html
3. demo/index.html

Исходные английские тексты: pure-guides/i18n/pages/*.en.md (без блока «открой на компьютере»: он добавляется сам tools/mobile-handoff.py).

Как сделать (по образцу страницы для стримеров gta-6-streamer-blocked-words.html: 13 версий, hreflang-кластер, в sitemap, переключатель языков):
- переводить как носитель, не дословно; правила тона и список «не переводить» в i18n/PROMPT-translate.md (Pure Spoiler Blocker, YouTube, Reddit, X, Chrome, Firefox, GTA VI, GTA 6, Shield и т.д. не переводятся; без длинных тире);
- ссылки, utm (utm_source=pureguides&utm_medium=...), числа (60 списков, 22 написания, 47 имён) и даты не менять; всё бесплатно, платной версии нет;
- в гайде перевести и FAQ, и JSON-LD (FAQPage) если есть;
- slug на языке страницы по образцу стримерских (gta-6-gesperrte-woerter-twitch-kick.html и т.п.), добавить в sitemap.xml, hreflang на всех 13 версиях, x-default на английскую;
- прогнать python3 tools/build.py и tools/site-check.py: 0 ошибок;
- ветка + PR, слить squash, записать строку в HANDOFF-<дата>.md в pure-extensions и в блок статуса README.md.

Контекст: цель 100 живых пользователей в неделю к Новому году, релиз GTA 6 19.11.2026. Статистика Cloudflare 15.11: страница гайда самая посещаемая после главной (12 визитов). Не спрашивай то, что видно в GitHub.
