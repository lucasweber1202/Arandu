// Propostas recebidas fora do portal (v3.7). A empresa transcreve a oferta que
// recebeu por e-mail, documento ou outro canal; o Arandu nunca a atribui ao banco
// como envio autenticado. Contrato: docs/EXTERNAL_FINANCIAL_PROPOSALS_V37.md.
// Revisão elegível habilita decisão interna canônica; continuidade contratual
// é uma ação separada e não significa aceite ou assinatura da instituição.

import { PRODUCTS } from '../../../lib/finance/products.mjs';
import { el, icon, formatDateTime, formatDate, plural } from '../core.js';
import { card, pill, tag, button, linkButton, emptyState, errorState, loading, drawer, field, catalogControl, toast, onSubmit, definitionList } from '../ui.js';
import { keyTerms, coverage, memberName } from './shared.js';

// Espelho dos papéis da API (RLS e RPC continuam decidindo): só orienta a tela.
const WRITE_ROLES = ['admin', 'finance_manager', 'analyst'];
const REVIEW_ROLES = ['admin', 'finance_manager'];

export const CHANNELS = Object.freeze({
  email: 'E-mail', document: 'Documento', spreadsheet: 'Planilha',
  formal_communication: 'Comunicação formal', manual: 'Anotação manual'
});
const STATE = Object.freeze({
  preparing: { label: 'Em preparação', tone: 'neutral', icon: 'edit' },
  pending_review: { label: 'Aguardando conferência', tone: 'warning', icon: 'clock' },
  reviewed: { label: 'Transcrição conferida', tone: 'info', icon: 'checkCircle' },
  withdrawn: { label: 'Retirada da análise', tone: 'neutral', icon: 'x' },
  superseded: { label: 'Substituída por versão nova', tone: 'neutral', icon: 'repeat' }
});
const DOCUMENT_STATE = Object.freeze({
  not_presented: 'Nenhum documento vinculado',
  metadata_available: 'Documento interno da solicitação vinculado',
  unavailable: 'Documento vinculado não está mais disponível'
});
const LIMIT_TEXT = 'Registrada pela empresa a partir de material recebido. A conferência confirma que a transcrição corresponde ao material; não é autenticação da instituição, aprovação de crédito, aceite ou assinatura.';

// Mensagens por código da API: o que aconteceu e o que fazer, sem código na tela.
function explain(error) {
  const code = error?.code || '';
  if (code === 'external_proposal_conflict' || code === 'external_proposal_state') return 'Outra pessoa alterou este registro antes de você. Nada foi gravado. Recarregue para ver a versão atual e decida de novo.';
  if (code === 'schema_incompatible') return 'Este ambiente ainda não tem o registro de propostas externas habilitado. Nada foi gravado.';
  if (code === 'external_decision_not_supported') return 'Decisão e contrato sobre proposta externa ainda não estão habilitados. Nada foi registrado.';
  if (error?.status === 403) return 'Seu papel não permite esta ação nesta organização ou entidade.';
  if (code === 'invalid_external_proposal') return 'Confira os campos, a origem e a versão. Nada foi gravado.';
  return error?.message || 'Não foi possível concluir. Nada foi confirmado.';
}
const unavailable = (error) => error?.status === 404 || error?.status === 503 || error?.code === 'schema_incompatible' || error?.code === 'route_not_found';

