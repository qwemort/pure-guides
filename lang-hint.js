/* Тихая подсказка о языке: показывается только на английской странице, у которой есть перевод
   на язык браузера (uk или pl). Не перенаправляет, не ходит в сеть, помнит «закрыть» на устройстве. */
(function () {
  try {
    if ((document.documentElement.lang || 'en') !== 'en') return;
    var pref = (navigator.language || '').slice(0, 2).toLowerCase();
    if (pref !== 'uk' && pref !== 'pl') return;
    var alt = document.querySelector('link[rel="alternate"][hreflang="' + pref + '"]');
    if (!alt) return;
    var key = 'pg-lang-hint-' + pref;
    try { if (localStorage.getItem(key)) return; } catch (e) {}
    var msg = pref === 'uk' ? ['Ця сторінка є українською', 'Відкрити', 'Закрити'] : ['Ta strona jest po polsku', 'Otwórz', 'Zamknij'];
    var box = document.createElement('div');
    box.className = 'lang-hint';
    box.setAttribute('role', 'note');
    var text = document.createElement('span'); text.textContent = msg[0];
    var link = document.createElement('a'); link.href = alt.href; link.hreflang = pref; link.textContent = msg[1];
    var close = document.createElement('button'); close.type = 'button'; close.textContent = msg[2];
    close.onclick = function () { try { localStorage.setItem(key, '1'); } catch (e) {} box.remove(); };
    box.append(text, link, close);
    document.body.insertBefore(box, document.body.firstChild);
  } catch (e) {}
})();
