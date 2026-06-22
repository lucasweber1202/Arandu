/* Arandu — camada de pre-lancamento */
(function(){
  const page=(location.pathname.split('/').pop()||'index.html');
  const internal=/^(painel|admin|demo|roadmap|configuracao|login|cadastro|minha-conta)/i.test(page);
  const escape=(value)=>String(value||'').replace(/[&<>'"]/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  function qs(sel,root=document){return root.querySelector(sel);}
  function qsa(sel,root=document){return Array.from(root.querySelectorAll(sel));}
  function create(html){const wrap=document.createElement('div');wrap.innerHTML=html.trim();return wrap.firstElementChild;}
  function insertBeforeFooter(el){const footer=qs('.site-footer'); if(footer&&footer.parentNode) footer.parentNode.insertBefore(el,footer); else document.body.appendChild(el);}

  function addNewsletter(){
    if(internal||qs('[data-prelaunch-newsletter]')) return;
    const block=create(`<section class="clean-section section-muted" data-prelaunch-newsletter><div class="container split"><div><p class="eyebrow">Lista de pre-lancamento</p><h2 class="section-title">Receba a primeira seleção da Arandu.</h2><p class="lead">Acompanhe artistas, obras, textos curatoriais e a abertura das primeiras vendas assistidas.</p></div><form class="form-card" data-form-type="newsletter"><h3>Receber novidades</h3><input name="nome" placeholder="Nome" /><input name="email" type="email" placeholder="Email" required /><button type="submit">Entrar na lista</button></form></div></section>`);
    insertBeforeFooter(block);
    if(!qs('script[src*="js/forms.js"]')){const s=document.createElement('script');s.src='js/forms.js';s.defer=true;document.body.appendChild(s);}
  }

  function improveArtistForm(){
    const form=qs('form[data-form-type="submissao-artista"]');
    if(!form||form.dataset.prelaunchEnhanced==='true') return;
    form.dataset.prelaunchEnhanced='true';
    const after=(anchorName,html)=>{const anchor=qs(`[name="${anchorName}"]`,form); if(anchor&&!qs(`[name="${create(html).getAttribute('name')}"]`,form)) anchor.insertAdjacentHTML('afterend',html);};
    after('nome_completo','<input name="email" type="email" placeholder="Email" required />');
    after('email','<input name="whatsapp" placeholder="WhatsApp" />');
    after('cidade','<input name="estado" placeholder="Estado" required />');
    after('faixa_preco','<select name="vendeu_obras"><option value="">Já vendeu obras antes?</option><option>Sim</option><option>Não</option></select>');
    after('vendeu_obras','<select name="tem_obras_disponiveis"><option value="">Tem obras disponíveis?</option><option>Sim</option><option>Não</option></select>');
    const message=qs('textarea[name="mensagem"]',form);
    if(message) message.placeholder='Mini bio, descrição da produção, séries, exposições, obras disponíveis e o que a curadoria deve entender sobre sua trajetória';
  }

  function addBuyerInterestToContact(){
    if(page!=='contato.html'||qs('[data-buyer-shortcut]')) return;
    const target=qs('#formulario .container, main .container');
    if(!target) return;
    target.insertAdjacentHTML('afterend',`<section class="clean-section" data-buyer-shortcut><div class="container home-trust-band"><a class="macro-card" href="para-compradores.html"><strong>Quero comprar arte</strong><span>Faça o cadastro de interesse para receber a primeira seleção.</span></a><a class="macro-card" href="para-artistas.html#submissao"><strong>Sou artista</strong><span>Envie portfólio, técnica, cidade e obras disponíveis.</span></a><a class="macro-card" href="curadoria.html"><strong>Como selecionamos</strong><span>Veja os critérios curatoriais antes de comprar ou submeter obras.</span></a></div></section>`);
  }

  function addPrelaunchHomeBand(){
    if(page!=='index.html'||qs('[data-prelaunch-band]')) return;
    const hero=qs('.rect-hero');
    if(!hero) return;
    hero.insertAdjacentHTML('afterend',`<section class="clean-section" data-prelaunch-band><div class="container home-trust-band"><a class="macro-card" href="para-compradores.html"><strong>Compradores</strong><span>Cadastre interesse por técnica, faixa de preço e intenção de compra.</span></a><a class="macro-card" href="para-artistas.html#submissao"><strong>Artistas</strong><span>Submeta portfólio para análise curatorial e acompanhamento de trajetória.</span></a><a class="macro-card" href="cadastro.html"><strong>Conta Arandu</strong><span>Crie acesso para acompanhar seleção, interesses e próximos recursos.</span></a></div></section>`);
  }

  function addFooterLinks(){
    const footer=qs('.site-footer .footer-grid');
    if(!footer||footer.dataset.prelaunchFooter==='true') return;
    footer.dataset.prelaunchFooter='true';
    const links=[['Curadoria','curadoria.html'],['Autenticidade','autenticidade.html'],['FAQ','faq.html'],['Para compradores','para-compradores.html'],['Cadastro','cadastro.html']];
    const col=create('<div><p>Pré-lançamento</p></div>');
    links.forEach(([label,href])=>{const a=document.createElement('a');a.href=href;a.textContent=label;col.appendChild(a);});
    footer.appendChild(col);
  }

  function addWorkInterestCta(){
    if(page!=='obras.html'||qs('[data-work-interest-note]')) return;
    const target=qs('[data-result-count]')||qs('#acervo .container');
    if(!target) return;
    target.insertAdjacentHTML('afterend','<p class="selection-summary" data-work-interest-note>Nesta fase, o interesse por obras é acompanhado pela curadoria antes de qualquer compra.</p>');
  }

  document.addEventListener('DOMContentLoaded',()=>{
    addPrelaunchHomeBand();
    improveArtistForm();
    addBuyerInterestToContact();
    addWorkInterestCta();
    addNewsletter();
    addFooterLinks();
  });
})();