/** Seção da aba Propostas: lista as transcrições externas e abre o registro. */
export function externalProposalsSection(ctx, rfq, { onChange = null } = {}) {
  const role = ctx.viewer?.role;
  const canWrite = WRITE_ROLES.includes(role);
  const canReview = REVIEW_ROLES.includes(role);
  const open = !['cancelled', 'contracted'].includes(rfq.status);
  const body = el('div', { class: 'stack external-proposals', id: 'external-proposals' });
  const section = card({
    title: 'Propostas recebidas fora do portal', headingLevel: 3, id: 'external-section',
    subtitle: 'Oferta que chegou por e-mail, documento ou reunião, transcrita pela sua equipe. A instituição não precisa ter conta no Arandu.',
    body
  });
  // Sandbox público sem backend: não há persistência. Explica o recurso sem
  // botão que pareça gravar.
  if (ctx.mode === 'demo') {
    body.append(el('p', { class: 'callout callout-info compact', id: 'external-demo-note', role: 'note' }, [icon('info', { size: 14 }),
      el('span', { text: 'Nesta demonstração sem servidor, o registro de propostas externas não é gravado. No ambiente com backend, a equipe registra a transcrição, confere com o material recebido e a inclui na comparação, sem permitir escolher ou contratar essa proposta por aqui.' })]));
    return section;
  }
  const load = async () => {
    body.replaceChildren(loading('Carregando propostas externas…'));
    let result;
    try {
      result = await ctx.api(`external-proposals?organization_id=${encodeURIComponent(ctx.organization.id)}&rfq_id=${encodeURIComponent(rfq.id)}&limit=25`);
    } catch (error) {
      body.replaceChildren(unavailable(error)
        ? el('p', { class: 'callout callout-info compact', id: 'external-unavailable', role: 'status' }, [icon('info', { size: 14 }), el('span', { text: 'O registro de propostas externas não está disponível neste ambiente. As propostas enviadas pelo portal continuam abaixo.' })])
        : errorState({ title: 'Propostas externas indisponíveis', error: error.status === 403 ? explain(error) : 'Não foi possível consultar. Isso não significa que não existam propostas externas.', onRetry: load }));
      return;
    }
    const rows = result.rows || [];
    const nodes = [el('p', { class: 'notice-line', text: LIMIT_TEXT })];
    if (canWrite && open) nodes.push(el('div', { class: 'row-actions' }, button('Registrar proposta recebida', { variant: 'secondary', iconName: 'plus', attrs: { id: 'external-new' }, onClick: () => editor(ctx, rfq, { onSaved: () => { load(); onChange?.(); } }) })));
    if (!rows.length) nodes.push(emptyState({ compact: true, iconName: 'inbox', title: 'Nenhuma proposta externa registrada', text: canWrite ? 'Recebeu condições fora do portal? Registre a transcrição para comparar com as demais.' : 'Quando a equipe registrar uma oferta recebida fora do portal, ela aparece aqui.' }));
    for (const row of rows) nodes.push(externalCard(ctx, rfq, row, { canWrite: canWrite && open, canReview, reload: () => { load(); onChange?.(); } }));
    if (result.page?.has_more) nodes.push(el('p', { class: 'muted small', text: 'Há mais registros além destes 25. Exporte o processo para a lista completa.' }));
    body.replaceChildren(...nodes);
  };
  load();
  return section;
}

