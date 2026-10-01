// Arandu Timeline: o fluxo do procurement numa linha.
//
//   ● Pedido ━ ● Convites ━ ● Propostas ━ ◉ Comparação ━ ○ Aprovação ━ ○ Contrato
//                                           Você está aqui
//
// Um componente, duas leituras: o processo de uma solicitação e o ciclo de
// vida de um contrato. Mostra só etapas que existem para aquele caso (sem
// aprovação quando ninguém pediu; sem renovação antes do contrato) e cada
// etapa concluída traz a data em que aconteceu. É informação de estado — não
// sugere decisão nem ordena propostas.

import { el, icon, formatDate, relativeDays, renewalStage, parseDay, todayIso } from '../../src/core.js';

const firstDate = (values) => values.filter(Boolean).sort()[0] || null;

/** Etapas de uma solicitação com estado (done/current/todo) e data quando houver. */
export function rfqStages(rfq, { approvals = [], decision = null, contract = null } = {}) {
  const invites = rfq.invites || [];
  const proposals = rfq.proposals || [];
  const mine = approvals.filter((row) => row.rfq_id === rfq.id);
  const pending = mine.find((row) => row.status === 'pending') || (rfq.pending_approval ? {} : null);
  const approved = mine.find((row) => row.status === 'approved' && !row.stale);
  const stages = [
    { id: 'pedido', label: 'Pedido', at: rfq.created_at },
    { id: 'convites', label: 'Convites', at: firstDate(invites.map((row) => row.created_at)), note: invites.length ? `${invites.length} convidado${invites.length > 1 ? 's' : ''}` : null },
    { id: 'propostas', label: 'Propostas', at: firstDate(proposals.map((row) => row.submitted_at)), note: proposals.length ? `${proposals.length} recebida${proposals.length > 1 ? 's' : ''}` : null },
    { id: 'comparacao', label: 'Comparação' }
  ];
  if (mine.length || pending) stages.push({ id: 'aprovacao', label: 'Aprovação', at: approved?.resolved_at || null, note: pending ? 'em andamento' : approved ? 'aprovada' : null });
  stages.push({ id: 'decisao', label: 'Decisão', at: decision?.decided_at || decision?.created_at || null }, { id: 'contrato', label: 'Contrato', at: contract?.created_at || null });
  if (rfq.status === 'contracted') stages.push({ id: 'renovacao', label: 'Renovação', note: contract?.ends_on ? `vence ${formatDate(contract.ends_on, { withYear: false })}` : null });

  const current = (() => {
    if (rfq.status === 'draft') return invites.length ? 'convites' : 'pedido';
    if (['open', 'collecting'].includes(rfq.status)) return proposals.length ? 'propostas' : 'convites';
    if (rfq.status === 'comparing') return pending ? 'aprovacao' : approved && !decision ? 'decisao' : 'comparacao';
    if (rfq.status === 'decided') return 'contrato';
    if (rfq.status === 'contracted') return 'renovacao';
    return null;
  })();
  const index = stages.findIndex((stage) => stage.id === current);
  return stages.map((stage, position) => ({ ...stage, state: rfq.status === 'cancelled' ? 'todo' : position < index ? 'done' : position === index ? 'current' : 'todo' }));
}

/** Marcos de um contrato: vigência, D-90/60/30, aviso prévio e vencimento. */
export function contractStages(contract) {
  const start = parseDay(contract.starts_on);
  const end = parseDay(contract.ends_on);
  if (!start || !end) return [];
  const day = (offset) => new Date(end.getTime() - offset * 86400000).toISOString().slice(0, 10);
  const stage = renewalStage(contract);
  const today = todayIso();
  const marks = [
    { id: 'inicio', label: 'Início', at: contract.starts_on },
    { id: 'd90', label: 'D-90', at: day(90) }, { id: 'd60', label: 'D-60', at: day(60) }, { id: 'd30', label: 'D-30', at: day(30) },
    { id: 'aviso', label: 'Aviso prévio', at: stage.deadline || contract.review_from, key: true },
    { id: 'fim', label: 'Vencimento', at: contract.ends_on }
  ].filter((mark) => mark.at && mark.at >= contract.starts_on).sort((a, b) => a.at.localeCompare(b.at) || (a.key ? -1 : 1))
    // Um marco por data: o aviso prévio prevalece sobre um D-xx no mesmo dia.
    .filter((mark, index, list) => mark.key || !list.some((other) => other !== mark && other.key && other.at === mark.at));
  const next = marks.findIndex((mark) => mark.at >= today);
  return marks.map((mark, position) => ({ ...mark, state: next === -1 || position < next ? 'done' : position === next ? 'current' : 'todo',
    note: position === next ? relativeDays(mark.at) : null }));
}

/**
 * Desenha a timeline. `compact` mostra só pontos e o rótulo da etapa atual
 * (quick view, painel); o padrão mostra todos os rótulos com data.
 */
export function timeline(stages, { label = 'Etapas do processo', compact = false, hereText = 'Você está aqui' } = {}) {
  const list = el('ol', { class: `at${compact ? ' at-compact' : ''}`, 'aria-label': label });
  for (const stage of stages) {
    const current = stage.state === 'current';
    list.append(el('li', { class: `at-step is-${stage.state}${stage.key ? ' is-key' : ''}`, 'aria-current': current ? 'step' : null, dataset: { stage: stage.id } }, [
      el('span', { class: 'at-dot', 'aria-hidden': 'true' }, stage.state === 'done' ? icon('check', { size: 10 }) : null),
      el('span', { class: 'at-text' }, [
        el('span', { class: 'at-label', text: stage.label }),
        !compact && (stage.at || stage.note || current) ? el('span', { class: 'at-meta num', text: current ? [hereText, stage.note].filter(Boolean).join(' · ') || formatDate(stage.at, { withYear: false }) : stage.note && !stage.at ? stage.note : stage.at ? formatDate(stage.at, { withYear: false }) : '' }) : null,
        el('span', { class: 'sr-only', text: stage.state === 'done' ? ' (concluída)' : current ? ` (${(hereText || 'próximo marco').toLowerCase()})` : ' (a seguir)' })
      ])
    ]));
  }
  // Em telas estreitas a linha rola na horizontal: começa mostrando a etapa atual.
  requestAnimationFrame(() => {
    const here = list.querySelector('[aria-current=step]');
    if (here && list.scrollWidth > list.clientWidth) list.scrollLeft = Math.max(0, here.offsetLeft - list.offsetLeft - list.clientWidth / 3);
  });
  return list;
}
