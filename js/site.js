/* ARANDU — casca pública: navegação, ações, menu e rodapé com dono único */
(function(){
  // Antes existiam dois reconstrutores de navegação (este e
  // arandu-interface-audit.js) escrevendo no mesmo `.site-nav` com listas
  // diferentes. O resultado medido no navegador era "Pesquisar" e "Entrar"
  // duplicados em toda página, home com navegação diferente do resto e o
  // rodapé de cada página trocado por um genérico. A casca agora tem um dono
  // só: este arquivo.
  const PRIMARY_NAV=[['Comprar arte','comprar-arte.html'],['Artistas','artistas.html'],['Para artistas','para-artistas.html'],['Coleções','colecoes.html']];
  const MENU_GROUPS=[
    ['Explorar',[['Início','index.html'],['Comprar arte','comprar-arte.html'],['Coleções','colecoes.html'],['Artistas','artistas.html'],['Pesquisar','pesquisa.html'],['Narrativa','narrativa.html']]],
    ['Caminhos',[['Sou artista','para-artistas.html'],['Portal do artista','portal-artista.html'],['Empresas e arquitetos','empresas-e-arquitetos.html'],['Portal de empresas','portal-empresa.html'],['Confiança','confianca.html'],['Verificar certificado','verificar-certificado.html']]]
  ];
  // Só rotas públicas entram aqui. Reescrever para uma página interna
  // (proposta-pdf.html) mandava o visitante para o login administrativo.
  const LEGACY_MAP={'obras.html':'comprar-arte.html','acervo.html':'comprar-arte.html','colecao-curatorial.html':'colecoes.html','propostas.html':'proposta-curatorial.html','narrativas.html':'narrativa.html','privacidade.html':'politica-de-privacidade.html','empresas.html':'empresas-e-arquitetos.html','autenticidade.html':'confianca.html'};
  const SEARCH_INDEX=[['Home','index.html','Entrada','página inicial caminhos principais comprar artistas confiança pesquisar narrativa coleções'],['Comprar arte','comprar-arte.html','Comprar','obras acervo preço técnica artista reserva curadoria pintura fotografia escultura filtros coleções'],['Coleções','colecoes.html','Comprar','primeira obra apartamento empresa fotografia obras até 3000 brasil em obra intenção curatorial'],['Artistas','artistas.html','Artistas','perfil trajetória cidade origem obras disponíveis linguagem território'],['Para artistas','para-artistas.html','Artistas','enviar portfólio submissão curadoria critérios comissão seleção candidatura'],['Portal do artista','portal-artista.html','Artistas','acompanhar obras status curadoria revisão de preço portfólio aprovado'],['Minha conta','minha-conta.html','Conta','comprador seleção reservas pedidos dados privacidade'],['Minha seleção','minha-selecao.html','Conta','obras salvas comparar enviar para curadoria lista'],['Empresas e arquitetos','empresas-e-arquitetos.html','Projetos','briefing escritório hotel clínica recepção restaurante projeto ambiente'],['Confiança','confianca.html','Confiança','autenticidade certificado reserva envio compra segura depoimentos procedência'],['Como funciona','como-funciona.html','Operação','compra reserva certificado artista empresa proposta curadoria'],['Pesquisar','pesquisa.html','Busca','pesquisar obra artista técnica certificado conteúdo intenção'],['Narrativa','narrativa.html','Editorial','manifestos estudos resumos análises arte brasil mundo depoimentos artistas'],['Entrar','login.html','Conta','login comprador artista empresa reservas portfólio briefing']].map(([title,url,type,text])=>({title,url,type,text}));
  const GLOBAL_SCRIPTS=[['../data/whatsapp-config.js','20260713-contact-1'],['arandu-functions.js','20260713-backend-assets-1'],['arandu-recent.js','20260713-backend-assets-1'],['arandu-journey.js','20260713-backend-assets-1'],['arandu-usability.js','20260713-backend-assets-1'],['proposal-api.js','20260713-backend-assets-1'],['contact-actions.js','20260713-contact-1'],['quick-buy.js','20260713-readable-commerce-2'],['visual-fallbacks.js','20260713-readable-commerce-2'],['readability-polish.js','20260713-readable-commerce-2'],['public-commerce-cta.js','20260713-readable-commerce-2']];
  const normalize=(value)=>String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const escape=(value)=>String(value||'').replace(/[&<>'"]/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const page=()=>location.pathname.split('/').pop()||'index.html';
  // Página interna servida atrás da sessão administrativa: ela já tem a barra
  // do console. Antes, site.js montava a navegação pública por cima e o painel
  // ficava com duas navegações, uma delas oferecendo "Entrar" a quem já estava
  // dentro.
  if(document.querySelector('[data-owner-console]'))return;
  let accountAuthenticated=false;
  let accountCheckStarted=false;
  let pageSessionPromise=null;
  function getPageSession(){
    if(!pageSessionPromise){
      pageSessionPromise=fetch('/api/auth/session',{credentials:'include',cache:'no-store'}).then(async(response)=>{
        const data=await response.json().catch(()=>({}));
        if(!response.ok||data.ok===false)throw new Error(data.error||'Não foi possível consultar a sessão.');
        return data;
      });
    }
    return pageSessionPromise;
  }
  // Cache somente em memória e somente durante este pageview. auth.js e
  // selection-tools.js reutilizam a mesma Promise sem persistir sessão.
  window.AranduSession=Object.freeze({get:getPageSession});
  const accountNav=()=>accountAuthenticated?['Minha conta','minha-conta.html']:['Entrar','login.html'];
  // A seleção é o que traz o comprador de volta. O contador só aparece quando
  // existe alguma obra salva: um "0" permanente no cabeçalho é ruído.
  function selectionCount(){try{const parsed=JSON.parse(localStorage.getItem('arandu.selection.v1')||'[]');return Array.isArray(parsed)?parsed.length:0;}catch{return 0;}}
  function injectScript(file,version){if(document.querySelector('script[src*="'+file.replace('../','')+'"]'))return;const script=document.createElement('script');script.src=(file.startsWith('../')?file.slice(3):'js/'+file)+'?v='+version;script.defer=true;document.body.appendChild(script);}
  function injectGlobalScripts(){GLOBAL_SCRIPTS.forEach(([file,version])=>injectScript(file,version));}
  function forceVisible(){document.documentElement.style.opacity='1';document.documentElement.style.visibility='visible';if(document.body){document.body.style.opacity='1';document.body.style.visibility='visible';document.body.style.display=document.body.style.display==='none'?'block':document.body.style.display;document.body.classList.add('arandu-safe-visible','arandu-deep-clean-ready');}const main=document.querySelector('main');if(main){main.style.opacity='1';main.style.visibility='visible';main.style.display=main.style.display==='none'?'block':main.style.display;}}
  // A navegação é reconstruída em várias passagens (DOM pronto, sessão carregada,
  // reparo tardio). Sem uma assinatura, cada passagem recriava o cabeçalho e o
  // menu do zero, descartando o botão já vinculado e o foco do teclado.
  const navSignature=()=>JSON.stringify([accountNav(),selectionCount()]);
  let menuGlobalsBound=false;
  function setMenuOpen(open,{restoreFocus=false}={}){
    const panel=document.getElementById('arandu-site-menu');
    const button=document.querySelector('[data-mobile-menu-button]');
    if(!panel||!button)return;
    panel.hidden=!open;
    button.setAttribute('aria-expanded',String(open));
    button.textContent=open?'Fechar':'Menu';
    button.setAttribute('aria-label',open?'Fechar menu de navegação':'Abrir menu de navegação');
    document.body.classList.toggle('arandu-menu-open',open);
    if(open)panel.querySelector('a')?.focus();
    else if(restoreFocus)button.focus();
  }
  function linkTo(href,label,className){const a=document.createElement('a');a.href=href;a.textContent=label;if(className)a.className=className;return a;}
  function ensureHeaderNav(){
    const header=document.querySelector('.site-header,.safe-header');
    const inner=document.querySelector('.header-inner,.safe-nav')||header?.querySelector('.container');
    if(!header||!inner)return;
    inner.querySelectorAll('.native-search-link').forEach((item)=>item.remove());
    let logo=inner.querySelector('.brand-logo,.safe-logo');
    if(!logo){logo=linkTo('index.html','Arandu','brand-logo');inner.prepend(logo);}
    let nav=inner.querySelector('.site-nav,.safe-links,.nav');
    if(!nav){nav=document.createElement('nav');nav.className='site-nav';inner.appendChild(nav);}
    nav.setAttribute('aria-label','Navegação principal');
    let actions=inner.querySelector('.site-actions');
    if(!actions){actions=document.createElement('div');actions.className='site-actions';inner.appendChild(actions);}
    const signature=navSignature();
    if(inner.dataset.araduNav===signature&&actions.querySelector('[data-mobile-menu-button]'))return;
    inner.dataset.araduNav=signature;
    nav.innerHTML='';
    PRIMARY_NAV.forEach(([label,href])=>nav.appendChild(linkTo(href,label)));
    const [accountLabel,accountHref]=accountNav();
    const saved=selectionCount();
    actions.innerHTML='';
    const search=linkTo('pesquisa.html','Pesquisar','search-entry');
    search.setAttribute('aria-label','Pesquisar na Arandu');
    actions.appendChild(search);
    if(saved>0){
      const selection=linkTo('minha-selecao.html','Seleção '+saved,'selection-entry');
      selection.setAttribute('aria-label','Minha seleção: '+saved+(saved===1?' obra salva':' obras salvas'));
      actions.appendChild(selection);
    }
    actions.appendChild(linkTo(accountHref,accountLabel,'auth-entry'));
    const button=document.createElement('button');
    button.className='menu-toggle';
    button.type='button';
    button.dataset.mobileMenuButton='true';
    button.setAttribute('aria-expanded','false');
    button.setAttribute('aria-controls','arandu-site-menu');
    button.setAttribute('aria-label','Abrir menu de navegação');
    button.textContent='Menu';
    actions.appendChild(button);
  }
  function markActive(){const current=page();document.querySelectorAll('.site-nav a,.site-actions a,.mobile-menu-panel a,.safe-links a,.nav a,.site-footer a').forEach((a)=>{const target=(a.getAttribute('href')||'').split('?')[0].split('#')[0]||'index.html';const active=target===current;a.classList.toggle('is-active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});}
  function buildMobileMenu(){
    const header=document.querySelector('.site-header,.safe-header');
    const button=document.querySelector('[data-mobile-menu-button]');
    if(!header||!button)return;
    let panel=document.getElementById('arandu-site-menu');
    if(!panel){panel=document.createElement('div');panel.id='arandu-site-menu';panel.className='mobile-menu-panel';panel.hidden=true;header.appendChild(panel);}
    const signature=navSignature();
    if(panel.dataset.araduMenu!==signature){
      panel.dataset.araduMenu=signature;
      panel.innerHTML='';
      MENU_GROUPS.forEach(([group,items])=>{
        const title=document.createElement('p');
        title.className='menu-group';
        title.textContent=group;
        panel.appendChild(title);
        items.forEach(([label,href])=>panel.appendChild(linkTo(href,label)));
      });
      const accountTitle=document.createElement('p');
      accountTitle.className='menu-group';
      accountTitle.textContent='Conta';
      panel.appendChild(accountTitle);
      const saved=selectionCount();
      panel.appendChild(linkTo('minha-selecao.html',saved>0?'Minha seleção ('+saved+')':'Minha seleção'));
      const [accountLabel,accountHref]=accountNav();
      panel.appendChild(linkTo(accountHref,accountLabel,'auth-entry'));
      if(!accountAuthenticated)panel.appendChild(linkTo('cadastro.html','Criar conta'));
      panel.appendChild(linkTo('contato.html','Falar com a curadoria'));
    }
    // O botão é recriado quando a navegação muda (ex.: ao reconhecer a sessão),
    // por isso os ouvintes globais consultam o botão vivo em vez de capturá-lo.
    if(!menuGlobalsBound){
      menuGlobalsBound=true;
      panel.addEventListener('click',(event)=>{if(event.target.closest('a'))setMenuOpen(false);});
      document.addEventListener('click',(event)=>{if(panel.hidden||header.contains(event.target))return;setMenuOpen(false);});
      document.addEventListener('keydown',(event)=>{if(event.key==='Escape'&&!panel.hidden)setMenuOpen(false,{restoreFocus:true});});
    }
    if(button.dataset.bound==='true')return;
    button.dataset.bound='true';
    button.addEventListener('click',()=>setMenuOpen(panel.hidden));
  }
  // O rodapé é a segunda chance de achar a conta, a seleção e o portal do
  // artista. Antes ele era sobrescrito por um bloco genérico que não citava
  // nenhum dos três, e a home ficava com um rodapé diferente do resto.
  function footerColumns(){
    const [accountLabel,accountHref]=accountNav();
    return [
      ['Explorar',[['Comprar arte','comprar-arte.html'],['Coleções','colecoes.html'],['Artistas','artistas.html'],['Pesquisar','pesquisa.html']]],
      ['Caminhos',[['Sou artista','para-artistas.html'],['Portal do artista','portal-artista.html'],['Empresas e arquitetos','empresas-e-arquitetos.html'],['Portal de empresas','portal-empresa.html']]],
      ['Conta e confiança',[[accountLabel,accountHref],['Minha seleção','minha-selecao.html'],['Confiança','confianca.html'],['Verificar certificado','verificar-certificado.html']]]
    ];
  }
  function ensureFooter(){
    const footer=document.querySelector('.site-footer,.safe-footer');
    if(!footer)return;
    const signature=navSignature();
    if(footer.dataset.araduFooter===signature)return;
    footer.dataset.araduFooter=signature;
    let grid=footer.querySelector('.footer-grid');
    if(!grid){
      const container=footer.querySelector('.container')||footer;
      grid=document.createElement('div');
      grid.className='footer-grid';
      container.innerHTML='';
      container.appendChild(grid);
    }
    grid.innerHTML='';
    const brand=document.createElement('div');
    const brandTitle=document.createElement('h2');
    brandTitle.textContent='Arandu';
    const brandText=document.createElement('p');
    brandText.textContent='Arte brasileira contemporânea com curadoria, território e procedência.';
    brand.append(brandTitle,brandText);
    grid.appendChild(brand);
    footerColumns().forEach(([title,items])=>{
      const column=document.createElement('div');
      const heading=document.createElement('p');
      heading.textContent=title;
      column.appendChild(heading);
      items.forEach(([label,href])=>column.appendChild(linkTo(href,label)));
      grid.appendChild(column);
    });
    let legal=footer.querySelector('.footer-legal');
    if(!legal){legal=document.createElement('div');legal.className='footer-legal';(grid.parentNode||footer).appendChild(legal);}
    legal.innerHTML='';
    [['Política de privacidade','politica-de-privacidade.html'],['Termos de uso','termos-de-uso.html'],['Cookies','cookies.html'],['Falar com a curadoria','contato.html']].forEach((item,index)=>{
      if(index)legal.append(' · ');
      legal.appendChild(linkTo(item[1],item[0]));
    });
  }
  async function syncAuthNavigation(){if(accountCheckStarted)return;accountCheckStarted=true;try{const data=await getPageSession();if(!data.authenticated)return;accountAuthenticated=true;refreshShell();}catch{}}
  function renderSearch(query=''){document.querySelectorAll('[data-search-results]').forEach((target)=>{const q=normalize(query);const results=SEARCH_INDEX.filter((item)=>!q||normalize(`${item.title} ${item.type} ${item.text}`).includes(q)).slice(0,10);target.innerHTML=results.length?results.map((item)=>`<a class="search-result" href="${escape(item.url)}"><strong>${escape(item.title)}</strong><small>${escape(item.type)}</small><p>${escape(item.text)}</p></a>`).join(''):'<p>Nenhum resultado encontrado.</p>';});}
  let searchBound=false;
  function bindSearch(){renderSearch('');if(searchBound)return;searchBound=true;document.addEventListener('input',(event)=>{if(event.target.matches('[data-search-input]'))renderSearch(event.target.value);});}
  function fixLegacyLinks(){document.querySelectorAll('a[href]').forEach((a)=>{const raw=a.getAttribute('href')||'';if(!raw||raw.startsWith('#')||raw.startsWith('http')||raw.startsWith('mailto:')||raw.startsWith('tel:'))return;const hashIndex=raw.indexOf('#');const hash=hashIndex>=0?raw.slice(hashIndex):'';const beforeHash=hashIndex>=0?raw.slice(0,hashIndex):raw;const queryIndex=beforeHash.indexOf('?');const query=queryIndex>=0?beforeHash.slice(queryIndex):'';const clean=queryIndex>=0?beforeHash.slice(0,queryIndex):beforeHash;if(LEGACY_MAP[clean])a.setAttribute('href',LEGACY_MAP[clean]+query+hash);});}
  function injectAssistant(){if(document.querySelector('[data-arandu-assistant]')||document.querySelector('script[src*="arandu-assistant.js"]'))return;const script=document.createElement('script');script.src='js/arandu-assistant.js?v=20260709-deep-clean-1';script.defer=true;document.body.appendChild(script);}
  function refreshShell(){ensureHeaderNav();buildMobileMenu();ensureFooter();markActive();}
  function run(){forceVisible();refreshShell();bindSearch();fixLegacyLinks();injectGlobalScripts();injectAssistant();syncAuthNavigation();}
  // Reparo tardio: só age se outro script tiver removido o cabeçalho. Repetir o
  // `run` completo em timer reescrevia a navegação enquanto a pessoa a usava.
  function reconcile(){forceVisible();if(!document.querySelector('.site-nav a,.safe-links a'))run();else{markActive();fixLegacyLinks();}}
  document.addEventListener('arandu:selection-updated',()=>{ensureHeaderNav();buildMobileMenu();markActive();});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
  setTimeout(reconcile,400);setTimeout(reconcile,1500);setTimeout(forceVisible,2000);
})();
