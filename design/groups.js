/* Плавное раскрытие групп тайтлов (<details class="tgroup">). Без JS работает как обычный details. */
(function(){
  if(matchMedia('(prefers-reduced-motion: reduce)').matches||!Element.prototype.animate)return;
  document.addEventListener('click',function(e){
    var s=e.target.closest&&e.target.closest('details.tgroup>summary');
    if(!s)return;
    var d=s.parentNode,c=d.querySelector('.titles');
    if(!c)return;
    e.preventDefault();
    var mt=parseFloat(getComputedStyle(c).marginTop)||0;
    var cur=d._a?c.getBoundingClientRect().height:null;
    if(d._a){d._a.onfinish=d._a.oncancel=null;d._a.cancel();}
    var opening=d._a?!d._closing:!d.open;
    var full;
    if(opening){d.open=true;}
    full=c.scrollHeight;
    var from=cur!==null?cur:(opening?0:full), to=opening?full:0;
    var m0=from?mt:0, m1=to?mt:0;
    d._closing=!opening;if(opening)d.removeAttribute('data-closing');else d.setAttribute('data-closing','');
    c.style.overflow='hidden';
    var a=d._a=c.animate([{height:from+'px',marginTop:m0+'px',opacity:from?1:0},{height:to+'px',marginTop:m1+'px',opacity:to?1:0}],{duration:280,easing:'cubic-bezier(.2,.7,.2,1)'});
    a.onfinish=function(){d._a=null;c.style.overflow='';if(!opening){d.open=false;d.removeAttribute('data-closing');}};
    a.oncancel=function(){c.style.overflow='';};
  });
})();
