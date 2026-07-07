/* ARANDU — shell público principal */
const SEARCH_INDEX=[
  ['Comprar arte','comprar-arte.html','Compra','obras disponíveis preço técnica artista reserva curadoria'],
  ['Perfil','minha-conta.html','Conta','perfil comprador preferências obras salvas recomendações login supabase'],
  ['Portal do artista','portal-artista.html','Artistas','login artista precificação portfólio preço reavaliação obras'],
  ['Empresas','empresas.html','Empresas','curadoria corporativa arquitetura hotel clínica escritório proposta'],
  ['Para compradores','para-compradores.html','Compradores','cadastro interesse primeira coleção orçamento técnica acompanhar artistas'],
  ['Explorar obras','obras.html','Obras','catálogo pintura fotografia escultura filtros acervo'],
  ['Artistas','artistas.html','Artistas','perfil trajetória técnica território obras disponíveis'],
  ['Para artistas','para-artistas.html','Artistas','submeter portfólio documentação certificado curadoria candidatura'],
  ['Curadoria','curadoria.html','Curadoria','critérios seleção originalidade técnica trajetória diversidade documentação'],
  ['Autenticidade','autenticidade.html','Confiança','certificado autoria ficha técnica procedência verificação'],
  ['Confiança','confianca.html','Confiança','autenticidade certificado critérios reserva compra procedência'],
  ['Sobre a Arandu','sobre.html','Institucional','manifesto nome arandu arte brasileira contemporânea'],
  ['FAQ','faq.html','Ajuda','perguntas frequentes compra entrega artista certificado devolução'],
  ['Contato','contato.html','Contato','falar com curadoria dúvidas compra artistas empresas'],
  ['Cadastro','cadastro.html','Conta','criar conta comprador artista curadoria'],
  ['Entrar','login.html','Conta','login acesso conta painel seleção'],
  ['Assistente virtual','#assistente','Atendimento','orientação caminho comprar obra empresa artista certificado'],
  ['Verificar certificado','verificar-certificado.html','Certificado','código certificado autenticidade validação procedência']
].map(([title,url,type,text])=>({title,url,type,text}));

