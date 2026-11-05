// Negotiation Studio: continuidade contrato → renegociação → decisão → contrato.
// A origem vem do evento canônico `rfq_created_from_contract` (gravado por
// fin_start_contract_rfq); nada é inferido por título ou instituição. Etapa sem
// registro aparece ausente, nunca concluída.
import { el, icon, formatDate, plural, productLabel, CONTRACT_STATUS, RFQ_STATUS, textStrong } from '../core.js';
import { CONTRACT_CATEGORIES } from '../../../lib/finance/contract-terms.mjs';
import { mutedText, button, toastError } from '../ui.js';
import { incumbentInvite, INCUMBENT_TEXT } from '../../../lib/finance/incumbent-onboarding.mjs';

const INCUMBENT_TAG = { none: 'Não convidada', invited: 'Convite enviado', accepted: 'No portal', closed: 'Convite encerrado' };

/**
 * Onboarding da instituição pelo contrato existente: convidar quem já presta o
 * serviço para responder à renegociação no portal. Convidar outras instituições
 * continua no formulário de convites; o Arandu não sugere quem convidar.
 */
export function incumbentOnboarding(ctx, rfq, origin) {
  const state = incumbentInvite(rfq, origin?.provider_id, { canManage: ctx.can('create_rfq') });
  if (state.kind === 'unavailable') return null;
  const name = origin.provider_name || 'a instituição';
  const box = el('div', { class: 'incumbent-onboarding', dataset: { state: state.kind } }, [
    el('p', {}, [textStrong(`Instituição do contrato: ${origin.provider_name || 'não informada'}`), el('span', { class: `tag tag-${state.kind === 'accepted' ? 'success' : state.kind === 'none' ? 'warning' : 'neutral'}`, text: INCUMBENT_TAG[state.kind] })]),
    mutedText(INCUMBENT_TEXT[state.kind] + (state.kind === 'invited' && state.expiresAt ? ` O convite vale até ${formatDate(state.expiresAt)}.` : '') + (state.proposal ? ' Já há proposta enviada por ela.' : ''))
  ]);
  if (state.canInvite) {
    box.append(button(state.kind === 'closed' ? `Convidar ${name} de novo` : `Convidar ${name} para o portal`, { size: 'sm', variant: 'secondary', iconName: 'send', onClick: async (event) => {
      const target = event.currentTarget; target.disabled = true;
      try {
        const result = await ctx.send('invites/send', { rfq_id: rfq.id, provider_id: origin.provider_id });
        const { deliverInvite } = await import('./rfq/invite-delivery.js');
        await deliverInvite(ctx, result, name);
        ctx.reload();
      } catch (error) { toastError(error); target.disabled = false; }
    } }), mutedText('Convidar a instituição atual não exclui outras: a empresa decide quem participa no formulário de convites.'));
  } else if (state.reason && state.kind !== 'accepted') box.append(mutedText(state.reason));
  return box;
}

/** Contrato de origem a partir dos eventos da solicitação (mais recente vence). */
export function originContractId(events = []) {
  const row = events.find((event) => event.event_type === 'rfq_created_from_contract' && event.metadata?.contract_id);
  return row ? row.metadata.contract_id : null;
}

/**
 * Etapas da jornada com o estado comprovado por registro. `state`:
 * done (há registro), current (onde o processo está), todo (ainda não), missing (sem registro).
 */
