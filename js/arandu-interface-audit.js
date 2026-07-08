/* ARANDU — auditoria leve de interface em runtime */
(function(){
  const INTERNAL=/^(painel|admin|demo|roadmap|configuracao|status)/i;
  const page=()=>location.pathname.split('/').pop()||'index.html';
  if(INTERNAL.test(page())) return;

  const publicNav=[
    ['Comprar','comprar-arte.html'],
    ['Artistas','artistas.html'],
    ['Confiança','confianca.html'],
    ['Pesquisar','pesquisa.html'],
    ['Narrativa','narrativa.html'],
    ['Entrar','login.html']
  ];

  function normalizeHref(href){
    try{return new URL(href,location.href).pathname.split('/').pop()||'index.html';}
    catch{return href;}
  }

  function rebuildNav(){
    document.querySelectorAll('.site-nav,.nav').forEach((nav)=>{
      nav.innerHTML='';
      publicNav.forEach(([label,href])=>{
        const a=document.createElement('a');
        a.href=href;
        a.textContent=label;
        if(normalizeHref(href)===page()) a.classList.add('is-active');
        if(href==='login.html') a.classList.add('auth-entry');
        nav.appendChild(a);
      });
    });
    document.querySelectorAll('.site-header > .container > a.cta,.header-inner > a.cta').forEach((cta)=>{
      if(/curadoria|falar|contato/i.test(cta.textContent||'')) cta.remove();
    });
  }

  function insertLoginEntry(){
    if(page()!=='index.html'||document.querySelector('[data-login-entry-strip]')) return;
    const target=document.querySelector('.path-section')||document.querySelector('[data-market-order]')||document.querySelector('.works-section');
    if(!target?.parentNode) return;
    const section=document.createElement('section');
    section.className='login-entry-strip';
    section.dataset.loginEntryStrip='true';
    section.innerHTML='<div class="container"><div class="login-entry-card"><div><p class="eyebrow">Conta Arandu</p><h2>Entre como comprador, artista ou empresa.</h2><p>O login separa cada experiência: obras e reservas para compradores, portfólio e preço para artistas, briefing e proposta para empresas.</p></div><div class="login-entry-actions"><a class="cta" href="login.html">Entrar</a><a class="cta secondary" href="cadastro.html">Criar conta</a></div></div></div>';
    target.parentNode.insertBefore(section,target);
  }

  function dedupeSections(){
    const unique=['[data-market-order]','[data-home-discovery]','[data-commercial-search-panel]','[data-login-entry-strip]'];
    unique.forEach((selector)=>{document.querySelectorAll(selector).forEach((el,index)=>{if(index>0)el.remove();});});
    document.querySelectorAll('#compare-tray,#selection-drawer-hint,[data-mega-trigger],[data-mega-nav],[data-floating-cta],.floating-cta,.mobile-bottom-nav,.bottom-nav,.product-mega,.mega-trigger').forEach((el)=>el.remove());
  }

  function fixLegacyLinks(){
    document.querySelectorAll('a[href="acervo.html"],a[href="obras.html"]').forEach((a)=>{
      if((a.textContent||'').match(/acervo|explorar obras|ver obras|comprar arte/i)) a.href='comprar-arte.html';
    });
  }

  function fixOverflow(){
    document.querySelectorAll('main section,.container,.clean-grid,.showcase-grid,.journey-grid,.journey-rail,.platform-routes,.portal-layout,.company-program-grid,.ux-work-grid,.ux-artist-grid').forEach((el)=>{el.style.minWidth='0';});
    document.querySelectorAll('main p, main li').forEach((el)=>{el.style.overflowWrap='break-word';});
    document.querySelectorAll('main h1,main h2,main h3,main strong,main a,main span').forEach((el)=>{el.style.wordBreak='normal';});
  }

  function runAudit(){rebuildNav();insertLoginEntry();dedupeSections();fixLegacyLinks();fixOverflow();}
  document.addEventListener('DOMContentLoaded',()=>{runAudit();setTimeout(runAudit,400);setTimeout(runAudit,1200);});
})();
