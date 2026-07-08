(function(){
  const root=document.querySelector('[data-ux-artists]');
  if(!root) return;
  function escapeHtml(value){return String(value||'').replace(/[&<>'"]/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));}
  function normalizeArtist(item){return {id:item.id,name:item.name||item.artist||'Artista Arandu',city:item.city||item.location||item.origin||'Brasil',region:item.region||'',profile:item.profile||item.bio||'',languages:Array.isArray(item.languages)?item.languages:[],url:item.url||('artista.html?id='+item.id)};}
  function normalizeArtwork(item){return {artistId:item.artistId||item.artist_id,artist:item.artist||item.artist_name||'',status:String(item.status||'').toLowerCase()};}
  async function loadArtists(){
    try{const res=await fetch('/api/artists',{cache:'no-store'}); const data=await res.json().catch(()=>({})); if(res.ok&&Array.isArray(data.items)&&data.items.length) return data.items.map(normalizeArtist);}catch(e){}
    const res=await fetch('data/artists.json',{cache:'no-store'}); const data=await res.json(); return Array.isArray(data)?data.map(normalizeArtist):[];
  }
  async function loadWorks(){
    try{const res=await fetch('/api/catalog',{cache:'no-store'}); const data=await res.json().catch(()=>({})); if(res.ok&&Array.isArray(data.items)) return data.items.map(normalizeArtwork);}catch(e){}
    const res=await fetch('data/artworks.json',{cache:'no-store'}); const data=await res.json(); return Array.isArray(data)?data.map(normalizeArtwork):[];
  }
  function countFor(artist,works){return works.filter((work)=>work.artistId===artist.id||work.artist===artist.name).filter((work)=>!/(vendida|sold|indisponível|indisponivel)/.test(work.status)).length;}
  function photoClass(index){return ['photo-earth','photo-sand','photo-open','photo-city'][index%4];}
  function card(artist,index,count){return '<a class="ux-artist-card" href="'+escapeHtml(artist.url)+'">'
    + '<div class="ux-artist-photo '+photoClass(index)+'"></div>'
    + '<strong>'+escapeHtml(artist.name)+'</strong>'
    + '<div class="ux-artist-meta"><span>'+escapeHtml(artist.city)+'</span><span>'+count+' obra'+(count===1?'':'s')+'</span></div>'
    + '<div class="ux-work-tags">'+artist.languages.slice(0,3).map((tag)=>'<span>'+escapeHtml(tag)+'</span>').join('')+'</div>'
    + '</a>';}
  Promise.all([loadArtists(),loadWorks()]).then(([artists,works])=>{
    root.innerHTML=artists.map((artist,index)=>card(artist,index,countFor(artist,works))).join('');
  }).catch(()=>{root.innerHTML='<div class="final-empty"><strong>Não foi possível carregar artistas</strong><span>Atualize a página ou tente novamente em instantes.</span></div>';});
})();
