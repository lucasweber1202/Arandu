(function(){
  const root=document.querySelector('[data-ux-artists]');
  if(!root) return;
  const countEl=document.querySelector('[data-ux-artist-count]');
  const search=document.querySelector('[data-ux-artist-search]');
  const language=document.querySelector('[data-ux-artist-language]');
  const sort=document.querySelector('[data-ux-artist-sort]');
  const state={term:'',language:'todos',sort:'nome'};
  function escapeHtml(value){return String(value||'').replace(/[&<>'"]/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));}
  function imageUrl(item){return item.image_url||item.photo_url||item.studio_image_url||item.avatar_url||'';}
  function normalizeArtist(item){
    const languages=Array.isArray(item.languages)?item.languages:Array.isArray(item.curatorial_axes)?item.curatorial_axes:[];
    const searchText=[item.name,item.artist,item.city,item.state,item.region,item.location,item.origin,item.profile,item.bio,languages.join(' ')].filter(Boolean).join(' ').toLowerCase();
    return {id:item.id,name:item.name||item.artist||'Artista Arandu',city:item.city||item.location||item.origin||'Brasil',state:item.state||'',region:item.region||'',profile:item.profile||item.bio||item.trajectory||'',languages,url:item.url||('artista.html?id='+item.id),image:imageUrl(item),search:searchText,count:0};
  }
  function normalizeArtwork(item){return {artistId:item.artistId||item.artist_id,artist:item.artist||item.artist_name||item.artists?.name||'',status:String(item.status||'').toLowerCase(),type:String(item.type||item.language||item.technique||'').toLowerCase()};}
  async function loadArtists(){if(!window.AranduCatalogSource)throw new Error('Fonte de artistas não carregada.');return (await window.AranduCatalogSource.artists()).map(normalizeArtist);}
  async function loadWorks(){if(!window.AranduCatalogSource)throw new Error('Fonte do catálogo não carregada.');return (await window.AranduCatalogSource.catalog()).map(normalizeArtwork);}
  function countFor(artist,works){return works.filter((work)=>work.artistId===artist.id||work.artist===artist.name).filter((work)=>!/(vendida|sold|indisponível|indisponivel|archived)/.test(work.status)).length;}
  function photoClass(index){return ['photo-earth','photo-sand','photo-open','photo-city'][index%4];}
  function matches(artist){const term=state.term.trim().toLowerCase(); const lang=state.language; const languageText=artist.languages.join(' ').toLowerCase(); return (!term||artist.search.includes(term))&&(lang==='todos'||languageText.includes(lang)||artist.search.includes(lang));}
  function sorted(list){const copy=[...list]; if(state.sort==='obras')copy.sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'pt-BR')); else if(state.sort==='cidade')copy.sort((a,b)=>a.city.localeCompare(b.city,'pt-BR')); else copy.sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')); return copy;}
  function card(artist,index){const media=artist.image?'<div class="op-card-media"><img src="'+escapeHtml(artist.image)+'" alt="'+escapeHtml(artist.name)+'"></div>':'<div class="ux-artist-photo op-card-media '+photoClass(index)+'"></div>'; return '<a class="ux-artist-card" href="'+escapeHtml(artist.url)+'">'
    + media
    + '<div class="op-artist-text"><strong>'+escapeHtml(artist.name)+'</strong><div class="ux-artist-meta"><span>'+escapeHtml([artist.city,artist.state].filter(Boolean).join(' · ')||'Brasil')+'</span><span class="op-artist-count">'+artist.count+' obra'+(artist.count===1?'':'s')+'</span></div>'
    + '<p>'+escapeHtml(artist.profile||'Trajetória em acompanhamento curatorial.')+'</p>'
    + '<div class="ux-work-tags">'+artist.languages.slice(0,3).map((tag)=>'<span>'+escapeHtml(tag)+'</span>').join('')+'</div></div>'
    + '</a>';}
  function render(artists){const list=sorted(artists.filter(matches)); root.innerHTML=list.length?list.map(card).join(''):'<div class="op-empty"><strong>Nenhum artista encontrado</strong><span>Tente outro nome, cidade, região ou linguagem.</span></div>'; if(countEl)countEl.textContent=list.length+' artista'+(list.length===1?' encontrado':'s encontrados');}
  Promise.all([loadArtists(),loadWorks()]).then(([artists,works])=>{artists.forEach((artist)=>{artist.count=countFor(artist,works);}); render(artists); search?.addEventListener('input',()=>{state.term=search.value;render(artists);}); language?.addEventListener('change',()=>{state.language=language.value;render(artists);}); sort?.addEventListener('change',()=>{state.sort=sort.value;render(artists);});}).catch((error)=>{const message=window.AranduCatalogSource?.message(error,'cadastro de artistas')||error.message;root.innerHTML='<div class="op-empty catalog-unavailable"><strong>Artistas indisponíveis</strong><span>'+escapeHtml(message)+'</span><a href="status.html">Ver estado do serviço</a></div>';if(countEl)countEl.textContent='Cadastro não liberado';});
})();
