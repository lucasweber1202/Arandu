import { graphContextCard } from './graph-context.js';
// Detalhe da solicitação: contexto no topo, operação separada em abas.

import { PRODUCTS } from '../../../lib/finance/products.mjs';
import { SOURCE_LABELS, fieldLabel } from '../../../lib/finance/passport.mjs';
import { el, icon, money, percent, fieldValue, formatDate, formatDateTime, relativeDays, daysUntil, productLabel, RFQ_STATUS, PROPOSAL_STATUS, APPROVAL_STATUS, PROVIDER_KINDS, todayIso, timeAgo } from '../core.js';
import { card, pill, tag, button, linkButton, emptyState, errorState, loading, tabs, definitionList, toast, confirmDialog, drawer, field, catalogControl, person, menu, progress } from '../ui.js';
import { loadEntities, rfqEntityControl } from './entities.js';
import { comparisonMatrix, weightsPanel, revisionTimeline, collaboration, activityLog, approvalSteps, approvalActions, currentStep, memberName, memberTitle, coverage, approvalSummaryLine } from './shared.js';

const FLOW = [['draft', 'Rascunho'], ['open', 'Aberta'], ['collecting', 'Coleta'], ['comparing', 'Avaliação'], ['decided', 'Decisão'], ['contracted', 'Contrato']];

function lifecycle(rfq, pendingApproval) {
  const index = FLOW.findIndex(([status]) => status === rfq.status);
  const list = el('ol', { class: 'lifecycle', 'aria-label': 'Etapas do processo' });
  FLOW.forEach(([status, label], position) => {
    const state = rfq.status === 'cancelled' ? 'todo' : position < index ? 'done' : position === index ? 'current' : 'todo';
    list.append(el('li', { class: `lifecycle-step ${state}`, 'aria-current': state === 'current' ? 'step' : null }, [
      el('span', { class: 'lifecycle-mark' }, state === 'done' ? icon('check', { size: 12 }) : null),
      el('span', { class: 'lifecycle-label', text: status === 'comparing' && pendingApproval ? 'Aprovação' : label }),
      state === 'done' ? el('span', { class: 'sr-only', text: '(concluída)' }) : null
    ]));
  });
  return list;
}

/** Documentos carregados só quando a pessoa abre a seção: evita uma chamada por cartão. */
export function lazyDocuments(ctx, entityType, entityId, label, options = {}) {
  const details = el('details', { class: 'lazy-documents' }, [el('summary', {}, [icon('file', { size: 14 }), el('span', { text: label })])]);
  details.addEventListener('toggle', () => {
    if (!details.open || details.dataset.loaded) return;
    details.dataset.loaded = '1';
    import('./documents.js').then(({ documentsPanel }) => details.append(documentsPanel(ctx, { entityType, entityId, ...options })));
  });
  return details;
}

function keyTerms(product, terms) {
  const keys = product === 'credit' ? ['offered_amount', 'interest_rate_month', 'cet_year', 'term_months', 'grace_months']
    : ['mdr_debit', 'mdr_credit_cash', 'mdr_credit_installment', 'pix_fee', 'anticipation_rate', 'settlement_days'];
  const specs = Object.fromEntries(PRODUCTS[product].proposalFields.map((spec) => [spec.key, spec]));
  return el('dl', { class: 'key-terms' }, keys.map((key) => {
    // O rótulo curto perde a unidade do parênteses; ela volta junto do valor.
    const unit = (specs[key].label.match(/\(([^)]*)\)$/) || [])[1] || '';
    const suffix = { meses: ' meses', dias: ' dias', '% a.m.': ' a.m.', '% a.a.': ' a.a.' }[unit] || '';
    const raw = fieldValue(specs[key], terms?.[key]);
    const value = raw === null ? null : `${raw}${suffix}`;
    return el('div', { class: 'key-term' }, [el('dt', { text: specs[key].label.replace(/\s*\(.*\)$/, '') }), el('dd', { class: value === null ? 'missing' : '', text: value ?? '—' })]);
  }));
}

