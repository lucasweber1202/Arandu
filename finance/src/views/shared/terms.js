// Termos de proposta: definições, cobertura, resumo e diferenças entre revisões.
// Extraído de views/shared.js (v7.0): dependências específicas, sem barrel.

import { PRODUCTS } from '../../../../lib/finance/products.mjs';
import { el, icon, money, fieldValue, formatDate } from '../../core.js';
import { field } from '../../ui.js';

export const DEFINITIONS = Object.freeze({
  interest_rate_month: 'Taxa nominal mensal informada pelo provedor. Não inclui tarifas nem tributos.',
  cet_year: 'Custo Efetivo Total anual declarado pelo provedor: juros, tarifas, tributos e seguros. O Arandu não calcula CET.',
  index_spread: 'Acréscimo anual sobre o indexador (CDI, IPCA…). O custo final depende da variação futura do índice.',
  grace_months: 'Meses iniciais sem pagamento de principal. O tratamento dos juros na carência varia por contrato.',
  amortization: 'PRICE: parcelas iguais. SAC: amortização constante, parcelas decrescentes. Bullet: principal no fim.',
  fees_amount: 'Tarifas pontuais informadas (cadastro, estruturação, registro).',
  declared_total_cost: 'Custo total informado pelo próprio provedor para a operação.',
  mdr_debit: 'Merchant Discount Rate: percentual retido pelo adquirente em cada venda no débito.',
  mdr_credit_cash: 'Percentual retido em vendas no crédito à vista.',
  mdr_credit_installment: 'Percentual retido em vendas parceladas.',
  pix_fee: 'Percentual cobrado sobre recebimentos via PIX.',
  anticipation_rate: 'Taxa mensal para receber antes do prazo de liquidação.',
  settlement_days: 'Dias entre a venda e o crédito na conta (D+N).',
  early_exit_penalty: 'Multa por encerrar o contrato antes do prazo.',
  contracting_days: 'Tempo estimado pelo provedor entre a escolha e a operação disponível.',
  valid_until: 'Data até a qual o provedor mantém as condições propostas.'
});

export function fieldsByKey(product) { return Object.fromEntries(PRODUCTS[product].proposalFields.map((field) => [field.key, field])); }

export function coverage(product, terms) {
  const comparable = PRODUCTS[product].proposalFields.filter((field) => field.comparable);
  const filled = comparable.filter((field) => terms?.[field.key] !== undefined && terms?.[field.key] !== null && terms?.[field.key] !== '').length;
  return { filled, total: comparable.length, ratio: comparable.length ? filled / comparable.length : 0 };
}

export function definitionTip(key) {
  const text = DEFINITIONS[key];
  if (!text) return null;
  const id = `def-${key}-${Math.random().toString(36).slice(2, 7)}`;
  return el('span', { class: 'tip' }, [
    el('button', { type: 'button', class: 'tip-trigger', 'aria-label': 'O que é isto?', 'aria-describedby': id }, icon('info', { size: 13 })),
    el('span', { role: 'tooltip', id, class: 'tip-text', text })
  ]);
}

export function revisionDiff(product, before, after) {
  if (!before || !after) return [];
  const labels = [['title', 'Título'], ['response_deadline', 'Prazo de resposta'], ['description', 'Descrição'],
    ...PRODUCTS[product].demandFields.map((field) => [field.key, field.label, field])];
  const changes = [];
  for (const [key, label, spec] of labels) {
    const a = key in (before.demand || {}) || key in (after.demand || {}) ? before.demand?.[key] : before[key];
    const b = key in (before.demand || {}) || key in (after.demand || {}) ? after.demand?.[key] : after[key];
    if (JSON.stringify(a ?? null) === JSON.stringify(b ?? null)) continue;
    const format = (value) => (spec ? fieldValue(spec, value) : key === 'response_deadline' ? formatDate(value) : value) ?? 'não informado';
    // Descrição: mostra o trecho real, encurtado, em vez de um marcador genérico.
    const excerpt = (value) => { const text = String(value ?? '').replace(/\s+/g, ' ').trim(); return text ? (text.length > 90 ? `${text.slice(0, 90)}…` : text) : 'sem descrição'; };
    changes.push({ label, before: key === 'description' ? excerpt(a) : format(a), after: key === 'description' ? excerpt(b) : format(b) });
  }
  return changes;
}

export function keyTerms(product, terms, money = {}) {
  const keys = product === 'credit' ? ['offered_amount', 'interest_rate_month', 'cet_year', 'term_months', 'grace_months']
    : ['mdr_debit', 'mdr_credit_cash', 'mdr_credit_installment', 'pix_fee', 'anticipation_rate', 'settlement_days'];
  const specs = Object.fromEntries(PRODUCTS[product].proposalFields.map((spec) => [spec.key, spec]));
  return el('dl', { class: 'key-terms' }, keys.map((key) => {
    // O rótulo curto perde a unidade do parênteses; ela volta junto do valor.
    const unit = (specs[key].label.match(/\(([^)]*)\)$/) || [])[1] || '';
    const suffix = { meses: ' meses', dias: ' dias', '% a.m.': ' a.m.', '% a.a.': ' a.a.' }[unit] || '';
    const raw = fieldValue(specs[key], terms?.[key], money);
    const value = raw === null ? null : `${raw}${suffix}`;
    return el('div', { class: 'key-term' }, [el('dt', { text: specs[key].label.replace(/\s*\(.*\)$/, '') }), el('dd', { class: value === null ? 'missing' : '', text: value ?? '—' })]);
  }));
}

// Linha curta com as condições principais, para listas. Ausente aparece como
// "não informado", nunca como zero; a unidade acompanha o valor.

export function termsSummary(product, terms) {
  const keys = product === 'credit' ? ['offered_amount', 'interest_rate_month', 'term_months'] : ['mdr_debit', 'mdr_credit_cash', 'settlement_days'];
  const specs = Object.fromEntries((PRODUCTS[product]?.proposalFields || []).map((spec) => [spec.key, spec]));
  return keys.filter((key) => specs[key]).map((key) => {
    const spec = specs[key];
    const unit = (spec.label.match(/\(([^)]*)\)$/) || [])[1] || '';
    const raw = fieldValue(spec, terms?.[key]);
    // Singular quando o valor é 1 ("1 dia", não "1 dias").
    const one = Number(terms?.[key]) === 1;
    const suffix = { meses: one ? ' mês' : ' meses', dias: one ? ' dia' : ' dias', '% a.m.': ' a.m.', '% a.a.': ' a.a.' }[unit] || '';
    return `${spec.label.replace(/\s*\(.*\)$/, '')}: ${raw === null ? 'não informado' : `${raw}${suffix}`}`;
  }).join(' · ');
}

// Quem o banco deixa criar e alterar tarefas (políticas fin_task_write/fin_task_edit).
// Leitor acompanha: a interface não oferece um controle que o servidor ignoraria.
