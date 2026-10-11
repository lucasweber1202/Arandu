// Fatos dos registros existentes. Sem estado paralelo nem cálculo financeiro.
import { el, formatDate, CONTRACT_STATUS, RFQ_STATUS } from '../core.js';
import { FACILITY_KINDS } from '../../../lib/finance/portfolio.mjs';
import { graphContextCard } from './graph-context.js';

const amount = (value, currency) => value === null || value === undefined ? 'Não informado' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value);
const date = value => value ? formatDate(value) : 'Não informada';
const section = (title, rows, render, empty) => el('section', { class: 'cc-section' }, [el('h3', { text: title }), rows.length ? el('ul', { class: 'plain-list' }, rows.map(render)) : el('p', { class: 'muted small', text: empty })]);
export function relationshipContext(ctx, detail) {
  const provider = detail.provider;
  const contracts = detail.contracts || [];
  const facilities = detail.facilities || [];
  const rfqs = detail.rfqs || [];
  const balances = new Map();
  for (const row of detail.balances || []) if (!balances.has(row.facility_id)) balances.set(row.facility_id, row);
  const href = path => ctx.href(path);
  const quickLinks = [['fees', 'Tarifas e cobranças'], ['covenants', 'Obrigações e covenants'], ['opportunities', 'Renovações e oportunidades'], ['qualifications', 'Qualificação'], ['performance', 'Performance'], ['spend', 'Spend']];
  return el('div', { class: 'stack relationship-context' }, [
    el('p', { class: 'muted small', text: `Recorte autorizado: até 200 contratos e facilities; 500 convites, propostas e solicitações; 2.000 fotografias de saldo. Indicadores e listas descrevem esse recorte, não o histórico completo. Cadastro ${provider.verification_state === 'EVIDENCIA_REGISTRADA' ? 'com evidência registrada; não é atestação de regularidade' : 'sem verificação registrada'}.` }),
    section('Contratos e condições', contracts, contract => el('li', {}, [el('a', { href: href(`/finance/contracts.html?abrir=contrato#contract-${contract.id}`), text: contract.title || 'Contrato registrado' }), el('p', { class: 'small muted', text: `${CONTRACT_STATUS[contract.status]?.label || 'Estado não informado'} · início ${date(contract.starts_on)} · término ${date(contract.ends_on)}. Abra o contrato para condições, versões, obrigações e renovação.` })]), 'Nenhum contrato disponível neste recorte.'),
    section('Facilities e limites', facilities, facility => {
      const balance = balances.get(facility.id);
      return el('li', {}, [el('a', { href: href(`/finance/portfolio.html#facility-${facility.id}`), text: facility.name }), el('p', { class: 'small', text: `${FACILITY_KINDS[facility.kind] || 'Facility'} · ${facility.currency} · limite aprovado ${amount(facility.approved_limit, facility.currency)} · vencimento ${date(facility.maturity_on)}` }),
        el('p', { class: 'small muted', text: balance ? `Fotografia de ${date(balance.as_of)}: dívida ${amount(balance.outstanding_amount, facility.currency)} · limite utilizado ${amount(balance.used_limit_amount, facility.currency)}. Origem: ${balance.source_reference || 'referência não informada'}. Informação histórica; não é saldo atual nem conciliação bancária.` : 'Saldo e utilização não registrados neste recorte. Ausência não é zero.' })]);
    }, 'Nenhuma facility disponível neste recorte.'),
    section('Solicitações, convites e propostas', rfqs, rfq => {
      const invites = (detail.invites || []).filter(row => row.rfq_id === rfq.id);
      const proposals = (detail.proposals || []).filter(row => row.rfq_id === rfq.id);
      return el('li', {}, [el('a', { href: href(`/finance/rfq.html?id=${rfq.id}`), text: rfq.title || 'Solicitação' }), el('p', { class: 'small muted', text: `${RFQ_STATUS[rfq.status]?.label || 'Estado não informado'} · prazo ${date(rfq.response_deadline)} · ${invites.length} convite(s) carregado(s) · ${proposals.filter(row => row.current_version > 0 && row.status !== 'withdrawn').length} proposta(s) submetida(s) não retirada(s). Abra o processo para revisão, decisão e contratação.` })]);
    }, 'Nenhuma solicitação disponível neste recorte.'),
    ctx.mode === 'demo' ? null : el('nav', { class: 'row-actions', 'aria-label': 'Jornadas desta instituição' }, quickLinks.map(([page, text]) => el('a', { href: href(`/finance/${page}.html?provider_id=${encodeURIComponent(provider.id)}`), text }))),
    graphContextCard(ctx, { type: 'provider', id: provider.id, title: 'Garantias, documentos e relações financeiras' })
  ].filter(Boolean));
}
