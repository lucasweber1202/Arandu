// Termos contratuais por categoria: valor, lista e editor (semântica do catálogo canônico).
// Extraído de views/contract-center.js (v7.0).

import { el, money, percent, enumLabel } from '../../core.js';
import { button, field, catalogControl } from '../../ui.js';
import { FEE_UNITS, contractTermFields } from '../../../../lib/finance/contract-terms.mjs';

const FEE_UNIT_LABELS = {
  per_month: 'por mês', per_transaction: 'por transação', per_item: 'por item', percent_of_volume: '% do volume',
  percent_of_amount: '% do valor', one_off: 'única', per_year: 'por ano'
};

export function termValue(spec, value, currency) {
  if (value === null || value === undefined || value === '') return null;
  if (spec.type === 'fees') return value.map((fee) => `${fee.service}: ${fee.unit.startsWith('percent') ? percent(fee.amount) : money(fee.amount)} ${FEE_UNIT_LABELS[fee.unit] || fee.unit}`).join(' · ');
  if (spec.type === 'money') return currency && currency !== 'BRL' ? `${currency} ${Number(value).toLocaleString('pt-BR')}` : money(value);
  if (spec.type === 'percent') return percent(value);
  if (spec.type === 'enum') return enumLabel(value);
  return String(value);
}

export function termsList(category, terms, currency) {
  const rows = contractTermFields(category).map((spec) => [spec, termValue(spec, terms?.[spec.key], terms?.currency || currency)]).filter(([, value]) => value !== null);
  if (!rows.length) return el('p', { class: 'muted', text: 'Nenhum termo estruturado registrado ainda.' });
  return el('dl', { class: 'deflist deflist-2' }, rows.map(([spec, value]) => el('div', { class: 'deflist-row' }, [el('dt', { text: spec.label }), el('dd', { text: value })])));
}

/** Editor de termos do catálogo (com tarifas como linhas). */

export function termsEditor(category, initial = {}) {
  const wrap = el('div', { class: 'field-grid terms-editor' });
  const controls = new Map();
  for (const spec of contractTermFields(category)) {
    if (spec.type === 'fees') continue;
    const control = spec.type === 'currency' ? el('input', { name: spec.key, maxlength: '3', class: 'input-short', value: initial[spec.key] || '' }) : catalogControl(spec, initial[spec.key] ?? null);
    controls.set(spec.key, { spec, control });
    wrap.append(field({ label: spec.label, control, optionalLabel: true, className: spec.type === 'text' && (spec.max ?? 0) > 400 ? 'span-2' : '' }));
  }
  const fees = el('div', { class: 'fee-rows span-2' });
  const addFee = (fee = {}) => {
    const service = el('input', { maxlength: '120', placeholder: 'Serviço (ex.: TED, PIX enviado)', value: fee.service || '', 'aria-label': 'Serviço da tarifa' });
    const unit = el('select', { 'aria-label': 'Unidade de cobrança' });
    for (const value of FEE_UNITS) unit.add(new Option(FEE_UNIT_LABELS[value], value));
    unit.value = fee.unit || 'per_transaction';
    const amount = el('input', { type: 'number', step: 'any', min: '0', value: fee.amount ?? '', 'aria-label': 'Valor contratado' });
    const row = el('div', { class: 'fee-row' }, [service, unit, amount, button('Remover', { size: 'sm', variant: 'ghost', onClick: () => row.remove() })]);
    row.read = () => (service.value.trim() ? { service: service.value.trim(), unit: unit.value, amount: Number(amount.value) } : null);
    fees.append(row);
  };
  for (const fee of initial.fees || []) addFee(fee);
  wrap.append(el('div', { class: 'span-2' }, [el('p', { class: 'field-label', text: 'Tarifas contratadas' }), fees,
    button('Adicionar tarifa', { size: 'sm', iconName: 'plus', onClick: () => addFee() })]));
  wrap.read = () => {
    const terms = {};
    for (const [key, { spec, control }] of controls) {
      const value = String(control.value || '').trim();
      if (!value) continue;
      terms[key] = ['money', 'percent', 'int', 'number'].includes(spec.type) ? Number(value) : spec.type === 'currency' ? value.toUpperCase() : value;
    }
    const feeRows = [...fees.children].map((row) => row.read()).filter(Boolean);
    if (feeRows.length) terms.fees = feeRows;
    return terms;
  };
  /** Preenche só campo vazio; devolve 'filled', 'same' ou 'kept' (a pessoa já digitou outro valor). */
  wrap.fillIfEmpty = (key, value, hint) => {
    const entry = controls.get(key);
    if (!entry) return 'kept';
    const current = String(entry.control.value || '').trim();
    if (current && current.toLowerCase() !== String(value).toLowerCase() && Number(current) !== Number(value)) return 'kept';
    if (current) return 'same';
    entry.control.value = String(value);
    entry.control.dispatchEvent(new Event('input', { bubbles: true }));
    const holder = entry.control.closest('.field');
    if (holder && hint) holder.append(el('p', { class: 'field-hint field-source', text: hint }));
    return 'filled';
  };
  return wrap;
}
