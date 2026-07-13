(function(){
  const root=document.querySelector('[data-catalog-quality]'); if(!root)return;
  const esc=(v)=>String(v??'').replace(/[&<>'"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const image=(item)=>item.image_url||item.main_image_url||item.photo_url||item.image||item.thumb_url||item.studio_image_url||item.thumb||'';
  async function get(url,fallback){try{const res=await fetch(url,{cache:'no-store'});const json=await res.json();if(res.ok&&Array.isArray(json.items))return json.items;if(Array.isArray(json))return json;}catch{} const res=await fetch(fallback,{cache:'no-store'});return res.json();}
  function workChecks(w){return [
    ['Imagem principal',Boolean(image(w)),'Adicionar imagem autorizada da obra.'],
    ['Preço ou faixa',Boolean(w.price||w.price_label||w.priceLabel),'Definir preço, faixa ou sob consulta.'],
    ['Artista vinculado',Boolean(w.artist_id||w.artistId||w.artist_name||w.artist),'Vincular artista aprovado.'],
    ['Resumo curatorial',Boolean(w.summary||w.curatorial_reading||w.curatorial_note),'Inserir leitura curta da obra.'],
    ['Certificado',Boolean(w.certificate||w.certificate_id||w.registry_code),'Criar código/certificado.'],
    ['Técnica e dimensões',Boolean(w.technique&&w.dimensions),'Completar ficha técnica.'],
    ['Tags/ambientes',Boolean(Array.isArray(w.tags)&&w.tags.length||Array.isArray(w.spaces)&&w.spaces.length),'Adicionar tags e ambientes.']
  ];}
  function artistChecks(a){return [
    ['Foto ou imagem',Boolean(image(a)),'Adicionar foto, retrato ou imagem de ateliê.'],
    ['Origem',Boolean(a.city||a.location||a.origin||a.state),'Informar cidade/estado/origem.'],
    ['Bio/perfil',Boolean(a.profile||a.bio||a.trajectory),'Inserir bio curta e trajetória.'],
    ['Linguagens',Boolean(Array.isArray(a.languages)&&a.languages.length),'Informar pintura, fotografia, escultura etc.'],
    ['Portfólio/Instagram',Boolean(a.portfolio_url||a.instagram),'Adicionar contato profissional ou portfólio.']
  ];}
  function score(checks){return Math.round((checks.filter(([,ok])=>ok).length/checks.length)*100);}
  function metric(label,value,text){return '<article class="op-quality-card"><strong>'+esc(value)+'</strong><h3>'+esc(label)+'</h3><p>'+esc(text)+'</p></article>';}
  function row(r){const missing=r.checks.filter(([,ok])=>!ok);return '<article class="op-quality-item '+(r.score<60?'is-critical':'')+'"><div><strong>'+esc(r.type)+' · '+esc(r.name)+'</strong><p>Score '+r.score+'/100 · '+(missing.length?esc(missing.map(([label])=>label).join(', ')):'Completo')+'</p></div><div class="admin-actions"><a href="'+esc(r.url)+'">Abrir</a><button type="button" data-copy-fix="'+esc(missing.map(([,ok,fix])=>fix).join('\n'))+'">Copiar pendências</button></div></article>';}
  Promise.all([get('/api/catalog','data/artworks.json'),get('/api/artists','data/artists.json'),get('data/certificates.json','data/certificates.json')]).then(([works,artists,certs])=>{
    const certByArtwork=new Set((Array.isArray(certs)?certs:[]).map((c)=>c.artwork_id).filter(Boolean));
    const workRows=works.map((w)=>{const checks=workChecks({...w,certificate:w.certificate||certByArtwork.has(w.id)});return {type:'obra',name:w.title||w.name||w.id,score:score(checks),checks,url:'obra.html?id='+(w.id||'')}});
    const artistRows=artists.map((a)=>{const checks=artistChecks(a);return {type:'artista',name:a.name||a.artist||a.id,score:score(checks),checks,url:'artista.html?id='+(a.id||'')}});
    const rows=[...workRows,...artistRows].sort((a,b)=>a.score-b.score);
    const weak=rows.filter((r)=>r.score<80); const critical=rows.filter((r)=>r.score<60);
    root.innerHTML='<div class="section-head compact-head"><div><p class="eyebrow">Qualidade dos dados</p><h2 class="section-title">O que falta antes de vender melhor.</h2></div><a class="cta secondary" href="catalogo-intake.html">Importar CSV</a></div><div class="op-quality-grid">'+[
      metric('Obras',works.length,'registros de obras carregados'),metric('Artistas',artists.length,'registros de artistas carregados'),metric('Abaixo de 80%',weak.length,'itens que precisam revisão'),metric('Críticos',critical.length,'abaixo de 60% de completude')
    ].join('')+'</div><h2>Prioridade de correção</h2><div class="op-quality-list">'+(weak.length?weak.map(row).join(''):'<div class="op-empty"><strong>Catálogo pronto</strong><span>Os campos essenciais estão consistentes para venda assistida.</span></div>')+'</div>';
  }).catch((error)=>{root.innerHTML='<div class="op-empty"><strong>Erro no diagnóstico</strong><span>'+esc(error.message)+'</span></div>';});
  root.addEventListener('click',(event)=>{const b=event.target.closest('[data-copy-fix]'); if(!b)return; navigator.clipboard?.writeText(b.dataset.copyFix||''); b.textContent='Copiado';});
})();
