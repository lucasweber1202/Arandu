(function(){
  const root=document.querySelector('[data-narrative-list]');
  if(!root)return;
  function escapeHtml(value){return String(value||'').replace(/[&<>'"]/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));}
  function card(item,featured=false){
    return '<a class="op-article-card '+(featured?'featured':'')+'" href="artigo.html?id='+escapeHtml(item.id)+'"><span>'+escapeHtml(item.type)+' · '+escapeHtml(item.readTime)+'</span><strong>'+escapeHtml(item.title)+'</strong><p>'+escapeHtml(item.summary)+'</p><small>'+escapeHtml(item.author)+'</small></a>';
  }
  fetch('data/narrative.json',{cache:'no-store'}).then((res)=>res.json()).then((items)=>{
    const featured=items.find((item)=>item.featured)||items[0];
    const other=items.filter((item)=>item!==featured).slice(0,6);
    root.innerHTML='<div class="op-narrative-grid narrative-safe-grid">'+(featured?'<div class="narrative-featured-col">'+card(featured,true)+'</div>':'')+'<div class="narrative-card-grid">'+other.map((item)=>card(item,false)).join('')+'</div></div>';
  }).catch(()=>{root.innerHTML='<div class="op-empty"><strong>Não foi possível carregar a narrativa</strong><span>Atualize a página ou tente novamente.</span></div>';});
})();
