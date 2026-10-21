// Fatos dos registros existentes. Sem estado paralelo nem cálculo financeiro.
import { el, formatDate, productLabel, renewalStage, CONTRACT_STATUS, RFQ_STATUS } from '../core.js';
import { CONTRACT_CATEGORIES } from '../../../lib/finance/contract-terms.mjs';
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
    section('Contratos e condições', contracts, contract => el('li', {}, [el('a', { href: href(`/finance/contracts.html?abrir=contrato#contract-${contract.id}`), text: contract.title || [CONTRACT_CATEGORIES[contract.product] || (contract.product ? productLabel(contract.product) : ''), contract.ends_on ? `vence ${date(contract.ends_on)}` : ''].filter(Boolean).join(' · ') || 'Contrato sem título' }), el('p', { class: 'small muted', text: `${CONTRACT_STATUS[contract.status]?.label || 'Estado não informado'} · início ${date(contract.starts_on)} · término ${date(contract.ends_on)}. Abra o contrato para condições, versões, obrigações e renovação.` })]), 'Nenhum contrato disponível neste recorte.'),
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

// ------------------------------------------------------------ workspace
// Resumo e pendências da instituição, derivados só do que a API carregou.
// Nada de nota, ranking ou urgência inventada: cada item diz de onde vem.
const DAY = 86400000;
const daysTo = (value, today) => (value ? Math.round((Date.parse(`${String(value).slice(0, 10)}T00:00:00Z`) - today) / DAY) : null);
const LIVE_RFQ = ['open', 'collecting', 'comparing'];
const RENEWAL_HORIZON = 90;

/**
 * Pendências do relacionamento, em ordem: vencido → próximo → em andamento → incompleto.
 * `kind` separa o que está vencido, o que vence em breve, o que está incompleto
 * e o que não foi informado — a tela nunca trata ausência como "em dia".
 */
