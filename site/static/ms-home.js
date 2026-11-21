// mutespoilers: поиск по тайтлам (алиасы, транслит, опечатки) и фильтр «ближайших 30 дней».
(function(){
var box=document.querySelector('.ms-search');if(box){
var inp=box.querySelector('input'),list=box.querySelector('[role=listbox]'),data=JSON.parse(document.getElementById('q-data').textContent),sel=-1,items=[];
function norm(s){return String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim()}
function lev(a,b){if(Math.abs(a.length-b.length)>1)return 9;var d=[],i,j;for(i=0;i<=a.length;i++)d[i]=[i];for(j=0;j<=b.length;j++)d[0][j]=j;for(i=1;i<=a.length;i++)for(j=1;j<=b.length;j++){d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])d[i][j]=Math.min(d[i][j],d[i-2][j-2]+1)}return d[a.length][b.length]}
data.forEach(function(t){t.k=t.a.map(norm);t.kc=t.k.map(function(x){return x.replace(/ /g,'')})});
function score(t,q){var qc=q.replace(/ /g,''),best=0;
  t.k.forEach(function(k,i){var kc=t.kc[i];
    if(k===q||kc===qc)best=Math.max(best,5);else if(k.indexOf(q)===0||kc.indexOf(qc)===0)best=Math.max(best,4);
    else if(k.indexOf(' '+q)>-1)best=Math.max(best,3);else if(qc.length>2&&kc.indexOf(qc)>-1)best=Math.max(best,2);
    else if(q.length>=4){k.split(' ').forEach(function(w){if(lev(w,q)<=1)best=Math.max(best,1)})}});
  return best}
function draw(){var q=norm(inp.value);list.innerHTML='';sel=-1;
  if(!q){list.hidden=true;inp.setAttribute('aria-expanded','false');return}
  var max=window.matchMedia('(max-width:820px)').matches?6:10;
  items=data.map(function(t){return[score(t,q),t]}).filter(function(x){return x[0]>0}).sort(function(a,b){return b[0]-a[0]||a[1].n.localeCompare(b[1].n)}).slice(0,max).map(function(x){return x[1]});
  if(!items.length){var li=document.createElement('li');li.className='ms-none';li.innerHTML='<span></span><a></a>';li.firstChild.textContent=box.getAttribute('data-none');var a=li.lastChild;a.textContent=box.getAttribute('data-req');a.href=box.getAttribute('data-req-href');list.appendChild(li)}
  items.forEach(function(t,i){var li=document.createElement('li');li.setAttribute('role','option');li.id='q-o'+i;li.setAttribute('aria-selected','false');
    var a=document.createElement('a');a.href=t.u;var n=document.createElement('span');n.textContent=t.n;var k=document.createElement('span');k.className='ms-qk';k.textContent=t.m+(t.d?' · '+t.d:'');a.appendChild(n);a.appendChild(k);li.appendChild(a);list.appendChild(li)});
  list.hidden=false;inp.setAttribute('aria-expanded','true')}
function move(d){var o=list.querySelectorAll('[role=option]');if(!o.length)return;sel=(sel+d+o.length)%o.length;o.forEach(function(x,i){x.setAttribute('aria-selected',i===sel)});inp.setAttribute('aria-activedescendant',o[sel].id)}
inp.addEventListener('input',draw);
inp.addEventListener('keydown',function(e){if(e.key==='ArrowDown'){e.preventDefault();move(1)}else if(e.key==='ArrowUp'){e.preventDefault();move(-1)}else if(e.key==='Enter'){var t=items[sel>-1?sel:0];if(t){e.preventDefault();location.href=t.u}}else if(e.key==='Escape'){inp.value='';draw()}});
document.addEventListener('click',function(e){if(!box.contains(e.target)){list.hidden=true;inp.setAttribute('aria-expanded','false')}});
}
document.querySelectorAll('.ms-ftabs').forEach(function(g){var bs=[].slice.call(g.querySelectorAll('button')),rows=[].slice.call(document.querySelectorAll('.ms-next .ms-cal-list li'));
  bs.forEach(function(b){b.addEventListener('click',function(){var f=b.getAttribute('data-f');bs.forEach(function(x){x.setAttribute('aria-pressed',x===b)});rows.forEach(function(r){r.hidden=!(f==='all'||r.getAttribute('data-m')===f)})})})});
})();
