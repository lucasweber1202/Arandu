/* ARANDU — auditoria leve de interface em runtime */
(function(){
  const INTERNAL=/^(painel|admin|demo|roadmap|configuracao)/i;
  const page=()=>location.pathname.split('/').pop()||'index.html';
  if(INTERNAL.test(page())) return;
  const navItems=[['Comprar arte','comprar-arte.html'],['Obras','obras.html'],['Artistas','artistas.html'],['Empresas','empresas.html'],['Portal artista','portal-artista.html'],['Entrar','login.html']];
  function ensureLogin(){
    document.querySelectorAll('.site-nav,.nav').forEach((nav)=>{
      const links=Array.from(nav.querySelectorAll('a[href]'));
      const seen=new Set();
      links.forEach((link)=>{const href=link.getAttribute('href'); if(seen.has(href)) link.remove(); else seen.add(href);});
      if(!nav.querySelector('a[href="login.html"]')){const a=document.createElement('a');a.href='login.html';a.textContent='Entrar';a.className='auth-entry';nav.appendChild(a);} 
      nav.querySelectorAll('a[href="login.html"]').forEach((a)=>a.classList.add('auth-entry'));
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
  function fixOverflow(){
    document.querySelectorAll('main section,.container,.clean-grid,.showcase-grid,.journey-grid,.journey-rail,.platform-routes,.portal-layout,.company-program-grid').forEach((el)=>{el.style.minWidth='0';});
    document.querySelectorAll('main p, main li').forEach((el)=>{el.style.overflowWrap='break-word';});
    document.querySelectorAll('main h1,main h2,main h3,main strong,main a,main span').forEach((el)=>{el.style.wordBreak='normal';});
  }
  function runAudit(){ensureLogin();insertLoginEntry();dedupeSections();fixOverflow();}
  document.addEventListener('DOMContentLoaded',()=>{runAudit();setTimeout(runAudit,400);setTimeout(runAudit,1200);});
})();
