const vertical = document.body.dataset.vertical;
const keys = vertical === 'export'
  ? ['products','requirements','documents','mappings','evidence','passports','cbam']
  : ['rfqs','invitations','quotes','decisions','contracts'];
const orgSelect = document.querySelector('#organization');
const message = document.querySelector('#message');
const cache = {};
let organizations = [];

async function api(path, options = {}) {
  const response = await fetch('/api/b2b/' + path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }, ...options
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Erro ${response.status}`);
  return result;
}
function info(text, success = false) {
  message.textContent = text;
  message.classList.toggle('success', success);
}
function optionText(row) { return row.name || row.title || row.code || row.legal_name || row.id; }
function renderOptions() {
  document.querySelectorAll('select[data-options]').forEach(select => {
    const existing = select.value;
    select.replaceChildren(new Option('Selecione…',''));
    for (const row of cache[select.dataset.options] || []) select.add(new Option(optionText(row) + ' · ' + row.id.slice(0,8),row.id));
    if ([...select.options].some(o => o.value === existing)) select.value = existing;
  });
}
function renderRows(key) {
  const target = document.querySelector(`[data-list="${key}"]`);
  if (!target) return;
  target.replaceChildren();
  for (const row of cache[key] || []) {
    const box = document.createElement('div'); box.className = 'row';
    const title = document.createElement('strong'); title.textContent = optionText(row); box.append(title);
    const meta = document.createElement('small');
    meta.textContent = `ID: ${row.id || '—'} · ${row.status || row.review_status || row.verification_state || ''}`; box.append(meta);
    if (key === 'quotes') {
      const terms = document.createElement('small'); terms.textContent = `Valor: ${row.amount ?? '—'} ${row.currency || ''} · Termos: ${JSON.stringify(row.terms)}`; box.append(terms);
    }
    if (key === 'contracts') {
      const renewal = new Date(`${row.ends_on}T00:00:00Z`);
      renewal.setUTCDate(renewal.getUTCDate() - Number(row.renewal_notice_days));
      const dates = document.createElement('small'); dates.textContent = `${row.starts_on} → ${row.ends_on} · iniciar revisão em ${renewal.toISOString().slice(0,10)}`; box.append(dates);
    }
    if (key === 'passports') {
      const link = document.createElement('a'); link.href = '/b2b/passport.html?token=' + encodeURIComponent(row.token);
      link.textContent = 'Abrir URL do passaporte'; box.append(link);
      const mappings = (cache.mappings || []).filter(item => item.product_id === row.product_id);
      const complete = mappings.filter(item => (cache.evidence || []).some(ev => ev.product_id === row.product_id && ev.requirement_id === item.requirement_id && ev.review_status === 'accepted' && (cache.documents || []).some(doc => doc.id === ev.document_id && doc.status === 'verified' && (!doc.expires_at || Date.parse(doc.expires_at) > Date.now())))).length;
      const score = document.createElement('small'); score.textContent = `Completude de dados: ${mappings.length ? Math.floor(100*complete/mappings.length) : 0}% · ${row.published ? 'publicado' : 'privado'}`; box.append(score);
    }
    const transitions = {
      documents: [['document','verified','Marcar verificado'],['document','rejected','Rejeitar']],
      evidence: [['evidence','accepted','Aceitar evidência'],['evidence','rejected','Rejeitar']],
      passports: [['passport','published','Publicar passaporte']],
      rfqs: [['rfq','open','Abrir RFQ']]
    };
    for (const [kind,status,label] of transitions[key] || []) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
      button.addEventListener('click', async () => {
        try { await api('transition',{ method:'POST',body:JSON.stringify({kind,id:row.id,status}) }); info('Estado atualizado.',true); await refresh(); }
        catch(error) { info(error.message); }
      }); box.append(button);
    }
    target.append(box);
  }
}
function renderComparison() {
  const host = document.querySelector('#comparison'); if (!host) return;
  host.replaceChildren();
  const groups = new Map();
  for (const quote of cache.quotes || []) {
    const invitation = (cache.invitations || []).find(i => i.id === quote.invitation_id);
    if (!invitation) continue;
    const group = groups.get(invitation.rfq_id) || [];
    group.push(quote); groups.set(invitation.rfq_id,group);
  }
  for (const [rfqId,quotes] of groups) {
    const title = document.createElement('h3');
    title.textContent = `Comparação factual · ${(cache.rfqs || []).find(r => r.id === rfqId)?.title || rfqId}`; host.append(title);
    const table = document.createElement('table');
    const header = table.createTHead().insertRow();
    for (const value of ['Campo',...quotes.map(q => q.id.slice(0,8))]) { const th=document.createElement('th'); th.textContent=value; header.append(th); }
    const fields = ['amount','currency','valid_until',...new Set(quotes.flatMap(q => Object.keys(q.terms || {})))];
    const tbody = table.createTBody();
    for (const field of fields) {
      const tr=tbody.insertRow();
      for (const value of [field,...quotes.map(q => String((field in q ? q[field] : q.terms?.[field]) ?? '—'))]) { const td=tr.insertCell(); td.textContent=value; }
    }
    const scroll = document.createElement('div'); scroll.className='table-scroll'; scroll.append(table); host.append(scroll);
  }
}
async function loadOrganizations(selected) {
  organizations = (await api('organizations')).rows;
  orgSelect.replaceChildren(new Option('Selecione uma organização…',''));
  for (const org of organizations) orgSelect.add(new Option(`${org.legal_name} · ${org.kind}`,org.id));
  const remembered = selected || sessionStorage.getItem('b2b-org');
  if (organizations.some(o => o.id === remembered)) orgSelect.value = remembered;
  else if (organizations.length) orgSelect.value = organizations[0].id;
  await refresh();
}
async function refresh() {
  const org = orgSelect.value;
  if (!org) return;
  document.querySelector('#organization-id').textContent = `ID para convites: ${org}`;
  sessionStorage.setItem('b2b-org',org);
  for (const key of keys) {
    try { cache[key] = (await api(`${key}?organization_id=${encodeURIComponent(org)}`)).rows; renderRows(key); }
    catch(error) { info(`${key}: ${error.message}`); }
  }
  renderOptions();
  renderComparison();
}
orgSelect.addEventListener('change',refresh);
document.querySelectorAll('form[data-action]').forEach(form => form.addEventListener('submit',async event => {
  event.preventDefault();
  const key = form.dataset.action;
  const body = Object.fromEntries(new FormData(form));
  if (key !== 'organizations' && key !== 'member-accept') {
    if (!orgSelect.value) return info('Crie ou selecione uma organização.');
    body.organization_id = orgSelect.value;
  }
  for (const field of ['details','terms']) {
    if (field in body) {
      try { body[field] = JSON.parse(body[field] || '{}'); }
      catch { return info(`${field}: JSON inválido.`); }
    }
  }
  if (key === 'quotes') body.provider_organization_id = orgSelect.value;
  if (body.amount) body.amount = Number(body.amount);
  for (const [field,value] of Object.entries(body)) if (value === '') delete body[field];
  try {
    const result = await api(key,{method:'POST',body:JSON.stringify(body)});
    info(key === 'organizations' ? 'Organização criada.' : key === 'member-accept' ? 'Convite aceito.' : 'Registro criado.',true);
    form.reset();
    if (key === 'organizations') await loadOrganizations(result.id);
    else if (key === 'member-accept') await loadOrganizations(result.organizationId);
    else if (key === 'member-invite') document.querySelector('#invitation-token').textContent = `Compartilhe o token apenas com o e-mail convidado: ${result.invitationToken}`;
    else await refresh();
  } catch(error) { info(error.message); }
}));
loadOrganizations().catch(error => info(`Entre na sua conta e configure o Supabase para usar o piloto: ${error.message}`));
