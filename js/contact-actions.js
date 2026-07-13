/* ARANDU — ações públicas de contato */
(function(){
  function contact(){return window.ARANDU_CONTACT||{};}
  function fallbackHref(kind){
    const cfg=contact();
    if(kind==='whatsapp')return cfg.whatsappUrl?.('Olá, quero falar com a curadoria da Arandu.')||cfg.mailto?.('Contato Arandu','Olá, quero falar com a curadoria da Arandu.')||'contato.html';
    if(kind==='proposal')return cfg.whatsappUrl?.('Olá, quero solicitar uma proposta curatorial da Arandu.')||cfg.mailto?.('Proposta curatorial Arandu','Olá, quero solicitar uma proposta curatorial da Arandu.')||'contato.html';
    if(kind==='artist')return cfg.whatsappUrl?.('Olá, quero apresentar meu portfólio para a Arandu.')||cfg.mailto?.('Portfólio para Arandu','Olá, quero apresentar meu portfólio para a Arandu.')||'para-artistas.html';
    return cfg.mailto?.()||'contato.html';
  }
  function hydrate(){
    document.querySelectorAll('[data-contact-action]').forEach((el)=>{
      const kind=el.getAttribute('data-contact-action')||'general';
      const href=fallbackHref(kind);
      if(el.tagName==='A')el.setAttribute('href',href);
      el.classList.toggle('is-contact-fallback',href.startsWith('mailto:'));
    });
    document.querySelectorAll('[data-contact-email]').forEach((el)=>{const email=contact().email;if(email)el.textContent=email;});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',hydrate);else hydrate();
  setTimeout(hydrate,500);
})();
