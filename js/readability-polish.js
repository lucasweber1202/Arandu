/* Arandu — legibilidade progressiva em cards e textos comprimidos */
(function(){
  const MAX=210;
  function clean(text){return String(text||'').replace(/\s+/g,' ').trim();}
  function polishText(el){
    if(el.dataset.readabilityPolished)return;
    const text=clean(el.textContent);
    if(text.length<MAX)return;
    el.dataset.fullText=text;
    el.dataset.shortText=text.slice(0,MAX).replace(/\s+\S*$/,'')+'…';
    el.textContent=el.dataset.shortText;
    el.dataset.readabilityPolished='true';
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='read-more-inline';
    btn.textContent='Ler mais';
    btn.addEventListener('click',()=>{
      const open=el.dataset.open==='true';
      el.dataset.open=String(!open);
      el.textContent=open?el.dataset.shortText:el.dataset.fullText;
      btn.textContent=open?'Ler mais':'Recolher';
      el.after(btn);
    });
    el.after(btn);
  }
  function polish(){
    document.querySelectorAll('.card p,.editorial-card p,.macro-card span,.op-collection-card span,.trust-card span,.ux-work-card p,.clean-card p,.admin-proposal-item p').forEach(polishText);
    document.querySelectorAll('.section-head .lead,.rect-hero .lead,.safe-lead').forEach((el)=>{el.style.maxWidth='64ch';el.style.lineHeight='1.58';});
  }
  polish();
  const observer=new MutationObserver(()=>polish());
  observer.observe(document.documentElement,{childList:true,subtree:true});
})();
