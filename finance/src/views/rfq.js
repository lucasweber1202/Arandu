/* global __ARANDU_DEMO__ */
import { graphContextCard } from './graph-context.js';
import { negotiationOrigin } from './negotiation-origin.js';
// Detalhe da solicitação: contexto no topo, operação separada em abas.

import { PRODUCTS } from '../../../lib/finance/products.mjs';
import { el, icon, fieldValue, formatDate, relativeDays, daysUntil, plural, productLabel, RFQ_STATUS, PROPOSAL_STATUS, PROVIDER_KINDS, todayIso, timeAgo } from '../core.js';
import { card, pill, tag, button, linkButton, emptyState, errorState, loading, tabs, definitionList, toast, confirmDialog, drawer, field, catalogControl, person, menu, progress, onSubmit } from '../ui.js';
import { loadEntities, rfqEntityControl } from './entities.js';
import { revisionTimeline, collaboration, activityLog } from './shared/collaboration.js';
import { currentStep, isViewerTurn } from './shared/approvals.js';
import { memberName } from './shared/people.js';
import { coverage, keyTerms } from './shared/terms.js';
import { lazyDocuments } from './shared/documents.js';
import { negotiationNextStep } from '../../../lib/finance/negotiation-next-step.mjs';
import { exportProcess } from './rfq/export.js';

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
// Convites que não aceitam mais resposta: rótulo em português, nunca o código.
const INVITE_CLOSED = Object.freeze({
  declined: { label: 'Recusou', tone: 'neutral', icon: 'x', detail: 'Recusou o convite' },
  revoked: { label: 'Revogado', tone: 'neutral', icon: 'x', detail: 'Convite revogado pela empresa' },
  expired: { label: 'Expirado', tone: 'neutral', icon: 'clock', detail: 'Convite expirou sem aceite' }
});

