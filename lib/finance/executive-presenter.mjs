// Superfície executiva de Value Intelligence: valor (P1.1), tarifas (P1.2) e
// oportunidades (P1.3) lado a lado, por moeda, entidade e período, com
// cobertura para evitar falsa precisão. Nunca soma moedas; nunca soma custo
// evitado com economia realizada; cada cartão leva ao trabalho.
import { money } from './fee-presenter.mjs';
import { VALUE_KINDS } from './value-realization.mjs';

const pct = (part, total) => (Number(total) > 0 ? `${Math.round((Number(part) * 100) / Number(total))}%` : '—');
const q = (params) => new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();

export function presentExecutive({ value = [], fees = [], opportunities = [], filters, today }) {
  const scope = { start: filters.start, end: filters.end, legal_entity_id: filters.entity };
  const currencies = [...new Set(value.map((v) => v.currency))].sort();
  const valueLines = currencies.length ? currencies.map((currency) => {
    const of = (kind) => value.find((v) => v.currency === currency && v.kind === kind);
    return `${currency}: ${['NEGOTIATED_SAVINGS', 'REALIZED_SAVINGS', 'COST_AVOIDANCE'].map((kind) => {
      const row = of(kind);
      return `${VALUE_KINDS[kind].toLowerCase()} ${row ? `${row.value_amount === null ? 'sem cálculo defensável' : money(row.value_amount, currency)} (${row.comparable}/${row.records} com cálculo)` : '—'}`;
    }).join(' · ')}`;
  }) : ['Sem registros de valor no período.'];
  const records = value.reduce((t, v) => t + Number(v.records), 0);
  const comparable = value.reduce((t, v) => t + Number(v.comparable), 0);
  const verified = value.filter((v) => v.kind === 'REALIZED_SAVINGS').reduce((t, v) => t + Number(v.records), 0);
  const active = opportunities.filter((o) => ['open', 'acknowledged', 'under_review'].includes(o.status));
  const sum = (rows, key) => rows.reduce((t, o) => t + Number(o[key] || 0), 0);
  const acted = opportunities.find((o) => o.status === 'acted');
  const in30 = new Date(Date.parse(`${today}T00:00:00Z`) + 30 * 86400000).toISOString().slice(0, 10);
  return {
    cards: [
      { title: 'Valor de procurement', lines: valueLines,
        note: `Cobertura: ${comparable}/${records} registros ativos com cálculo defensável; ${verified} realizações verificadas. Negociado, realizado e custo evitado nunca são somados entre si nem entre moedas; custo evitado não é caixa.`,
        links: [{ href: `/finance/value.html?${q(scope)}`, text: 'Abrir registros de valor' }, { href: `/finance/value.html?${q({ ...scope, kind: 'NEGOTIATED_SAVINGS' })}`, text: 'Negociado a realizar' }] },
      { title: 'Tarifas bancárias', lines: fees.length ? fees.flatMap((s) => [
        `${s.currency}: ${s.above} acima da referência contratada (${s.above > 0 ? `diferença ${money(s.above_total, s.currency)}` : '—'}) · ${s.below} abaixo (${s.below > 0 ? `diferença ${money(Math.abs(Number(s.below_total)), s.currency)}` : '—'}) · ${s.not_comparable} não comparáveis · ${s.missing_reference} sem referência`,
        `${s.currency}: ${s.open_review} com revisão necessária · ${s.under_review} em revisão · ${s.closed_review} resolvidas ou descartadas`]) : ['Sem cobranças observadas no período.'],
        note: fees.length ? `Cobertura: ${fees.map((s) => `${s.currency} ${s.schedules_observed}/${s.schedules} tarifas contratadas com observação comparável, ${pct(s.verified, s.observations)} das observações verificadas`).join('; ')}. Diferença não é economia nem acusação.` : 'Sem dado não é zero.',
        links: [{ href: `/finance/fees.html?${q({ ...scope, review_status: 'new' })}`, text: 'Diferenças aguardando revisão' }, { href: `/finance/fees.html?${q(scope)}`, text: 'Abrir tarifas' }] },
      { title: 'Oportunidades (agora)', lines: [`${sum(active, 'opportunities')} ativas · ${sum(active, 'due_30')} com prazo nos próximos 30 dias · ${sum(active, 'overdue')} com prazo vencido`,
        `${Number(acted?.opportunities || 0)} com ação registrada por pessoa`],
        note: 'Fato + regra da sua empresa + fonte; ação possível para uma pessoa avaliar. Sem ranking.',
        links: [{ href: `/finance/opportunities.html?${q({ status: 'open', legal_entity_id: filters.entity })}`, text: 'Abrir worklist' }, { href: `/finance/opportunities.html?${q({ due_before: in30, legal_entity_id: filters.entity })}`, text: 'Prazo em 30 dias' }] }
    ]
  };
}

// Performance e Spend no painel: o servidor devolve estado técnico; a tela
// mostra texto de gente. Nunca UUID, enum em inglês, nome de função nem
// timestamp ISO. Referências vêm de leituras sob o JWT de quem chama.
const PERFORMANCE_STATUS = { open: 'Em acompanhamento', closed: 'Encerrado' };
const VALUE_KIND_LABEL = { contracted: 'Contratado', observed: 'Observado', estimated: 'Estimado', verified: 'Verificado' };
const PRODUCT_LABEL = { credit: 'Crédito', acquiring: 'Adquirência' };
const plural = (n, one, many) => `${n} ${Number(n) === 1 ? one : many}`;
const dayOf = (value) => {
  const s = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return 'data indisponível';
  return new Date(`${s}T00:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
};

export function presentPerformanceSummary(performance = {}) {
  const rows = performance?.rows || [];
  const coverage = performance?.coverage || {};
  return {
    title: 'Performance dos provedores',
    lines: rows.length ? rows.map((r) => `${PERFORMANCE_STATUS[r.status] || 'Situação não informada'}: ${plural(r.periods ?? 0, 'período', 'períodos')}${Number(r.overdue) ? ` · ${plural(r.overdue, 'revisão atrasada', 'revisões atrasadas')}` : ''}`)
      : ['Nenhum período de performance registrado.'],
    note: `Cobertura: ${coverage.confirmed ?? 0} de ${coverage.registered ?? 0} dimensões confirmadas${Number(coverage.not_available) ? `, ${coverage.not_available} indisponíveis` : ''}. Sem períodos registrados não é possível concluir performance. Referência ${dayOf(performance?.observed_at)}.`,
    links: [{ href: '/finance/performance.html', text: 'Abrir períodos e evidências' }]
  };
}

export function presentSpendSummary(spend = {}, providers = []) {
  const name = (id) => providers.find((p) => p.id === id)?.name || 'Provedor indisponível';
  const rows = spend?.rows || [];
  return {
    title: 'Spend por moeda e tipo',
    lines: rows.length ? rows.map((r) => `${r.currency} · ${VALUE_KIND_LABEL[r.value_kind] || 'Tipo não informado'} · ${PRODUCT_LABEL[r.product] || 'Outro produto'} · ${name(r.provider_id)}: ${r.amount === null || r.amount === undefined ? 'indisponível' : money(r.amount, r.currency)} · cobertura ${r.included_records ?? 0}/${r.records ?? 0}`)
      : ['Nenhuma evidência de spend no período.'],
    note: `Moedas e tipos não são somados; diferença de spend não é savings. Referência ${dayOf(spend?.observed_at)}.`,
    links: [{ href: '/finance/spend.html', text: 'Revisar evidências de Spend' }]
  };
}