export function negotiationJourney(rfq, { origin, decision = null, contract = null, pending = null } = {}) {
  const live = (rfq.proposals || []).filter((row) => row.current_version > 0 && row.status !== 'withdrawn').length;
  const external = Number(rfq.external_proposal_count ?? (rfq.external_decision_alternatives || []).length) || 0;
  const after = (statuses) => statuses.includes(rfq.status);
  const cancelled = rfq.status === 'cancelled';
  return [
    { key: 'origin', label: 'Contrato de origem', state: origin ? 'done' : 'missing', text: origin ? 'Renegociação iniciada a partir do contrato registrado.' : 'Contrato de origem fora dos registros carregados.' },
    { key: 'request', label: 'Solicitação', state: rfq.status === 'draft' ? 'current' : 'done', text: `${RFQ_STATUS[rfq.status]?.label || 'Estado não informado'} · revisão ${rfq.revision || 1}.` },
    { key: 'proposals', label: 'Propostas', state: live + external ? 'done' : after(['open', 'collecting']) ? 'current' : 'todo',
      text: live + external ? `${plural(live, 'enviada pela instituição no portal', 'enviadas pelas instituições no portal')} · ${plural(external, 'registrada pela empresa (canal externo)', 'registradas pela empresa (canal externo)')}.` : 'Nenhuma proposta registrada ainda. A empresa pode registrar uma proposta recebida por e-mail ou reunião sem convidar a instituição.' },
    { key: 'compare', label: 'Comparação', state: after(['decided', 'contracted']) ? 'done' : rfq.status === 'comparing' ? 'current' : 'todo', text: 'Critérios e pesos definidos pela empresa; o Arandu não escolhe vencedor.' },
    { key: 'decision', label: 'Decisão', state: decision ? 'done' : pending ? 'current' : 'todo', text: decision ? 'Decisão humana registrada.' : pending ? 'Aprovação em andamento.' : 'Sem decisão registrada.' },
    { key: 'contract', label: 'Contrato resultante', state: contract ? 'done' : decision ? 'current' : 'todo', text: contract ? `Vigência ${formatDate(contract.starts_on)} → ${formatDate(contract.ends_on)}.` : decision ? 'Decisão sem contrato registrado ainda.' : 'Depois da decisão.' },
    { key: 'follow', label: 'Acompanhamento', state: contract ? 'current' : 'todo', text: contract ? 'Marcos, tarefas e renovação seguem no contrato resultante.' : 'Começa com o contrato registrado.' }
  ].map((step) => cancelled && step.state !== 'done' ? { ...step, state: 'todo' } : step);
}

const STATE_TEXT = { done: 'registrado', current: 'etapa atual', todo: 'ainda não', missing: 'sem registro' };

