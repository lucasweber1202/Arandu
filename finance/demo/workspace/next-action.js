// Gramática universal da próxima ação.
//
// Todo objeto de trabalho (solicitação, aprovação, contrato, proposta,
// tarefa) responde às mesmas cinco perguntas, com as mesmas palavras em
// qualquer tela — início, lista, detalhe, inspector, aprovação e busca:
//
//   ESTADO         onde o processo está            "Em avaliação"
//   PRÓXIMA AÇÃO   o que fazer agora (imperativo)  "Comparar as 3 propostas recebidas"
//   POR QUÊ        o fato que justifica a ação      "1 proposta possui campos não informados."
//   PRAZO          a data que importa               "Prazo em 2 dias"
//   RESPONSÁVEL    quem precisa agir                "Marina Costa"
//
// Módulo puro (sem DOM): só lê dados que a tela já carregou. Nunca ordena,
// pontua ou recomenda proposta — a ação é sempre sobre o processo.

import { PRODUCTS } from '../../../lib/finance/products.mjs';
import { daysUntil, relativeDays, formatDate, RFQ_STATUS, renewalStage, productLabel } from '../../src/core.js';

export const STAGES = Object.freeze({
  draft: { label: 'Rascunho', order: 0 },
  collecting: { label: 'Coleta', order: 1 },
  evaluation: { label: 'Avaliação', order: 2 },
  approval: { label: 'Aprovação', order: 3 },
  decided: { label: 'Decidida', order: 4 },
  contracted: { label: 'Contrato', order: 5 },
  closed: { label: 'Encerrada', order: 6 }
});

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
const empty = (value) => value === undefined || value === null || value === '';

function nameOf(members, id, fallback = 'Membro da equipe') {
  if (!id) return fallback;
  const member = (members || []).find((row) => row.user_id === id);
  return member?.display_name || fallback;
}
export function currentApprovalStep(request) {
  return [...(request?.steps || [])].filter((step) => step.status === 'pending').sort((a, b) => a.position - b.position)[0] || null;
}
function latestApproval(approvals, rfqId) {
  return [...(approvals || [])].filter((row) => row.rfq_id === rfqId).sort((a, b) => String(b.requested_at || '').localeCompare(String(a.requested_at || '')))[0] || null;
}

/** Prazo em linguagem de trabalho: "Prazo em 2 dias", "Prazo encerrado há 2 dias". */
export function dueOf(date, { label = 'Prazo', live = true } = {}) {
  if (!date) return null;
  const days = daysUntil(date);
  if (days === null) return null;
  const text = !live ? `${label} ${formatDate(date, { withYear: false })}`
    : days < 0 ? `${label} encerrado ${relativeDays(date)}` : `${label} ${relativeDays(date)}`;
  return { date, days, text, short: days < 0 ? `${-days}d atrás` : days === 0 ? 'hoje' : `${days}d`, urgent: live && days <= 2 };
}

/** Propostas com campos comparáveis não informados e propostas que respondem a revisão anterior. */
export function proposalFacts(rfq) {
  const proposals = rfq?.proposals || [];
  const comparable = (PRODUCTS[rfq?.product]?.proposalFields || []).filter((field) => field.comparable);
  // "Incompleta" = deixou de informar um critério que outra proposta informou.
  // Campo que ninguém informou não é lacuna de uma proposta (ex.: custo total declarado).
  const informed = comparable.filter((field) => proposals.some((proposal) => !empty(proposal.terms?.[field.key])));
  const incomplete = proposals.filter((proposal) => informed.some((field) => empty(proposal.terms?.[field.key])
    && !(field.key === 'index_spread' && (proposal.terms?.index || 'pre') === 'pre')));
  const outdated = proposals.filter((proposal) => proposal.rfq_revision && proposal.rfq_revision < (rfq.revision || 1));
  const validity = proposals.map((proposal) => proposal.terms?.valid_until).filter(Boolean).map((date) => ({ date, days: daysUntil(date) })).filter((item) => item.days !== null && item.days >= 0).sort((a, b) => a.days - b.days)[0] || null;
  return { total: proposals.length, incomplete, complete: proposals.length - incomplete.length, outdated, nearestValidity: validity };
}

