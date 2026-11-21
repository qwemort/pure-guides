// mutespoilers: вкладки соцсетей, очередь слов для X/Bluesky (галочки в localStorage), копирование строкой, ссылка на список.
(function(){
var copied=document.documentElement.getAttribute('data-copied')||'Copied';
function copy(t,b){if(!navigator.clipboard)return;navigator.clipboard.writeText(t).then(function(){if(!b)return;var o=b.textContent;b.textContent=copied;setTimeout(function(){b.textContent=o},1200)},function(){})}
// вкладки (клавиши влево/вправо)
document.querySelectorAll('.ms-tabs').forEach(function(bar){
  var tabs=[].slice.call(bar.querySelectorAll('[role=tab]'));
  function sel(t,focus){tabs.forEach(function(x){var on=x===t;x.setAttribute('aria-selected',on);x.tabIndex=on?0:-1;document.getElementById(x.getAttribute('aria-controls')).hidden=!on});if(focus)t.focus()}
  tabs.forEach(function(t,i){t.addEventListener('click',function(){sel(t)});t.addEventListener('keydown',function(e){var d=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;if(d){e.preventDefault();sel(tabs[(i+d+tabs.length)%tabs.length],true)}})});
});
// очередь: тап копирует слово и ставит галочку
document.querySelectorAll('.ms-queue').forEach(function(q){
  var key=q.getAttribute('data-key'),chips=[].slice.call(q.querySelectorAll('.chip.q')),cnt=q.querySelector('.ms-count'),tpl=q.getAttribute('data-done');
  var done={};try{done=JSON.parse(localStorage.getItem(key)||'{}')}catch(e){}
  function draw(){var k=0;chips.forEach(function(c){var on=!!done[c.textContent];c.setAttribute('aria-pressed',on);if(on)k++});cnt.textContent=tpl.replace('{k}',k).replace('{n}',chips.length)}
  function save(){try{localStorage.setItem(key,JSON.stringify(done))}catch(e){}}
  chips.forEach(function(c){c.addEventListener('click',function(e){e.stopPropagation();copy(c.textContent);done[c.textContent]=1;save();draw()})});
  q.querySelector('.ms-reset').addEventListener('click',function(){done={};save();draw()});
  draw();
});
document.querySelectorAll('.ms-copyline').forEach(function(b){b.addEventListener('click',function(e){e.stopPropagation();copy(b.getAttribute('data-text'),b)})});
document.querySelectorAll('.ms-share').forEach(function(b){b.addEventListener('click',function(){copy(location.origin+location.pathname+'#mute-words',b)})});
})();
