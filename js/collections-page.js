(function(){
  const root=document.querySelector('[data-collections-grid]');
  const status=document.querySelector('[data-collections-status]');
  if(!root)return;
  const escapeHtml=(value)=>String(value??'').replace(/[&<>'"]/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const money=(value)=>value?Number(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'sob curadoria';
  function card(item){
    const id=item.id||item.slug;
    return `<a class="op-collection-card" href="comprar-arte.html?colecao=${escapeHtml(id)}">
      <strong>${escapeHtml(item.title)}</strong>
      <span>${escapeHtml(item.summary||'Coleção curatorial Arandu.')}</span>
      <div class="mvp-pill-row"><span class="mvp-pill">${escapeHtml(item.curatorial_axis||'Curadoria')}</span><span class="mvp-pill">${escapeHtml(item.audience||'Compradores')}</span></div>
      <em>${Number(item.artwork_count||0)} obras · a partir de ${money(item.starting_price)}</em>
    </a>`;
  }
  async function load(){
    try{
      const response=await fetch('/api/collections',{cache:'no-store'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||data.ok===false)throw new Error(data.error||'Não foi possível carregar coleções.');
      const collections=Array.isArray(data.collections)?data.collections:[];
      root.innerHTML=collections.length?collections.map(card).join(''):'<article class="macro-card"><strong>Sem coleções</strong><span>Cadastre coleções ou rode o SQL de coleções do MVP.</span></article>';
      if(status)status.textContent='Coleções carregadas do catálogo verificado.';
    }catch(error){
      root.innerHTML='<article class="macro-card catalog-unavailable"><strong>Coleções indisponíveis</strong><span>'+escapeHtml(error.message)+'</span><a href="status.html">Ver estado do serviço</a></article>';
      if(status)status.textContent='As coleções serão abertas após a validação do catálogo real.';
    }
  }
  load();
})();
