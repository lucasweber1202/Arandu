/* Arandu — compra rápida e atalhos comerciais */
(function(){
  function page(){return location.pathname.split('/').pop()||'index.html';}
  if(page()!=='comprar-arte.html')return;
  const controls=document.querySelector('[data-catalog-controls]');
  const target=document.querySelector('#obras .section-head')||controls;
  if(!target||document.querySelector('[data-quick-buy-panel]'))return;
  function click(sel){const el=document.querySelector(sel); if(el){el.click(); return true;} return false;}
  function setInput(sel,value){const el=document.querySelector(sel); if(!el)return false; el.value=value; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return true;}
  function scrollWorks(){document.getElementById('obras')?.scrollIntoView({behavior:'smooth',block:'start'});}
  function contactUrl(intent){
    const contact=window.ARANDU_CONTACT;
    const text='Olá, quero ajuda para comprar uma obra pela Arandu. Interesse: '+intent+'.';
    if(contact&&typeof contact.whatsappUrl==='function')return contact.whatsappUrl(text)||contact.mailto?.('Interesse em obra Arandu',text)||'contato.html';
    return 'contato.html';
  }
  const panel=document.createElement('section');
  panel.className='quick-buy-panel';
  panel.dataset.quickBuyPanel='true';
  panel.innerHTML='<p class="eyebrow">Compra rápida</p><h2>Escolha por intenção, não por excesso de filtro.</h2><p>Use um atalho abaixo, veja poucas obras e peça reserva. A curadoria confirma disponibilidade, certificado, envio e preço final antes de qualquer pagamento.</p><div class="quick-buy-actions"><button type="button" data-qb="primeira" class="is-dark">Primeira obra</button><button type="button" data-qb="ate3000">Até R$ 3 mil</button><button type="button" data-qb="foto">Fotografia</button><button type="button" data-qb="casa">Para casa</button><button type="button" data-qb="empresa">Empresa/escritório</button><button type="button" data-qb="limpar">Limpar e ver tudo</button><a data-qb-contact href="contato.html">Pedir ajuda</a></div><div class="quick-buy-help"><span>1. Clique em uma intenção.</span><span>2. Reserve uma obra com nome e WhatsApp.</span><span>3. Receba confirmação antes de pagar.</span></div>';
  target.parentElement.insertBefore(panel,target.nextSibling);
  panel.addEventListener('click',(event)=>{
    const btn=event.target.closest('[data-qb]'); if(!btn)return;
    const action=btn.dataset.qb;
    if(action==='primeira'){click('[data-collection="primeira"]')||setInput('[data-ux-catalog-search]','primeira obra');}
    if(action==='ate3000'){click('[data-price="ate3000"]');}
    if(action==='foto'){setInput('[data-ux-catalog-type]','Fotografia');}
    if(action==='casa'){click('[data-collection="casa"]')||setInput('[data-ux-catalog-search]','casa sala apartamento');}
    if(action==='empresa'){click('[data-collection="empresa"]')||setInput('[data-ux-catalog-search]','empresa escritório recepção');}
    if(action==='limpar'){click('[data-clear]');}
    scrollWorks();
  });
  const contact=panel.querySelector('[data-qb-contact]');
  if(contact)contact.href=contactUrl('curadoria rápida');
})();
