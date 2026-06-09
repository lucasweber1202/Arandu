/* ARANDU — links jurídicos globais */
(function(){
  const links=[
    ['Termos','termos-de-uso.html'],
    ['Privacidade','politica-de-privacidade.html'],
    ['Compra e reserva','compra-reserva-reembolso.html'],
    ['Artistas','politica-para-artistas.html'],
    ['Certificado','certificado-autenticidade.html']
  ];
  function run(){
    document.querySelectorAll('.site-footer').forEach((footer)=>{
      if(footer.querySelector('[data-legal-links]'))return;
      const wrap=document.createElement('div');
      wrap.className='footer-legal-links';
      wrap.dataset.legalLinks='true';
      links.forEach(([label,href])=>{const a=document.createElement('a');a.href=href;a.textContent=label;wrap.appendChild(a)});
      const container=footer.querySelector('.container')||footer;
      container.appendChild(wrap);
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
})();
