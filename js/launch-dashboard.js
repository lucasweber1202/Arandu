(function(){
  const root=document.querySelector('[data-launch-dashboard]');
  if(!root)return;
  function esc(v){return String(v??'').replace(/[&<>'"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
  function ok(v){return v?'OK':'!';}
  function card(label,value,text){return '<article class="op-launch-card"><strong>'+ok(value)+'</strong><h3>'+esc(label)+'</h3><p>'+esc(text)+'</p></article>';}
  async function json(url){const res=await fetch(url,{cache:'no-store'});return res.json();}
  Promise.allSettled([json('/api/health?probe=1'),json('/api/dashboard')]).then((results)=>{
    const health=results[0].status==='fulfilled'?results[0].value:null;
    const dashboard=results[1].status==='fulfilled'?results[1].value:null;
    const checks=health?.checks||{}; const metrics=dashboard?.metrics||{};
    const rows=[
      ['Técnico',health?.productionReady,'Variáveis críticas e canal de contato configurados.'],
      ['Banco',health?.verifiedReady,'Supabase respondendo em tabelas e views principais.'],
      ['Catálogo',Number(metrics.artworks||0)>0,`${metrics.artworks||0} obras no banco.`],
      ['Artistas',Number(metrics.artists||0)>0,`${metrics.artists||0} artistas no banco.`],
      ['Leads',Number(metrics.leads||0)>=0,`${metrics.leads||0} leads registrados.`],
      ['Certificados',Number(metrics.certificates||0)>0,`${metrics.certificates||0} certificados verificáveis.`],
      ['Contato',checks.contactChannel,'WhatsApp ou e-mail configurado.'],
      ['Domínio',checks.siteUrl,'URL de produção configurada.']
    ];
    const actions=(health?.launchReadiness?.nextCriticalActions||[]).map((item)=>'<li>'+esc(item)+'</li>').join('')||'<li>Sem ações técnicas críticas no health check.</li>';
    root.innerHTML='<div class="section-head compact-head"><div><p class="eyebrow">Diagnóstico</p><h2 class="section-title">Prontidão de lançamento.</h2></div><p class="lead">Este painel cruza /api/health?probe=1 com /api/dashboard.</p></div><div class="op-launch-grid">'+rows.map((r)=>card(r[0],r[1],r[2])).join('')+'</div><div class="certificate-preview" style="margin-top:24px"><p class="eyebrow">Próximas ações</p><h2>O que ainda precisa atenção</h2><ol class="process-steps">'+actions+'</ol></div>';
  }).catch((error)=>{root.innerHTML='<div class="op-empty"><strong>Erro ao carregar painel</strong><span>'+esc(error.message)+'</span></div>';});
})();