const PUBLIC_NAV_ITEMS=[
  ['Comprar arte','comprar-arte.html'],
  ['Obras','obras.html'],
  ['Artistas','artistas.html'],
  ['Empresas','empresas.html'],
  ['Portal artista','portal-artista.html'],
  ['Entrar','login.html']
];
const INTERNAL_PAGE_PATTERNS=/^(painel|admin|demo|roadmap|configuracao|login|cadastro|minha-conta)/i;
const normalizeText=(value)=>String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const escapeHtml=(value)=>String(value||'').replace(/[&<>'"]/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const currentPage=()=>window.location.pathname.split('/').pop()||'index.html';
const isInternalPage=()=>INTERNAL_PAGE_PATTERNS.test(currentPage());
const hasAsset=(srcOrHref)=>Boolean(document.querySelector(`script[src*="${srcOrHref}"],link[href*="${srcOrHref}"]`));
function injectScriptOnce(src,id){if(document.getElementById(id)||hasAsset(src.split('?')[0])) return;const script=document.createElement('script');script.id=id;script.src=src;script.defer=true;document.body.appendChild(script);}
function injectCssOnce(href,id){if(document.getElementById(id)||hasAsset(href.split('?')[0])) return;const link=document.createElement('link');link.id=id;link.rel='stylesheet';link.href=href;document.head.appendChild(link);}
function loadCentralLoader(){if(!isInternalPage()) injectScriptOnce('js/arandu-loader.js?v=20260707-launch-readiness-1','arandu-loader-js');}
function injectPageIntegrations(){if(isInternalPage()) return;[
['js/arandu-functions.js?v=20260610-ux-1','arandu-functions-js'],['js/arandu-recent.js?v=20260610-public-shell-1','arandu-recent-js'],['js/arandu-journey.js?v=20260610-public-shell-1','arandu-journey-js'],['js/arandu-usability.js?v=20260610-public-shell-1','arandu-usability-js'],['js/arandu-assistant.js?v=20260618-experience-1','arandu-assistant-js'],['js/arandu-mobile.js?v=20260618-mobile-1','arandu-mobile-js'],['js/arandu-commerce.js?v=20260618-commerce-1','arandu-commerce-js'],['js/arandu-commerce-polish.js?v=20260706-commerce-polish-1','arandu-commerce-polish-js'],['js/arandu-launch-readiness.js?v=20260707-launch-readiness-1','arandu-launch-readiness-js'],['js/arandu-visual-commercial-polish.js?v=20260707-commercial-polish-2','arandu-visual-commercial-polish-js'],['js/arandu-platform-upgrade.js?v=20260707-platform-1','arandu-platform-upgrade-js']].forEach(([src,id])=>injectScriptOnce(src,id));if(currentPage()==='proposta-curatorial.html') injectScriptOnce('js/proposal-api.js?v=20260610-operational-1','arandu-proposal-api-js');}
function injectProductCss(){if(isInternalPage()) return;[
['css/arandu-architecture.css?v=20260610-public-shell-1','arandu-architecture-css'],['css/arandu-clean.css?v=20260610-public-shell-1','arandu-clean-css'],['css/arandu-visual-polish.css?v=20260610-public-shell-1','arandu-visual-polish-css'],['css/arandu-mobile.css?v=20260618-mobile-1','arandu-mobile-css'],['css/arandu-commerce.css?v=20260618-commerce-1','arandu-commerce-css'],['css/arandu-commerce-polish.css?v=20260706-commerce-polish-1','arandu-commerce-polish-css'],['css/arandu-launch-readiness.css?v=20260707-launch-readiness-1','arandu-launch-readiness-css'],['css/arandu-visual-commercial-polish.css?v=20260707-commercial-polish-2','arandu-visual-commercial-polish-css'],['css/arandu-platform-upgrade.css?v=20260707-platform-1','arandu-platform-upgrade-css']].forEach(([href,id])=>injectCssOnce(href,id));}
function markActiveLinks(){const page=currentPage();document.querySelectorAll('a[href]').forEach((link)=>{const href=link.getAttribute('href')||'';const target=href.split('#')[0].split('?')[0]||'index.html';if(target===page) link.classList.add('is-active');});}
function normalizeHeader(){if(isInternalPage()) return;document.querySelectorAll('.header-inner > .search-trigger, .header-inner > .native-search-link').forEach((link)=>link.remove());document.querySelectorAll('.site-nav, .nav').forEach((nav)=>{nav.innerHTML='';PUBLIC_NAV_ITEMS.forEach(([label,href])=>{const a=document.createElement('a');a.href=href;a.textContent=label;nav.appendChild(a);});});document.querySelectorAll('.site-header .cta').forEach((cta)=>{if(cta.matches('[data-assistant-open]')) return;cta.href='contato.html';cta.textContent='Falar com a curadoria';});}
function renderSearchResults(query=''){const target=document.querySelector('[data-search-results]');if(!target) return;const q=normalizeText(query);const results=SEARCH_INDEX.filter((item)=>!q||normalizeText(`${item.title} ${item.type} ${item.text}`).includes(q)).slice(0,10);target.innerHTML=results.length?results.map((item)=>item.url==='#assistente'?`<button class="search-result" type="button" data-assistant-open><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.type)}</small><p>${escapeHtml(item.text)}</p></button>`:`<a class="search-result" href="${escapeHtml(item.url)}"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.type)}</small><p>${escapeHtml(item.text)}</p></a>`).join(''):'<p>Nenhum resultado encontrado.</p>';}
function setupSearch(){document.querySelectorAll('[data-search-results]').forEach(()=>renderSearchResults(''));}
function setupMobileMenu(){if(isInternalPage()) return;const headerInner=document.querySelector('.header-inner');const nav=document.querySelector('.site-nav, .nav');if(!headerInner||!nav||document.querySelector('[data-mobile-menu-button]')) return;const button=document.createElement('button');button.type='button';button.className='mobile-menu-button mobile-only';button.dataset.mobileMenuButton='true';button.setAttribute('aria-expanded','false');button.textContent='Menu';const panel=document.createElement('div');panel.className='mobile-menu-panel mobile-only';panel.hidden=true;panel.innerHTML=nav.innerHTML;button.addEventListener('click',()=>{const open=panel.hidden;panel.hidden=!open;document.body.classList.toggle('menu-open',open);button.setAttribute('aria-expanded',String(open));});panel.addEventListener('click',(event)=>{if(event.target.closest('a')){panel.hidden=true;document.body.classList.remove('menu-open');button.setAttribute('aria-expanded','false');}});headerInner.appendChild(button);document.querySelector('.site-header, .header')?.appendChild(panel);}
function setupShare(){document.addEventListener('click',async(event)=>{const target=event.target.closest('.share-action, [href="#compartilhar"]');if(!target) return;event.preventDefault();const data={title:document.title||'Arandu',text:'Conheça a Arandu',url:location.href};try{if(navigator.share){await navigator.share(data);return;}await navigator.clipboard.writeText(location.href);alert('Link copiado para compartilhar.');}catch(_){location.href='https://wa.me/?text='+encodeURIComponent(location.href);}});}
function removeLegacyUi(){if(isInternalPage()) return;document.querySelectorAll('#mood-bar,#side-inquiry,#sticky-decision-footer,#lead-magnet,#intent-cloud,#buyer-profile,#budget-helper,#command-palette,#copy-journey,#section-index,#compare-tray,#selection-drawer-hint,[data-mega-trigger],[data-mega-nav],[data-mobile-bottom-nav],[data-floating-cta],.floating-cta,.mobile-bottom-nav,.bottom-nav,.product-mega,.mega-trigger').forEach((el)=>el.remove());}
document.addEventListener('input',(event)=>{if(event.target.matches('[data-search-input]')) renderSearchResults(event.target.value);});
document.addEventListener('DOMContentLoaded',()=>{document.body.dataset.publicShell=isInternalPage()?'20260707-internal-shell-safe':'20260707-platform-shell';loadCentralLoader();injectProductCss();injectPageIntegrations();normalizeHeader();markActiveLinks();setupSearch();setupMobileMenu();setupShare();removeLegacyUi();setTimeout(removeLegacyUi,300);setTimeout(removeLegacyUi,1200);});
