// Composição server-side da tela de tarifas (server aggregation). Toda frase
// que a interface mostra sai daqui, com a linguagem segura do domínio:
// "acima/abaixo da referência contratada", "revisão necessária", "não
// comparável". Puro: recebe linhas já autorizadas pelo RLS do chamador.
import { FEE_CATALOG as C } from './fee-intelligence.mjs';

export const money = (n, currency) => n === null || n === undefined ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(Number(n));
export const day = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—');
const stamp = (v) => (v ? `${day(v)} ${String(v).slice(11, 16)} UTC` : '—');
const pairs = (map) => Object.entries(map);

export function comparisonText(v) {
  return v.comparison_status === 'comparable' ? C.directions[v.direction] : `${C.comparison[v.comparison_status]}: ${(v.reasons || []).map((r) => C.reasons[r] || r).join('; ')}`;
}
export function termsText(x) {
  return `${C.models[x.pricing_model]} ${x.tiers ? x.tiers.map((t) => `${t.up_to ?? '∞'}:${t.rate}`).join('; ') : x.rate} ${x.currency}${x.minimum_amount != null ? ` · mín ${x.minimum_amount}` : ''}${x.maximum_amount != null ? ` · máx ${x.maximum_amount}` : ''} · ${C.schedule_sources[x.source]} ${x.source_reference}`;
}
export function summaryLines(s) {
  return [`Comparáveis: contratado ${money(s.contracted_total, s.currency)} · observado ${money(s.observed_total, s.currency)}`,
    `${s.above} acima da referência contratada (${money(s.above_total, s.currency)}) · ${s.below} abaixo (${money(s.below_total, s.currency)}) · ${s.equal} iguais`,
    `${s.not_comparable} não comparáveis · ${s.missing_reference} sem referência contratada`,
    `Revisão: ${s.open_review} necessária · ${s.under_review} em revisão · ${s.closed_review} resolvidas ou descartadas`];
}
export const coverageNote = (s) => `Cobertura: ${s.schedules_observed}/${s.schedules} tarifas contratadas com observação comparável; ${s.verified}/${s.observations} observações verificadas. Sem dado não é zero.`;
export const providerLines = (summary) => summary.length
  ? summary.map((s) => `${s.currency}: ${s.schedules} tarifas contratadas · ${s.observations} observações · ${Number(s.above) + Number(s.below)} com diferença · ${s.under_review} em revisão · ${s.closed_review} resolvidas/descartadas · cobertura ${s.schedules_observed}/${s.schedules}`)
  : ['Sem tarifas registradas para este provedor no período.'];

const pricingFields = () => [['pricing_model', 'Modelo de cobrança', pairs(C.models)], ['currency', 'Moeda', C.currencies.map((c) => [c, c])],
  ['rate', 'Taxa (valor, %, bps ou por unidade)', 'number', { step: '.000001' }], ['tiers', 'Faixas graduadas (até:taxa; …), ex.: 100:2; :1', 'text'],
  ['minimum_amount', 'Mínimo mensal', 'number'], ['maximum_amount', 'Máximo mensal', 'number'], ['effective_from', 'Vigente desde (vazio = vigência da versão do contrato)', 'date'],
  ['contract_version', 'Versão do contrato (vazio = atual)', 'number', { step: 1, min: 1 }], ['source', 'Fonte', pairs(C.schedule_sources)], ['source_reference', 'Referência da fonte (cláusula, anexo)', 'text', { required: true }]];

export function feeForms(contracts, schedules) {
  const contractOptions = [['', 'Selecione um contrato'], ...contracts.map((c) => [c.id, c.title || c.id])];
  return {
    page: [
      { label: 'Registrar tarifa contratada', primary: true, title: 'Registrar tarifa contratada', post: 'fees/schedules',
        intro: 'Vinculada a uma versão do contrato; só muda por nova versão, sem sobrescrever o histórico. Valor fixo → mês/ano/única; por unidade ou faixas → transação/item; percentual ou bps → % do volume/valor.',
        fields: [['contract_id', 'Contrato', contractOptions, { required: true }], ['service', 'Serviço', 'text', { required: true, maxlength: 120 }], ['category', 'Categoria', pairs(C.categories)], ['charging_unit', 'Unidade de cobrança', pairs(C.units)], ...pricingFields()] },
      { label: 'Registrar cobrança observada', title: 'Registrar cobrança observada', post: 'fees/observe',
        intro: 'Registro manual a partir de documento da origem indicada; o Arandu não importa dados automaticamente. A comparação usa a versão contratada vigente no período e fica congelada.',
        fields: [['contract_id', 'Contrato', contractOptions, { required: true }], ['service', 'Serviço (como no contrato)', 'text', { required: true, maxlength: 120 }], ['charging_unit', 'Unidade de cobrança', pairs(C.units)],
          ['currency', 'Moeda', C.currencies.map((c) => [c, c])], ['period_start', 'Início do período', 'date', { required: true }], ['period_end', 'Fim do período', 'date', { required: true }],
          ['volume', 'Volume (transações/itens), quando aplicável', 'number', { step: '.000001' }], ['base_amount', 'Base de cálculo (valor), quando percentual', 'number'],
          ['observed_amount', 'Valor cobrado no período', 'number', { required: true }], ['source_type', 'Origem do dado', pairs(C.sources)],
          ['source_reference', 'Referência da fonte (extrato, relatório)', 'text', { required: true }], ['source_object_id', 'Identificador na fonte (opcional)'], ['evidence_reference', 'Referência da evidência', 'text', { required: true }]] }
    ],
    version: schedules.length ? [{ label: 'Nova versão de tarifa contratada', title: 'Nova versão de tarifa contratada', post: 'fees/version',
      intro: 'Cobranças já comparadas mantêm a referência da época; a nova versão vale a partir da vigência informada.',
      fields: [['schedule', 'Tarifa contratada (versão atual)', schedules.map((s) => [`${s.id}|${s.current_version}`, `${s.service} · ${C.units[s.charging_unit]} · v${s.current_version}`])], ...pricingFields(), ['reason', 'Justificativa', 'textarea', { required: true }]] }] : []
  };
}

