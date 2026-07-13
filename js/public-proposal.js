(function(){
  const root=document.querySelector('[data-public-proposal]'); if(!root)return;
  const params=new URLSearchParams(location.search);
  const token=params.get('token');
  const esc=(v)=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  function money(v){const n=Number(v||0);return n? n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'';}
  function itemCard(item,i){return '<article class="admin-proposal-item"><div class="admin-proposal-thumb '+esc(item.thumb||item.imageClass||'')+'"></div><div><p class="eyebrow">Obra '+(i+1)+'</p><h2>'+esc(item.title||item.name||'Obra selecionada')+'</h2><p><strong>'+esc(item.artist||item.artist_name||'Artista')+'</strong></p><p>'+esc([item.technique,item.dimensions,item.priceLabel||item.price_label||money(item.price)].filter(Boolean).join(' · '))+'</p><p>'+esc(item.note||item.context||item.summary||'Seleção curatorial Arandu com leitura de escala, linguagem, preço, documentação e adequação ao ambiente.')+'</p><a href="'+esc(item.url||('obra.html?id='+(item.id||''))||'comprar-arte.html')+'">Ver obra</a></div></article>';}
  function nextStep(s){return '<section class="certificate-preview"><p class="eyebrow">Próximo passo</p><h2>Reserva assistida, não checkout automático.</h2><p>A proposta não confirma disponibilidade. A Arandu valida status da obra, certificado, embalagem, frete e condição antes de qualquer fechamento.</p><div class="page-actions"><a class="cta" href="contato.html" data-contact-action="proposal">Falar com a curadoria</a><button class="cta secondary" type="button" onclick="window.print()">Salvar / imprimir PDF</button></div><p><strong>Validade sugerida:</strong> '+esc(s.valid_until||'7 dias após envio')+'</p></section>';}
  async function demoSelection(){
    const [worksRes,artistsRes]=await Promise.all([fetch('data/artworks.json',{cache:'no-store'}),fetch('data/artists.json',{cache:'no-store'})]);
    const works=await worksRes.json(); const artists=await artistsRes.json().catch(()=>[]);
    const names=Object.fromEntries(artists.map(a=>[a.id,a.name]));
    return {name:'Cliente em análise',briefing:{space:'Apartamento, escritório ou recepção',goal:'Escolher obras com presença, procedência e boa leitura de compra'},valid_until:'7 dias',items:works.slice(0,4).map((w)=>({id:w.id,title:w.title,artist:w.artist||names[w.artist_id]||w.artist_id,technique:w.technique,dimensions:w.dimensions,price:w.price,priceLabel:w.price_label,summary:w.summary,url:'obra.html?id='+w.id}))};
  }
  async function loadSelection(){
    if(token){try{const res=await fetch('/api/selections?token='+encodeURIComponent(token),{cache:'no-store'});const json=await res.json().catch(()=>({}));if(res.ok&&json.selection)return json.selection;}catch{}}
    const local=localStorage.getItem('arandu.public.proposal');
    if(local){try{return JSON.parse(local);}catch{}}
    return demoSelection();
  }
  function render(s){const items=s.items||[];const total=items.reduce((sum,item)=>sum+(Number(item.price)||0),0);root.innerHTML='<p class="eyebrow">Proposta curatorial Arandu</p><h1>Seleção de arte brasileira contemporânea.</h1><p class="lead">Uma proposta para decidir com contexto: obra, artista, preço, escala, certificado, ambiente e próximo passo comercial.</p><div class="op-quality-grid"><div><span>Cliente</span><strong>'+esc(s.name||'Cliente em análise')+'</strong></div><div><span>Ambiente</span><strong>'+esc(s.briefing?.space||s.briefing?.environment||'Ambiente a definir')+'</strong></div><div><span>Objetivo</span><strong>'+esc(s.briefing?.goal||s.goal||'Compra assistida')+'</strong></div><div><span>Total estimado</span><strong>'+esc(total?money(total):'Sob consulta')+'</strong></div></div><div class="admin-proposal-items">'+(items.length?items.map(itemCard).join(''):'<div class="op-empty"><strong>Nenhuma obra vinculada</strong><span>Salve obras em Minha Seleção para gerar uma proposta mais precisa.</span></div>')+'</div>'+nextStep(s);}
  loadSelection().then(render).catch((e)=>{root.innerHTML='<h1>Proposta indisponível.</h1><p>'+esc(e.message)+'</p>';});
})();