/** Respostas: "2/3 respostas · 2d" — a versão compacta nunca some no celular. */
export function responsesOf(rfq) {
  const invited = (rfq?.invites || []).length || rfq?.invites_count || 0;
  const answered = (rfq?.proposals || []).length;
  return { invited: Math.max(invited, answered), answered };
}

/**
 * Próxima ação de uma solicitação.
 * @param {object} rfq       solicitação como a lista/overview entrega
 * @param {object} context   { approvals, viewerId, members, contracts }
 */
export function rfqNext(rfq, { approvals = [], viewerId = null, members = [], contracts = [] } = {}) {
  const base = `/finance/rfq.html?id=${encodeURIComponent(rfq.id)}`;
  const { invited, answered } = responsesOf(rfq);
  const owner = { id: rfq.owner_id || null, name: rfq.owner_name || nameOf(members, rfq.owner_id) };
  const live = ['open', 'collecting'].includes(rfq.status);
  const facts = proposalFacts(rfq);
  // O prazo que importa muda com a fase: resposta dos provedores durante a
  // coleta; depois, a validade da proposta que vence primeiro.
  const due = live || rfq.status === 'draft' ? dueOf(rfq.response_deadline, { live })
    : rfq.status === 'comparing' && facts.nearestValidity ? dueOf(facts.nearestValidity.date, { label: 'Proposta vence' }) : null;
  const status = RFQ_STATUS[rfq.status] || { label: rfq.status, tone: 'neutral' };
  const make = (fields) => {
    const result = { kind: 'rfq', id: rfq.id, title: rfq.title, product: rfq.product, state: status.label, stateTone: status.tone, owner, due, invited, answered,
      mine: Boolean(viewerId && (fields.owner?.id ?? owner.id) === viewerId), ...fields };
    result.compact = [invited ? `${answered}/${invited} respostas` : null, result.due && live ? result.due.short : null].filter(Boolean).join(' · ');
    return result;
  };

  if (rfq.status === 'draft') {
    return make({ stage: 'draft', action: invited ? 'Abrir para propostas' : 'Completar a demanda e convidar provedores', tone: 'neutral', cta: 'Continuar', href: base,
      why: invited ? `${plural(invited, 'provedor convidado', 'provedores convidados')}; nenhum vê a solicitação antes da abertura.` : 'Rascunho: ainda não enviado a nenhum provedor.',
      steps: ['Completar demanda', 'Convidar provedores', 'Abrir para propostas'] });
  }
  if (live) {
    if (!invited) return make({ stage: 'collecting', action: 'Convidar provedores', why: 'A solicitação está aberta, mas ninguém foi convidado.', tone: 'warning', cta: 'Convidar', href: `${base}#visao-geral` });
    if (due && due.days < 0) return make({ stage: 'collecting', action: 'Encerrar a coleta e avaliar', why: `Prazo encerrado · ${answered} de ${invited} responderam.`, tone: 'warning', cta: 'Avaliar', href: `${base}#comparacao` });
    if (answered >= invited) return make({ stage: 'collecting', action: 'Encerrar a coleta e comparar', why: `Todos os ${plural(invited, 'provedor respondeu', 'provedores responderam')}.`.replace(/^Todos os 1 provedor respondeu\./, 'O provedor convidado respondeu.'), tone: 'accent', cta: 'Comparar', href: `${base}#comparacao` });
    const waiting = invited - answered;
    return make({ stage: 'collecting', action: `Aguardando ${plural(waiting, 'provedor', 'provedores')}`, why: `${answered} de ${invited} responderam.`, tone: due?.urgent ? 'warning' : 'neutral', cta: 'Acompanhar', href: base });
  }
  if (rfq.status === 'comparing') {
    const latest = latestApproval(approvals, rfq.id);
    const pending = latest?.status === 'pending' ? latest : null;
    if (pending || rfq.pending_approval) {
      const step = currentApprovalStep(pending);
      const total = (pending?.steps || []).length;
      const approver = { id: step?.approver_id || null, name: nameOf(members, step?.approver_id, 'aprovador') };
      const position = step ? `Etapa ${step.position} de ${total}` : 'Aprovação em andamento';
      if (pending?.stale) return make({ stage: 'approval', state: 'Em aprovação', stateTone: 'warning', action: 'Pedir aprovação de novo', why: 'A proposta aprovada mudou depois do pedido; a aprovação ficou desatualizada.', tone: 'danger', cta: 'Revisar', href: `${base}#aprovacoes`, owner });
      if (approver.id && approver.id === viewerId) {
        return make({ stage: 'approval', state: 'Em aprovação', stateTone: 'warning', action: 'Revisar e decidir a aprovação', why: `${position} · pedido por ${nameOf(members, pending.requested_by)}.`, tone: 'warning', cta: 'Revisar decisão',
          href: `/finance/approvals.html#request-${pending.id}`, owner: approver, requestId: pending.id });
      }
      return make({ stage: 'approval', state: 'Em aprovação', stateTone: 'warning', action: `Aguardando ${approver.name}`, why: `${position} da aprovação.`, tone: 'neutral', cta: 'Acompanhar',
        href: pending ? `/finance/approvals.html#request-${pending.id}` : `${base}#aprovacoes`, owner: approver, requestId: pending?.id || null });
    }
    if (latest?.status === 'changes_requested' || latest?.status === 'rejected') {
      const actor = (latest.steps || []).find((step) => step.status === latest.status);
      return make({ stage: 'evaluation', action: latest.status === 'rejected' ? 'Rever a escolha da proposta' : 'Ajustar e pedir aprovação de novo', tone: 'danger', cta: 'Ver motivo', href: `${base}#aprovacoes`,
        why: actor?.comment ? `${nameOf(members, actor.approver_id)}: “${actor.comment}”` : latest.status === 'rejected' ? 'A aprovação foi rejeitada.' : 'Foram pedidas alterações na aprovação.' });
    }
    if (latest?.status === 'approved' && !latest.stale) {
      return make({ stage: 'approval', action: 'Registrar a decisão', why: 'Aprovação concluída para a proposta escolhida.', tone: 'success', cta: 'Registrar', href: `${base}#decisao` });
    }
    const notes = [];
    if (facts.incomplete.length) notes.push(`${plural(facts.incomplete.length, 'proposta possui', 'propostas possuem')} campos não informados`);
    if (facts.outdated.length) notes.push(`${plural(facts.outdated.length, 'responde', 'respondem')} a uma revisão anterior`);
    return make({ stage: 'evaluation', action: facts.total > 1 ? `Comparar as ${facts.total} propostas recebidas` : facts.total === 1 ? 'Avaliar a proposta recebida' : 'Avaliar sem propostas recebidas',
      why: notes.length ? `${notes.join('; ')}.`.replace(/^./, (letter) => letter.toUpperCase()) : facts.total ? 'Todas as propostas informaram os campos comparáveis.' : 'Nenhum provedor respondeu.',
      tone: 'accent', cta: 'Comparar', href: `${base}#comparacao` });
  }
  if (rfq.status === 'decided') {
    return make({ stage: 'decided', action: 'Registrar o contrato', why: 'Decisão registrada. Informe vigência e aviso prévio para acompanhar a renovação.', tone: 'accent', cta: 'Registrar', href: `${base}#decisao` });
  }
  if (rfq.status === 'contracted') {
    const contract = (contracts || []).find((row) => row.rfq_id === rfq.id);
    const next = contract ? contractNext(contract, { members }) : null;
    return make({ stage: 'contracted', action: next?.action || 'Acompanhar o contrato', why: next?.why || 'Contrato registrado; os marcos de renovação ficam em Contratos.', tone: next?.tone || 'neutral',
      cta: 'Ver contrato', href: contract ? `/finance/contracts.html#contract-${contract.id}` : `${base}#decisao`, due: next?.due || null, mine: false });
  }
  return make({ stage: 'closed', action: 'Nenhuma ação pendente', why: rfq.status === 'cancelled' ? 'Solicitação cancelada; o histórico fica preservado.' : 'Processo encerrado.', tone: 'neutral', cta: 'Ver', href: base, mine: false });
}