export function presentFeePage({ rows, summary, next, schedules, contracts }) {
  const forms = feeForms(contracts, schedules);
  return {
    cards: [
      ...summary.map((s) => ({ title: `Tarifas · ${s.currency}`, lines: summaryLines(s), note: coverageNote(s) })),
      { title: 'Tarifas contratadas (versões)', lines: schedules.length ? schedules.flatMap((s) => [`${s.service} · ${C.categories[s.category]} · ${C.units[s.charging_unit]}`,
        ...[...(s.versions || [])].sort((a, b) => a.version - b.version).map((x) => `  v${x.version} desde ${day(x.effective_from)} (contrato v${x.contract_version}): ${termsText(x)}${x.reason ? ` · ${x.reason}` : ''}`)])
        : ['Nenhuma tarifa contratada registrada no escopo.'], actions: forms.version }
    ],
    columns: ['Serviço', 'Período', 'Contratado', 'Observado', 'Diferença', 'Comparação', 'Revisão'],
    rows: rows.map((v) => ({ id: v.id, cells: [v.service, `${day(v.period_start)} – ${day(v.period_end)}`, money(v.contracted_amount, v.currency), money(v.observed_amount, v.currency), money(v.variance_amount, v.currency), comparisonText(v), C.review[v.review_status]] })),
    next,
    empty: { title: 'Sem cobranças observadas no período', text: 'Sem dado não é zero. Registre a tarifa contratada e a cobrança observada com a fonte.' },
    options: { category: pairs(C.categories), currency: C.currencies.map((c) => [c, c]), review_status: pairs(C.review) },
    forms: forms.page
  };
}

export function presentFeeDetail({ variance: v, observation: o = {}, reviews = [], entity = null }) {
  const ref = v.reference_snapshot;
  const m = v.methodology || {};
  const actions = (C.transitions[v.review_status] || []).filter((to) => to !== 'confirmed' || v.comparison_status === 'comparable').map((to) => ({
    label: C.review[to], title: C.review[to], post: 'fees/review', fixed: { variance_id: v.id, expected_status: v.review_status, to_status: to },
    intro: 'A interpretação é sua. O Arandu registra a decisão e a evidência; não classifica a cobrança como erro.',
    fields: [['reason_code', 'Motivo', pairs(C.review_reasons)], ['notes', 'Notas', 'textarea', { required: true, maxlength: 2000 }], ['evidence_reference', 'Referência da evidência'], ...(to === 'resolved' ? [['resolution', 'Resolução', 'textarea', { required: true }]] : [])]
  }));
  if (o.verification_status === 'unverified') actions.push({ label: 'Verificar observação', title: 'Verificar observação', post: 'fees/verify', fixed: { observation_id: o.id },
    fields: [['status', 'Resultado', [['verified', 'Verificada contra a fonte'], ['rejected', 'Rejeitada (fonte não confere)']]], ['reason', 'Justificativa', 'textarea', { required: true }]] });
  return {
    title: `${v.service} · ${v.currency}`,
    lines: [
      `${comparisonText(v)} · ${C.review[v.review_status]}`,
      `Contratado ${money(v.contracted_amount, v.currency)} · observado ${money(v.observed_amount, v.currency)} · diferença ${money(v.variance_amount, v.currency)} · ${day(v.period_start)} – ${day(v.period_end)}`,
      ref ? `Referência: tarifa v${ref.version} (contrato v${ref.contract_version}) vigente desde ${day(ref.effective_from)} · ${termsText(ref)}` : 'Sem referência contratada aplicável.',
      `Fórmula v${m.version}: ${m.formula || 'sem cálculo'}${m.reference_formula ? ` (referência: ${m.reference_formula})` : ''} · entradas ${JSON.stringify(m.inputs || {})}. ${m.note || ''}`.trim(),
      `Fonte: ${C.sources[o.source_type] || o.source_type} · ${o.source_reference}${o.source_object_id ? ` · objeto ${o.source_object_id}` : ''} · registrada ${stamp(o.ingested_at)} (entrada manual) · evidência ${o.evidence_reference}`,
      `Verificação: ${o.verification_status === 'verified' ? 'verificada' : o.verification_status === 'rejected' ? 'rejeitada' : 'pendente'}${o.verified_at ? ` em ${stamp(o.verified_at)} — ${o.verification_reason}` : ''}. Entidade: ${entity || 'nível de grupo'}.`
    ],
    sections: [{ title: 'Histórico de revisão', empty: 'Sem revisão registrada.', items: reviews.map((r) => `${stamp(r.reviewed_at)} · ${C.review[r.from_status] || r.from_status} → ${C.review[r.to_status]} · ${C.review_reasons[r.reason_code]} · ${r.notes}${r.evidence_reference ? ` · evidência ${r.evidence_reference}` : ''}${r.resolution ? ` · resolução: ${r.resolution}` : ''}`) }],
    graph: { type: 'contract', id: v.contract_id, kind: 'fee_variance', title: 'Contexto do contrato' },
    actions
  };
}

/** "100:2; :1" → [{up_to:100, rate:2}, {up_to:null, rate:1}] (faixas graduadas). */
export function parseTiers(text) {
  if (Array.isArray(text)) return text;
  return String(text || '').split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const [upTo, rate] = part.split(':').map((x) => x.trim());
    return { up_to: upTo ? Number(upTo) : null, rate: Number(rate) };
  });
}