export async function rfqDetail(ctx) {
  const id = new URLSearchParams(location.search).get('id');
  let rfq = (ctx.data.rfqs || []).find((item) => item.id === id);
  if (!rfq && id && !(__ARANDU_DEMO__ && ctx.mode === 'demo')) {
    try {
      const detail = await ctx.api(`rfq/${encodeURIComponent(id)}`);
      if (detail.rfq?.id !== id || detail.rfq.organization_id !== ctx.organization.id) throw Object.assign(new Error('Solicitação fora da organização em foco.'), {status:404});
      rfq = {...detail.rfq, invites:detail.invites || [], proposals:detail.proposals || []};
    } catch (error) {
      if (error.status !== 404) return errorState({error, onRetry:()=>ctx.reload()});
    }
  }
  if (!rfq) {
    ctx.header({ title: 'Detalhe da solicitação', crumbs: [{ label: 'Solicitações', href: ctx.href('/finance/rfqs.html') }] });
    return emptyState({ title: id ? 'Solicitação não encontrada' : 'Escolha uma solicitação', text: id ? 'Ela pode ter sido removida ou pertencer a outra organização. Confira o link.' : 'Abra uma solicitação na lista para ver os detalhes.', iconName: 'search',
      action: linkButton('Ver solicitações', ctx.href('/finance/rfqs.html'), { iconName: 'arrowRight' }) });
  }
  let externalUi=null;
  if (!(__ARANDU_DEMO__ && ctx.mode === 'demo')) {
    try { externalUi=await import('./external-proposals.js');rfq=await externalUi.loadExternalDecisionChoices(ctx,rfq); }
    catch { rfq={...rfq,external_decision_error:true,external_decision_alternatives:[]}; }
  }
  document.title = `${rfq.title} | Arandu Financial Procurement`;
  const manage = ctx.can('create_rfq');
  const proposals = rfq.proposals || [];
  // Leitura de governança que falhou não vira "sem decisão" nem "aprovação não
  // exigida": a tela diz o que faltou e não oferece decidir nem pedir aprovação.
  const gaps = new Set();
  const [approvals, decisions, generalPolicy, evaluation, entities] = await Promise.all([
    ((__ARANDU_DEMO__ && ctx.mode === 'demo') ? ctx.loadApprovals() : ctx.api(`approvals?organization_id=${encodeURIComponent(ctx.organization.id)}&rfq_id=${encodeURIComponent(rfq.id)}`).then(result=>result.rows || [])).then((rows) => rows.filter((row) => row.rfq_id === rfq.id)).catch(()=>{gaps.add('as aprovações'); return [];}),
    ctx.api(`decisions?organization_id=${encodeURIComponent(ctx.organization.id)}${(__ARANDU_DEMO__ && ctx.mode === 'demo') ? '' : `&rfq_id=${encodeURIComponent(rfq.id)}`}`).then((result) => result.rows || []).catch(() => { gaps.add('a decisão registrada'); return []; }),
    ctx.api(`approval-policy?organization_id=${encodeURIComponent(ctx.organization.id)}`).catch(() => { gaps.add('a política de aprovação'); return { required_for_decision: false }; }),
    // Exigência pela policy v2 (sem proposta escolhida ainda): a decisão sem
    // pedido só passa quando nenhuma policy pede etapa ou bloqueio.
    ['collecting', 'comparing'].includes(rfq.status) && (proposals.length || rfq.external_decision_alternatives?.length)
      ? ctx.send('approval-policies/preview', { rfq_id: rfq.id }).then((out) => out.evaluation).catch((error) => { if (error.status !== 404) gaps.add('a exigência de aprovação'); return null; })
      : Promise.resolve(null),
    // Entidades não dependem da avaliação da política. Não serializar uma
    // consulta de contexto depois das consultas de aprovação.
    loadEntities(ctx)
  ]);
  externalUi?.normalizeExternalApprovals(approvals,rfq);
  if ((__ARANDU_DEMO__ && ctx.mode === 'demo') && ctx.approvalsError) gaps.add('as aprovações');
  const governanceGap = gaps.size ? ['a decisão registrada', 'a política de aprovação', 'a exigência de aprovação', 'as aprovações'].filter(item=>gaps.has(item)) : null;
  const policy = { ...generalPolicy, required_for_decision: Boolean(generalPolicy.required_for_decision || evaluation?.approval_required), evaluation };
  const decision = decisions.find((row) => row.rfq_id === rfq.id) || null;
  const contract = decision ? (Object.hasOwn(decision, 'contract') ? decision.contract : (ctx.data.contracts || []).find((row) => row.decision_id === decision.id)) : null;
  // A decisão e seu contrato são fatos posteriores ao resumo: projetar a etapa
  // já comprovada por esses vínculos, sem escrever nem reabrir o processo.
  if (!(__ARANDU_DEMO__ && ctx.mode === 'demo') && decision) rfq = {...rfq, status:contract ? 'contracted' : 'decided'};
  const pending = approvals.find((row) => row.status === 'pending') || null;
  const days = daysUntil(rfq.response_deadline);
  const live = ['open', 'collecting'].includes(rfq.status);

  // ---------------------------------------------------------- cabeçalho
  const transition = async (status, { title, description, tone = 'primary', confirmLabel }) => {
    if (!await confirmDialog({ title, description, confirmLabel, tone })) return;
    try {
      await ctx.send('transition', { kind: 'rfq', id: rfq.id, from: rfq.status, status });
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
      description: `${plural(proposals.length, 'proposta recebida', 'propostas recebidas')}. Provedores não poderão mais enviar ou revisar propostas, a menos que você reabra a coleta.` }) }));
    if (rfq.status === 'comparing' && !pending && !decision && !governanceGap) actions.push(linkButton(policy.required_for_decision ? 'Solicitar aprovação' : 'Registrar decisão', `#${policy.required_for_decision ? 'aprovacoes' : 'decisao'}`, { variant: 'primary', iconName: policy.required_for_decision ? 'checkCircle' : 'flag' }));
    if (rfq.status === 'decided' && !contract && !governanceGap) actions.push(linkButton('Registrar contrato', '#decisao', { variant: 'primary', iconName: 'briefcase' }));
    if (['draft', 'open', 'collecting'].includes(rfq.status)) actions.push(button('Editar', { iconName: 'edit', onClick: () => editDrawer(ctx, rfq) }));
  }
  if (pending) actions.push(linkButton(isViewerTurn(pending, ctx.viewer?.id) ? 'Decidir aprovação' : 'Acompanhar aprovação', '#aprovacoes', { variant: 'primary', iconName: 'clock' }));
  if (contract) actions.push(linkButton('Ver contrato', ctx.href(`/finance/contracts.html#contract-${contract.id}`), { iconName: 'briefcase' }));
  const more = [
    { label: 'Exportar processo (JSON)', icon: 'download', onClick: () => exportProcess(ctx, rfq) },
    manage && rfq.status === 'comparing' && !decision ? { label: 'Reabrir coleta', icon: 'refresh', onClick: () => transition('collecting', { title: 'Reabrir a coleta?', description: 'Provedores voltam a poder enviar e revisar propostas.', confirmLabel: 'Reabrir' }) } : null,
    manage && ['draft', 'open', 'collecting', 'comparing'].includes(rfq.status) ? { label: 'Cancelar solicitação', icon: 'x', danger: true, onClick: () => transition('cancelled', { title: 'Cancelar esta solicitação?', description: 'O processo é encerrado sem decisão. O histórico é preservado. Esta ação não pode ser desfeita.', confirmLabel: 'Cancelar solicitação', tone: 'danger' }) } : null
  ].filter(Boolean);
  actions.push(menu('Mais ações', more, { visibleLabel: 'Mais' }));
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
  // Próximo passo acima das abas: visível em qualquer aba e no celular, com a
  // ação que o estado permite e quem pode agir — a máquina de estados não muda.
  root.append(nextStepCard(ctx, rfq, { pending, approvals, decision, contract, policy, governanceGap, manage }));
  root.append(negotiationOrigin(ctx, rfq, { decision, contract, pending }));
  // Processos e atividades de relacionamento vinculados a esta negociação (CRM).
  if (!(__ARANDU_DEMO__ && ctx.mode === 'demo')) {
    // Copilot da negociação: pergunta sobre esta solicitação, não sobre a organização inteira.
    import('./copilot.js').then((m) => m.setCopilotContext({ type: 'rfq', id: rfq.id, label: rfq.title })).catch(() => {});
    const crmSlot = el('div');
    root.append(crmSlot);
    import('./crm-workspace.js').then((m) => { if (crmSlot.parentNode) crmSlot.replaceWith(m.crmLinkedPanel(ctx, { relatedId: rfq.id, noun: 'esta negociação' })); }).catch(() => crmSlot.remove());
  }
  if (governanceGap) root.append(governanceGapNotice(ctx, governanceGap));

  const tabset = tabs([
    { id: 'visao-geral', label: 'Visão geral', render: () => overviewTab(ctx, rfq, { manage, pending, approvals, decision, contract, policy, governanceGap }) },
    { id: 'propostas', label: 'Propostas', count: proposals.length+(rfq.external_proposal_count||0), render: () => proposalsTab(ctx, rfq) },
    { id: 'comparacao', label: 'Comparação', render: () => import('./rfq/comparison-tab.js').then((m) => m.comparisonTab(ctx, rfq, decision)) },
    { id: 'aprovacoes', label: 'Aprovações', count: pending ? 1 : null, render: () => governanceGap ? governanceGapTab() : import('./rfq/approvals-tab.js').then((m) => m.approvalsTab(ctx, rfq, approvals, { manage })) },
    { id: 'decisao', label: 'Decisão', render: () => governanceGap ? governanceGapTab() : import('./rfq/decision-tab.js').then((m) => m.decisionTab(ctx, rfq, { decision, contract, policy, approvals, manage, externalUi })) },
    { id: 'atividade', label: 'Atividade', render: () => activityTab(ctx, rfq) }
  ], { label: 'Seções da solicitação' });
  root.append(tabset.node);
  return root;
}

