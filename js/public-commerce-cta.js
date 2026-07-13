/* Arandu — CTA comercial fixo para acelerar compra */
(function(){
  const hidden=/^(painel|admin|editor|upload|kanban|funil|lead|certificados-admin|propostas-admin|colecoes-admin|status|go-live|login|cadastro|minha-conta)/i;
  const page=location.pathname.split('/').pop()||'index.html';
  if(hidden.test(page)||document.querySelector('[data-public-commerce-cta]'))return;
  function contactHref(){
    const msg='Olá, quero ajuda para escolher ou reservar uma obra na Arandu.';
    const contact=window.ARANDU_CONTACT;
    if(contact&&typeof contact.whatsappUrl==='function')return contact.whatsappUrl(msg)||contact.mailto?.('Ajuda para comprar arte',msg)||'contato.html';
    return 'contato.html';
  }
  const bar=document.createElement('aside');
  bar.className='public-commerce-cta';
  bar.dataset.publicCommerceCta='true';
  bar.innerHTML='<div><strong>Comprar arte com curadoria</strong><span>Escolha uma intenção, reserve e confirme tudo antes de pagar.</span></div><a class="primary" href="comprar-arte.html#obras">Ver obras</a><a class="secondary" data-public-contact href="contato.html">Pedir ajuda</a><button type="button" aria-label="Fechar">×</button>';
  document.body.appendChild(bar);
  const contact=bar.querySelector('[data-public-contact]');
  if(contact)contact.href=contactHref();
  bar.querySelector('button')?.addEventListener('click',()=>bar.remove());
})();