export async function rfqDetail(ctx) {
  const id = new URLSearchParams(location.search).get('id');
  const rfq = (ctx.data.rfqs || []).find((item) => item.id === id);
  if (!rfq) {
    ctx.header({ title: 'Detalhe da solicitação', crumbs: [{ label: 'Solicitações', href: ctx.href('/finance/rfqs.html') }] });
    return emptyState({ title: id ? 'Solicitação não encontrada' : 'Escolha uma solicitação', text: id ? 'Ela pode ter sido removida ou pertencer a outra organização. Confira o link.' : 'Abra uma solicitação na lista para ver os detalhes.', iconName: 'search',
      action: linkButton('Ver solicitações', ctx.href('/finance/rfqs.html'), { iconName: 'arrowRight' }) });
  }
  document.title = `${rfq.title} | Arandu Financial Procurement`;
  const manage = ctx.can('create_rfq');
  const proposals = rfq.proposals || [];
  const [approvals, decisions, policy] = await Promise.all([
    ctx.loadApprovals().then((rows) => rows.filter((row) => row.rfq_id === rfq.id)),
    ctx.api(`decisions?organization_id=${encodeURIComponent(ctx.organization.id)}`).then((result) => result.rows || []).catch(() => []),
    ctx.api(`approval-policy?organization_id=${encodeURIComponent(ctx.organization.id)}`).catch(() => ({ required_for_decision: false }))
  ]);
  const decision = decisions.find((row) => row.rfq_id === rfq.id) || null;
  const contract = decision ? (ctx.data.contracts || []).find((row) => row.decision_id === decision.id) : null;
  const pending = approvals.find((row) => row.status === 'pending') || null;
  const days = daysUntil(rfq.response_deadline);
  const live = ['open', 'collecting'].includes(rfq.status);

  // ---------------------------------------------------------- cabeçalho
  const transition = async (status, { title, description, tone = 'primary', confirmLabel }) => {
    if (!await confirmDialog({ title, description, confirmLabel, tone })) return;
    try {
      await ctx.api('transition', { method: 'POST', body: JSON.stringify({ kind: 'rfq', id: rfq.id, from: rfq.status, status }) });
      toast({ open: 'Solicitação aberta para propostas.', comparing: 'Coleta encerrada. Propostas prontas para avaliação.', collecting: 'Coleta reaberta.', cancelled: 'Solicitação cancelada.' }[status] || 'Estado atualizado.');
      ctx.reload();
    } catch (error) { toast(error.message, 'error'); }
  };
  const actions = [];
  if (manage) {
    if (rfq.status === 'draft') actions.push(button('Abrir para propostas', { variant: 'primary', iconName: 'send', onClick: () => transition('open', {
      title: 'Abrir para propostas?', confirmLabel: 'Abrir solicitação',
      description: (rfq.invites || []).length ? 'Os provedores convidados passam a ver a solicitação e podem enviar propostas até o prazo.' : 'Ainda não há provedores convidados. Você pode abrir agora e convidar em seguida.' }) }));
    if (rfq.status === 'collecting') actions.push(button('Encerrar coleta e avaliar', { variant: 'primary', iconName: 'scale', onClick: () => transition('comparing', {
      title: 'Encerrar a coleta?', confirmLabel: 'Encerrar coleta',
      description: `${proposals.length} proposta(s) recebida(s). Provedores não poderão mais enviar ou revisar propostas, a menos que você reabra a coleta.` }) }));
    if (rfq.status === 'comparing' && !pending && !decision) actions.push(linkButton(policy.required_for_decision ? 'Solicitar aprovação' : 'Registrar decisão', `#${policy.required_for_decision ? 'aprovacoes' : 'decisao'}`, { variant: 'primary', iconName: policy.required_for_decision ? 'checkCircle' : 'flag' }));
    if (rfq.status === 'decided' && !contract) actions.push(linkButton('Registrar contrato', '#decisao', { variant: 'primary', iconName: 'briefcase' }));
    if (['draft', 'open', 'collecting'].includes(rfq.status)) actions.push(button('Editar', { iconName: 'edit', onClick: () => editDrawer(ctx, rfq) }));
  }
  if (pending) actions.push(linkButton(currentStep(pending)?.approver_id === ctx.viewer?.id ? 'Decidir aprovação' : 'Acompanhar aprovação', '#aprovacoes', { variant: 'primary', iconName: 'clock' }));
  if (contract) actions.push(linkButton('Ver contrato', ctx.href(`/finance/contracts.html#contract-${contract.id}`), { iconName: 'briefcase' }));
  const more = [
    { label: 'Exportar processo (JSON)', icon: 'download', onClick: () => exportProcess(ctx, rfq) },
    manage && rfq.status === 'comparing' && !decision ? { label: 'Reabrir coleta', icon: 'refresh', onClick: () => transition('collecting', { title: 'Reabrir a coleta?', description: 'Provedores voltam a poder enviar e revisar propostas.', confirmLabel: 'Reabrir' }) } : null,
    manage && ['draft', 'open', 'collecting', 'comparing'].includes(rfq.status) ? { label: 'Cancelar solicitação', icon: 'x', danger: true, onClick: () => transition('cancelled', { title: 'Cancelar esta solicitação?', description: 'O processo é encerrado sem decisão. O histórico é preservado. Esta ação não pode ser desfeita.', confirmLabel: 'Cancelar solicitação', tone: 'danger' }) } : null
  ].filter(Boolean);
  actions.push(menu('Mais ações', more, { visibleLabel: 'Mais' }));
  const entities = await loadEntities(ctx);
  ctx.header({
    crumbs: [{ label: 'Solicitações', href: ctx.href('/finance/rfqs.html') }, { label: rfq.title }],
    title: rfq.title,
    meta: [
      tag(productLabel(rfq.product, { short: true })), pill(pending ? { label: 'Em aprovação', tone: 'warning', icon: 'clock' } : RFQ_STATUS[rfq.status]),
      el('span', { class: 'meta-item', title: 'Revisão publicada atual' }, [icon('repeat', { size: 14 }), el('span', { text: `Revisão ${rfq.revision || 1}` })]),
      el('span', { class: 'meta-item' }, [icon('users', { size: 14 }), el('span', { text: rfq.owner_name || memberName(ctx.members, rfq.owner_id) })]),
      entities.rows.length ? el('span', { class: 'meta-item meta-entity' }, rfqEntityControl(ctx, entities, rfq)) : null,
      el('span', { class: `meta-item${live && days !== null && days <= 2 ? ' urgent' : ''}` }, [icon('calendar', { size: 14 }),
        el('span', { text: rfq.response_deadline ? `Prazo de resposta ${formatDate(rfq.response_deadline)}${live ? ` · ${relativeDays(rfq.response_deadline)}` : ''}` : 'Sem prazo definido' })])
    ],
    actions
  });

  const root = el('div', { class: 'detail' });
  if (new URLSearchParams(location.search).get('created')) {
    root.append(el('div', { class: 'callout callout-success', role: 'status' }, [icon('checkCircle'), el('span', {}, [el('strong', { text: 'Solicitação criada como rascunho. ' }), 'Próximo passo: convide provedores e abra para propostas.'])]));
  }
  root.append(lifecycle(rfq, Boolean(pending)));

  const tabset = tabs([
    { id: 'visao-geral', label: 'Visão geral', render: () => overviewTab(ctx, rfq, { manage, pending, approvals, decision, contract, policy }) },
    { id: 'propostas', label: 'Propostas', count: proposals.length, render: () => proposalsTab(ctx, rfq) },
    { id: 'comparacao', label: 'Comparação', render: () => comparisonTab(ctx, rfq, decision) },
    { id: 'aprovacoes', label: 'Aprovações', count: pending ? 1 : null, render: () => approvalsTab(ctx, rfq, approvals, { manage }) },
    { id: 'decisao', label: 'Decisão', render: () => decisionTab(ctx, rfq, { decision, contract, policy, approvals, manage }) },
    { id: 'atividade', label: 'Atividade', render: () => activityTab(ctx, rfq) }
  ], { label: 'Seções da solicitação' });
  root.append(tabset.node);
  return root;
}

