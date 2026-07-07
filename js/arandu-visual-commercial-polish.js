/* ARANDU — camada de compra, leitura e prevenção de sobreposição */
(function(){
  const INTERNAL=/^(painel|admin|demo|roadmap|configuracao|login|cadastro|minha-conta)/i;
  const page=()=>window.location.pathname.split('/').pop()||'index.html';
  if(INTERNAL.test(page())) return;

  const WORKS=[
    {title:'Estudo de Solo Nº 04',artist:'Marina Silveira',type:'Pintura',price:'R$ 4.200',badge:'Oportunidade da semana',href:'obra.html?id=estudo-de-solo-04',why:'Pintura de presença silenciosa, boa para iniciar coleção com uma obra única e fácil de contextualizar.'},
    {title:'Sertão Silencioso',artist:'Camila Rebouças',type:'Fotografia fine art',price:'R$ 2.100',badge:'Faixa acessível',href:'obra.html?id=sertao-silencioso',why:'Entrada mais leve no acervo, com narrativa brasileira forte e boa leitura para ambientes íntimos.'},
    {title:'Equilíbrio Suspenso',artist:"Arthur D'Avila",type:'Escultura',price:'R$ 8.900',badge:'Peça de impacto',href:'obra.html?id=equilibrio-suspenso',why:'Obra tridimensional para quem quer um ponto focal e não apenas decoração de parede.'}
  ];

  const normalize=(value)=>String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const esc=(value)=>String(value||'').replace(/[&<>'"]/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

  function renderResults(input, target){
    if(!target) return;
    const query=normalize(input?.value||'');
    if(!query){target.innerHTML='';return;}
    const results=WORKS.filter((work)=>normalize(`${work.title} ${work.artist} ${work.type} ${work.badge}`).includes(query)).slice(0,3);
    target.innerHTML=results.length?results.map((work)=>`<a class="commercial-result" href="${esc(work.href)}"><small>${esc(work.badge)}</small><strong>${esc(work.title)}</strong><span>${esc(work.artist)} · ${esc(work.type)} · ${esc(work.price)}</span></a>`).join(''):'<div class="commercial-result"><small>Curadoria</small><strong>Não encontrei uma peça exata.</strong><span>Procure por pintura, fotografia, escultura, artista ou faixa de preço.</span></div>';
  }

  function ensureVisibleSearch(){
    const current=page();
    if(!['index.html','obras.html','comprar-arte.html','acervo.html'].includes(current)) return;
    if(document.querySelector('[data-commercial-search-panel]')) return;
    const anchor=document.querySelector(current==='comprar-arte.html'?'#obras-disponiveis':'.rect-hero + section, main section:nth-of-type(2)')||document.querySelector('main');
    if(!anchor?.parentNode) return;
    const panel=document.createElement('section');
    panel.className='clean-section commercial-search-section';
    panel.dataset.commercialSearchPanel='true';
    panel.innerHTML=`<div class="container"><div class="commercial-search-panel"><div class="commercial-search-header"><div><p class="eyebrow">Encontrar uma obra</p><h2 class="commercial-title">Busque por técnica, artista ou intenção de compra.</h2><p class="commercial-copy">A ideia é aproximar a compra de uma conversa de galeria: você procura, separa algumas peças e a curadoria ajuda a decidir com calma.</p></div><label class="commercial-search-box"><span class="sr-only">Pesquisar obras</span><input data-commercial-search-input type="search" placeholder="Ex.: pintura, fotografia, até R$ 3 mil"><a class="cta secondary" href="obras.html">Ver acervo</a></label></div><div class="commercial-search-results" data-commercial-search-results></div></div></div>`;
    anchor.parentNode.insertBefore(panel, anchor);
    const input=panel.querySelector('[data-commercial-search-input]');
    const target=panel.querySelector('[data-commercial-search-results]');
    input?.addEventListener('input',()=>renderResults(input,target));
  }

  function addReadingClass(){
    document.querySelectorAll('main p').forEach((p)=>{
      const text=p.textContent.trim();
      if(text.length>130 && !p.closest('.artwork-card,.opportunity-card,.commercial-search-panel,.site-footer')){
        p.classList.add('reading-copy');
      }
    });
  }

  function preventOverlap(){
    document.querySelectorAll('.artwork-card,.clean-card,.opportunity-card,.commercial-card,.rect-hero,.clean-section,.launch-trust-band').forEach((el)=>{
      el.style.minWidth='0';
    });
    document.querySelectorAll('h1,h2,h3,p,a,span,strong,small').forEach((el)=>{
      el.style.overflowWrap='anywhere';
    });
  }

  function improveBuyLabels(){
    document.querySelectorAll('a[href="comprar-arte.html"],a[href="#obras-disponiveis"]').forEach((link)=>{
      if(/comprar arte/i.test(link.textContent.trim())) link.setAttribute('aria-label','Comprar arte com busca, obras disponíveis e apoio da curadoria');
    });
    document.querySelectorAll('[data-reserve-artwork], .artwork-card[href*="obra.html"]').forEach((el)=>{
      el.setAttribute('data-commercial-ready','true');
    });
  }

  document.addEventListener('DOMContentLoaded',()=>{
    document.body.dataset.visualCommercialPolish='20260707';
    ensureVisibleSearch();
    addReadingClass();
    preventOverlap();
    improveBuyLabels();
    setTimeout(()=>{addReadingClass();preventOverlap();},600);
  });
})();