function externalCard(ctx, rfq, row, { canWrite, canReview, reload }) {
  const cov = coverage(rfq.product, row.terms || {});
  const missing = PRODUCTS[rfq.product].proposalFields.filter((spec) => spec.comparable && (row.terms?.[spec.key] === null || row.terms?.[spec.key] === undefined || row.terms?.[spec.key] === '')).map((spec) => spec.label.replace(/\s*\(.*\)$/, ''));
  const state = STATE[row.state] || { label: 'Estado não reconhecido', tone: 'neutral' };
  const actions = [];
  const live = row.state !== 'withdrawn';
  if (canReview && row.decision_allowed===true) {
    actions.push(linkButton('Selecionar na decisão', '#decisao', {size:'sm',variant:'primary',iconName:'flag'}));
    actions.push(linkButton('Solicitar aprovação', '#aprovacoes', {size:'sm',iconName:'checkCircle'}));
  }
  if (live && canWrite) actions.push(button('Corrigir (nova versão)', { size: 'sm', iconName: 'edit', onClick: () => editor(ctx, rfq, { record: row, onSaved: reload }) }));
  if (live && canReview && row.state === 'pending_review') actions.push(button('Conferir transcrição', { size: 'sm', variant: 'primary', iconName: 'checkCircle', onClick: () => { review(ctx, row, 'confirm', reload); } }));
  if (live && canReview) actions.push(button('Retirar da análise', { size: 'sm', variant: 'ghost', iconName: 'x', onClick: () => { review(ctx, row, 'withdraw', reload); } }));
  const history = el('details', { class: 'proposal-details' }, el('summary', { text: 'Histórico de versões e conferências' }));
  history.addEventListener('toggle', () => { if (history.open && !history.dataset.loaded) { history.dataset.loaded = '1'; versionHistory(ctx, rfq, row, history); } });
  return el('article', { class: 'proposal-card external-card', id: `external-${row.id}` }, [
    el('header', { class: 'proposal-head' }, [
      el('div', {}, [el('h4', { class: 'proposal-name', text: row.provider_name || 'Instituição cadastrada' }),
        el('p', { class: 'muted small', text: `${CHANNELS[row.channel] || 'Canal não informado'} · ${row.received_at ? `recebida em ${formatDateTime(row.received_at)}` : 'data de recebimento não informada'} · versão ${row.current_version}` })]),
      el('div', { class: 'proposal-badges' }, [tag('Fonte externa'), pill(state, { size: 'sm' }), row.rfq_revision_matches === false ? tag(`Revisão ${row.rfq_revision} da solicitação`, 'warning') : null])
    ]),
    el('p', { class: 'muted small' }, [el('strong', { text: 'Referência: ' }), row.source_reference || 'não informada']),
    keyTerms(rfq.product, row.terms || {}, { currency: row.currency ?? null }),
    el('div', { class: 'proposal-foot' }, [
      el('span', { class: 'coverage-inline' }, [el('span', { class: 'coverage-bar' }, el('span', { class: 'coverage-fill', style: `width:${Math.round(cov.ratio * 100)}%` })), el('span', { text: `${cov.filled} de ${cov.total} condições comparáveis informadas` })]),
      el('span', { class: 'muted small', text: row.currency ? `Moeda declarada ${row.currency}` : 'Moeda não declarada: não é convertida nem tratada como real' })
    ]),
    missing.length ? el('p', { class: 'small warn-text', text: `Não informado no material: ${missing.join(', ')}. Permanece em branco; não vira zero nem vantagem na comparação.` }) : null,
    // Proveniência da versão atual: quem declarou, quem transcreveu, quem conferiu e o que a instituição não confirmou.
    el('dl', { class: 'deflist deflist-2 external-provenance', 'aria-label': `Origem da versão ${row.current_version}` }, [
      ['Declarada por', `${row.provider_name || 'Instituição'} (atribuição feita pela empresa)`],
      ['Canal e recebimento', `${CHANNELS[row.channel] || 'Canal não informado'} · ${row.received_at ? formatDateTime(row.received_at) : 'data não informada'}`],
      ['Transcrita por', row.recorded_by ? `${memberName(ctx.members, row.recorded_by)}${row.recorded_at ? ` em ${formatDateTime(row.recorded_at)}` : ''}` : 'Não informado'],
      ['Documento', DOCUMENT_STATE[row.document_state] || DOCUMENT_STATE.not_presented],
      ['Conferência da transcrição', row.state === 'reviewed' ? `${memberName(ctx.members, row.reviewed_by)}${row.reviewed_at ? ` em ${formatDateTime(row.reviewed_at)}` : ''} · versão ${row.current_version}` : row.state === 'withdrawn' ? 'Retirada da análise' : `Pendente para a versão ${row.current_version}`],
      ['Confirmação da instituição', 'Não registrada: a instituição não enviou nem confirmou estes termos no Arandu']
    ].map(([label, value]) => el('div', { class: 'deflist-row' }, [el('dt', { text: label }), el('dd', { text: value })]))),
    el('p', { class: 'muted small', text: row.state === 'reviewed' ? row.decision_allowed===true ? 'Pode ser selecionada por decisão interna da empresa, com a aprovação aplicável. O registro contratual é uma etapa separada; não há assinatura automática.' : 'A transcrição foi conferida. Confira o estado do processo, a revisão e a disponibilidade do documento antes de decidir.' : row.state === 'withdrawn' ? 'Fora da comparação corrente; o histórico continua disponível.' : 'Fica fora da comparação até alguém da gestão conferir a transcrição.' }),
    el('details', { class: 'proposal-details' }, [el('summary', { text: 'Ver todas as condições transcritas' }), definitionList(PRODUCTS[rfq.product].proposalFields.filter((spec) => spec.key !== 'institution'), row.terms || {}, { showMissing: true, currency: row.currency ?? null })]),
    history,
    actions.length ? el('div', { class: 'row-actions' }, actions) : null
  ]);
}