// ------------------------------------------------------------ visão geral
function overviewTab(ctx, rfq, { manage, pending, approvals, decision, contract, policy }) {
  const grid = el('div', { class: 'split' });
  const spec = PRODUCTS[rfq.product];
  const demand = card({ title: 'Demanda', subtitle: 'O que a empresa pediu, como os provedores veem.', id: 'demanda', body: [
    rfq.description ? el('p', { class: 'prose', text: rfq.description }) : null,
    definitionList(spec.demandFields, rfq.demand)
  ], actions: manage && ['draft', 'open', 'collecting'].includes(rfq.status) ? [button('Editar demanda', { size: 'sm', iconName: 'edit', onClick: () => editDrawer(ctx, rfq) })] : null });
  const revisions = card({ title: 'Revisões publicadas', subtitle: 'Propostas ficam ligadas à revisão que o provedor viu.', id: 'revisoes', body: revisionTimeline(ctx, rfq) });

  const invites = rfq.invites || [];
  const answered = new Map((rfq.proposals || []).map((proposal) => [proposal.provider_id, proposal]));
  const inviteList = el('ul', { class: 'invite-list', role: 'list' });
  for (const invite of invites) {
    const proposal = answered.get(invite.provider_id);
    const state = proposal ? { label: 'Respondeu', tone: 'success', icon: 'checkCircle' }
      : invite.status === 'accepted' ? { label: 'Preparando', tone: 'info', icon: 'edit' }
        : invite.status === 'invited' ? { label: 'Convidado', tone: 'neutral', icon: 'send' } : { label: invite.status, tone: 'neutral' };
    const detail = proposal ? `Proposta v${proposal.version}${proposal.rfq_revision ? ` · respondeu à revisão ${proposal.rfq_revision}` : ''}`
      : invite.status === 'accepted' ? 'Aceitou o convite' : 'Aguardando aceite';
    inviteList.append(el('li', { class: 'invite-row' }, [person(invite.provider_name || 'Provedor', detail), pill(state, { size: 'sm' })]));
  }
  const inviteCard = card({ title: 'Provedores convidados', subtitle: invites.length ? `${invites.length} convidado(s) · ${answered.size} responderam` : 'Ninguém convidado ainda.', id: 'convites',
    body: [invites.length ? inviteList : emptyState({ title: 'Convide pelo menos três provedores', text: 'Com menos de três propostas, a comparação diz pouco.', iconName: 'users', compact: true }),
      manage && ['draft', 'open', 'collecting'].includes(rfq.status) ? inviteForm(ctx, rfq) : null] });

  const reuse = card({ title: 'Reaproveitar', id: 'reaproveitar', body: [el('p', { class: 'muted small', text: 'Comece outra solicitação com esta demanda. Convites, propostas e decisões não são copiados.' }),
    linkButton('Criar nova solicitação com estes dados', ctx.href(`/finance/new-rfq.html?clone=${encodeURIComponent(rfq.id)}`), { size: 'sm', iconName: 'repeat' })] });
  const documents = card({ title: 'Documentos', subtitle: 'Balanços, minutas e anexos do processo, em armazenamento privado.', id: 'documentos', body: el('div', {}, loading()) });
  import('./documents.js').then(({ documentsPanel }) => documents.querySelector('.card-body').replaceChildren(documentsPanel(ctx, {
    entityType: 'rfq', entityId: rfq.id, canUpload: manage || ctx.can('upload_document'), shareLabel: 'Visível aos provedores convidados' })));
  grid.append(el('div', { class: 'split-main' }, [demand, passportSnapshotCard(ctx, rfq), revisions, graphContextCard(ctx, { type: 'rfq', id: rfq.id })]), el('div', { class: 'split-side' }, [nextStepCard(ctx, rfq, { pending, approvals, decision, contract, policy }), inviteCard, documents, reuse]));
  return grid;
}

// Fotografia dos campos do Financial Passport usados na criação. Só a
// compradora lê (RLS); o cartão some quando a RFQ não veio do Passport.
function passportSnapshotCard(ctx, rfq) {
  // Marcador vazio: o cartão só entra quando há fotografia (sem estado de carga sobrando).
  const slot = el('div', { hidden: true });
  const body = el('div');
  const node = card({ title: 'Dados do Financial Passport', subtitle: 'Fotografia do perfil no momento da criação. Mudanças posteriores no Passport não alteram este processo.', id: 'passport', body });
  ctx.api(`rfq-passport?organization_id=${encodeURIComponent(ctx.organization.id)}&rfq_id=${encodeURIComponent(rfq.id)}`).then(({ rows }) => {
    if (!rows?.length) return;
    const spec = PRODUCTS[rfq.product];
    body.replaceChildren(el('ul', { class: 'passport-snapshot', role: 'list' }, rows.map((row) => {
      const demandSpec = spec.demandFields.find((item) => item.key === row.demand_key);
      const numeric = demandSpec && ['money', 'percent', 'number', 'int'].includes(demandSpec.type);
      const shown = demandSpec ? fieldValue(demandSpec, numeric ? Number(row.field_value) : row.field_value) : null;
      return el('li', { class: 'passport-snapshot-row' }, [
      el('span', { class: 'passport-label', text: demandSpec?.label || fieldLabel(row.field_key) }),
      el('span', { class: 'passport-value', text: shown ?? row.field_value }),
      el('span', { class: 'passport-meta', text: [
        row.original_scope === 'entity' ? 'Origem: entidade legal' : 'Origem: grupo',
        SOURCE_LABELS[row.source] || row.source,
        row.profile_updated_at ? `atualizado em ${formatDate(row.profile_updated_at)}` : null,
        row.freshness === 'stale' ? 'desatualizado na criação' : row.freshness === 'review_due' ? 'revisão próxima na criação' : null,
        row.used_as_is ? 'usado sem alteração' : 'alterado na solicitação'
      ].filter(Boolean).join(' · ') })
      ]);
    })));
    slot.replaceWith(node);
  }).catch(() => {});
  return slot;
}

