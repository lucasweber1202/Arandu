/* ARANDU — shell público seguro e não destrutivo */
(function(){
  const PUBLIC_NAV=[['Home','index.html'],['Comprar','comprar-arte.html'],['Artistas','artistas.html'],['Confiança','confianca.html'],['Pesquisar','pesquisa.html'],['Narrativa','narrativa.html'],['Entrar','login.html']];
  const SEARCH_INDEX=[
    ['Home','index.html','Entrada','página inicial caminhos principais comprar artistas confiança pesquisar narrativa'],
    ['Comprar','comprar-arte.html','Comprar','obras acervo preço técnica artista reserva curadoria pintura fotografia escultura filtros coleções'],
    ['Coleções','colecoes.html','Comprar','primeira coleção casa empresa brasil em obra intenção curatorial'],
    ['Artistas','artistas.html','Artistas','perfil trajetória cidade origem obras disponíveis linguagem território'],
    ['Confiança','confianca.html','Confiança','autenticidade certificado reserva envio compra segura depoimentos procedência'],
    ['Pesquisar','pesquisa.html','Busca','pesquisar obra artista técnica certificado conteúdo intenção'],
    ['Narrativa','narrativa.html','Editorial','manifestos estudos resumos análises arte brasil mundo depoimentos artistas'],
    ['Entrar','login.html','Conta','login comprador artista empresa reservas portfólio briefing']
  ].map(([title,url,type,text])=>({title,url,type,text}));
  const normalize=(value)=>String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const escape=(value)=>String(value||'').replace(/[&<>'"]/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const page=()=>location.pathname.split('/').pop()||'index.html';
  function forceVisible(){
    document.documentElement.style.opacity='1';
    document.documentElement.style.visibility='visible';
    if(document.body){
      document.body.style.opacity='1';
      document.body.style.visibility='visible';
      document.body.style.display=document.body.style.display==='none'?'block':document.body.style.display;
      document.body.classList.add('arandu-safe-visible');
    }
    const main=document.querySelector('main');
    if(main){main.style.opacity='1';main.style.visibility='visible';main.style.display=main.style.display==='none'?'block':main.style.display;}
  }
  function markActive(){
    const current=page();
    document.querySelectorAll('.site-nav a,.safe-links a').forEach((a)=>{
      const target=(a.getAttribute('href')||'').split('?')[0].split('#')[0]||'index.html';
      a.classList.toggle('is-active',target===current);
    });
  }
  function buildMobileMenu(){
    const header=document.querySelector('.site-header,.safe-header');
    const nav=document.querySelector('.site-nav,.safe-links');
    const inner=document.querySelector('.header-inner,.safe-nav');
    if(!header||!nav||!inner||document.querySelector('[data-mobile-menu-button]')) return;
    const button=document.createElement('button');
    button.type='button';button.dataset.mobileMenuButton='true';button.className='mobile-menu-button';button.textContent='Menu';button.setAttribute('aria-expanded','false');
    const panel=document.createElement('div');panel.className='mobile-menu-panel';panel.hidden=true;
    PUBLIC_NAV.forEach(([label,href])=>{const a=document.createElement('a');a.href=href;a.textContent=label;panel.appendChild(a);});
    button.addEventListener('click',()=>{const open=panel.hidden;panel.hidden=!open;button.setAttribute('aria-expanded',String(open));});
    inner.appendChild(button);header.appendChild(panel);
  }
  function renderSearch(query=''){
    document.querySelectorAll('[data-search-results]').forEach((target)=>{
      const q=normalize(query);
      const results=SEARCH_INDEX.filter((item)=>!q||normalize(`${item.title} ${item.type} ${item.text}`).includes(q)).slice(0,10);
      target.innerHTML=results.length?results.map((item)=>`<a class="search-result" href="${escape(item.url)}"><strong>${escape(item.title)}</strong><small>${escape(item.type)}</small><p>${escape(item.text)}</p></a>`).join(''):'<p>Nenhum resultado encontrado.</p>';
    });
  }
  function bindSearch(){
    renderSearch('');
    document.addEventListener('input',(event)=>{if(event.target.matches('[data-search-input]'))renderSearch(event.target.value);});
  }
  function fixLegacyLinks(){
    document.querySelectorAll('a[href="obras.html"],a[href="acervo.html"]').forEach((a)=>{a.href='comprar-arte.html';});
  }
  function run(){forceVisible();markActive();buildMobileMenu();bindSearch();fixLegacyLinks();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
  setTimeout(forceVisible,300);setTimeout(forceVisible,1200);
})();
