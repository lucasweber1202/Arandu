// Composição server-side da tela de valor de procurement (server aggregation).
// Mantém a separação negociado × realizado × custo evitado, por moeda, e
// "sem cálculo defensável" no lugar de número inventado.
import { VALUE_KINDS, VALUE_CURRENCIES, VALUE_DIMENSIONS } from './value-realization.mjs';
import { money as fmt, day } from './fee-presenter.mjs';

const money = (n, currency) => n === null || n === undefined ? 'Sem cálculo defensável' : fmt(n, currency);
const DIMENSIONS = Object.freeze({ service: 'Serviço', unit: 'Unidade econômica', volume: 'Volume', indexer: 'Indexador', term_months: 'Prazo (meses)', amortization: 'Amortização', fees: 'Tarifas incluídas', guarantee: 'Garantias', grace_months: 'Carência (meses)' });
const BASELINE_SOURCES = [['manual', 'Declaração documentada'], ['contract', 'Contrato'], ['proposal', 'Proposta'], ['approved_budget', 'Orçamento aprovado'], ['import', 'Importação']];

export function valueForms(contracts) {
  const req = { required: true };
  return [{ label: 'Registrar estimativa', primary: true, title: 'Registrar estimativa de valor', post: 'value',
    intro: 'Custos totais, mesmo período e critérios iguais. Spread isolado não prova economia. Custo evitado usa despesa contrafactual declarada; não é caixa economizado.',
    fields: [['title', 'Título', 'text', req], ['kind', 'Tipo estimado', Object.entries(VALUE_KINDS).filter(([k]) => k !== 'REALIZED_SAVINGS'), req],
      ['contract_id', 'Contrato de destino', [['', 'Selecione um contrato'], ...contracts.map((c) => [c.id, c.title || c.id])], req], ['currency', 'Moeda', VALUE_CURRENCIES.map((c) => [c, c]), req],
      ['period_start', 'Início do período', 'date', req], ['period_end', 'Fim do período', 'date', req], ['source', 'Fonte do baseline', BASELINE_SOURCES, req],
      ['reference', 'Referência do baseline', 'text', req], ['as_of', 'Data do baseline', 'date', req], ['amount', 'Custo do baseline', 'number', { ...req, max: 1e12 }],
      ['target_amount', 'Custo de destino', 'number', { ...req, max: 1e12 }],
      ['comparability', 'Comparabilidade', [['incomplete', 'Dados incompletos — sem cálculo'], ['not_comparable', 'Condições distintas — sem cálculo'], ['comparable', 'Custos totais e condições comparáveis']], req],
      ['evidence_reference', 'Referência da evidência', 'text', req], ['reason', 'Justificativa e ajustes', 'textarea', req],
      ...VALUE_DIMENSIONS.flatMap((k) => [[`baseline_${k}`, `${DIMENSIONS[k]} — baseline`], [`target_${k}`, `${DIMENSIONS[k]} — destino`]])] }];
}

/** Formulário plano → contrato da API (baseline aninhado, dimensões só quando informadas). */
export function valueInputFromForm(b) {
  if (b.baseline) return b;
  const dims = (prefix) => Object.fromEntries(VALUE_DIMENSIONS.filter((k) => typeof b[`${prefix}_${k}`] === 'string' && b[`${prefix}_${k}`].trim()).map((k) => [k, b[`${prefix}_${k}`].trim()]));
  return { organization_id: b.organization_id, contract_id: b.contract_id, kind: b.kind, title: b.title, currency: b.currency, period_start: b.period_start, period_end: b.period_end,
    target_amount: b.target_amount, comparability: b.comparability, evidence_reference: b.evidence_reference, reason: b.reason, target_dimensions: dims('target'),
    baseline: { source: b.source, reference: b.reference, as_of: b.as_of, amount: b.amount, currency: b.currency, unit: 'period_total', period_start: b.period_start, period_end: b.period_end, dimensions: dims('baseline') } };
}

