/* Arandu — compra rápida e atalhos comerciais */
(function(){
  function page(){return location.pathname.split('/').pop()||'index.html';}
  if(page()!=='comprar-arte.html')return;
  const controls=document.querySelector('[data-catalog-controls]');
  const target=document.querySelector('#obras .section-head')||controls;
  if(!target||document.querySelector('[data-quick-buy-panel]'))return;
  function click(sel){const el=document.querySelector(sel); if(el){el.click(); return true;} return false;}
  function setInput(sel,value){const el=document.querySelector(sel); if(!el)return false; el.value=value; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return true;}
  function setSearch(value){return setInput('[data-ux-catalog-search]',value);}
  function setType(value){return setInput('[data-ux-catalog-type]',value);}
  function scrollWorks(){document.getElementById('obras')?.scrollIntoView({behavior:'smooth',block:'start'});}
  function contactUrl(intent){
    const contact=window.ARANDU_CONTACT;
    const text='Olá, quero ajuda para comprar uma obra pela Arandu. Interesse: '+intent+'.';
    if(contact&&typeof contact.whatsappUrl==='function')return contact.whatsappUrl(text)||contact.mailto?.('Interesse em obra Arandu',text)||'contato.html';
    return 'contato.html';
  }
  function applyIntent(action){
    if(action==='primeira'){click('[data-collection="primeira"]')||setSearch('primeira obra fotografia papel preço acessível');}
    if(action==='ate3000'){click('[data-price="ate3000"]');}
    if(action==='foto'||action==='fotografia'){setType('Fotografia');}
    if(action==='casa'){click('[data-collection="casa"]')||setSearch('casa sala apartamento parede');}
    if(action==='empresa'){click('[data-collection="empresa"]')||setSearch('empresa escritório recepção ambiente');}
    if(action==='brasil'){click('[data-collection="brasil"]')||setSearch('brasil território rio sertão cidade memória');}
    if(action==='certificado'){setSearch('certificado obra única procedência');}
    if(action==='limpar'){click('[data-clear]');}
  }
  controls?.classList.add('is-collapsed');
  const filterButton=document.querySelector('[data-toggle-filters]');
  if(filterButton){filterButton.textContent='Mostrar filtros';filterButton.addEventListener('click',()=>setTimeout(()=>{filterButton.textContent=controls?.classList.contains('is-collapsed')?'Mostrar filtros':'Ocultar filtros';},30));}
  const panel=document.createElement('section');
  panel.className='quick-buy-panel';
  panel.dataset.quickBuyPanel='true';
  panel.innerHTML='<p class="eyebrow">Compra rápida</p><h2>Escolha por intenção, não por excesso de filtro.</h2><p>Use um atalho, veja poucas obras e peça reserva. A curadoria confirma disponibilidade, certificado, envio e preço final antes de qualquer pagamento.</p><div class="quick-buy-actions"><button type="button" data-qb="primeira" class="is-dark">Primeira obra</button><button type="button" data-qb="ate3000">Até R$ 3 mil</button><button type="button" data-qb="foto">Fotografia</button><button type="button" data-qb="casa">Para casa</button><button type="button" data-qb="empresa">Empresa/escritório</button><button type="button" data-qb="certificado">Com certificado</button><button type="button" data-qb="limpar">Ver tudo</button><a data-qb-contact href="contato.html">Pedir ajuda</a></div><div class="quick-buy-help"><span>1. Clique em uma intenção.</span><span>2. Reserve com nome e WhatsApp.</span><span>3. Confirme antes de pagar.</span></div>';
  target.parentElement.insertBefore(panel,target.nextSibling);
  panel.addEventListener('click',(event)=>{
    const btn=event.target.closest('[data-qb]'); if(!btn)return;
    applyIntent(btn.dataset.qb);
    controls?.classList.add('is-collapsed');
    scrollWorks();
  });
  const contact=panel.querySelector('[data-qb-contact]');
  if(contact)contact.href=contactUrl('curadoria rápida');
  setTimeout(()=>{
    const colecao=new URLSearchParams(location.search).get('colecao');
    if(!colecao)return;
    const map={primeira:'primeira',casa:'casa',empresa:'empresa',brasil:'brasil',ate3000:'ate3000','ate-3000':'ate3000',fotografia:'fotografia',certificado:'certificado'};
    const intent=map[String(colecao).toLowerCase()];
    if(intent){applyIntent(intent);scrollWorks();}
  },900);
})();