/** Próxima ação de um pedido de aprovação, do ponto de vista de quem vê. */
export function approvalNext(request, rfq, { viewerId = null, members = [] } = {}) {
  const step = currentApprovalStep(request);
  const total = (request.steps || []).length;
  const approved = (request.steps || []).filter((item) => item.status === 'approved').length;
  const approver = { id: step?.approver_id || null, name: nameOf(members, step?.approver_id, 'aprovador') };
  const requester = nameOf(members, request.requested_by);
  const base = { kind: 'approval', id: request.id, title: rfq?.title || 'Pedido de aprovação', due: dueOf(rfq?.response_deadline, { live: false }), requester, position: step ? step.position : null, total, approved };
  if (request.status === 'pending' && request.stale) return { ...base, state: 'Desatualizada', stateTone: 'danger', action: 'Aguardar novo pedido', why: 'A proposta mudou depois do pedido; esta aprovação não vale mais.', tone: 'danger', owner: { id: request.requested_by, name: requester }, mine: false };
  if (request.status === 'pending') {
    const mine = Boolean(viewerId && approver.id === viewerId);
    return { ...base, state: mine ? 'Aguardando você' : 'Em andamento', stateTone: mine ? 'warning' : 'info', action: mine ? 'Revisar e decidir' : `Aguardando ${approver.name}`,
      why: `Etapa ${step?.position || '—'} de ${total} · pedido por ${requester}.`, tone: mine ? 'warning' : 'neutral', owner: approver, mine };
  }
  const label = { approved: 'Aprovada', rejected: 'Rejeitada', changes_requested: 'Alterações pedidas', cancelled: 'Cancelada' }[request.status] || request.status;
  const actor = (request.steps || []).find((item) => item.status === request.status);
  return { ...base, state: label, stateTone: request.status === 'approved' ? 'success' : request.status === 'rejected' ? 'danger' : 'neutral', action: 'Nenhuma ação pendente',
    why: actor?.comment ? `${nameOf(members, actor.approver_id)}: “${actor.comment}”` : `${approved} de ${total} aprovaram.`, tone: 'neutral', owner: { id: request.requested_by, name: requester }, mine: false };
}