export function presentValuePage({ rows, totals, next, contracts }) {
  return {
    cards: totals.map((t) => ({ title: `${VALUE_KINDS[t.kind]} · ${t.currency}`, lines: [money(t.value_amount, t.currency)], note: `${t.comparable} de ${t.records} registros comparáveis. Registros ativos dos filtros.` })),
    columns: ['Registro', 'Tipo', 'Período', 'Valor', 'Estado'],
    rows: rows.map((r) => ({ id: r.id, cells: [r.title, VALUE_KINDS[r.kind], `${r.period_start} – ${r.period_end}`, money(r.value_amount, r.currency), `${r.status === 'active' ? 'Ativo' : 'Invalidado'} · ${r.comparability} · ${r.product || ''} · ${r.kind === 'REALIZED_SAVINGS' ? 'Verificado' : 'Declarado'}`] })),
    next, detail_label: 'Ver evidência',
    empty: { title: 'Sem registros no período', text: 'Sem dado não é zero. Informe baseline e custos comparáveis.' },
    options: { product: [['credit', 'Crédito'], ['acquiring', 'Adquirência']], kind: Object.entries(VALUE_KINDS), currency: VALUE_CURRENCIES.map((x) => [x, x]) },
    forms: valueForms(contracts)
  };
}

export function presentValueDetail({ record: r, observations = [], methodology = null, entity = null }) {
  const actions = [];
  if (r.status === 'active') {
    if (r.kind === 'NEGOTIATED_SAVINGS' && r.comparability === 'comparable') actions.push({ label: 'Registrar realização verificada', title: 'Registrar realização verificada', post: 'value/observe',
      intro: `Observação do período completo ${r.period_start} – ${r.period_end}, em ${r.currency}. Período encerrado; negociado preservado.`,
      fixed: { record_id: r.id, currency: r.currency, period_start: r.period_start, period_end: r.period_end, coverage: 'complete' },
      fields: [['observed_amount', 'Custo observado', 'number', { required: true, max: 1e12 }], ['source', 'Fonte', [['statement', 'Extrato'], ['invoice', 'Fatura'], ['import', 'Importação'], ['manual', 'Declaração documentada']]],
        ['evidence_reference', 'Referência da evidência', 'text', { required: true }], ['verification_reason', 'Justificativa da verificação', 'textarea', { required: true }],
        ['verified', 'Confirmei a evidência e a cobertura completa do período', 'checkbox', { required: true }]] });
    actions.push({ label: 'Invalidar com justificativa', title: 'Invalidar registro', post: 'value/invalidate', fixed: { record_id: r.id },
      intro: 'Preserva evidência; exclui dos totais ativos. Correções exigem novo registro.', fields: [['reason', 'Justificativa', 'textarea', { required: true }]] });
  }
  const b = r.baseline || {};
  return {
    title: r.title,
    lines: [`${VALUE_KINDS[r.kind]} · ${money(r.value_amount, r.currency)} · ${r.period_start} – ${r.period_end}`,
      `Baseline: ${b.source} · ${b.reference} · ${b.as_of} · ${money(b.amount, r.currency)}. Custo de destino: ${money(r.target_amount, r.currency)}.`,
      `Entidade: ${entity || 'Nível de grupo'}. Responsável: ${r.owner_id}. Registrado: ${r.created_at}.`,
      `Evidência: ${r.evidence_reference}. Justificativa: ${r.reason}.`,
      `Metodologia v${methodology?.version || 1}: ${r.methodology_snapshot?.formula}. ${r.methodology_snapshot?.verification || ''}`.trim(),
      ...observations.map((o) => `Observação: ${o.source} · ${o.evidence_reference} · ${o.period_start} – ${o.period_end}, cobertura ${o.coverage}. Verificada por ${o.verified_by} em ${o.verified_at}: ${o.verification_reason}`),
      ...(r.invalidation_reason ? [`Invalidado: ${r.invalidation_reason} · ${r.invalidated_at}`] : [])],
    sections: [
      { title: `Contrato de destino · versão ${r.contract_version}`, items: [JSON.stringify(r.target_snapshot)] },
      { title: 'Comparabilidade econômica', items: VALUE_DIMENSIONS.map((k) => `${DIMENSIONS[k]}: baseline ${JSON.stringify(b.dimensions?.[k] ?? null)} · destino ${JSON.stringify(r.target_dimensions?.[k] ?? null)}`) }
    ],
    graph: { type: 'contract', id: r.contract_id, title: 'Contexto financeiro do contrato' },
    actions
  };
}
export { day };
