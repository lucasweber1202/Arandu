(function(){
  const root=document.querySelector('[data-ux-catalog]');
  if(!root) return;

  const state={term:'',type:'todos',axis:'todos',edition:'todos',price:'todos',sort:'curadoria',dense:false};
  const countEl=document.querySelector('[data-ux-catalog-count]');
  const input=document.querySelector('[data-ux-catalog-search]');
  const typeSelect=document.querySelector('[data-ux-catalog-type]');
  const axisSelect=document.querySelector('[data-ux-catalog-axis]');
  const editionSelect=document.querySelector('[data-ux-catalog-edition]');
  const sortSelect=document.querySelector('[data-ux-catalog-sort]');

  function escapeHtml(value){return String(value||'').replace(/[&<>'"]/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));}
  function numberFrom(value){const parsed=Number(String(value||'').replace(/[^0-9,.-]/g,'').replace(/\./g,'').replace(',','.'));return Number.isFinite(parsed)?parsed:null;}
  function imageUrl(item){return item.main_image_url||item.image_url||item.image||item.photo_url||item.thumb_url||item.detail_image_url||item.room_image_url||'';}
  function normalize(item,index){
    const tags=Array.isArray(item.tags)?item.tags:[];
    const rawSearch=[item.title,item.name,item.artist,item.artist_name,item.artists?.name,item.type,item.language,item.technique,item.edition,item.price_label,item.summary,item.search,tags.join(' ')].filter(Boolean).join(' ');
    const normalized={
      id:item.id||item.slug||String(index),
      title:item.title||item.name||'Obra sem título',
      artist:item.artist||item.artist_name||item.artists?.name||'Artista Arandu',
      type:item.type||item.language||item.technique||'Obra',
      technique:item.technique||item.type||item.language||'',
      edition:item.edition||item.quantity||item.edition_label||'',
      thumb:item.thumb||item.image_class||'thumb-terra',
      image:imageUrl(item),
      tags,
      price:Number(item.price)||numberFrom(item.price_label)||numberFrom(item.priceLabel),
      priceLabel:item.priceLabel||item.price_label||(item.price?Number(item.price).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'sob consulta'),
      createdAt:item.created_at||item.createdAt||'',
      status:item.status||'available',
      search:String(rawSearch).toLowerCase()
    };
    normalized.typeTag=typeTag(normalized);
    normalized.axisTag=axisTag(normalized);
    normalized.editionTag=editionTag(normalized);
    normalized.search=[normalized.search,normalized.typeTag,normalized.axisTag,normalized.editionTag,normalized.priceLabel].join(' ').toLowerCase();
    return normalized;
  }
  async function load(){
    try{const res=await fetch('/api/catalog',{cache:'no-store'}); const data=await res.json().catch(()=>({})); if(res.ok&&Array.isArray(data.items)&&data.items.length) return data.items.map(normalize);}catch(e){}
    const fallback=await fetch('data/artworks.json',{cache:'no-store'}); const list=await fallback.json(); return Array.isArray(list)?list.map(normalize):[];
  }
  function typeTag(item){const text=(item.type+' '+item.technique+' '+item.search).toLowerCase(); if(/foto|fotografia/.test(text)) return 'Fotografia'; if(/escultura|cerâmica|ceramica|objeto|bronze|madeira|volume/.test(text)) return 'Escultura'; return 'Pintura';}
  function axisTag(item){const text=(item.search+' '+(item.tags||[]).join(' ')).toLowerCase(); if(/afro|comunidade|retrato|salvador|corpo|ayla/.test(text)) return 'Afro-brasileiro'; if(/xakriab|origin|ind[ií]gen|grafismo|trama/.test(text)) return 'Originário'; if(/sertão|sertao|interior|paisagem|horizonte|goiás|goias/.test(text)) return 'Sertão'; if(/cidade|urbana|metrópole|metropole|rio de janeiro|são paulo|sao paulo|escritório|escritorio/.test(text)) return 'Metrópole'; if(/rio|água|agua|natureza|botânica|botanica|litoral/.test(text)) return 'Rio e natureza'; return 'Brasil contemporâneo';}
  function editionTag(item){const text=(item.edition+' '+item.search).toLowerCase(); if(/única|unica/.test(text)) return 'Obra única'; if(/limitada|edição de|edicao de|tiragem/.test(text)) return 'Edição limitada'; return 'Edição especial';}
  function priceOk(item){if(state.price==='todos')return true; if(!item.price)return state.price==='acima7000'; if(state.price==='ate3000')return item.price<=3000; if(state.price==='3000a7000')return item.price>3000&&item.price<=7000; if(state.price==='acima7000')return item.price>7000; return true;}
  function matches(item){const term=state.term.trim().toLowerCase();return (!term||item.search.includes(term))&&(state.type==='todos'||item.typeTag===state.type)&&(state.axis==='todos'||item.axisTag===state.axis)&&(state.edition==='todos'||item.editionTag===state.edition)&&priceOk(item);}
  function sortItems(list){const copy=[...list]; if(state.sort==='preco-menor')copy.sort((a,b)=>(a.price||Infinity)-(b.price||Infinity)); if(state.sort==='preco-maior')copy.sort((a,b)=>(b.price||0)-(a.price||0)); if(state.sort==='artista')copy.sort((a,b)=>a.artist.localeCompare(b.artist,'pt-BR')); if(state.sort==='recentes')copy.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))); return copy;}
  function card(item){const tags=[item.typeTag,item.axisTag,item.editionTag]; const media=item.image?'<div class="op-card-media"><img src="'+escapeHtml(item.image)+'" alt="'+escapeHtml(item.title)+'"></div>':'<div class="op-card-media '+escapeHtml(item.thumb)+'"></div>';return '<a class="ux-work-card" href="obra.html?id='+escapeHtml(item.id)+'">'
    + media
    + '<strong>'+escapeHtml(item.title)+'</strong>'
    + '<span class="artist">'+escapeHtml(item.artist)+'</span>'
    + '<div class="ux-work-tags">'+tags.map((tag)=>'<span>'+escapeHtml(tag)+'</span>').join('')+'</div>'
    + '<div class="op-work-foot"><span class="op-price">'+escapeHtml(item.priceLabel)+'</span><span class="op-mini-link">Ver obra →</span></div>'
    + '</a>';}
  function render(items){const filtered=sortItems(items.filter(matches));root.classList.toggle('is-dense',state.dense);root.innerHTML=filtered.length?filtered.map(card).join(''):'<div class="op-empty"><strong>Nenhuma obra encontrada</strong><span>Tente limpar filtros, pesquisar outro termo ou falar com a curadoria.</span></div>'; if(countEl)countEl.textContent=filtered.length+' obra'+(filtered.length===1?' encontrada':'s encontradas');}
  function bind(items){
    input?.addEventListener('input',()=>{state.term=input.value;render(items);});
    typeSelect?.addEventListener('change',()=>{state.type=typeSelect.value;render(items);});
    axisSelect?.addEventListener('change',()=>{state.axis=axisSelect.value;render(items);});
    editionSelect?.addEventListener('change',()=>{state.edition=editionSelect.value;render(items);});
    sortSelect?.addEventListener('change',()=>{state.sort=sortSelect.value;render(items);});
    document.querySelectorAll('[data-ux-catalog-price] [data-price]').forEach((button)=>button.addEventListener('click',()=>{state.price=button.dataset.price;document.querySelectorAll('[data-ux-catalog-price] [data-price]').forEach((item)=>item.classList.toggle('is-active',item===button));render(items);}));
    document.querySelector('[data-clear]')?.addEventListener('click',()=>{state.term='';state.type='todos';state.axis='todos';state.edition='todos';state.price='todos';state.sort='curadoria';if(input)input.value='';if(typeSelect)typeSelect.value='todos';if(axisSelect)axisSelect.value='todos';if(editionSelect)editionSelect.value='todos';if(sortSelect)sortSelect.value='curadoria';document.querySelectorAll('[data-ux-catalog-price] [data-price]').forEach((item)=>item.classList.toggle('is-active',item.dataset.price==='todos'));render(items);});
    document.querySelector('[data-ux-catalog-view]')?.addEventListener('click',()=>{state.dense=!state.dense;root.style.gridTemplateColumns=state.dense?'repeat(auto-fit,minmax(210px,1fr))':'';render(items);});
  }
  load().then((items)=>{render(items);bind(items);}).catch(()=>{root.innerHTML='<div class="op-empty"><strong>Não foi possível carregar o acervo</strong><span>Atualize a página ou tente novamente em instantes.</span></div>';});
})();