export function relationshipAttention(detail, { today = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) } = {}) {
  const items = [];
  for (const contract of detail.contracts || []) {
    if (!['active', 'renewing'].includes(contract.status)) continue;
    const days = daysTo(contract.ends_on, today);
    const name = contract.title || CONTRACT_CATEGORIES[contract.product] || 'Contrato';
    if (days === null) items.push({ kind: 'missing', rank: 4, title: `Término não informado: ${name}`, detail: 'Sem data de término o Arandu não acompanha renovação nem aviso prévio.', target: { type: 'contract', id: contract.id } });
    else if (days < 0) items.push({ kind: 'overdue', rank: 0, due: days, title: `Contrato vencido: ${name}`, detail: `Término em ${formatDate(contract.ends_on)}, ainda registrado como vigente.`, target: { type: 'contract', id: contract.id } });
    else {
      // Três datas distintas: término contratual, marco de aviso prévio
      // registrado no cadastro e tarefas operacionais (abaixo).
      if (contract.renewal_notice_days === null || contract.renewal_notice_days === undefined) {
        if (days <= RENEWAL_HORIZON) items.push({ kind: 'soon', rank: 1, due: days, title: `Vence em ${days} ${days === 1 ? 'dia' : 'dias'}: ${name}`, detail: `Término em ${formatDate(contract.ends_on)}. Aviso prévio não informado no registro: nenhum marco foi calculado.`, target: { type: 'contract', id: contract.id } });
        continue;
      }
      const stage = renewalStage(contract);
      const noticeDays = daysTo(stage.deadline, today);
      const notice = `Marco de aviso prévio: ${formatDate(stage.deadline)} (${contract.renewal_notice_days} dias registrados no cadastro; confira no documento).`;
      if (stage.stage === 'past_notice') items.push({ kind: 'overdue', rank: 0, due: noticeDays, title: `Aviso prévio registrado já passou: ${name}`, detail: `${notice} Término contratual em ${formatDate(contract.ends_on)}.`, target: { type: 'contract', id: contract.id } });
      else if (days <= RENEWAL_HORIZON || stage.stage === 'window') items.push({ kind: 'soon', rank: 1, due: noticeDays, title: `Decidir renovação até ${formatDate(stage.deadline)}: ${name}`, detail: `${notice} Término contratual em ${formatDate(contract.ends_on)}.`, target: { type: 'contract', id: contract.id } });
    }
  }
  for (const issue of detail.issues || []) {
    if (!['open', 'in_progress'].includes(issue.status)) continue;
    const days = daysTo(issue.due_on, today);
    items.push({ kind: days !== null && days < 0 ? 'overdue' : 'open', rank: days !== null && days < 0 ? 0 : 2, due: days, title: `Questão aberta: ${issue.title}`,
      detail: days === null ? 'Sem prazo definido.' : days < 0 ? `Prazo vencido em ${formatDate(issue.due_on)}.` : `Prazo ${formatDate(issue.due_on)}.`, target: { type: 'issue', id: issue.id } });
  }
  for (const rfq of detail.rfqs || []) {
    if (!LIVE_RFQ.includes(rfq.status)) continue;
    const days = daysTo(rfq.response_deadline, today);
    items.push({ kind: 'open', rank: 2, due: rfq.status === 'comparing' ? null : days, title: `Negociação em andamento: ${rfq.title || 'Solicitação'}`,
      detail: `${RFQ_STATUS[rfq.status]?.label || 'Em andamento'}${!rfq.response_deadline ? '' : rfq.status === 'comparing' ? ` · coleta encerrada (prazo era ${formatDate(rfq.response_deadline)})` : ` · prazo de resposta ${formatDate(rfq.response_deadline)}`}.`, target: { type: 'rfq', id: rfq.id } });
  }
  for (const task of detail.tasks || []) {
    const days = daysTo(task.due_on, today);
    items.push({ kind: days !== null && days < 0 ? 'overdue' : 'open', rank: days !== null && days < 0 ? 0 : 3, due: days, title: `Tarefa: ${task.title}`,
      detail: task.due_on ? `Prazo operacional ${formatDate(task.due_on)}${task.assignee_name ? ` · responsável ${task.assignee_name}` : ' · responsável não definido'}.` : 'Sem prazo definido.', target: { type: 'task', id: task.id } });
  }
  if (!(detail.contacts || []).length) items.push({ kind: 'missing', rank: 4, title: 'Nenhum contato registrado', detail: 'Registre quem atende a empresa nesta instituição.', target: { type: 'contact' } });
  const due = (item) => (Number.isFinite(item.due) ? item.due : 9999);
  return items.sort((a, b) => a.rank - b.rank || due(a) - due(b));
}

/** Fatos do topo: responsável, produtos e próximo prazo — com a origem de cada um. */
export function relationshipSummary(detail, options) {
  const primary = (detail.contacts || []).find((row) => row.is_primary) || null;
  const categories = new Set([...(detail.map || []).map((row) => row.category), ...(detail.contracts || []).map((row) => row.product).filter(Boolean)]);
  const statuses = new Set((detail.relationships || []).map((row) => row.status));
  const attention = relationshipAttention(detail, options);
  const dated = attention.filter((item) => Number.isFinite(item.due) && item.due >= 0).sort((a, b) => a.due - b.due)[0] || null;
  return {
    status: statuses.has('active') ? 'Ativo' : statuses.has('prospect') ? 'Em prospecção' : statuses.size ? 'Inativo' : (detail.contracts || []).some((row) => ['active', 'renewing'].includes(row.status)) ? 'Com contrato vigente' : 'Estado não registrado',
    contact: primary ? [primary.name, primary.title].filter(Boolean).join(' · ') : null,
    products: [...categories].map((key) => CONTRACT_CATEGORIES[key] || productLabel(key)).filter(Boolean),
    next: dated, attention
  };
}
