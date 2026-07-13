/* Arandu — substitui placeholders vazios por obras visuais provisórias */
(function(){
  const arts=[
    'assets/art-placeholder-terra.svg',
    'assets/art-placeholder-rio.svg',
    'assets/art-placeholder-urbano.svg',
    'assets/art-placeholder-corpo.svg'
  ];
  function pick(el,index){
    const text=(el.className+' '+(el.closest('article')?.textContent||'')).toLowerCase();
    if(/rio|natureza|verde|água|agua/.test(text))return arts[1];
    if(/urbano|cidade|metrópole|metropole|empresa|escritório|escritorio/.test(text))return arts[2];
    if(/corpo|afro|memória|memoria|retrato/.test(text))return arts[3];
    return arts[index%arts.length];
  }
  function apply(){
    document.querySelectorAll('.op-card-media,.admin-proposal-thumb,.thumb-terra,.thumb-urbano,.thumb-verde,.thumb-areia,.rect-frame,.safe-visual,.art-tile').forEach((el,index)=>{
      if(el.querySelector?.('img'))return;
      if(el.dataset.visualFallbackApplied)return;
      const src=pick(el,index);
      el.style.backgroundImage='url("'+src+'")';
      el.style.backgroundSize='cover';
      el.style.backgroundPosition='center';
      el.dataset.visualFallbackApplied='true';
      el.setAttribute('aria-label',el.getAttribute('aria-label')||'Imagem provisória de obra Arandu');
    });
    document.querySelectorAll('.rect-frame .rect-block,.safe-visual .rect-block').forEach((el)=>{el.style.display='none';});
  }
  apply();
  const observer=new MutationObserver(()=>apply());
  observer.observe(document.documentElement,{childList:true,subtree:true});
})();