function nextStepCard(ctx, rfq, { pending, approvals = [], decision, contract, policy } = {}) {
  // O cartão acompanha o estado real do processo, não só o status da RFQ.
  const latest = [...approvals].sort((a, b) => String(b.requested_at).localeCompare(String(a.requested_at)))[0];
  const situational = (() => {
    if (pending) {
      const step = currentStep(pending);
      const total = (pending.steps || []).length;
      return step?.approver_id === ctx.viewer?.id
        ? ['Sua aprovação é necessária', `Etapa ${step.position} de ${total}. Veja o contexto na aba Aprovações e decida.`]
        : [`Aguardando ${step ? memberName(ctx.members, step.approver_id) : 'aprovação'}`, `Etapa ${step?.position || '—'} de ${total}. Você será avisado quando a etapa for concluída.`];
    }
    if (rfq.status === 'comparing' && latest?.status === 'changes_requested') return ['Alterações pedidas na aprovação', 'Revise a justificativa ou a escolha e solicite aprovação de novo.'];
    if (rfq.status === 'comparing' && latest?.status === 'rejected') return ['Aprovação rejeitada', 'Veja o motivo na aba Aprovações antes de decidir o próximo passo.'];
    if (rfq.status === 'comparing' && latest?.status === 'approved' && !latest.stale && !decision) return ['Aprovação concluída: registre a decisão', 'A aprovação cobre a proposta escolhida. Registre a decisão para seguir ao contrato.'];
    if (rfq.status === 'comparing' && policy?.required_for_decision) return ['Compare e peça aprovação', 'A política da empresa exige aprovação antes da decisão. A comparação é factual; a decisão é sempre da empresa.'];
    if (rfq.status === 'decided' && contract) return ['Contrato registrado', 'Os marcos de renovação aparecem em Contratos.'];
    return null;
  })();
  const text = situational || {
    draft: ['Convide provedores e abra para propostas', 'Provedores só veem a solicitação depois de convidados e com ela aberta.'],
    open: ['Aguardando as primeiras respostas', 'Você será avisado quando uma proposta chegar.'],
    collecting: ['Acompanhe as respostas até o prazo', 'Encerre a coleta quando tiver propostas suficientes para avaliar.'],
    comparing: ['Compare, peça aprovação e decida', 'A comparação é factual; a decisão é sempre da empresa.'],
    decided: ['Registre o contrato', 'Com vigência e aviso prévio, o Arandu acompanha a renovação.'],
    contracted: ['Contrato em acompanhamento', 'Os marcos de renovação aparecem em Contratos.'],
    cancelled: ['Solicitação cancelada', 'O histórico fica preservado para consulta.']
  }[rfq.status] || ['—', ''];
  return el('section', { class: 'next-step', 'aria-label': 'Próximo passo' }, [el('span', { class: 'next-step-kicker', text: 'Próximo passo' }), el('p', { class: 'next-step-title', text: text[0] }), el('p', { class: 'next-step-text', text: text[1] })]);
}

function inviteForm(ctx, rfq) {
  const invited = new Set((rfq.invites || []).filter((row) => ['invited', 'accepted'].includes(row.status)).map((row) => row.provider_id));
  const options = (ctx.data.providers || []).filter((provider) => provider.status === 'active' && !invited.has(provider.id));
  if (!options.length) return el('p', { class: 'muted small', text: 'Todos os provedores cadastrados já foram convidados. Cadastre outros em Provedores.' });
  const select = el('select', { name: 'provider_id' });
  for (const provider of options) select.add(new Option(`${provider.name} · ${PROVIDER_KINDS[provider.kind] || provider.kind}`, provider.id));
  const submit = button('Convidar', { variant: 'primary', type: 'submit', size: 'sm', iconName: 'send' });
  const form = el('form', { class: 'inline-form' }, [field({ label: 'Convidar provedor', control: select }), submit]);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    try {
      const result = await ctx.api('invites/send', { method: 'POST', body: JSON.stringify({ rfq_id: rfq.id, provider_id: select.value }) });
      const name = select.selectedOptions[0].textContent.split(' · ')[0];
      if (ctx.mode === 'demo') {
        toast(`Convite simulado para ${name}. Nenhum e-mail foi enviado. Troque para “Provedor” no topo para responder como a Atlas.`, 'info');
      } else if (result.invitationToken) {
        const description = result.recipient_mode === 'organization_open'
          ? 'Este provedor não tem e-mail de contato cadastrado: qualquer conta provedora que receber este link poderá aceitá-lo. Entregue por um canal seguro — ou cadastre o contato e convide de novo para restringir ao e-mail dele:'
          : 'Só a conta com o e-mail de contato cadastrado para este provedor pode aceitar. O convite é enviado a esse e-mail quando o envio estiver ligado; você também pode entregar este link de uso único por um canal seguro:';
        await confirmDialog({ title: 'Convite criado', confirmLabel: 'Pronto', description,
          body: el('input', { class: 'input mono', readonly: true, value: `${location.origin}/provider/invite.html#token=${result.invitationToken}`, 'aria-label': 'Link de convite' }) });
      }
      ctx.reload();
    } catch (error) { toast(error.message, 'error'); submit.disabled = false; }
  });
  return form;
}

function editDrawer(ctx, rfq) {
  const spec = PRODUCTS[rfq.product];
  const form = el('form', { class: 'stack', id: 'revision-form', novalidate: true });
  const title = el('input', { name: 'title', value: rfq.title, maxlength: '200' });
  const description = el('textarea', { name: 'description', rows: '3', maxlength: '4000' });
  description.value = rfq.description || '';
  const deadline = el('input', { name: 'response_deadline', type: 'date', value: rfq.response_deadline || '' });
  form.append(field({ label: 'Título', control: title, required: true }), field({ label: 'Contexto', control: description, optionalLabel: true }), field({ label: 'Prazo de resposta', control: deadline }));
  const grid = el('div', { class: 'field-grid' });
  for (const item of spec.demandFields) grid.append(field({ label: item.label, control: catalogControl(item, rfq.demand?.[item.key]), required: Boolean(item.required) }));
  form.append(grid);
  const willNotify = rfq.status !== 'draft' && (rfq.invites || []).length;
  const status = el('p', { class: 'callout callout-info', role: 'status' }, [icon('info'), el('span', { text: `Você está editando a revisão ${rfq.revision || 1}. ${willNotify ? 'Uma mudança material cria a revisão ' + ((rfq.revision || 1) + 1) + ' e avisa os provedores convidados. Propostas já enviadas continuam ligadas à revisão que responderam.' : 'Enquanto é rascunho, nenhum provedor é avisado.'}` })]);
  const save = button(rfq.status === 'draft' ? 'Salvar alterações' : 'Publicar revisão', { variant: 'primary', type: 'submit', iconName: 'check' });
  const dialog = drawer({ title: 'Editar solicitação', subtitle: rfq.title, body: [status, form], footer: [button('Cancelar', { variant: 'ghost', onClick: () => dialog.close() }), save] });
  save.setAttribute('form', 'revision-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const entries = Object.fromEntries(new FormData(form));
    if ((entries.title || '').trim().length < 3) { form.querySelector('[name=title]').closest('.field').setError('Use pelo menos 3 caracteres.'); return; }
    const demand = {};
    for (const item of spec.demandFields) if (entries[item.key] !== undefined && entries[item.key] !== '') demand[item.key] = entries[item.key];
    save.disabled = true;
    save.querySelector('.btn-label').textContent = 'Publicando…';
    try {
      const result = await ctx.api('rfqs', { method: 'PATCH', body: JSON.stringify({ rfq_id: rfq.id, expected_revision: rfq.revision || 1, title: entries.title, description: entries.description, response_deadline: entries.response_deadline, demand }) });
      dialog.close();
      toast(result.revision > (rfq.revision || 1) ? `Revisão ${result.revision} publicada.` : 'Nenhuma mudança material: a revisão continua a mesma.');
      ctx.reload();
    } catch (error) {
      save.disabled = false;
      save.querySelector('.btn-label').textContent = rfq.status === 'draft' ? 'Salvar alterações' : 'Publicar revisão';
      status.className = 'callout callout-danger';
      status.replaceChildren(icon('alert'), el('span', { text: error.message }), error.status === 409 ? button('Recarregar versão atual', { size: 'sm', onClick: () => location.reload() }) : null);
    }
  });
}