/** Cartão de origem: contrato, condições registradas, jornada e retorno. Assíncrono; nada se não houver origem. */
export function negotiationOrigin(ctx, rfq, { decision = null, contract = null, pending = null } = {}) {
  const slot = el('section', { class: 'card negotiation-origin', id: 'negotiation-origin', 'aria-labelledby': 'negotiation-origin-title', hidden: true });
  ctx.api(`events?organization_id=${ctx.orgId}&entity_type=rfq&entity_id=${encodeURIComponent(rfq.id)}`).then(async ({ rows = [] }) => {
    const originId = originContractId(rows);
    if (!originId) return;
    // Leitura canônica da continuidade (versão de origem, propostas por autoria,
    // decisões e contratos resultantes). Falha não esconde o cartão: declara.
    let process = null, continuityError = false;
    try {
      const out = await ctx.api(`contract-negotiations?contract_id=${encodeURIComponent(originId)}&rfq_id=${encodeURIComponent(rfq.id)}`);
      process = (out.processes || []).find((row) => row.rfq?.id === rfq.id) || null;
    } catch { continuityError = true; }
    const origin = (ctx.data.contracts || []).find((row) => row.id === originId) || null;
    const back = new URLSearchParams(location.search).get('de') === 'relacionamentos';
    const contractHref = ctx.href(`/finance/contracts.html?abrir=contrato#contract-${originId}`);
    const facts = origin ? [
      ['Instituição', origin.provider_name || 'Não informada'], ['Condição', CONTRACT_CATEGORIES[origin.product] || productLabel(origin.product) || 'Não informada'],
      ['Estado do contrato', CONTRACT_STATUS[origin.status]?.label || 'Não informado'], ['Vigência', `${formatDate(origin.starts_on)} → ${origin.ends_on ? formatDate(origin.ends_on) : 'término não informado'}`],
      ['Aviso prévio registrado', origin.renewal_notice_days === null || origin.renewal_notice_days === undefined ? 'Não informado' : `${origin.renewal_notice_days} dias (confira no documento)`],
      ['Termos atuais', origin.current_version ? `Versão ${origin.current_version} registrada` : 'Termos não estruturados'],
      ['Versão de referência da renegociação', process?.origin ? (process.origin.version_recorded ? `Versão ${process.origin.contract_version} (vigente quando a renegociação começou)` : 'Não registrada (renegociação anterior ao registro de versão)') : 'Não informado'],
      ['Custo registrado', origin.cost_summary || 'Não informado'], ['Condições registradas', origin.main_conditions || 'Não informado']
    ] : [];
    const journey = negotiationJourney(rfq, { origin: Boolean(originId), decision, contract, pending });
    const names = new Map([...(ctx.data.providers || []).map((row) => [row.id, row.name]), ...(rfq.invites || []).map((row) => [row.provider_id, row.provider_name])]);
    const authenticated = (process?.proposals || []).filter((row) => row.status !== 'withdrawn' && (row.versions || []).length).map((row) => ({ ...row, provider_name: names.get(row.provider_id) || null }));
    const economics = el('div');
    if ((origin?.product || process?.rfq?.product || rfq.product) === 'acquiring' && process) {
      import('./acquiring-economics.js').then((module) => economics.replaceChildren(module.acquiringEconomicsPanel(ctx, { contract: { id: originId }, proposals: authenticated, externalCount: (process.external_proposals || []).length })))
        .catch(() => economics.replaceChildren(el('p', { class: 'muted small', role: 'status', text: 'O módulo de análise econômica não carregou. Recarregue a página para tentar de novo.' })));
    }
    slot.replaceChildren(
      el('div', { class: 'card-head' }, el('div', { class: 'card-head-text' }, [
        el('h2', { class: 'card-title', id: 'negotiation-origin-title', text: 'Renegociação de contrato existente' }),
        el('p', { class: 'card-subtitle', text: 'De onde esta solicitação veio, as condições que estão em vigor e onde o processo está. Etapas sem registro aparecem como ausentes.' })])),
      el('div', { class: 'card-body stack' }, [
        origin ? el('dl', { class: 'deflist deflist-3' }, facts.map(([label, value]) => el('div', { class: 'deflist-row' }, [el('dt', { text: label }), el('dd', { class: value === 'Não informado' ? 'missing' : '', text: value })])))
          : el('p', { class: 'callout callout-info compact', role: 'note', text: 'O contrato de origem está registrado, mas fora dos contratos carregados nesta tela. Abra o contrato para ver condições e versões.' }),
        origin ? incumbentOnboarding(ctx, rfq, origin) : null,
        el('ol', { class: 'negotiation-journey', 'aria-label': 'Jornada da renegociação' }, journey.map((step) => el('li', { class: `nj-step nj-${step.state}`, dataset: { step: step.key, state: step.state } }, [
          el('span', { class: 'nj-mark', 'aria-hidden': 'true' }, step.state === 'done' ? icon('check', { size: 12 }) : null),
          el('div', {}, [el('p', { class: 'nj-label' }, [textStrong(step.label), mutedText(` · ${STATE_TEXT[step.state]}`, 'span')]), mutedText(step.text)])
        ]))),
        continuityError ? el('p', { class: 'muted small', role: 'status', text: 'O histórico completo da renegociação (versão de origem e propostas por autoria) não pôde ser consultado agora; o restante segue disponível.' }) : null,
        economics,
        el('nav', { class: 'row-actions', 'aria-label': 'Contexto da renegociação' }, [
          el('a', { class: 'btn btn-secondary btn-sm', href: contractHref }, [icon('briefcase', { size: 14 }), el('span', { class: 'btn-label', text: 'Contrato de origem' })]),
          origin?.provider_id ? el('a', { class: 'btn btn-ghost btn-sm', href: ctx.href(`/finance/providers.html?provider_id=${encodeURIComponent(origin.provider_id)}`) }, [el('span', { class: 'btn-label', text: `Relacionamento com ${origin.provider_name || 'a instituição'}` })]) : null,
          contract ? el('a', { class: 'btn btn-ghost btn-sm', href: ctx.href(`/finance/contracts.html?abrir=contrato#contract-${contract.id}`) }, [el('span', { class: 'btn-label', text: 'Contrato resultante' })]) : null,
          back ? el('a', { class: 'btn btn-ghost btn-sm', href: ctx.href('/finance/providers.html#relationship-center') }, [icon('arrowRight', { size: 14 }), el('span', { class: 'btn-label', text: 'Voltar à Central de Relacionamentos' })]) : null
        ].filter(Boolean))
      ].filter(Boolean)));
    slot.hidden = false;
  }).catch(() => {
    slot.replaceChildren(el('p', { class: 'muted small', role: 'status', text: 'Não foi possível consultar a origem desta solicitação agora. O processo continua disponível abaixo.' }));
    slot.hidden = false;
  });
  return slot;
}
