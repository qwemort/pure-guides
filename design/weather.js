// «Спойлерная погода»: настоящие данные бота (data/spoiler-index.json) и релизы недели (spoiler-danger/*.json).
(function () {
  var root = document.getElementById('wx'); if (!root) return;
  var base = document.querySelector('link[href$="pure.css"]').href.replace(/design\/pure\.css.*$/, '');
  var tabs = document.getElementById('wxTabs'), body = document.getElementById('wxBody');
  var slides = [], cur = 0, timer = null;
  var calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function el(h) { var d = document.createElement('div'); d.innerHTML = h; return d; }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function shortName(t) { t = t.replace(/ Season \d+$/, '').split(':')[0].trim(); if (t.length <= 18) return t; var w = t.split(' '), o = ''; for (var i = 0; i < w.length && (o + ' ' + w[i]).trim().length <= 17; i++) o = (o + ' ' + w[i]).trim(); return (o || t.slice(0, 17)) + '…'; }
  function days(iso) { return Math.ceil((new Date(iso + 'T00:00:00') - new Date()) / 864e5); }
  function show(i) {
    cur = i;
    Array.prototype.forEach.call(tabs.children, function (b, j) { b.setAttribute('aria-selected', j === i ? 'true' : 'false'); });
    body.innerHTML = slides[i].html;
  }
  function start() { if (calm || slides.length < 2) return; stop(); timer = setInterval(function () { show((cur + 1) % slides.length); }, 6000); }
  function stop() { if (timer) clearInterval(timer); timer = null; }
  root.addEventListener('mouseenter', stop); root.addEventListener('mouseleave', start);
  root.addEventListener('focusin', stop);
  function build() {
    tabs.innerHTML = '';
    slides.forEach(function (s, i) {
      var b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'tab'); b.textContent = s.tab;
      b.addEventListener('click', function () { stop(); show(i); }); tabs.appendChild(b);
    });
    if (slides.length) { show(0); start(); } else { body.innerHTML = '<p class="small">No data today.</p>'; }
  }
  var idx = fetch(base + 'data/spoiler-index.json').then(function (r) { return r.json(); }).catch(function () { return null; });
  var week = fetch(base + 'spoiler-danger/latest.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  Promise.all([idx, week]).then(function (res) {
    var ix = res[0], wk = res[1];
    if (ix && ix.length) {
      var t = ix[ix.length - 1], d = days('2026-11-19'), end = (t.queries || []).filter(function (q) { return /ending/.test(q.q); })[0];
      document.getElementById('wxDate').textContent = t.date;
      slides.push({ tab: 'GTA VI', html:
        '<p class="wx-kind">Game · consoles ' + (d > 0 ? 'in ' + d + ' days' : 'out now') + '</p><p class="wx-title">GTA VI</p>' +
        '<div class="wx-big"><span class="wx-num">' + t.main.spoilers + ' of ' + t.main.cards + '</span><span>videos for “' + esc(t.main.q) + '” on YouTube had spoilers today</span></div>' +
        (end ? '<p class="wx-line">Search “' + esc(end.q) + '” and it is ' + end.spoilers + ' of ' + end.cards + '.</p>' : '') +
        '<p class="wx-line"><a href="' + base + 'spoiler-index/">Daily spoiler index</a> · <a href="' + base + 'gta-6-mute-list.html">GTA 6 mute list</a></p>' });
    }
    if (wk && wk.items) {
      wk.items.filter(function (it) { return days(it.date) >= 0 && !/gta/i.test(it.title); }).sort(function (a, b) { return a.date < b.date ? -1 : 1; }).slice(0, 4).forEach(function (it) {
        var d = days(it.date), dt = new Date(it.date + 'T00:00:00');
        var when = d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
        slides.push({ tab: shortName(it.title), html:
          '<p class="wx-kind">' + (it.kind === 'anime' ? 'Anime' : 'Series') + ' · ' + esc(it.note) + '</p><p class="wx-title">' + esc(it.title) + '</p>' +
          '<div class="wx-big"><span class="wx-num">' + when + '</span><span>new episode. Spoilers start the same day.</span></div>' +
          (it.mute ? '<p class="wx-line"><a href="' + base + esc(it.mute) + '">Mute list for it</a></p>' : '') +
          '<p class="wx-line small">Source: <a href="' + esc(it.source) + '">' + esc(it.source.split('/')[2]) + '</a></p>' });
      });
    }
    build();
  });
  // демо двойного клика
  document.querySelectorAll('.row.hid .veil').forEach(function (v) {
    v.addEventListener('click', function () {
      var row = v.parentNode;
      if (row.classList.contains('armed')) { row.classList.add('open'); return; }
      row.classList.add('armed'); v.innerHTML = 'Click again to show. <b>It may spoil the story.</b>';
    });
  });
})();
