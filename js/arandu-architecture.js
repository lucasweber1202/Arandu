/* ARANDU — arquitetura de navegação e limpeza pública segura */
(function(){
  const version = '20260610-architecture-safe-1';
  const nav = [
    ['Comprar arte', 'comprar-arte.html'],
    ['Acervo', 'acervo.html'],
    ['Empresas', 'empresas.html'],
    ['Confiança', 'confianca.html'],
    ['Narrativa', 'narrativa.html'],
    ['Explorar', 'obras.html']
  ];
  const internalPagePattern = /^(painel|admin|demo|roadmap|configuracao|login|cadastro|minha-conta)/i;
  const noisySelectors = [
    '#intent-score','#context-ribbon','#session-summary','#recent-intent-cta','#collector-mode','#quiet-mode',
    '#compare-tray','#trust-seal','#keyboard-hint','#copy-journey','#last-reserve','#exit-prompt','#section-index',
    '#buyer-profile','#intent-cloud','#budget-helper','#quick-faq','#suggestion-panel','#preference-panel',
    '#intent-map','#profile-map','#governor-panel','.intent-cloud','.buyer-profile','.budget-helper','.quick-faq',
    '.preference-chip','.suggestion-chip','.intent-chip','.floating-cta','.mobile-bottom-nav','.bottom-nav',
    '.selection-drawer-hint','.product-mega','.mega-trigger','[data-mega-nav]','[data-mega-trigger]',
    '[data-floating-cta]','[data-mobile-bottom-nav]','[data-save-intent]'
  ];

  function page(){return location.pathname.split('/').pop() || 'index.html'}
  function isInternal(){return internalPagePattern.test(page())}

  function normalizeHeader(){
    if(isInternal()) return;
    document.querySelectorAll('.header-inner > .search-trigger,.header-inner > .native-search-link').forEach((a)=>a.remove());
    document.querySelectorAll('.site-nav,.nav').forEach((navEl)=>{
      navEl.innerHTML='';
      nav.forEach(([label,href])=>{
        const a=document.createElement('a');
        a.href=href;
        a.textContent=label;
        navEl.appendChild(a);
      });
    });
    document.querySelectorAll('.site-header .cta').forEach((a)=>{
      a.textContent='Falar com a curadoria';
      a.href='contato.html';
    });
  }

  function removeFixedLegacyNoise(){
    if(isInternal()) return;
    document.querySelectorAll('body > *').forEach((el)=>{
      if(el.closest('.site-header')||el.tagName==='SCRIPT'||el.tagName==='STYLE') return;
      const identity = `${el.id || ''} ${el.className || ''}`;
      if(!/widget|floating|intent|suggest|prefer|governor|bottom|tray|prompt|hint|score|ribbon/i.test(identity)) return;
      const cs = getComputedStyle(el);
      if(cs.position==='fixed'||cs.position==='sticky') el.remove();
    });
  }

  function cleanNoise(){
    if(isInternal()) return;
    document.body.classList.add('architecture-clean','arandu-clean-runtime');
    document.body.dataset.architectureVersion=version;
    noisySelectors.forEach((selector)=>document.querySelectorAll(selector).forEach((el)=>el.remove()));
    removeFixedLegacyNoise();
    document.querySelectorAll('a,button').forEach((el)=>{
      const t=(el.textContent||'').trim().toLowerCase();
      if(t.includes('copiar link')){
        el.textContent='Compartilhar';
        el.classList.add('share-action');
        if(el.tagName==='A') el.href='#compartilhar';
      }
    });
  }

  async function shareCurrent(){
    const data={title:document.title||'Arandu',text:'Conheça a Arandu',url:location.href};
    try{
      if(navigator.share){await navigator.share(data);return}
      await navigator.clipboard.writeText(location.href);
      alert('Link copiado para compartilhar.');
    }catch(error){
      try{await navigator.clipboard.writeText(location.href);alert('Link copiado para compartilhar.')}catch(_){location.href='https://wa.me/?text='+encodeURIComponent(location.href)}
    }
  }

  function bindShare(){
    if(window.__aranduShareBound) return;
    window.__aranduShareBound=true;
    document.addEventListener('click',(event)=>{
      const target=event.target.closest('.share-action,[href="#compartilhar"]');
      if(!target) return;
      event.preventDefault();
      shareCurrent();
    });
  }

  function observe(){
    if(isInternal()||window.__aranduCleanObserver) return;
    window.__aranduCleanObserver=true;
    const observer=new MutationObserver(()=>{window.requestAnimationFrame(cleanNoise)});
    observer.observe(document.documentElement,{childList:true,subtree:true});
  }

  function run(){
    normalizeHeader();
    cleanNoise();
    bindShare();
    observe();
    if(!isInternal()) [100,400,1200].forEach((delay)=>setTimeout(cleanNoise,delay));
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',run); else run();
})();
