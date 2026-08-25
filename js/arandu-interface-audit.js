/* ARANDU — reparos de interface que a casca não cobre */
(function(){
  // Este arquivo já reconstruía a navegação e o rodapé por conta própria,
  // disputando o mesmo `.site-nav` com js/site.js e produzindo entradas
  // duplicadas ("Pesquisar" e "Entrar" duas vezes em toda página) e rodapés
  // apagados. A casca pública passou a ter um dono único (js/site.js) e aqui
  // ficam apenas os reparos que ninguém mais faz: remover seções repetidas e
  // sobras de protótipos que atrapalham a leitura.
  const INTERNAL=/^(painel|admin|demo|roadmap|configuracao|status)/i;
  const page=()=>location.pathname.split('/').pop()||'index.html';
  if(INTERNAL.test(page())) return;

  function dedupeSections(){
    const unique=['[data-market-order]','[data-home-discovery]','[data-commercial-search-panel]','[data-login-entry-strip]'];
    unique.forEach((selector)=>{document.querySelectorAll(selector).forEach((el,index)=>{if(index>0)el.remove();});});
    document.querySelectorAll('#compare-tray,#selection-drawer-hint,[data-mega-trigger],[data-mega-nav],[data-floating-cta],.floating-cta,.mobile-bottom-nav,.bottom-nav,.product-mega,.mega-trigger').forEach((el)=>el.remove());
  }

  // O cabeçalho já traz "Falar com a curadoria" no menu e o rodapé repete o
  // contato. O CTA solto ao lado da navegação sobrava e empurrava a barra para
  // fora da tela em telas médias.
  function removeDuplicateHeaderCta(){
    document.querySelectorAll('.site-header > .container > a.cta,.header-inner > a.cta').forEach((cta)=>{
      if(/curadoria|falar|contato/i.test(cta.textContent||'')) cta.remove();
    });
  }

  function runAudit(){removeDuplicateHeaderCta();dedupeSections();}
  document.addEventListener('DOMContentLoaded',()=>{runAudit();setTimeout(runAudit,400);setTimeout(runAudit,1200);});
})();
