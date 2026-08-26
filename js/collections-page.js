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
      const presentation=window.AranduCatalogSource?.presentationEnabled?.()===true;
      const response=await fetch(presentation?'/data/collections.json':'/api/collections',{cache:'no-store'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||data.ok===false)throw new Error(data.error||'Não foi possível carregar coleções.');
      const collections=presentation?(Array.isArray(data)?data:[]):(Array.isArray(data.collections)?data.collections:[]);
      // Sem coleção cadastrada, esta era a única página pública que respondia ao
      // visitante com uma instrução de operação — "rode o SQL de coleções do
      // MVP". É o estado que produção devolve hoje, então era o que a pessoa
      // via ao abrir Coleções.
      root.innerHTML=collections.length?collections.map(card).join(''):'<article class="macro-card catalog-unavailable"><strong>As coleções abrem junto com o acervo</strong><span>Cada coleção é montada a partir de obras já conferidas. Enquanto o acervo está em validação curatorial, não há coleção para mostrar — e nenhuma é inventada.</span>'+(window.AranduCatalogSource?.rescueActions('acervo')||'')+'</article>';
      if(status)status.textContent=presentation?'Coleções demonstrativas para navegação; não representam catálogo comercial.':(collections.length?'Coleções carregadas do catálogo verificado.':'Nenhuma coleção publicada ainda.');
    }catch(error){
      // `error.message` traz o texto que a API escreveu para a operação. Quem
      // abriu Coleções precisa da leitura da fonte do catálogo, que já traduz o
      // motivo em linguagem de visitante.
      root.innerHTML='<article class="macro-card catalog-unavailable"><strong>Coleções em validação curatorial</strong><span>'+escapeHtml(window.AranduCatalogSource?.message(error,'conjunto de coleções')||'Não foi possível carregar as coleções agora. Recarregue a página em instantes ou fale com a curadoria.')+'</span>'+(window.AranduCatalogSource?.rescueActions('acervo')||'')+'</article>';
      if(status)status.textContent='As coleções serão abertas após a validação do catálogo real.';
    }
  }
  load();
})();