/** Reuses registered contracts; selecting an offer never creates a signed instrument. */
export function externalContractContinuation(ctx, rfq, decision) {
  const body=el('div',{class:'stack'},loading('Consultando registros contratuais…'));
  const wrap=card({title:'Continuidade da decisão externa',body});
  const source=decision.selected_proposal?.provenance;
  if (!source) {body.replaceChildren(errorState({error:'A origem preservada da decisão não está disponível.',onRetry:()=>ctx.reload()}));return wrap;}
  const requestKey=`external-link-${crypto.randomUUID()}`;
  const select=el('select',{name:'external_contract',required:true},el('option',{value:'',text:'Selecione um contrato já registrado…'}));
  const records=new Map();
  const confirmed=el('input',{type:'checkbox',required:true});
  const status=el('p',{class:'muted small',role:'status'});
  const submit=button('Confirmar vínculo ao registro contratual',{variant:'primary',type:'submit',attrs:{id:'external-link-contract'}});
  const form=el('form',{class:'stack'},[
    el('p',{class:'callout callout-info',text:'A decisão é interna. Vincule somente um contrato existente legítimo da mesma instituição, entidade e produto. A assinatura e a aceitação da instituição não são verificadas pelo Arandu.'}),
    linkButton('Registrar contrato existente na carteira',ctx.href('/finance/contracts.html'),{iconName:'arrowRight'}),
    field({label:'Contrato registrado',control:select,required:true}),
    el('label',{class:'check-row'},[confirmed,el('span',{text:'Conferi o registro e confirmo que corresponde à contratação desta decisão. Isso não declara uma assinatura verificada pelo Arandu.'})]),status,submit
  ]);
  const load=async(after=null)=>{
    try {
      const result=await ctx.api(`external-proposals/contracts?organization_id=${encodeURIComponent(ctx.organization.id)}&id=${encodeURIComponent(decision.external_proposal_id)}&limit=50${after?`&after=${encodeURIComponent(after)}`:''}`);
      for(const row of result.rows||[]) {records.set(row.id,row);select.add(new Option(`${row.title||'Contrato registrado'} · ${formatDate(row.starts_on)} a ${formatDate(row.ends_on)} · ${row.currency} · versão ${row.current_version}`,row.id));}
      status.textContent=records.size?'Confira o documento, as condições e a vigência antes de confirmar.':'Nenhum registro elegível encontrado. Registre o contrato na carteira e volte a esta solicitação.';
      if(result.page?.has_more) {const more=button('Carregar mais contratos',{size:'sm',onClick:()=>{more.remove();load(result.page.next_after);}});form.append(more);}
      body.replaceChildren(form);
    } catch(error){body.replaceChildren(errorState({error,onRetry:()=>load(after)}));}
  };
  form.addEventListener('submit',async event=>{
    event.preventDefault();const record=records.get(select.value);
    if(!record||!confirmed.checked){status.textContent='Escolha o contrato e confirme a conferência do registro.';return;}
    submit.disabled=true;
    try {
      await ctx.api('external-proposals/contract',{method:'POST',body:JSON.stringify({id:decision.external_proposal_id,expected_version:decision.external_proposal_version,rfq_revision:decision.external_rfq_revision,request_key:requestKey,decision_id:decision.id,contract_id:record.id,expected_contract_version:record.current_version,confirmed_contract_record:true})});
      toast('Vínculo contratual confirmado. A assinatura não foi verificada pelo Arandu.');ctx.reload();
    } catch(error) {
      status.textContent=error.status&&error.status<500?explain(error):'O resultado ainda é desconhecido. Consulte antes de tentar novamente.';
      if(!error.status||error.status>=500) form.append(button('Consultar resultado do vínculo',{onClick:async()=>{
        try {const result=await ctx.api(`external-proposals/result?organization_id=${encodeURIComponent(ctx.organization.id)}&id=${encodeURIComponent(decision.external_proposal_id)}&operation=contract&request_key=${encodeURIComponent(requestKey)}`);if(result.state==='confirmed')ctx.reload();else{status.textContent='O vínculo ainda não foi confirmado. Uma nova tentativa conservará a mesma intenção.';submit.disabled=false;}}catch{status.textContent='A consulta falhou. O resultado continua desconhecido; nenhuma nova gravação foi enviada.';}
      }}));else submit.disabled=false;
    }
  });
  load();return wrap;
}

