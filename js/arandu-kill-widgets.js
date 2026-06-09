/* ARANDU — kill switch de widgets legados */
(function(){
  const badText=['sugestão','sugestao','preferência','preferencia','intenção','intencao','maturidade','guia rápido','guia rapido','primeira compra','comece aqui','orçamento','orcamento','até r$ 3.000','ate r$ 3.000','fotografia até 3000','gerar proposta','perfil de compra','mapa de intenções','mapa de intencoes'];
  const badRe=/(intent|preference|preferencia|suggest|sugest|floating|bottom-nav|mega|governor|score|ribbon|prompt|hint|tray|collector|quiet|profile|budget|session|copy-journey|last-reserve)/i;
  function shouldRemove(el){
    if(!el||el.nodeType!==1)return false;
    if(el.closest('.site-header'))return false;
    if(['SCRIPT','STYLE','LINK','META','TITLE'].includes(el.tagName))return false;
    const idClass=`${el.id||''} ${el.className||''} ${el.getAttribute('data-testid')||''} ${[...el.attributes||[]].map(a=>a.name).join(' ')}`;
    const text=(el.textContent||'').toLowerCase().slice(0,500);
    if(badRe.test(idClass))return true;
    if(badText.some(t=>text.includes(t)))return true;
    try{const cs=getComputedStyle(el);if((cs.position==='fixed'||cs.position==='sticky')&&badRe.test(idClass+' '+text))return true;}catch(_){}
    return false;
  }
  function removeLegacy(){
    document.body?.classList.add('arandu-no-widgets');
    document.querySelectorAll('aside,dialog,nav,section,div,a,button').forEach(el=>{
      if(!shouldRemove(el))return;
      const box=el.closest('aside,dialog,section,[class*="panel"],[class*="widget"],[class*="floating"],[class*="bottom"],[class*="mega"],[id*="intent"],[id*="suggest"],[id*="prefer"]')||el;
      if(box&&!box.closest('.site-header'))box.remove();
    });
    document.querySelectorAll('a[href*="ate-3000"],a[href*="obras-ate-3000"],a[href*="guia-primeira-obra"],a[href*="comece-aqui"],[data-search-suggestion],[data-save-intent],[data-floating-cta],[data-mobile-bottom-nav],[data-mega-trigger],[data-mega-nav]').forEach(el=>el.remove());
  }
  function start(){
    removeLegacy();
    [50,150,350,800,1600,3000,5000].forEach(t=>setTimeout(removeLegacy,t));
    const observer=new MutationObserver(()=>requestAnimationFrame(removeLegacy));
    observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','id','style']});
    window.aranduKillWidgets={removeLegacy};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
