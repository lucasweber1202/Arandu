(function(){
  const summary=document.querySelector('[data-go-live-summary]');
  const actions=document.querySelector('[data-go-live-actions]');
  if(!summary||!actions)return;
  const esc=(v)=>String(v??'').replace(/[&<>'"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const okBadge=(ok)=>'<span class="af-badge '+(ok?'is-ok':'is-warn')+'">'+(ok?'ok':'pendente')+'</span>';
  const toast=(text)=>{const zone=document.querySelector('[data-toast-zone]'); if(!zone)return; const item=document.createElement('div');item.className='admin-toast';item.textContent=text;zone.appendChild(item);setTimeout(()=>item.remove(),3500);};
  async function json(url,fallback){try{const res=await fetch(url,{cache:'no-store'});const data=await res.json();return {ok:res.ok,data};}catch(error){return {ok:false,data:fallback,error};}}
  async function exists(url){try{const res=await fetch(url,{method:'HEAD',cache:'no-store'});return res.ok;}catch{return false;}}
  function contactOk(){const digits=String(window.ARANDU_WHATSAPP_NUMBER||'').replace(/\D/g,'');return digits.length>=12||Boolean(window.ARANDU_CONTACT_EMAIL);}
  function card(label,ok,detail,href){return '<article class="op-quality-card '+(ok?'':'is-critical')+'"><div>'+okBadge(ok)+'</div><h3>'+esc(label)+'</h3><p>'+esc(detail)+'</p>'+(href?'<a href="'+esc(href)+'">Abrir</a>':'')+'</article>';}
  function action(title,items){return '<section class="admin-kanban-column"><h3>'+esc(title)+' <small>'+items.length+'</small></h3>'+items.map((item)=>'<article class="admin-kanban-card"><strong>'+esc(item.title)+'</strong><p>'+esc(item.text)+'</p>'+(item.href?'<a href="'+esc(item.href)+'">Resolver</a>':'')+'</article>').join('')+'</section>';}
  async function load(){
    summary.innerHTML='<div class="op-empty"><strong>Carregando</strong><span>Consultando arquivos e endpoints públicos...</span></div>';
    const [health,catalog,artists,certs,checklist,logoPng,logoSvg]=await Promise.all([
      json('/api/health',{}),json('/api/catalog','data/artworks.json'),json('/api/artists','data/artists.json'),json('data/certificates.json',[]),json('data/launch-checklist.json',{}),exists('assets/logo-arandu.png'),exists('assets/logo-arandu.svg')
    ]);
    const healthData=health.data||{};
    const catalogItems=Array.isArray(catalog.data?.items)?catalog.data.items:(Array.isArray(catalog.data)?catalog.data:[]);
    const artistItems=Array.isArray(artists.data?.items)?artists.data.items:(Array.isArray(artists.data)?artists.data:[]);
    const certItems=Array.isArray(certs.data)?certs.data:[];
    const checks=healthData.checks||{};
    const productionReady=Boolean(healthData.productionReady);
    const contact=contactOk();
    const hasEnoughCatalog=catalogItems.length>=20&&artistItems.length>=5;
    const hasTrust=certItems.some((item)=>item.verification_status==='valid');
    const hasLogo=logoPng||logoSvg;
    const cards=[
      card('Site público',true,'Home, compra, coleções, artistas, confiança, busca e narrativa estão navegáveis.','index.html'),
      card('Catálogo mínimo',hasEnoughCatalog,catalogItems.length+' obras e '+artistItems.length+' artistas carregados.','diagnostico-catalogo.html'),
      card('Certificados',hasTrust,certItems.length+' registros de certificado encontrados.','certificado-imprimivel.html'),
      card('Contato comercial',contact,contact?'WhatsApp ou e-mail central configurado.':'Configurar WhatsApp real ou e-mail de atendimento.','templates-comunicacao.html'),
      card('Supabase',Boolean(checks.supabaseUrl&&checks.supabaseAnonKey),checks.supabaseUrl?'Variáveis Supabase detectadas.':'Ainda em modo demo/local.','status.html'),
      card('Token admin',Boolean(checks.adminToken),checks.adminToken?'Token administrativo detectado.':'Configure ARANDU_ADMIN_TOKEN na Vercel.','docs/VERCEL_ENV_SETUP.md'),
      card('Logo',hasLogo,logoPng?'PNG final detectado.':(logoSvg?'SVG provisório detectado; substituir por PNG final depois.':'Logo ausente.'),'assets/logo-arandu.svg'),
      card('Pronto para produção',productionReady,productionReady?'Ambiente de produção configurado.':'Faltam variáveis reais de produção.','status.html')
    ];
    summary.innerHTML='<div class="section-head compact-head"><div><p class="eyebrow">Resumo</p><h2>Prontidão de lançamento</h2></div><strong>'+cards.filter((html)=>html.includes('is-ok')).length+'/'+cards.length+'</strong></div><div class="op-quality-grid">'+cards.join('')+'</div>';
    const pending=[];
    if(!contact)pending.push({title:'Configurar canal de contato',text:'Inserir WhatsApp real em data/whatsapp-config.js ou configurar ARANDU_CONTACT_EMAIL.',href:'docs/VERCEL_ENV_SETUP.md'});
    if(!checks.supabaseUrl)pending.push({title:'Configurar Supabase',text:'Adicionar SUPABASE_URL, SUPABASE_ANON_KEY e SERVICE_ROLE na Vercel.',href:'docs/VERCEL_ENV_SETUP.md'});
    if(!checks.adminToken)pending.push({title:'Criar token administrativo',text:'Definir ARANDU_ADMIN_TOKEN para liberar painel real.',href:'docs/VERCEL_ENV_SETUP.md'});
    if(!hasEnoughCatalog)pending.push({title:'Substituir base demo por catálogo real',text:'Meta mínima: 5 artistas reais e 20 obras reais autorizadas.',href:'catalogo-intake.html'});
    if(!logoPng)pending.push({title:'Subir logo final PNG',text:'Adicionar assets/logo-arandu.png antes de divulgar amplamente.',href:'docs/VERCEL_ENV_SETUP.md'});
    const ready=[{title:'Venda assistida já utilizável',text:'Catálogo, reserva, proposta pública, certificado e contato já têm fluxos navegáveis.',href:'comprar-arte.html'},{title:'Operação comercial já utilizável',text:'Kanban, funil, diagnóstico e templates estão disponíveis para uso interno.',href:'kanban-comercial.html'}];
    actions.innerHTML=action('Pendências reais',pending.length?pending:[{title:'Sem pendências críticas locais',text:'As pendências restantes dependem do ambiente de produção.',href:'status.html'}])+action('Já pode usar',ready);
    toast('Cockpit atualizado.');
  }
  document.querySelector('[data-go-live-refresh]')?.addEventListener('click',()=>load());
  load();
})();
