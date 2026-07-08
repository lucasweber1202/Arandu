(function(){
  const root=document.querySelector('[data-ux-catalog]');
  if(!root) return;

  function escapeHtml(value){return String(value||'').replace(/[&<>'"]/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));}
  function normalize(item){return {
    id:item.id,
    title:item.title||item.name||'Obra sem título',
    artist:item.artist||item.artist_name||item.artists?.name||'Artista Arandu',
    type:item.type||item.language||item.technique||'Obra',
    edition:item.edition||item.quantity||'',
    thumb:item.thumb||item.image_class||'thumb-terra',
    tags:Array.isArray(item.tags)?item.tags:[],
    search:String([item.title,item.artist,item.artist_name,item.type,item.technique,item.edition,item.summary,item.search,(item.tags||[]).join(' ')].filter(Boolean).join(' ')).toLowerCase()
  };}
  async function load(){
    try{const res=await fetch('/api/catalog',{cache:'no-store'}); const data=await res.json().catch(()=>({})); if(res.ok&&Array.isArray(data.items)&&data.items.length) return data.items.map(normalize);}catch(e){}
    const fallback=await fetch('data/artworks.json',{cache:'no-store'}); const list=await fallback.json(); return Array.isArray(list)?list.map(normalize):[];
  }
  function typeTag(item){const text=(item.type+' '+item.search).toLowerCase(); if(/foto|fotografia/.test(text)) return 'Fotografia'; if(/escultura|cerâmica|ceramica|objeto|bronze|madeira|volume/.test(text)) return 'Escultura'; return 'Pintura';}
  function axisTag(item){const text=(item.search+' '+item.tags.join(' ')).toLowerCase(); if(/afro|comunidade|retrato|salvador|corpo|ayla/.test(text)) return 'Afro-brasileiro'; if(/xakriab|origin|grafismo|trama/.test(text)) return 'Originário'; if(/sertão|sertao|interior|paisagem|horizonte|goiás|goias/.test(text)) return 'Sertão'; if(/cidade|urbana|metrópole|metropole|rio de janeiro|são paulo|sao paulo|escritório|escritorio/.test(text)) return 'Metrópole'; if(/rio|água|agua|natureza|botânica|botanica|litoral/.test(text)) return 'Rio e natureza'; return 'Brasil contemporâneo';}
  function editionTag(item){const text=(item.edition+' '+item.search).toLowerCase(); if(/única|unica/.test(text)) return 'Obra única'; if(/limitada|edição de|edicao de|tiragem/.test(text)) return 'Edição limitada'; return 'Edição especial';}
  function card(item){const tags=[typeTag(item),axisTag(item),editionTag(item)]; return '<a class="ux-work-card" href="obra.html?id='+escapeHtml(item.id)+'">'
    + '<div class="ux-work-image '+escapeHtml(item.thumb)+'"></div>'
    + '<strong>'+escapeHtml(item.title)+'</strong>'
    + '<span class="artist">'+escapeHtml(item.artist)+'</span>'
    + '<div class="ux-work-tags">'+tags.map((tag)=>'<span>'+escapeHtml(tag)+'</span>').join('')+'</div>'
    + '</a>';}
  function render(list){root.innerHTML=list.length?list.map(card).join(''):'<div class="final-empty"><strong>Nenhuma obra encontrada</strong><span>Tente outra busca ou fale com a curadoria.</span></div>';}
  load().then((items)=>{
    const input=document.querySelector('[data-ux-catalog-search]');
    render(items);
    if(input){input.addEventListener('input',()=>{const term=input.value.trim().toLowerCase(); render(term?items.filter((item)=>item.search.includes(term)):items);});}
  }).catch(()=>{root.innerHTML='<div class="final-empty"><strong>Não foi possível carregar o acervo</strong><span>Atualize a página ou tente novamente em instantes.</span></div>';});
})();
