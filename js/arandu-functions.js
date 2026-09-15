/* Arandu — funcionalidades públicas de compra e curadoria */
(function(){
  const COMPARE_KEY='arandu.compare.v1';
  const SELECTION_KEY='arandu.selection.v1';
  const PUBLIC_SKIP=/^(painel|admin|demo|roadmap|configuracao|login|cadastro|minha-conta)/i;
  function page(){return location.pathname.split('/').pop()||'index.html'}
  function isInternal(){return PUBLIC_SKIP.test(page())}
  function read(key){try{const data=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(data)?data:[]}catch{return[]}}
  function write(key,value){localStorage.setItem(key,JSON.stringify(value.slice(-20)))}
  function escapeAranduFunctionsHtml(value){return String(value||'').replace(/[&<>'"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]})}
  function toast(message){let el=document.querySelector('[data-arandu-toast]');if(!el){el=document.createElement('div');el.className='arandu-toast';el.dataset.aranduToast='true';document.body.appendChild(el)}el.textContent=message;el.classList.add('is-visible');clearTimeout(el._timer);el._timer=setTimeout(function(){el.classList.remove('is-visible')},2600)}
  function compareItems(){return read(COMPARE_KEY)}
  function selectionItems(){return read(SELECTION_KEY)}
  function removeCompare(id){write(COMPARE_KEY,compareItems().filter(function(item){return item.id!==id}));renderDock()}
  function renderDock(){if(isInternal())return;const compare=compareItems();const selected=selectionItems();let dock=document.querySelector('[data-arandu-decision-dock]');if(!dock){dock=document.createElement('aside');dock.className='arandu-decision-dock';dock.dataset.aranduDecisionDock='true';document.body.appendChild(dock)}if(!compare.length&&!selected.length){dock.hidden=true;return}dock.hidden=false;const compareText=compare.length?`${compare.length} em comparação`:'nenhuma comparação';const selectedText=selected.length?`${selected.length} na seleção`:'seleção vazia';dock.innerHTML=`<div><strong>Curadoria em andamento</strong><small>${escapeAranduFunctionsHtml(selectedText)} · ${escapeAranduFunctionsHtml(compareText)}</small></div><div class="dock-actions"><a class="primary" href="minha-selecao.html">Minha seleção</a><a href="comparar-obras.html">Comparar</a><a href="proposta-curatorial.html">Gerar proposta</a><button type="button" data-clear-compare>Limpar comparação</button></div>`}
  function renderComparePage(){const target=document.querySelector('[data-compare-runtime]');if(!target)return;const items=compareItems();if(!items.length){target.innerHTML='<article class="card arandu-guidance-card"><h2>Nenhuma obra em comparação.</h2><p>Volte ao acervo e clique em Comparar nas obras que chamarem atenção.</p><a class="cta secondary" href="obras.html">Abrir acervo</a></article>';return}target.innerHTML='<div class="grid grid-3">'+items.map(function(item){return `<article class="card"><p class="eyebrow">Comparação</p><h3>${escapeAranduFunctionsHtml(item.title)}</h3><p>${escapeAranduFunctionsHtml(item.artist)}</p><p>${escapeAranduFunctionsHtml(item.technique||'Técnica a confirmar')} · ${escapeAranduFunctionsHtml(item.dimensions||'Dimensão a confirmar')}</p><strong>${escapeAranduFunctionsHtml(item.priceLabel||'Sob consulta')}</strong><div class="arandu-compare-bar"><a class="arandu-compare-chip" href="${escapeAranduFunctionsHtml(item.url||'obra.html?id='+item.id)}">Ver obra</a><button class="arandu-compare-chip" type="button" data-remove-compare="${escapeAranduFunctionsHtml(item.id)}">Remover</button></div></article>`}).join('')+'</div>'}
  function addGuidanceBlocks(){if(document.querySelector('[data-arandu-guidance-added]'))return;const isCatalog=page()==='obras.html'||page()==='comprar-arte.html'||page()==='acervo.html';if(!isCatalog)return;const grid=document.querySelector('[data-catalog-grid]');if(!grid)return;const block=document.createElement('article');block.className='card arandu-guidance-card';block.dataset.aranduGuidanceAdded='true';block.innerHTML='<p class="eyebrow">Como escolher</p><h3>Use a seleção como uma conversa com a curadoria.</h3><p>Salve obras que geram interesse, compare alternativas e transforme a escolha em proposta. O objetivo não é comprar rápido; é comprar com clareza.</p><div class="page-actions"><a class="cta secondary" href="minha-selecao.html">Ver seleção</a><a class="cta secondary" href="encontrar-arte.html">Receber orientação</a></div>';grid.prepend(block)}
  function setupShortcuts(){document.addEventListener('keydown',function(event){if(event.key==='/'&&!/input|textarea|select/i.test(document.activeElement.tagName)){const search=document.querySelector('[data-catalog-search],[data-search-input]');if(search){event.preventDefault();search.focus();toast('Busca ativada.')}}})}
  document.addEventListener('click',function(event){const clear=event.target.closest('[data-clear-compare]');if(clear){event.preventDefault();write(COMPARE_KEY,[]);toast('Comparação limpa.');renderDock();renderComparePage();return}const remove=event.target.closest('[data-remove-compare]');if(remove){event.preventDefault();removeCompare(remove.dataset.removeCompare);renderComparePage();return}});
  document.addEventListener('arandu:selection-updated',renderDock);
  // A comparação é de artwork-tools.js: ele alterna a obra e desenha a própria
  // barra. Este arquivo também escutava o clique no mesmo botão, para sempre
  // *adicionar* a obra, mas nunca chegava a agir — lia o id por
  // `data-artwork-id`/`data-save-artwork`/`data-reserve-artwork`, e o botão de
  // comparar não tem nenhum deles. Era código morto com aparência de disputa.
  //
  // O dock não escuta `arandu:compare-changed` de propósito: ele é uma segunda
  // barra fixa no rodapé e, aberto junto com a barra de comparação, cobre o
  // "Comparar agora" dela. Enquanto as duas superfícies não forem uma só, quem
  // fala de comparação é a barra.
  document.addEventListener('DOMContentLoaded',function(){if(isInternal())return;addGuidanceBlocks();renderDock();renderComparePage();setupShortcuts();setTimeout(function(){addGuidanceBlocks();renderDock();renderComparePage()},900);setTimeout(renderDock,1800)});
})();