// ------------------------------------------------------------- propostas
function proposalsTab(ctx, rfq) {
  const proposals = rfq.proposals || [];
  const wrap = el('div', { class: 'stack' });
  if (!proposals.length) {
    wrap.append(emptyState({ title: 'Nenhuma proposta recebida', text: ['draft'].includes(rfq.status) ? 'Convide provedores e abra a solicitação para começar a receber propostas.' : 'Os provedores convidados ainda estão preparando as respostas.', iconName: 'inbox' }));
  }
  for (const proposal of proposals) {
    const cov = coverage(rfq.product, proposal.terms);
    const outdated = proposal.rfq_revision && proposal.rfq_revision < (rfq.revision || 1);
    const details = el('details', { class: 'proposal-details' }, [el('summary', { text: 'Ver todas as condições' }), definitionList(PRODUCTS[rfq.product].proposalFields.filter((item) => item.key !== 'institution'), proposal.terms, { showMissing: true })]);
    wrap.append(el('article', { class: 'proposal-card', id: `proposal-${proposal.id}` }, [
      el('header', { class: 'proposal-head' }, [
        el('div', {}, [el('h3', { class: 'proposal-name', text: proposal.provider_name }), el('p', { class: 'muted small', text: `${PROVIDER_KINDS[proposal.provider_kind] || 'Provedor'} · enviada ${timeAgo(proposal.submitted_at)} · versão ${proposal.version}${proposal.versions_count > 1 ? ` de ${proposal.versions_count}` : ''}` })]),
        el('div', { class: 'proposal-badges' }, [pill(PROPOSAL_STATUS[proposal.status], { size: 'sm' }), proposal.rfq_revision ? tag(`Respondeu à rev. ${proposal.rfq_revision}`, outdated ? 'warning' : 'neutral') : null])
      ]),
      outdated ? el('p', { class: 'callout callout-warning compact' }, [icon('alert', { size: 14 }), el('span', { text: `Esta proposta foi enviada antes da revisão ${rfq.revision}. As condições respondem à revisão ${proposal.rfq_revision}.` })]) : null,
      keyTerms(rfq.product, proposal.terms),
      el('div', { class: 'proposal-foot' }, [el('span', { class: 'coverage-inline' }, [el('span', { class: 'coverage-bar' }, el('span', { class: 'coverage-fill', style: `width:${Math.round(cov.ratio * 100)}%` })), el('span', { text: `${cov.filled} de ${cov.total} condições comparáveis informadas` })]),
        proposal.terms?.valid_until ? el('span', { class: `muted small${daysUntil(proposal.terms.valid_until) < 5 ? ' warn-text' : ''}`, text: `Válida até ${formatDate(proposal.terms.valid_until)}` }) : null]),
      proposal.note ? el('p', { class: 'proposal-note' }, [icon('message', { size: 14 }), el('span', { text: proposal.note })]) : null,
      details,
      lazyDocuments(ctx, 'proposal', proposal.id, 'Documentos enviados pelo provedor')
    ]));
  }
  const waiting = (rfq.invites || []).filter((invite) => !proposals.some((proposal) => proposal.provider_id === invite.provider_id));
  if (waiting.length) wrap.append(card({ title: 'Ainda sem resposta', headingLevel: 3, body: el('ul', { class: 'invite-list', role: 'list' }, waiting.map((invite) =>
    el('li', { class: 'invite-row' }, [person(invite.provider_name), el('span', { class: 'muted small', text: invite.status === 'accepted' ? 'aceitou o convite e está preparando' : 'ainda não aceitou o convite' })]))) }));
  return wrap;
}

// ------------------------------------------------------------ comparação
function comparisonTab(ctx, rfq, decision = null) {
  const proposals = rfq.proposals || [];
  const wrap = el('div', { class: 'stack' });
  wrap.append(comparisonMatrix(rfq, proposals));
  // Processo já decidido: a conta abre com os pesos que a empresa registrou na decisão.
  const recorded = ctx.weights[rfq.id] ? null : decision?.criteria?.weights;
  if (proposals.length > 1) wrap.append(weightsPanel(rfq, proposals, { initial: ctx.weights[rfq.id] || recorded,
    initialNote: recorded && Object.keys(recorded).length ? 'Pesos registrados na decisão desta solicitação.' : null,
    onApplied: (weights) => { ctx.weights[rfq.id] = weights; } }));
  if (proposals.length) {
    ctx.api('signals', { method: 'POST', body: JSON.stringify({ organization_id: ctx.organization.id, event: 'comparison_viewed', entity_type: 'rfq', entity_id: rfq.id }) }).catch(() => {});
    wrap.append(el('div', { class: 'row-actions' }, [button('Exportar processo (JSON)', { size: 'sm', iconName: 'download', attrs: { id: 'export-rfq' }, onClick: () => exportProcess(ctx, rfq) }),
      el('span', { class: 'muted small', text: 'Registro factual: demanda, propostas, critérios e decisão, com datas. Sem recomendação.' })]));
  }
  return wrap;
}

