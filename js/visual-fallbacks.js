/* Arandu — substitui placeholders vazios por obras visuais provisórias */
(function(){
  const arts={
    terra:'assets/art-placeholder-terra.svg',
    rio:'assets/art-placeholder-rio.svg',
    urbano:'assets/art-placeholder-urbano.svg',
    corpo:'assets/art-placeholder-corpo.svg',
    mata:'assets/art-placeholder-mata.svg',
    trama:'assets/art-placeholder-trama.svg',
    luz:'assets/art-placeholder-luz.svg',
    noite:'assets/art-placeholder-noite.svg'
  };
  const list=Object.values(arts);
  function pick(el,index){
    const text=(el.className+' '+(el.closest('article,section')?.textContent||'')).toLowerCase();
    if(/xakriab|origin|indígen|indigen|trama|grafismo|território|territorio/.test(text))return arts.trama;
    if(/rio|água|agua|fluvial|travessia/.test(text))return arts.rio;
    if(/mata|natureza|verde|botânica|botanica|folha|jardim/.test(text))return arts.mata;
    if(/urbano|cidade|metrópole|metropole|empresa|escritório|escritorio|reunião|reuniao/.test(text))return arts.noite;
    if(/corpo|afro|memória|memoria|retrato|comunidade|festa/.test(text))return arts.corpo;
    if(/luz|horizonte|interior|sertão|sertao|paisagem/.test(text))return arts.luz;
    if(/bronze|escultura|objeto|cerâmica|ceramica|madeira/.test(text))return arts.terra;
    return list[index%list.length];
  }
  function apply(){
    document.querySelectorAll('.op-card-media,.admin-proposal-thumb,.thumb-terra,.thumb-urbano,.thumb-verde,.thumb-areia,.thumb-bronze,.thumb-botanica,.thumb-outono,.rect-frame,.safe-visual,.art-tile,.certificate-preview').forEach((el,index)=>{
      if(el.querySelector?.('img'))return;
      if(el.dataset.visualFallbackApplied)return;
      const src=pick(el,index);
      el.style.backgroundImage='url("'+src+'")';
      el.style.backgroundSize='cover';
      el.style.backgroundPosition='center';
      el.dataset.visualFallbackApplied='true';
      el.setAttribute('aria-label',el.getAttribute('aria-label')||'Imagem provisória de obra Arandu');
    });
    document.querySelectorAll('.rect-frame .rect-block,.safe-visual .rect-block,.safe-visual:before,.safe-visual:after').forEach((el)=>{el.style.display='none';});
  }
  apply();
  const observer=new MutationObserver(()=>apply());
  observer.observe(document.documentElement,{childList:true,subtree:true});
})();