/** Próxima ação de um contrato: o prazo que importa é o do aviso prévio. */
export function contractNext(contract, { members = [] } = {}) {
  const owner = { id: contract.owner_id || null, name: contract.owner_name || nameOf(members, contract.owner_id) };
  const product = productLabel(contract.product, { short: true });
  if (!['active', 'renewing'].includes(contract.status)) return { kind: 'contract', id: contract.id, title: contract.provider_name, state: 'Encerrado', stateTone: 'neutral', action: 'Nenhuma ação pendente', why: 'Contrato encerrado, mantido para histórico.', tone: 'neutral', owner, due: null, mine: false };
  const stage = renewalStage(contract);
  const common = { kind: 'contract', id: contract.id, title: contract.provider_name, state: contract.status === 'renewing' ? 'Em renovação' : 'Vigente', stateTone: contract.status === 'renewing' ? 'warning' : 'success', owner };
  if (stage.stage === 'past_notice') return { ...common, action: 'Negociar ou preparar a substituição', why: `O prazo do aviso prévio passou; o contrato vence ${relativeDays(contract.ends_on)}.`, tone: 'danger', due: dueOf(contract.ends_on, { label: 'Vence' }) };
  if (contract.status === 'renewing') return { ...common, action: 'Comparar antes do aviso prévio', why: `Nova concorrência em andamento · ${product}.`, tone: 'accent', due: dueOf(stage.deadline, { label: 'Aviso prévio' }) };
  if (stage.stage === 'window') return { ...common, action: 'Decidir renovação', why: `${product} · janela de renovação aberta.`, tone: 'warning', due: dueOf(stage.deadline, { label: 'Aviso prévio' }) };
  return { ...common, action: 'Nada a fazer agora', why: `A janela de decisão abre ${relativeDays(stage.opensAt)}.`, tone: 'neutral', due: dueOf(contract.ends_on, { label: 'Vence', live: false }), mine: false };
}

/** Próxima ação de uma tarefa. */
export function taskNext(task, { viewerId = null } = {}) {
  const done = task.status === 'done';
  const due = done ? null : dueOf(task.due_on);
  return { kind: 'task', id: task.id, title: task.title, state: done ? 'Concluída' : due && due.days < 0 ? 'Vencida' : 'Aberta', stateTone: done ? 'success' : due && due.days < 0 ? 'danger' : 'neutral',
    action: done ? 'Nenhuma ação pendente' : task.title, why: done ? 'Tarefa concluída.' : task.assignee_id && task.assignee_id === viewerId ? 'Tarefa atribuída a você.' : task.assignee_name ? `Tarefa de ${task.assignee_name}.` : 'Tarefa sem responsável.',
    tone: done ? 'neutral' : due && due.days < 0 ? 'danger' : 'neutral', owner: { id: task.assignee_id || null, name: task.assignee_name || 'Sem responsável' }, due, mine: !done && (!task.assignee_id || task.assignee_id === viewerId) };
}

