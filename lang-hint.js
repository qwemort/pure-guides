/* Язык страницы по браузеру. Английская страница, у которой есть перевод (link rel="alternate" hreflang),
   сама открывает версию на языке человека: сначала его явный выбор (клик по ссылке с hreflang, например
   в переключателе языков внизу), иначе первый язык из настроек браузера. Только при входе извне
   (не при переходе внутри сайта), «English» в переключателе запоминается и больше не перекидывает.
   Без сети и без cookies: выбор хранится в localStorage на этом устройстве. Поисковые роботы приходят
   с английским языком, поэтому видят английскую страницу, а переводы находят по hreflang. */
(function () {
  try {
    if (window.__pgLang) return; window.__pgLang = 1;
    var KEY = 'pg-lang', store = function (v) { try { localStorage.setItem(KEY, v); } catch (e) {} };
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest && e.target.closest('a[hreflang]');
      if (a) store(a.getAttribute('hreflang'));
    }, true);
    if ((document.documentElement.lang || 'en') !== 'en') return;
    if (/[?&]lang=en(&|$)/.test(location.search)) { store('en'); return; }
    if (document.referrer) { try { if (new URL(document.referrer).host === location.host) return; } catch (e) {} }
    var alts = {};
    document.querySelectorAll('link[rel="alternate"][hreflang]').forEach(function (l) {
      var h = l.getAttribute('hreflang').toLowerCase(); if (h !== 'x-default') alts[h] = l.href;
    });
    var saved = null; try { saved = localStorage.getItem(KEY); } catch (e) {}
    var want = saved ? [saved] : (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en']);
    for (var i = 0; i < want.length; i++) {
      var c = String(want[i]).toLowerCase(), base = c.split('-')[0];
      if (base === 'en') return;
      var hit = alts[c] || alts[base] || (base === 'pt' && alts['pt-br']) || (/^zh(-cn|-sg|-hans.*)?$/.test(c) && alts['zh-cn']);
      if (hit) { if (hit !== location.href.split('#')[0]) location.replace(hit + location.hash); return; }
    }
  } catch (e) {}
})();