async function versionHistory(ctx, rfq, row, host, before = null) {
  const list = el('div', { class: 'stack' }, loading('Carregando histórico…'));
  host.append(list);
  try {
    const result = await ctx.api(`external-proposals?organization_id=${encodeURIComponent(ctx.organization.id)}&id=${encodeURIComponent(row.id)}&limit=10${before ? `&before_version=${before}` : ''}`);
    const reviews = result.reviews || [];
    list.replaceChildren(el('ol', { class: 'external-history', role: 'list' }, (result.versions || []).map((version) => el('li', { class: 'external-history-item' }, [
      el('p', {}, [el('strong', { text: `Versão ${version.version}` }), ' · ', pill(STATE[version.version_state] || STATE.preparing, { size: 'sm' })]),
      el('p', { class: 'muted small', text: `Registrada por ${memberName(ctx.members, version.recorded_by)} em ${formatDateTime(version.recorded_at)} · ${CHANNELS[version.channel] || 'canal não informado'}` }),
      version.correction_reason ? el('p', { class: 'small' }, [el('strong', { text: 'Motivo da correção: ' }), version.correction_reason]) : null,
      ...reviews.filter((item) => item.version === version.version).map((item) => el('p', { class: 'small' }, [
        el('strong', { text: item.action === 'confirm' ? 'Conferida: ' : 'Retirada: ' }),
        `${item.reason} — ${memberName(ctx.members, item.reviewed_by)}, ${formatDateTime(item.reviewed_at)}${item.document_read ? ' · documento lido pelo revisor' : ''}`]))
    ]))));
    if (result.page?.has_more) list.append(button('Ver versões anteriores', { size: 'sm', onClick: (event) => { event.currentTarget.remove(); versionHistory(ctx, rfq, row, host, result.page.next_before); } }));
  } catch (error) {
    list.replaceChildren(el('p', { class: 'field-error', role: 'alert', text: unavailable(error) ? 'Histórico indisponível neste ambiente.' : explain(error) }));
  }
}

function localIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