/** Próxima ação de uma oportunidade no portal do provedor. */
export function opportunityNext(row) {
  const open = ['open', 'collecting'].includes(row.rfq_status);
  const due = dueOf(row.response_deadline, { live: open });
  const base = { kind: 'opportunity', id: row.proposal_id, title: row.title, due };
  if (open && row.version && row.submitted_rfq_revision && row.rfq_revision > row.submitted_rfq_revision) {
    return { ...base, state: 'Solicitação mudou', stateTone: 'warning', action: 'Atualizar proposta', why: `Sua proposta v${row.version} responde à revisão ${row.submitted_rfq_revision}; a empresa publicou a revisão ${row.rfq_revision}.`, tone: 'warning', cta: 'Atualizar proposta' };
  }
  if (open && !row.version) return { ...base, state: row.has_draft ? 'Rascunho salvo' : 'Para responder', stateTone: 'accent', action: row.has_draft ? 'Concluir e enviar a proposta' : 'Responder à oportunidade', why: `${row.buyer_name || 'A empresa'} aguarda sua proposta.`, tone: 'accent', cta: row.has_draft ? 'Continuar' : 'Responder' };
  if (open) return { ...base, state: `Proposta v${row.version} enviada`, stateTone: 'success', action: 'Nenhuma ação pendente', why: `Responde à revisão ${row.submitted_rfq_revision || row.rfq_revision}. Você ainda pode revisar enquanto a coleta estiver aberta.`, tone: 'neutral', cta: 'Ver ou revisar' };
  if (row.rfq_status === 'comparing') return { ...base, state: 'Em avaliação pela empresa', stateTone: 'accent', action: 'Aguardar a avaliação', why: row.version ? `Sua proposta v${row.version} está com a empresa.` : 'A coleta encerrou sem proposta sua.', tone: 'neutral', cta: 'Ver' };
  return { ...base, state: row.selected ? 'Proposta escolhida' : 'Processo encerrado', stateTone: row.selected ? 'success' : 'neutral', action: 'Nenhuma ação pendente', why: row.version ? `Última versão enviada: v${row.version}.` : 'Nenhuma proposta enviada.', tone: 'neutral', cta: 'Ver' };
}

/**
 * Fila "Precisa de você": o que exige a pessoa agora, a partir das próximas
 * ações de cada objeto. Ordena por urgência (tom + prazo), nunca por valor.
 */
export function workQueue({ rfqs = [], approvals = [], contracts = [], tasks = [], viewerId = null, members = [], canManage = false } = {}) {
  const items = [];
  const weight = { danger: 0, warning: 1, accent: 2, success: 2, neutral: 3 };
  for (const rfq of rfqs) {
    const next = rfqNext(rfq, { approvals, viewerId, members, contracts });
    const needsMe = next.stage === 'approval' && next.owner?.id === viewerId && next.cta === 'Revisar decisão';
    const ownerWork = canManage && ['draft', 'collecting', 'evaluation', 'decided'].includes(next.stage) && (next.stage !== 'draft' || rfq.owner_id === viewerId)
      && !(next.stage === 'collecting' && next.tone === 'neutral' && !(next.due && next.due.days <= 7));
    const decision = canManage && next.stage === 'approval' && next.cta === 'Registrar';
    if (needsMe || ownerWork || decision) items.push({ ...next, section: 'rfq' });
  }
  if (canManage) {
    for (const contract of contracts) {
      const stage = renewalStage(contract);
      if (!['window', 'past_notice'].includes(stage.stage)) continue;
      items.push({ ...contractNext(contract, { members }), cta: 'Revisar', href: `/finance/contracts.html#contract-${contract.id}`, section: 'contract' });
    }
  }
  for (const task of tasks) {
    const next = taskNext(task, { viewerId });
    if (!next.mine || !next.due || next.due.days > 2) continue;
    items.push({ ...next, action: task.title, cta: 'Ver', href: `/finance/tasks.html#task-${task.id}`, section: 'task' });
  }
  const due = (item) => (item.due ? item.due.days : 999);
  return items.sort((a, b) => (weight[a.tone] ?? 3) - (weight[b.tone] ?? 3) || due(a) - due(b));
}