async function exportProcess(ctx, rfq) {
  try {
    const result = await ctx.api(`export?rfq_id=${encodeURIComponent(rfq.id)}`);
    const blob = new Blob([JSON.stringify(result.export, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = el('a', { href: url, download: `arandu-${ctx.mode === 'demo' ? 'demo-' : ''}rfq-${rfq.id.slice(0, 8)}.json` });
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast('Exportação gerada neste navegador.');
  } catch (error) { toast(error.message, 'error'); }
}

// ----------------------------------------------------------- aprovações
export function approvalCard(ctx, request, rfq, { onChange, compact = false } = {}) {
  const proposal = (rfq.proposals || []).find((row) => row.id === request.proposal_id);
  const step = currentStep(request);
  const mine = step && step.approver_id === ctx.viewer?.id;
  const node = el('article', { class: `approval-card${mine ? ' mine' : ''}`, id: `request-${request.id}` }, [
    el('header', { class: 'approval-head' }, [
      el('div', {}, [
        el('p', { class: 'approval-kicker', text: `${approvalSummaryLine(request)} · solicitado por ${memberName(ctx.members, request.requested_by)} ${timeAgo(request.requested_at)}` }),
        el('h3', { class: 'approval-title', text: proposal ? `${proposal.provider_name} · proposta v${request.proposal_version}` : `Proposta v${request.proposal_version}` })
      ]),
      pill(request.stale && request.status === 'pending' ? { label: 'Desatualizada', tone: 'danger', icon: 'alert' } : APPROVAL_STATUS[request.status])
    ]),
    request.stale ? el('p', { class: 'callout callout-warning compact' }, [icon('alert', { size: 14 }), el('span', { text: 'A solicitação ou a proposta mudou depois do pedido. Esta aprovação não vale para a versão atual; peça uma nova.' })]) : null,
    request.rationale ? el('blockquote', { class: 'rationale' }, [el('span', { class: 'rationale-label', text: 'Contexto do solicitante' }), el('p', { text: request.rationale })]) : null,
    proposal && !compact ? keyTerms(rfq.product, proposal.terms) : null,
    approvalSteps(request, ctx.members)
  ]);
  if (mine && !request.stale) node.append(el('div', { class: 'approval-cta' }, [el('p', { class: 'approval-your-turn' }, [icon('clock', { size: 14 }), el('span', { text: 'Sua decisão é a próxima etapa.' })]), approvalActions(ctx, request, { onDone: onChange })]));
  if (request.status === 'pending' && request.requested_by === ctx.viewer?.id) {
    node.append(el('div', { class: 'row-actions' }, button('Cancelar pedido de aprovação', { variant: 'ghost', size: 'sm', iconName: 'x', onClick: async () => {
      if (!await confirmDialog({ title: 'Cancelar o pedido?', description: 'Os aprovadores deixam de ver a pendência. O histórico é mantido.', confirmLabel: 'Cancelar pedido', tone: 'danger' })) return;
      try { await ctx.api('approvals/cancel', { method: 'POST', body: JSON.stringify({ request_id: request.id }) }); toast('Pedido de aprovação cancelado.'); onChange?.(); }
      catch (error) { toast(error.message, 'error'); }
    } })));
  }
  return node;
}

function approvalsTab(ctx, rfq, approvals, { manage }) {
  const wrap = el('div', { class: 'stack' });
  const proposals = rfq.proposals || [];
  const [latest, ...older] = approvals;
  if (latest) wrap.append(approvalCard(ctx, latest, rfq, { onChange: () => ctx.reload() }));
  const canRequest = manage && proposals.length && ['collecting', 'comparing'].includes(rfq.status) && (!latest || latest.status !== 'pending' || latest.stale) && !rfq.decision_id;
  if (canRequest) wrap.append(approvalRequestForm(ctx, rfq, latest));
  if (!latest && !canRequest) wrap.append(emptyState({ title: 'Nenhuma aprovação solicitada', text: proposals.length ? 'Quem gerencia a solicitação pode pedir aprovação de uma proposta a um ou mais aprovadores, em ordem.' : 'A aprovação fica disponível quando houver propostas.', iconName: 'checkCircle' }));
  if (older.length) wrap.append(el('details', { class: 'history' }, [el('summary', { text: `Pedidos anteriores (${older.length})` }), ...older.map((request) => approvalCard(ctx, request, rfq, { compact: true }))]));
  return wrap;
}

function approvalRequestForm(ctx, rfq, latest) {
  const proposals = rfq.proposals || [];
  const eligible = (ctx.members || []).filter((member) => member.user_id !== ctx.viewer?.id && member.role !== 'provider_user');
  const form = el('form', { class: 'card approval-form', id: 'approval-request', novalidate: true });
  form.append(el('div', { class: 'card-head' }, el('div', { class: 'card-head-text' }, [
    el('h3', { class: 'card-title', text: latest && latest.status !== 'pending' ? 'Solicitar nova aprovação' : 'Solicitar aprovação' }),
    el('p', { class: 'card-subtitle', text: 'Escolha a proposta, os aprovadores (em ordem) e explique o porquê. Cada aprovador é avisado na sua vez.' })
  ])));
  const body = el('div', { class: 'card-body stack' });
  const proposalGroup = el('fieldset', { class: 'radio-cards' }, el('legend', { class: 'field-label', text: 'Proposta para aprovação' }));
  proposals.forEach((proposal, index) => {
    proposalGroup.append(el('label', { class: 'radio-card' }, [
      el('input', { type: 'radio', name: 'proposal_id', value: proposal.id, checked: index === 0 }),
      el('span', { class: 'radio-card-text' }, [el('strong', { text: proposal.provider_name }), el('span', { class: 'muted small', text: `v${proposal.version} · ${rfq.product === 'credit' ? `${percent(proposal.terms?.interest_rate_month)} a.m. · ${money(proposal.terms?.offered_amount, { compact: true })}` : `MDR crédito ${percent(proposal.terms?.mdr_credit_cash)} · PIX ${percent(proposal.terms?.pix_fee)}`}` })])
    ]));
  });
  const order = [];
  const approverGroup = el('fieldset', { class: 'approver-pick' }, el('legend', { class: 'field-label', text: 'Aprovadores, na ordem em que devem decidir' }));
  const orderNote = el('p', { class: 'field-hint', text: 'Marque na ordem desejada. O solicitante não pode aprovar o próprio pedido.' });
  for (const member of eligible) {
    const box = el('input', { type: 'checkbox', value: member.user_id, name: 'approver' });
    const badge = el('span', { class: 'order-badge', 'aria-hidden': 'true' });
    box.addEventListener('change', () => {
      if (box.checked) order.push(member.user_id); else order.splice(order.indexOf(member.user_id), 1);
      for (const input of approverGroup.querySelectorAll('input')) {
        const position = order.indexOf(input.value);
        input.closest('label').querySelector('.order-badge').textContent = position >= 0 ? String(position + 1) : '';
      }
    });
    approverGroup.append(el('label', { class: 'approver-option' }, [box, badge, person(member.display_name || memberName(ctx.members, member.user_id), member.title || memberTitle(ctx.members, member.user_id))]));
  }
  if (!eligible.length) approverGroup.append(el('p', { class: 'muted', text: 'Convide outro membro da empresa para poder solicitar aprovação.' }));
  approverGroup.append(orderNote);
  const rationale = el('textarea', { name: 'rationale', rows: '4', maxlength: '4000', placeholder: 'Ex.: menor custo total estimado e valor integral; garantias validadas com o jurídico.' });
  const rationaleField = field({ label: 'Contexto para quem aprova', control: rationale, required: true, hint: 'Quem aprova vê este texto junto com a proposta e a comparação.' });
  const error = el('p', { class: 'field-error', role: 'alert', hidden: true });
  const submit = button('Solicitar aprovação', { variant: 'primary', type: 'submit', iconName: 'send' });
  body.append(proposalGroup, approverGroup, rationaleField, error, el('div', { class: 'form-actions' }, submit));
  form.append(body);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.hidden = true;
    if (!order.length) { error.textContent = 'Escolha pelo menos um aprovador.'; error.hidden = false; return; }
    if (!rationale.value.trim()) { rationaleField.setError('Explique o contexto para quem vai aprovar.'); rationale.focus(); return; }
    submit.disabled = true;
    try {
      await ctx.api('approvals/request', { method: 'POST', body: JSON.stringify({ rfq_id: rfq.id, proposal_id: new FormData(form).get('proposal_id'), approver_ids: order, rationale: rationale.value }) });
      toast(`Aprovação solicitada. ${memberName(ctx.members, order[0])} foi avisado(a).`);
      ctx.reload();
    } catch (failure) { error.textContent = failure.message; error.hidden = false; submit.disabled = false; }
  });
  return form;
}

// -------------------------------------------------------------- decisão
function decisionTab(ctx, rfq, { decision, contract, policy, approvals, manage }) {
  const wrap = el('div', { class: 'stack' });
  const proposals = rfq.proposals || [];
  if (decision) {
    const chosen = proposals.find((row) => row.id === decision.proposal_id);
    const weights = Object.entries(decision.criteria?.weights || {});
    const specs = Object.fromEntries(PRODUCTS[rfq.product].proposalFields.map((item) => [item.key, item]));
    wrap.append(card({ title: 'Decisão registrada', id: 'decisao-registrada', body: [
      el('div', { class: 'decision-summary' }, [
        el('span', { class: 'decision-icon' }, icon('flag', { size: 18 })),
        el('div', {}, [el('p', { class: 'decision-title', text: chosen ? `${chosen.provider_name} · proposta v${decision.proposal_version || chosen.version}` : 'Proposta escolhida' }),
          el('p', { class: 'muted small', text: `Por ${memberName(ctx.members, decision.decided_by)} em ${formatDateTime(decision.decided_at)}` })])
      ]),
      decision.rationale ? el('blockquote', { class: 'rationale' }, [el('span', { class: 'rationale-label', text: 'Justificativa' }), el('p', { text: decision.rationale })]) : null,
      el('p', { class: 'muted small', text: weights.length ? `Critérios definidos pela empresa: ${weights.map(([key, value]) => `${specs[key]?.label || key} (${value})`).join(' · ')}` : 'Decisão sem pesos registrados.' }),
      chosen ? keyTerms(rfq.product, chosen.terms) : null
    ] }));
    if (contract) wrap.append(card({ title: 'Contrato', body: [el('p', { text: `Vigência de ${formatDate(contract.starts_on)} a ${formatDate(contract.ends_on)} · aviso prévio de ${contract.renewal_notice_days} dias.` }),
      linkButton('Abrir ciclo de vida do contrato', ctx.href(`/finance/contracts.html#contract-${contract.id}`), { iconName: 'arrowRight', variant: 'primary' })] }));
    else if (manage) wrap.append(contractForm(ctx, rfq, decision, chosen));
    else wrap.append(emptyState({ title: 'Contrato ainda não registrado', text: 'Quem gerencia a solicitação registra o contrato com vigência e aviso prévio.', iconName: 'briefcase', compact: true }));
    return wrap;
  }
  if (!proposals.length) { wrap.append(emptyState({ title: 'A decisão fica disponível com propostas', text: 'Assim que houver ao menos uma proposta enviada, a empresa pode registrar sua escolha.', iconName: 'flag' })); return wrap; }
  if (!['collecting', 'comparing'].includes(rfq.status)) { wrap.append(emptyState({ title: 'Sem decisão para este estado', text: 'Decisões são registradas enquanto a solicitação está em coleta ou avaliação.', iconName: 'flag' })); return wrap; }
  const approved = approvals.find((row) => row.status === 'approved' && !row.stale);
  const pending = approvals.find((row) => row.status === 'pending');
  if (policy.required_for_decision && !approved) {
    wrap.append(el('div', { class: 'callout callout-warning' }, [icon('lock'), el('div', {}, [
      el('strong', { text: 'Sua empresa exige aprovação antes da decisão.' }),
      el('p', { text: pending ? `Há um pedido em andamento (${approvalSummaryLine(pending)}). A decisão libera quando ele for aprovado.` : 'Solicite a aprovação da proposta escolhida na aba Aprovações.' }),
      linkButton(pending ? 'Acompanhar aprovação' : 'Solicitar aprovação', '#aprovacoes', { size: 'sm', iconName: 'arrowRight' })
    ])]));
    return wrap;
  }
  if (!manage) { wrap.append(emptyState({ title: 'Nenhuma decisão registrada', text: 'Quem gerencia a solicitação registra a decisão.', iconName: 'flag' })); return wrap; }
  const form = el('form', { class: 'card', id: 'decision-form', novalidate: true });
  const group = el('fieldset', { class: 'radio-cards' }, el('legend', { class: 'field-label', text: 'Proposta escolhida' }));
  for (const proposal of proposals) {
    const locked = approved && approved.proposal_id !== proposal.id;
    group.append(el('label', { class: `radio-card${locked ? ' disabled' : ''}` }, [
      el('input', { type: 'radio', name: 'proposal_id', value: proposal.id, checked: approved ? approved.proposal_id === proposal.id : proposal === proposals[0], disabled: locked }),
      el('span', { class: 'radio-card-text' }, [el('strong', { text: proposal.provider_name }), el('span', { class: 'muted small', text: locked ? 'Não aprovada' : `v${proposal.version}${approved?.proposal_id === proposal.id ? ' · aprovada' : ''}` })])
    ]));
  }
  const rationale = el('textarea', { name: 'rationale', rows: '3', maxlength: '4000', 'aria-label': 'Justificativa da decisão' });
  const weights = ctx.weights[rfq.id];
  const useWeights = el('input', { type: 'checkbox', name: 'use_weights', checked: Boolean(weights) });
  const submit = button('Registrar decisão', { variant: 'primary', type: 'submit', iconName: 'flag' });
  form.append(el('div', { class: 'card-head' }, el('div', { class: 'card-head-text' }, [el('h3', { class: 'card-title', text: 'Registrar decisão' }),
    el('p', { class: 'card-subtitle', text: 'A decisão é da empresa. O Arandu guarda quem decidiu, quando, a proposta e uma fotografia de todas as propostas deste momento.' })])),
  el('div', { class: 'card-body stack' }, [group, field({ label: 'Justificativa', control: rationale, optionalLabel: true }),
    weights ? el('label', { class: 'check' }, [useWeights, el('span', { text: 'Registrar os pesos aplicados na comparação como critério desta decisão' })]) : null,
    el('div', { class: 'form-actions' }, submit)]));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const chosen = proposals.find((row) => row.id === data.get('proposal_id'));
    if (!await confirmDialog({ title: `Registrar a escolha de ${chosen?.provider_name}?`, description: 'A decisão fica registrada de forma permanente e a solicitação passa para “Decidida”. Em seguida você registra o contrato.', confirmLabel: 'Registrar decisão' })) return;
    submit.disabled = true;
    try {
      await ctx.api('decisions', { method: 'POST', body: JSON.stringify({ rfq_id: rfq.id, proposal_id: data.get('proposal_id'), rationale: data.get('rationale'), criteria: { weights: useWeights.checked ? weights || {} : {} } }) });
      toast('Decisão registrada. Agora registre o contrato.');
      ctx.reload();
    } catch (error) { toast(error.message, 'error'); submit.disabled = false; }
  });
  wrap.append(form);
  return wrap;
}

