(function(){
  const root=document.querySelector('[data-benchmark-cards]');
  if(!root)return;
  function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
  fetch('data/conversion-benchmark.json',{cache:'no-store'}).then(r=>r.json()).then((items)=>{
    root.innerHTML=items.map((item,index)=>'<article class="conversion-card"><span class="af-badge">'+esc(index===0?'alvo Arandu':'benchmark')+'</span><strong>'+esc(item.platform)+'</strong><p>'+esc(item.model)+'</p><p><b>'+esc(item.steps)+' etapas · '+esc(item.estimatedMinutes)+' min estimados</b></p><p><b>CTA:</b> '+esc(item.primaryCta)+'</p><p>'+esc(item.friction)+'</p><p><em>'+esc(item.conversionIdea)+'</em></p></article>').join('');
  }).catch(()=>{root.innerHTML='<div class="op-empty"><strong>Benchmark indisponível</strong><span>Atualize a página.</span></div>';});
})();