/** Formulário em duas etapas: preencher → revisar resumo → gravar. */
function editor(ctx, rfq, { record = null, onSaved }) {
  const product = PRODUCTS[rfq.product];
  const specs = product.proposalFields.filter((spec) => spec.key !== 'institution');
  const providers = (ctx.data.providers || []).filter((provider) => provider.status === 'active' || provider.id === record?.provider_id);
  // Chave estável por abertura do formulário: repetir após timeout reaproveita
  // o mesmo pedido em vez de criar um segundo registro.
  const requestKey = `ui-${record ? 'fix' : 'new'}-${crypto.randomUUID()}`;
  const provider = el('select', { name: 'provider_id', required: true, disabled: Boolean(record) });
  provider.add(new Option('Selecione a instituição…', ''));
  for (const item of providers) provider.add(new Option(item.name, item.id));
  if (record) provider.value = record.provider_id;
  const channel = el('select', { name: 'channel' }, Object.entries(CHANNELS).map(([value, text]) => el('option', { value, text })));
  channel.value = record?.channel || 'email';
  const received = el('input', { name: 'received_at', type: 'datetime-local' });
  if (record?.received_at) { const d = new Date(record.received_at); received.value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
  const reference = el('input', { name: 'source_reference', type: 'text', maxlength: '500', required: true, placeholder: 'Ex.: e-mail do gerente de 12/10, assunto "Proposta capital de giro"' });
  reference.value = record?.source_reference || '';
  const currency = el('select', { name: 'currency' }, [el('option', { value: '', text: 'Não declarada no material' }), el('option', { value: 'BRL', text: 'Real (BRL)' }), el('option', { value: 'USD', text: 'Dólar (USD)' }), el('option', { value: 'EUR', text: 'Euro (EUR)' })]);
  // Registro novo não presume real: a moeda vem do material ou fica não declarada.
  currency.value = record?.currency || '';
  const documentSelect = el('select', { name: 'document' }, el('option', { value: '', text: 'Sem documento vinculado' }));
  const documentHint = el('span', { class: 'muted small', text: 'Carregando documentos internos da solicitação…' });
  ctx.api(`private-documents?organization_id=${encodeURIComponent(ctx.organization.id)}&entity_type=rfq&entity_id=${encodeURIComponent(rfq.id)}`).then(({ rows = [] }) => {
    const usable = rows.filter((doc) => doc.visibility === 'internal' && doc.versions?.some((version) => version.version === doc.current_version && version.completed_at));
    for (const doc of usable) documentSelect.add(new Option(`${doc.title} · versão ${doc.current_version}`, `${doc.id}|${doc.current_version}`));
    if (record?.document_id) documentSelect.value = `${record.document_id}|${record.document_version}`;
    documentHint.textContent = usable.length ? 'Somente documentos internos já enviados nesta solicitação. Instituições não os veem.' : 'Nenhum documento interno disponível. Envie na aba Visão geral, se houver; sem documento, o registro diz que não há anexo.';
  }).catch(() => { documentHint.textContent = 'Não foi possível listar documentos. Você pode registrar sem anexo.'; });
  const termControls = specs.map((spec) => {
    const control = catalogControl(spec, record?.terms?.[spec.key] ?? null);
    // Sem leitura "= R$ …": o valor está na moeda declarada, que pode não ser real.
    delete control.dataset.readout;
    return { spec, control, node: field({ label: spec.label.replace('(R$)', '(na moeda do material)'), control, optionalLabel: true }) };
  });
  const reason = el('textarea', { name: 'correction_reason', rows: '2', maxlength: '1000', minlength: '10' });
  const formError = el('p', { class: 'field-error', role: 'alert', hidden: true });
  const form = el('form', { id: 'external-form', novalidate: true, class: 'stack' }, [
    el('p', { class: 'callout callout-info compact', role: 'note' }, [icon('info', { size: 14 }), el('span', { text: 'Você está registrando a transcrição de uma oferta que recebeu. O Arandu não a trata como enviada ou confirmada pela instituição. Deixe em branco o que o material não informa: campo vazio permanece "não informado", nunca zero.' })]),
    el('fieldset', { class: 'stack' }, [el('legend', { text: 'Origem' }), el('div', { class: 'field-grid' }, [
      field({ label: 'Instituição', control: provider, required: true, hint: record ? 'A instituição de um registro não muda; corrija criando outro registro.' : 'Cadastre a instituição em Instituições se ela ainda não estiver na lista.' }),
      field({ label: 'Canal de recebimento', control: channel, required: true }),
      field({ label: 'Recebida em', control: received, optionalLabel: true, hint: 'Somente se a data e a hora forem conhecidas.' }),
      field({ label: 'Moeda declarada', control: currency }),
      field({ label: 'Referência do material', control: reference, required: true, className: 'span-2' }),
      field({ label: 'Documento interno', control: documentSelect, optionalLabel: true, className: 'span-2' })
    ]), documentHint]),
    el('fieldset', { class: 'stack' }, [el('legend', { text: `Condições (${product.label})` }), el('div', { class: 'field-grid' }, termControls.map((item) => item.node))]),
    record ? field({ label: 'Motivo da correção', control: reason, required: true, hint: 'Entre 10 e 1000 caracteres. Fica no histórico; a versão anterior é preservada.' }) : null,
    formError
  ]);
  const step = el('div', { class: 'stack' }, form);
  const next = button('Revisar antes de gravar', { variant: 'primary', iconName: 'arrowRight' });
  const back = button('Voltar e editar', { variant: 'ghost', iconName: 'chevronLeft' });
  const save = button(record ? 'Gravar nova versão' : 'Gravar para conferência', { variant: 'primary', iconName: 'checkCircle' });
  back.hidden = true; save.hidden = true;
  const sheet = drawer({ title: record ? 'Corrigir proposta externa' : 'Registrar proposta recebida', subtitle: rfq.title, body: step, footer: [back, next, save], className: 'drawer-wide' });
  let payload = null;
  const fail = (text) => { formError.textContent = text; formError.hidden = false; formError.focus?.(); };
  next.addEventListener('click', () => {
    formError.hidden = true;
    if (!provider.value) return fail('Escolha a instituição que enviou a oferta.');
    if (reference.value.trim().length < 3) return fail('Descreva a referência do material recebido (ex.: e-mail e data).');
    const receivedAt = localIso(received.value);
    if (receivedAt === undefined || (receivedAt && Date.parse(receivedAt) > Date.now())) return fail('A data de recebimento não pode ser futura nem inválida.');
    if (record && reason.value.trim().length < 10) return fail('Explique o motivo da correção (mínimo de 10 caracteres).');
    const terms = {};
    for (const { spec, control } of termControls) {
      const raw = control.value.trim();
      if (!raw) continue;
      terms[spec.key] = spec.type === 'bool' ? raw === 'true' : ['money', 'percent', 'number', 'int'].includes(spec.type) ? Number(raw) : raw;
      if (typeof terms[spec.key] === 'number' && !Number.isFinite(terms[spec.key])) return fail(`${spec.label}: valor inválido.`);
    }
    const [documentId, documentVersion] = documentSelect.value ? documentSelect.value.split('|') : [null, null];
    payload = {
      rfq_id: rfq.id, provider_id: provider.value, request_key: requestKey, rfq_revision: rfq.revision || 1,
      state: 'pending_review', channel: channel.value, received_at: receivedAt, source_reference: reference.value.trim(),
      currency: currency.value || null, terms, document_id: documentId, document_version: documentId ? Number(documentVersion) : null,
      ...(record ? { id: record.id, expected_version: record.current_version, correction_reason: reason.value.trim() } : {})
    };
    const filled = Object.keys(terms).length;
    step.replaceChildren(el('div', { class: 'stack', id: 'external-review' }, [
      el('p', { class: 'callout callout-warning compact', role: 'note' }, [icon('alert', { size: 14 }), el('span', { text: 'Confira: isto grava uma transcrição feita pela sua empresa. Ela não é proposta autenticada pela instituição, nem aprovação de crédito ou aceite.' })]),
      definitionList([
        { key: 'institution', label: 'Instituição', type: 'text' }, { key: 'channel', label: 'Canal', type: 'text' },
        { key: 'received', label: 'Recebida em', type: 'text' }, { key: 'currency', label: 'Moeda', type: 'text' },
        { key: 'reference', label: 'Referência', type: 'text' }, { key: 'document', label: 'Documento', type: 'text' }
      ], {
        institution: provider.selectedOptions[0]?.text, channel: CHANNELS[channel.value],
        received: receivedAt ? formatDateTime(receivedAt) : 'Não informada', currency: payload.currency || 'Não declarada',
        reference: payload.source_reference, document: documentId ? documentSelect.selectedOptions[0]?.text : 'Nenhum (não há anexo)'
      }),
      el('p', { class: 'small', text: `${plural(filled, 'condição informada', 'condições informadas')}; as demais ficam como não informadas.` }),
      keyTerms(rfq.product, terms, { currency: payload.currency }),
      record ? el('p', { class: 'small' }, [el('strong', { text: 'Motivo: ' }), payload.correction_reason]) : null,
      el('p', { class: 'muted small', text: 'Depois de gravada, a versão fica aguardando conferência por alguém da gestão antes de entrar na comparação.' }),
      formError
    ]));
    next.hidden = true; back.hidden = false; save.hidden = false; save.focus();
  });
  back.addEventListener('click', () => { step.replaceChildren(form); next.hidden = false; back.hidden = true; save.hidden = true; formError.hidden = true; });
  save.addEventListener('click', async () => {
    if (!payload || save.disabled) return;
    save.disabled = true; back.disabled = true;
    try {
      const result = await ctx.api(record ? 'external-proposals/versions' : 'external-proposals', { method: 'POST', body: JSON.stringify(payload) });
      toast(result.replayed ? 'Este registro já havia sido gravado; nada foi duplicado.' : `Versão ${result.version} gravada. Aguardando conferência.`);
      sheet.close();
      // Quem pode conferir segue direto para a conferência desta versão: são
      // duas declarações distintas, gravadas em dois passos confirmados.
      if (!result.replayed && REVIEW_ROLES.includes(ctx.viewer?.role)) {
        review(ctx, { id: result.id, current_version: result.version, provider_name: provider.selectedOptions[0]?.text, document_id: payload.document_id }, 'confirm', onSaved);
        return;
      }
      onSaved?.();
    } catch (error) {
      fail(explain(error));
      save.disabled = error?.code === 'external_proposal_conflict' || error?.code === 'external_proposal_state';
      back.disabled = false;
    }
  });
}

// Conferência/retirada em painel próprio: erro de validação ou 409 mantém o que
// foi digitado; nada é enviado antes das declarações completas.
function review(ctx, row, action, reload) {
  const confirm = action === 'confirm';
  const hasDocument = Boolean(row.document_id);
  const reason = el('textarea', { rows: '3', maxlength: '1000', id: 'external-review-reason' });
  const material = el('input', { type: 'checkbox', id: 'external-material' });
  const documentRead = el('input', { type: 'checkbox', id: 'external-document-read' });
  const error = el('p', { class: 'field-error', role: 'alert', hidden: true, tabindex: '-1' });
  const submit = button(confirm ? 'Confirmar conferência' : 'Retirar', { variant: confirm ? 'primary' : 'danger', type: 'submit', iconName: confirm ? 'checkCircle' : 'x' });
  const form = el('form', { class: 'stack', id: 'external-review-form', novalidate: true }, [
    el('p', { class: 'small', text: confirm
      ? `Você confirma que a versão ${row.current_version} corresponde ao material recebido de ${row.provider_name || 'a instituição'}. Isso não valida as condições, não é aprovação de crédito e não indica aceite da instituição.`
      : 'A proposta sai da comparação corrente. Versões e conferências anteriores continuam no histórico.' }),
    field({ label: confirm ? 'Como conferiu' : 'Motivo da retirada', control: reason, required: true, hint: 'Entre 10 e 1000 caracteres.' }),
    el('label', { class: 'check-row' }, [material, el('span', { text: 'Li o material recebido para esta conferência.' })]),
    hasDocument ? el('label', { class: 'check-row' }, [documentRead, el('span', { text: 'Li o documento vinculado.' })]) : el('p', { class: 'muted small', text: 'Não há documento vinculado a esta versão.' }),
    error, el('div', { class: 'form-actions' }, submit)
  ]);
  const sheet = drawer({ title: confirm ? 'Conferir transcrição' : 'Retirar da análise', subtitle: row.provider_name || null, body: form, onClose: reload });
  const fail = (text) => { error.textContent = text; error.hidden = false; error.focus(); };
  onSubmit(form, async (event) => {
    event.preventDefault();
    error.hidden = true;
    const text = reason.value.trim();
    if (text.length < 10) { reason.closest('.field').setError('Escreva pelo menos 10 caracteres.'); reason.focus(); return; }
    reason.closest('.field').setError('');
    if (!material.checked || (confirm && hasDocument && !documentRead.checked)) return fail('Marque as declarações de leitura. Nada foi registrado.');
    submit.disabled = true;
    try {
      await ctx.api(`external-proposals/${action}`, { method: 'POST', body: JSON.stringify({ id: row.id, expected_version: row.current_version, reason: text, material_reviewed: true, document_read: hasDocument && documentRead.checked }) });
      toast(confirm ? 'Conferência registrada. A proposta entra na comparação como fonte externa.' : 'Proposta retirada da análise. O histórico foi preservado.');
      sheet.close();
    } catch (failure) {
      fail(explain(failure));
      // Conflito: a versão mudou. Não reenvia; a pessoa fecha e relê.
      submit.disabled = ['external_proposal_conflict', 'external_proposal_state'].includes(failure?.code);
    }
  });
  return sheet;
}

