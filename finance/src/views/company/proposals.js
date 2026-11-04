// Propostas recebidas em todas as solicitações da organização.
// Extraído de company.js (v7.0): uma capability por módulo e rota.

import { el, formatDate, relativeDays, daysUntil, RFQ_STATUS, PROPOSAL_STATUS, PROVIDER_KINDS } from '../../core.js';
import { linkButton, emptyState } from '../../ui.js';
import { coverage, termsSummary } from '../shared/terms.js';

export async function proposalsList(ctx) {
  ctx.header({ title: 'Propostas recebidas', subtitle: 'Respostas das instituições convidadas, com versão, validade e cobertura dos campos pedidos.' });
  const rows = [];
  for (const rfq of ctx.data.rfqs || []) for (const proposal of rfq.proposals || []) rows.push({ rfq, proposal });
  if (!rows.length) return emptyState({ title: 'Nenhuma proposta recebida ainda', text: 'Convide provedores em uma solicitação aberta. As respostas aparecem aqui.', iconName: 'inbox', action: linkButton('Ver solicitações', ctx.href('/finance/rfqs.html'), { iconName: 'arrowRight' }) });
  rows.sort((a, b) => String(b.proposal.submitted_at).localeCompare(String(a.proposal.submitted_at)));
  const table = el('table', { class: 'data-table' });
  table.append(el('thead', {}, el('tr', {}, ['Instituição', 'Solicitação', 'Condições', 'Versão', 'Enviada', 'Validade', 'Cobertura'].map((label) => el('th', { scope: 'col', text: label })))));
  const body = el('tbody');
  for (const { rfq, proposal } of rows) {
    const outdated = proposal.rfq_revision && proposal.rfq_revision < (rfq.revision || 1);
    const cov = coverage(rfq.product, proposal.terms);
    const validDays = daysUntil(proposal.terms?.valid_until);
    const live = ['open', 'collecting', 'comparing'].includes(rfq.status);
    body.append(el('tr', { class: 'row-link', dataset: { entity: 'proposal', id: proposal.id, rfq: rfq.id } }, [
      el('td', { 'data-label': 'Instituição', class: 'cell-primary' }, [el('a', { class: 'row-title stretched', href: ctx.href(`/finance/rfq.html?id=${rfq.id}#propostas`), text: proposal.provider_name }), el('span', { class: 'row-sub', text: PROVIDER_KINDS[proposal.provider_kind] || 'Provedor' })]),
      el('td', { 'data-label': 'Solicitação' }, [el('span', { text: rfq.title }), el('span', { class: 'row-sub', text: RFQ_STATUS[rfq.status]?.label })]),
      el('td', { 'data-label': 'Condições', class: 'small' }, termsSummary(rfq.product, proposal.terms)),
      el('td', { 'data-label': 'Versão' }, [el('span', { text: `v${proposal.version}` }),
        // Retirada ou em preparação não pode parecer resposta válida.
        proposal.status && !['submitted', 'revised'].includes(proposal.status) ? el('span', { class: 'row-sub warn-text', text: PROPOSAL_STATUS[proposal.status]?.label || 'Situação desconhecida' }) : null, proposal.rfq_revision ? el('span', { class: `row-sub${outdated ? ' warn-text' : ''}`, text: `rev. ${proposal.rfq_revision}${outdated ? ` (atual ${rfq.revision})` : ''}` }) : null]),
      // Resposta depois do prazo informado é registrada como tal (fato, não juízo).
      el('td', { 'data-label': 'Enviada' }, [el('span', { text: formatDate(proposal.submitted_at) }),
        rfq.response_deadline && proposal.submitted_at && String(proposal.submitted_at).slice(0, 10) > rfq.response_deadline ? el('span', { class: 'row-sub warn-text', text: 'após o prazo de resposta' }) : null]),
      // Validade só é alerta enquanto o processo ainda decide; em processo encerrado
      // é registro histórico (com ano), sem vermelho de urgência.
      el('td', { 'data-label': 'Validade', class: live && validDays !== null && validDays < 5 ? 'urgent' : '' }, proposal.terms?.valid_until ? el('span', { class: live ? '' : 'muted', text: `${formatDate(proposal.terms.valid_until, { withYear: !live })}${validDays !== null && validDays >= 0 ? ` · ${relativeDays(proposal.terms.valid_until)}` : validDays < 0 ? (live ? ' · vencida' : ' · expirou') : ''}` }) : el('span', { class: 'muted', text: 'não informada' })),
      el('td', { 'data-label': 'Cobertura' }, el('span', { class: 'coverage-inline' }, [el('span', { class: 'coverage-bar' }, el('span', { class: 'coverage-fill', style: `width:${Math.round(cov.ratio * 100)}%` })), el('span', { class: 'small', text: `${cov.filled}/${cov.total}` })]))
    ]));
  }
  table.append(body);
  return el('div', { class: 'table-card' }, table);
}

// --------------------------------------------------------------- contratos
