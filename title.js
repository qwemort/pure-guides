document.addEventListener('click',function(e){var b=e.target.closest('.chip,.copyall');if(!b)return;var t=b.classList.contains('chip')?b.textContent:Array.from(b.parentNode.querySelectorAll('.chip')).map(function(x){return x.textContent}).join('\n');var o=b.textContent;var done=function(){b.textContent=document.documentElement.getAttribute('data-copied')||'Copied';setTimeout(function(){b.textContent=o},1200)};if(navigator.clipboard)navigator.clipboard.writeText(t).then(done,function(){});});
(function(){
var bar=document.querySelector('.t-langbar');if(!bar)return;
var btn=bar.querySelector('.t-lbtn'),menu=bar.querySelector('.t-lmenu'),cur=bar.querySelector('.t-lcur');
var items=Array.prototype.slice.call(menu.querySelectorAll('button'));
var codes=items.map(function(b){return b.getAttribute('data-lang')});
function pick(){
  try{var s=localStorage.getItem('pg-words-lang');if(s&&codes.indexOf(s)>-1)return s}catch(e){}
  var pl=document.documentElement.getAttribute('lang');if(pl&&codes.indexOf(pl)>-1)return pl;
  var l=(navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language||'en']);
  for(var i=0;i<l.length;i++){
    var x=String(l[i]),lo=x.toLowerCase(),p=lo.split('-')[0];
    if(lo==='pt-br'||p==='pt')return 'pt-BR';
    if(p==='zh')return 'zh-CN';
    if(codes.indexOf(p)>-1)return p;
  }
  return 'en';
}
function show(c,save){
  Array.prototype.forEach.call(document.querySelectorAll('.t-lang'),function(p){p.hidden=p.getAttribute('data-lang')!==c});
  items.forEach(function(b){var on=b.getAttribute('data-lang')===c;if(on){b.setAttribute('aria-current','true');cur.textContent=b.textContent}else b.removeAttribute('aria-current')});
  if(save){try{localStorage.setItem('pg-words-lang',c)}catch(e){}}
}
function close(){menu.hidden=true;btn.setAttribute('aria-expanded','false')}
btn.addEventListener('click',function(){var o=menu.hidden;menu.hidden=!o;btn.setAttribute('aria-expanded',o?'true':'false')});
items.forEach(function(b){b.addEventListener('click',function(){show(b.getAttribute('data-lang'),true);close();btn.focus()})});
document.addEventListener('click',function(e){if(!bar.contains(e.target))close()});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!menu.hidden){close();btn.focus()}});
show(pick(),false);
})();