function contractForm(ctx, rfq, decision, chosen) {
  const today = todayIso();
  const months = Number(chosen?.terms?.term_months || chosen?.terms?.contract_months || 12);
  const end = new Date(Date.now() + months * 30.44 * 86400000).toISOString().slice(0, 10);
  const starts = el('input', { name: 'starts_on', type: 'date', value: today });
  const ends = el('input', { name: 'ends_on', type: 'date', value: end });
  const notice = el('input', { name: 'renewal_notice_days', type: 'number', min: '0', max: '3650', step: '1', value: '60' });
  const cost = el('textarea', { name: 'cost_summary', rows: '2', maxlength: '1000' });
  cost.value = chosen ? (rfq.product === 'credit'
    ? `${percent(chosen.terms?.interest_rate_month)} a.m.${chosen.terms?.cet_year ? ` · CET ${percent(chosen.terms.cet_year)} a.a.` : ''} · ${chosen.terms?.term_months || '—'} meses`
    : `MDR débito ${percent(chosen.terms?.mdr_debit)} · crédito ${percent(chosen.terms?.mdr_credit_cash)} · PIX ${percent(chosen.terms?.pix_fee)}`) : '';
  const conditions = el('textarea', { name: 'main_conditions', rows: '2', maxlength: '4000' });
  const reference = el('input', { name: 'document_reference', type: 'url', placeholder: 'https://…' });
  const submit = button('Registrar contrato', { variant: 'primary', type: 'submit', iconName: 'briefcase' });
  const form = el('form', { class: 'card', id: 'contract-form', novalidate: true }, [
    el('div', { class: 'card-head' }, el('div', { class: 'card-head-text' }, [el('h3', { class: 'card-title', text: 'Registrar contrato' }),
      el('p', { class: 'card-subtitle', text: 'Com vigência e aviso prévio, o Arandu cria os marcos de 90, 60 e 30 dias e a data de aviso para a renovação.' })])),
    el('div', { class: 'card-body' }, [el('div', { class: 'field-grid' }, [
      field({ label: 'Início da vigência', control: starts, required: true }), field({ label: 'Fim da vigência', control: ends, required: true }),
      field({ label: 'Aviso prévio (dias)', control: notice, hint: 'Prazo contratual para avisar a não renovação.' }),
      field({ label: 'Referência do documento', control: reference, optionalLabel: true, hint: 'Link https para o contrato no seu repositório.' }),
      field({ label: 'Resumo do custo', control: cost, className: 'span-2' }), field({ label: 'Condições principais', control: conditions, optionalLabel: true, className: 'span-2' })
    ]), el('div', { class: 'form-actions' }, submit)])
  ]);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (ends.value < starts.value) { ends.closest('.field').setError('O fim não pode ser antes do início.'); ends.focus(); return; }
    if (reference.value && !/^https:\/\//.test(reference.value)) { reference.closest('.field').setError('Use um endereço https.'); reference.focus(); return; }
    submit.disabled = true;
    try {
      const result = await ctx.api('contracts', { method: 'POST', body: JSON.stringify({ decision_id: decision.id, ...Object.fromEntries(new FormData(form)), renewal_notice_days: Number(notice.value) }) });
      toast('Contrato registrado. Os marcos de renovação já estão no calendário.');
      location.assign(ctx.href(`/finance/contracts.html#contract-${result.id}`));
    } catch (error) { toast(error.message, 'error'); submit.disabled = false; }
  });
  return form;
}

// -------------------------------------------------------------- atividade
function activityTab(ctx, rfq) {
  return el('div', { class: 'split' }, [
    el('div', { class: 'split-main' }, card({ title: 'Conversa do processo', subtitle: 'Cada comentário mostra quem pode lê-lo.', body: collaboration(ctx, rfq) })),
    el('div', { class: 'split-side' }, card({ title: 'Histórico', subtitle: 'Registro automático de cada etapa.', body: activityLog(ctx, 'rfq', rfq.id) }))
  ]);
}

export { progress, loading, errorState };
