(function(){
  const root=document.querySelector('[data-catalog-quality]'); if(!root)return;
  function esc(v){return String(v??'').replace(/[&<>'"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
  function image(item){return item.image_url||item.main_image_url||item.photo_url||item.image||item.thumb_url||item.studio_image_url||'';}
  async function get(url,fallback){try{const res=await fetch(url,{cache:'no-store'});const json=await res.json();if(res.ok&&Array.isArray(json.items))return json.items;if(Array.isArray(json))return json;}catch{} const res=await fetch(fallback,{cache:'no-store'});return res.json();}
  function issuesWork(w){const out=[];if(!image(w))out.push('sem imagem');if(!w.price&&!w.price_label&&!w.priceLabel)out.push('sem preço');if(!w.artist_id&&!w.artistId&&!w.artist_name&&!w.artist)out.push('sem artista vinculado');if(!w.summary)out.push('sem resumo');if(!w.certificate&&!w.certificate_id&&!w.registry_code)out.push('sem certificado');if(!w.tags||!Array.isArray(w.tags)||!w.tags.length)out.push('sem tags');return out;}
  function issuesArtist(a){const out=[];if(!image(a))out.push('sem foto');if(!a.city&&!a.location&&!a.origin)out.push('sem origem');if(!a.profile&&!a.bio)out.push('sem bio');if(!a.languages||!Array.isArray(a.languages)||!a.languages.length)out.push('sem linguagens');return out;}
  function metric(label,value,text){return '<article class="op-quality-card"><strong>'+esc(value)+'</strong><h3>'+esc(label)+'</h3><p>'+esc(text)+'</p></article>';}
  Promise.all([get('/api/catalog','data/artworks.json'),get('/api/artists','data/artists.json')]).then(([works,artists])=>{
    const workRows=works.map((w)=>({type:'obra',name:w.title||w.name||w.id,issues:issuesWork(w),url:'obra.html?id='+(w.id||'')}));
    const artistRows=artists.map((a)=>({type:'artista',name:a.name||a.artist||a.id,issues:issuesArtist(a),url:'artista.html?id='+(a.id||'')}));
    const rows=[...workRows,...artistRows].filter((r)=>r.issues.length);
    const critical=rows.filter((r)=>r.issues.some((i)=>/imagem|foto|preço|artista/.test(i))).length;
    root.innerHTML='<div class="section-head compact-head"><div><p class="eyebrow">Qualidade dos dados</p><h2 class="section-title">O que falta antes de divulgar melhor.</h2></div><p class="lead">Este relatório usa /api/catalog e /api/artists, com fallback local.</p></div><div class="op-quality-grid">'+[
      metric('Obras',works.length,'registros de obras carregados'),metric('Artistas',artists.length,'registros de artistas carregados'),metric('Pendências',rows.length,'itens com algum campo incompleto'),metric('Críticas',critical,'imagem, preço ou vínculo ausente')
    ].join('')+'</div><div class="op-quality-list">'+(rows.length?rows.map((r)=>'<article class="op-quality-item '+(r.issues.length>2?'is-critical':'')+'"><strong>'+esc(r.type)+' · '+esc(r.name)+'</strong><p>'+esc(r.issues.join(', '))+'</p><a href="'+esc(r.url)+'">Abrir registro</a></article>').join(''):'<div class="op-empty"><strong>Sem pendências detectadas</strong><span>O catálogo está consistente para os campos verificados.</span></div>')+'</div>';
  }).catch((error)=>{root.innerHTML='<div class="op-empty"><strong>Erro no diagnóstico</strong><span>'+esc(error.message)+'</span></div>';});
})();
