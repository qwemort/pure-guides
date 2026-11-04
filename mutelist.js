(function(){
  var toast=document.getElementById('toast'),t;
  function say(m){toast.textContent=m;toast.className='on';clearTimeout(t);t=setTimeout(function(){toast.className=''},1400)}
  function copy(text){
    if(navigator.clipboard&&navigator.clipboard.writeText){return navigator.clipboard.writeText(text)}
    var ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();
    try{document.execCommand('copy')}catch(e){}document.body.removeChild(ta);return Promise.resolve();
  }
  var groups={};
  document.querySelectorAll('.chips').forEach(function(box){
    var words=box.textContent.split('|').map(function(w){return w.trim()}).filter(Boolean);
    groups[box.dataset.group]=words;box.textContent='';
    words.forEach(function(w){
      var b=document.createElement('button');b.type='button';b.className='chip';b.textContent=w;
      b.onclick=function(){copy(w).then(function(){b.classList.add('done');say('Copied: '+w)})};
      box.appendChild(b);
    });
  });
  document.querySelectorAll('.copyall').forEach(function(b){
    b.onclick=function(){var w=groups[b.dataset.copy]||[];copy(w.join('\n')).then(function(){say('Copied '+w.length+' words')})};
  });
})();
