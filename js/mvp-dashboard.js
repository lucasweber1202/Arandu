(function(){
  const target=document.querySelector('[data-mvp-dashboard]');
  if(!target)return;
  const escapeHtml=(value)=>String(value??'').replace(/[&<>'"]/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const formatMetric=(value)=>Number(value||0).toLocaleString('pt-BR');
  const money=(value)=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const titleCase=(value)=>String(value||'').replace(/_/g,' ').replace(/\b\w/g,(char)=>char.toUpperCase());
  function card(label,value,detail){return `<article class="mvp-card"><span class="mvp-kicker">MVP</span><h3>${escapeHtml(value)}</h3><p><strong>${escapeHtml(label)}</strong></p><p>${escapeHtml(detail||'')}</p></article>`;}
  function scoreSignal(signal){return signal==='validado'?'ok':signal==='em_tracao'?'warn':'risk';}
  function scorecard(rows){
    if(!Array.isArray(rows)||!rows.length)return '<article class="mvp-card"><h3>Scorecard ainda não instalado</h3><p>Rode o SQL operacional no Supabase para carregar as metas de validação.</p></article>';
    return rows.map((row)=>{const pct=row.target?Math.min(100,Math.round((Number(row.value||0)/Number(row.target))*100)):0;return `<article class="mvp-card"><span class="mvp-kicker ${scoreSignal(row.signal)}">${escapeHtml(row.signal||'métrica')}</span><h3>${escapeHtml(titleCase(row.metric))}</h3><p>${formatMetric(row.value)} de ${formatMetric(row.target)} alvo</p><div class="mvp-progress"><span style="width:${pct}%"></span></div></article>`;}).join('');
  }
  function table(rows,columns,empty){
    if(!Array.isArray(rows)||!rows.length)return `<article class="mvp-card"><h3>${escapeHtml(empty||'Sem dados')}</h3><p>Sem registros suficientes ou view ainda não instalada.</p></article>`;
    return `<table class="mvp-table"><thead><tr>${columns.map(([key,label])=>`<th>${escapeHtml(label||key)}</th>`).join('')}</tr></thead><tbody>${rows.map((row)=>`<tr>${columns.map(([key])=>`<td>${escapeHtml(row[key]??'—')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }
  function priceTable(rows){
    if(!Array.isArray(rows)||!rows.length)return '<article class="mvp-card"><h3>Faixas de preço vazias</h3><p>Cadastre obras com preço ou rode a view operacional.</p></article>';
    return `<table class="mvp-table"><thead><tr><th>Faixa</th><th>Obras</th><th>Preço médio</th><th>Valor bruto estoque</th><th>Disponíveis</th></tr></thead><tbody>${rows.map((row)=>`<tr><td>${escapeHtml(row.price_band)}</td><td>${formatMetric(row.artworks)}</td><td>${money(row.avg_price)}</td><td>${money(row.gross_inventory_value)}</td><td>${formatMetric(row.available_live)}</td></tr>`).join('')}</tbody></table>`;
  }
  function readiness(rows){
    if(!Array.isArray(rows)||!rows.length)return '<article class="mvp-card"><h3>Sem auditoria de certificado</h3><p>A view de prontidão ainda não retornou registros.</p></article>';
    return rows.slice(0,12).map((row)=>`<article class="mvp-card"><span class="mvp-kicker">${escapeHtml(row.readiness||'certificado')}</span><h3>${escapeHtml(row.title||row.artwork_id)}</h3><p>${escapeHtml(row.artist_name||'Artista')}</p><p>Código: ${escapeHtml(row.certificate_code||'pendente')}</p></article>`).join('');
  }
  async function load(){
    try{
      const response=await fetch('/api/mvp-dashboard',{cache:'no-store'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||data.ok===false)throw new Error(data.error||'Falha ao carregar MVP.');
      const dashboard=data.dashboard||{};
      const installCard=data.installed?card('SQL operacional','Instalado','As views v_mvp_* responderam corretamente.'):card('SQL operacional','Pendente','Rode docs/arandu-mvp-operacional.sql no Supabase para completar o painel.');
      target.innerHTML=`
        <section class="mvp-section"><div class="container"><div class="mvp-head"><div><p class="eyebrow">Status do MVP</p><h2 class="section-title">Painel de validação operacional.</h2></div><p class="lead">Modo: ${escapeHtml(data.mode)} · Views instaladas: ${data.installed?'sim':'não'} · Erros: ${(data.errors||[]).length}</p></div><div class="mvp-grid-4">
          ${installCard}
          ${card('Artistas prontos',formatMetric(dashboard.artists_ready),`${formatMetric(dashboard.artists_total)} artistas totais`)}
          ${card('Obras publicadas',formatMetric(dashboard.artworks_live),`${formatMetric(dashboard.artworks_total)} obras totais`)}
          ${card('Reservas em 30 dias',formatMetric(dashboard.reservations_30d),`${formatMetric(dashboard.converted_reservations_total)} reservas convertidas no total`)}
          ${card('Leads em 30 dias',formatMetric(dashboard.leads_30d),'Compradores e contatos comerciais')}
          ${card('Submissões 30 dias',formatMetric(dashboard.artist_submissions_30d),'Artistas entrando no funil')}
          ${card('Briefings 30 dias',formatMetric(dashboard.company_briefs_30d),'Empresas, arquitetos e espaços')}
          ${card('Certificados válidos',formatMetric(dashboard.valid_certificates),`${formatMetric(dashboard.open_tasks)} tarefas abertas/em andamento`)}
        </div></div></section>
        <section class="mvp-section alt"><div class="container"><div class="mvp-head"><div><p class="eyebrow">Scorecard</p><h2 class="section-title">Validação comercial do piloto.</h2></div><p class="lead">Metas mínimas para decidir se o Arandu pode sair do piloto fechado.</p></div><div class="mvp-grid-5">${scorecard(data.scorecard)}</div></div></section>
        <section class="mvp-section"><div class="container"><div class="mvp-head"><div><p class="eyebrow">Preço e acervo</p><h2 class="section-title">Faixas de preço e estoque.</h2></div><p class="lead">Ajuda a validar ticket médio, comissão e foco inicial de venda.</p></div>${priceTable(data.priceBands)}</div></section>
        <section class="mvp-section alt"><div class="container"><div class="mvp-head"><div><p class="eyebrow">Funil</p><h2 class="section-title">Artistas e pipeline comercial.</h2></div><p class="lead">Acompanhe onde há gargalo: artista, comprador, briefing, reserva ou proposta.</p></div><div class="mvp-grid-2"><div>${table(data.artistPipeline,[['status','Status'],['state','UF'],['region','Região'],['artists','Artistas'],['with_profile_ready','Perfil pronto']],'Sem funil de artistas')}</div><div>${table(data.commercialPipeline,[['source','Origem'],['status','Status'],['records','Registros'],['last_at','Último movimento']],'Sem pipeline comercial')}</div></div></div></section>
        <section class="mvp-section"><div class="container"><div class="mvp-head"><div><p class="eyebrow">Certificados</p><h2 class="section-title">Prontidão documental das obras.</h2></div><p class="lead">Priorize obras sem certificado antes do piloto com compradores.</p></div><div class="mvp-grid-4">${readiness(data.certificateReadiness)}</div></div></section>
        <section class="mvp-section alt"><div class="container"><div class="mvp-head"><div><p class="eyebrow">Diagnóstico técnico</p><h2 class="section-title">Supabase e views.</h2></div><p class="lead">Use essa área para conferir rapidamente o que ainda falta instalar.</p></div>${table(data.errors,[['resource','Recurso'],['error','Erro']],'Nenhum erro encontrado')}</div></section>`;
    }catch(error){
      target.innerHTML=`<section class="mvp-section"><div class="container"><article class="mvp-card"><h3>Erro ao carregar painel MVP</h3><p>${escapeHtml(error.message)}</p></article></div></section>`;
    }
  }
  load();
})();