function governanceGapNotice(ctx, gaps) {
  const list = gaps.length > 1 ? `${gaps.slice(0, -1).join(', ')} e ${gaps.at(-1)}` : gaps[0];
  return el('div', { class: 'callout callout-warning governance-gap', role: 'alert' }, [icon('alert'), el('div', { class: 'stack' }, [
    el('strong', { text: `Não conseguimos carregar ${list} desta solicitação.` }),
    el('p', { text: 'Enquanto isso, decisão e aprovação ficam indisponíveis nesta tela para não agir sobre informação incompleta. Nada foi alterado.' }),
    el('div', {}, button('Recarregar', { size: 'sm', iconName: 'refresh', onClick: () => ctx.reload() }))
  ])]);
}
// Dentro das abas, sem repetir o alerta do topo (leitor de tela o anunciaria duas vezes).
const governanceGapTab = () => emptyState({ title: 'Indisponível até recarregar', text: 'O aviso no topo da página diz o que não carregou. Nada foi alterado.', iconName: 'alert', compact: true });

// ------------------------------------------------------------ visão geral
function overviewTab(ctx, rfq, { manage, pending, approvals, decision, contract, policy, governanceGap }) {
  const grid = el('div', { class: 'split' });
  const spec = PRODUCTS[rfq.product];
  const demand = card({ title: 'Demanda', subtitle: 'O que a empresa pediu, como as instituições convidadas veem.', id: 'demanda', body: [
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
        : invite.status === 'invited' ? { label: 'Convidado', tone: 'neutral', icon: 'send' } : INVITE_CLOSED[invite.status] || { label: 'Convite encerrado', tone: 'neutral', icon: 'x' };
    const detail = proposal ? `Proposta v${proposal.version}${proposal.rfq_revision ? ` · respondeu à revisão ${proposal.rfq_revision}` : ''}`
      : invite.status === 'accepted' ? 'Aceitou o convite' : invite.status === 'invited' ? 'Aguardando aceite' : INVITE_CLOSED[invite.status]?.detail || 'Não pode mais responder por este convite';
    inviteList.append(el('li', { class: 'invite-row' }, [person(invite.provider_name || 'Provedor', detail), pill(state, { size: 'sm' })]));
  }
  const inviteCard = card({ title: 'Instituições convidadas', subtitle: invites.length ? `${plural(invites.length, 'convidado', 'convidados')} · ${answered.size} ${answered.size === 1 ? 'respondeu' : 'responderam'}` : 'Ninguém convidado ainda.', id: 'convites',
    body: [invites.length ? inviteList : emptyState({ title: 'Convide pelo menos três provedores', text: 'Com menos de três propostas, a comparação diz pouco.', iconName: 'users', compact: true }),
      manage && ['draft', 'open', 'collecting'].includes(rfq.status) ? inviteForm(ctx, rfq) : null] });

  const reuse = card({ title: 'Reaproveitar', id: 'reaproveitar', body: [el('p', { class: 'muted small', text: 'Comece outra solicitação com esta demanda. Convites, propostas e decisões não são copiados.' }),
    linkButton('Criar nova solicitação com estes dados', ctx.href(`/finance/new-rfq.html?clone=${encodeURIComponent(rfq.id)}`), { size: 'sm', iconName: 'repeat' })] });
  const documents = card({ title: 'Documentos', subtitle: 'Balanços, minutas e anexos do processo, em armazenamento privado.', id: 'documentos', body: el('div', {}, loading()) });
  import('./documents.js').then(({ documentsPanel }) => documents.querySelector('.card-body').replaceChildren(documentsPanel(ctx, {
    entityType: 'rfq', entityId: rfq.id, canUpload: manage || ctx.can('upload_document'), shareLabel: 'Visível aos provedores convidados' })));
  // Quadro de respostas (portal + propostas externas, de quem é a vez): fora do
  // build de demonstração, que não tem API nem empacota o módulo.
  let board = null;
  if (!__ARANDU_DEMO__ && !(__ARANDU_DEMO__ && ctx.mode === 'demo')) {
    board = el('div');
    import('./negotiation-board.js').then((m) => { if (board.parentNode) board.replaceWith(m.responseBoardCard(ctx, rfq)); }).catch(() => board.remove());
  }
  grid.append(el('div', { class: 'split-main' }, [board, demand, passportSnapshotCard(ctx, rfq), revisions, graphContextCard(ctx, { type: 'rfq', id: rfq.id })].filter(Boolean)), el('div', { class: 'split-side' }, [inviteCard, documents, reuse]));
  return grid;
}

// Fotografia dos campos do Financial Passport usados na criação. Só a
// compradora lê (RLS); o cartão some quando a RFQ não veio do Passport.
function passportSnapshotCard(ctx, rfq) {
  // Marcador vazio: o cartão só entra quando há fotografia (sem estado de carga sobrando).
  const slot = el('div', { hidden: true });
  const body = el('div');
  const node = card({ title: 'Dados do Financial Passport', subtitle: 'Fotografia do perfil no momento da criação. Mudanças posteriores no Passport não alteram este processo.', id: 'passport', body });
  ctx.api(`rfq-passport?organization_id=${encodeURIComponent(ctx.organization.id)}&rfq_id=${encodeURIComponent(rfq.id)}`).then(async ({ rows }) => {
    if (!rows?.length) return;
    // Rótulos do Passport só quando há fotografia: fora do carregamento inicial da rota.
    const { SOURCE_LABELS, fieldLabel } = await import('../../../lib/finance/passport.mjs');
    const spec = PRODUCTS[rfq.product];
    body.replaceChildren(el('ul', { class: 'passport-snapshot', role: 'list' }, rows.map((row) => {
      const demandSpec = spec.demandFields.find((item) => item.key === row.demand_key);
      const numeric = demandSpec && ['money', 'percent', 'number', 'int'].includes(demandSpec.type);
      const shown = demandSpec ? fieldValue(demandSpec, numeric ? Number(row.field_value) : row.field_value) : null;
      return el('li', { class: 'passport-snapshot-row' }, [
      el('span', { class: 'passport-label', text: demandSpec?.label || fieldLabel(row.field_key) }),
      el('span', { class: 'passport-value', text: shown ?? row.field_value }),
      el('span', { class: 'passport-meta', text: [
        row.original_scope === 'entity' ? 'Origem: perfil da entidade legal' : 'Origem: perfil do grupo',
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

function nextStepCard(ctx, rfq, { pending, approvals = [], decision, contract, policy, governanceGap = null, manage = false } = {}) {
  // O cartão acompanha o estado real do processo, não só o status da RFQ.
  const latest = [...approvals].sort((a, b) => String(b.requested_at).localeCompare(String(a.requested_at)))[0];
  const situational = (() => {
    if (governanceGap && ['collecting', 'comparing', 'decided'].includes(rfq.status)) return ['Recarregue antes de seguir', 'Parte do contexto de aprovação e decisão não carregou. Nada foi alterado.'];
    if (pending) {
      const step = currentStep(pending);
      const total = (pending.steps || []).length;
      if (pending.policy_snapshot) {
        const active = (pending.stages || []).filter((stage) => stage.status === 'active').map((stage) => stage.label);
        return pending.viewer_can_act
          ? ['Sua aprovação é necessária', `Etapa ativa: ${active.join(' e ')}. Veja a policy e o contexto na aba Aprovações.`]
          : [active.length ? `Aguardando: ${active.join(' e ')}` : 'Aguardando exceção pendente', 'O fluxo segue a policy gravada no pedido. Você será avisado quando avançar.'];
      }
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
  // Rascunho e coleta: mesma regra da lista de solicitações (prazo, quem respondeu,
  // revisão anterior), em vez de um texto fixo por estado.
  const canonical = !situational && ['draft', 'open', 'collecting'].includes(rfq.status) ? negotiationNextStep(rfq, todayIso()) : null;
  const text = situational || (canonical && [canonical.text, canonical.detail || {
    draft: 'Instituições só veem a solicitação depois de convidadas e com ela aberta.',
    open: 'Você será avisado quando uma proposta chegar.',
    collecting: 'Encerre a coleta quando tiver propostas suficientes para avaliar.' }[rfq.status]]) || {
    draft: ['Convide provedores e abra para propostas', 'Provedores só veem a solicitação depois de convidados e com ela aberta.'],
    open: ['Aguardando as primeiras respostas', 'Você será avisado quando uma proposta chegar.'],
    collecting: ['Acompanhe as respostas até o prazo', 'Encerre a coleta quando tiver propostas suficientes para avaliar.'],
    comparing: ['Compare, peça aprovação e decida', 'A comparação é factual; a decisão é sempre da empresa.'],
    decided: ['Registre o contrato', 'Com vigência e aviso prévio, o Arandu acompanha a renovação.'],
    contracted: ['Contrato em acompanhamento', 'Os marcos de renovação aparecem em Contratos.'],
    cancelled: ['Solicitação cancelada', 'O histórico fica preservado para consulta.']
  }[rfq.status] || ['—', ''];
  // Onde agir: aba do processo correspondente. Só um atalho de navegação; as
  // ações continuam nos lugares de sempre e o servidor decide quem pode.
  const where = governanceGap ? null : pending ? ['#aprovacoes', 'Ver aprovação'] : {
    draft: ['#convites', 'Ver convites'], open: ['#convites', 'Ver convites'], collecting: ['#propostas', 'Ver propostas'],
    comparing: rfq.proposals?.length ? ['#comparacao', 'Ver comparação'] : ['#propostas', 'Ver propostas'], decided: ['#decisao', 'Ver decisão']
  }[rfq.status] || null;
  const viewerTurn = pending && isViewerTurn(pending, ctx.viewer?.id);
  const who = canonical?.actor === 'institution' ? 'Ação das instituições convidadas; você acompanha. Para registrar um follow-up, abra o relacionamento da instituição no Quadro de respostas.'
    : governanceGap || ['contracted', 'cancelled'].includes(rfq.status) ? null
    : pending ? (viewerTurn || pending.viewer_can_act ? 'Você pode agir nesta etapa.' : 'Ação de quem aprova esta etapa; você acompanha.')
      : manage ? 'Você pode agir nesta etapa.' : 'Ação de quem gerencia a solicitação; você acompanha.';
  return el('section', { class: 'next-step next-step-bar', 'aria-label': 'Próximo passo' }, [
    el('div', { class: 'next-step-copy' }, [el('span', { class: 'next-step-kicker', text: 'Próximo passo' }), el('p', { class: 'next-step-title', text: text[0] }), el('p', { class: 'next-step-text', text: text[1] }),
      who ? el('p', { class: 'next-step-who', text: who }) : null]),
    where ? el('a', { class: 'btn btn-sm btn-secondary next-step-link', href: where[0], text: where[1] }) : null
  ]);
}

function inviteForm(ctx, rfq) {
  const invited = new Set((rfq.invites || []).filter((row) => ['invited', 'accepted'].includes(row.status)).map((row) => row.provider_id));
  const options = (ctx.data.providers || []).filter((provider) => provider.status === 'active' && !invited.has(provider.id));
  if (!options.length) return el('p', { class: 'muted small', text: 'Todos os provedores cadastrados já foram convidados. Cadastre outros em Provedores.' });
  const select = el('select', { name: 'provider_id' });
  for (const provider of options) select.add(new Option(`${provider.name} · ${PROVIDER_KINDS[provider.kind] || 'tipo não informado'}`, provider.id));
  const submit = button('Convidar', { variant: 'secondary', type: 'submit', size: 'sm', iconName: 'send' });
  const form = el('form', { class: 'inline-form' }, [field({ label: 'Convidar instituição', control: select }), submit]);
  onSubmit(form, async (event) => {
    event.preventDefault();
    submit.disabled = true;
    try {
      const result = await ctx.send('invites/send', { rfq_id: rfq.id, provider_id: select.value });
      const name = select.selectedOptions[0].textContent.split(' · ')[0];
      if ((__ARANDU_DEMO__ && ctx.mode === 'demo')) {
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
  onSubmit(form, async (event) => {
    event.preventDefault();
    const entries = Object.fromEntries(new FormData(form));
    if ((entries.title || '').trim().length < 3) { form.querySelector('[name=title]').closest('.field').setError('Use pelo menos 3 caracteres.'); return; }
    const demand = {};
    for (const item of spec.demandFields) if (entries[item.key] !== undefined && entries[item.key] !== '') demand[item.key] = entries[item.key];
    save.disabled = true;
    save.querySelector('.btn-label').textContent = 'Publicando…';
    try {
      const result = await ctx.send('rfqs', { rfq_id: rfq.id, expected_revision: rfq.revision || 1, title: entries.title, description: entries.description, response_deadline: entries.response_deadline, demand }, 'PATCH');
      dialog.close();
      toast(result.revision > (rfq.revision || 1) ? `Revisão ${result.revision} publicada.` : 'Nenhuma mudança material: a revisão continua a mesma.');
      ctx.reload();
    } catch (error) {
      save.disabled = false;
      save.querySelector('.btn-label').textContent = rfq.status === 'draft' ? 'Salvar alterações' : 'Publicar revisão';
      status.className = 'callout callout-danger';
      status.replaceChildren(...[icon('alert'), el('span', { text: error.message }), error.status === 409 ? button('Recarregar versão atual', { size: 'sm', onClick: () => location.reload() }) : null].filter(Boolean));
    }
  });
}

// ------------------------------------------------------------- propostas
function proposalsTab(ctx, rfq) {
  const proposals = rfq.proposals || [];
  const wrap = el('div', { class: 'stack' });
  if (!proposals.length) {
    wrap.append(emptyState({ title: 'Nenhuma proposta pelo portal', text: ['draft'].includes(rfq.status) ? 'Convide provedores e abra a solicitação para começar a receber propostas.' : 'Os provedores convidados ainda estão preparando as respostas.', iconName: 'inbox' }));
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
  // Convite recusado, revogado ou expirado não está "aguardando".
  const waiting = (rfq.invites || []).filter((invite) => ['invited', 'accepted'].includes(invite.status) && !proposals.some((proposal) => proposal.provider_id === invite.provider_id));
  if (waiting.length) wrap.append(card({ title: 'Ainda sem resposta', headingLevel: 3, body: el('ul', { class: 'invite-list', role: 'list' }, waiting.map((invite) =>
    el('li', { class: 'invite-row' }, [person(invite.provider_name), el('span', { class: 'muted small', text: invite.status === 'accepted' ? 'aceitou o convite e está preparando' : 'ainda não aceitou o convite' })]))) }));
  // Ofertas recebidas fora do portal ficam em seção própria: os contadores do
  // portal não dizem nada sobre elas (contrato v3.7).
  if (ctx.audience === 'company') {
    const slot = el('div', {}, loading('Carregando propostas externas…'));
    wrap.append(slot);
    import('./external-proposals.js').then(({ externalProposalsSection }) => slot.replaceChildren(externalProposalsSection(ctx, rfq)))
      .catch(() => slot.replaceChildren(errorState({ title: 'Propostas externas indisponíveis', error: 'O módulo não carregou. Recarregue a página.' })));
  }
  return wrap;
}

// ------------------------------------------------------------ comparação
function activityTab(ctx, rfq) {
  return el('div', { class: 'split' }, [
    el('div', { class: 'split-main' }, card({ title: 'Conversa do processo', subtitle: 'Cada comentário mostra quem pode lê-lo.', body: collaboration(ctx, rfq) })),
    el('div', { class: 'split-side' }, card({ title: 'Histórico', subtitle: 'Registro automático de cada etapa.', body: activityLog(ctx, 'rfq', rfq.id) }))
  ]);
}

export { progress, loading, errorState };

