// Economics Experience: comparação de custos de processamento de adquirência.
// Todo número vem de POST /api/finance/acquiring-economics (metodologia
// acquiring-processing-cost-v2). O navegador só valida o que o usuário digitou
// e apresenta o resultado: não calcula, não normaliza mix, não persiste.
import { el, icon, moneyIn, formatDate, formatDateTime } from '../core.js';
import { button, field, toast } from '../ui.js';

const SLICES = [['share_debit', 'Débito'], ['share_credit_cash', 'Crédito à vista'], ['share_credit_installment', 'Crédito parcelado'], ['share_pix', 'PIX']];
export const COMPONENT_LABELS = Object.freeze({ debit: 'Débito (MDR)', credit_cash: 'Crédito à vista (MDR)', credit_installment: 'Crédito parcelado (MDR)', pix: 'PIX', fixed_fees: 'Tarifas fixas mensais' });
export const REASON_LABELS = Object.freeze({
  no_contract_version_for_period: 'Não há versão dos termos do contrato vigente no início do mês analisado.',
  contract_outside_period: 'O contrato não cobre o mês inteiro analisado.',
  contract_changed_in_period: 'Os termos do contrato mudaram dentro do mês analisado; escolha outro mês.',
  missing_contract_rate: 'Taxa do contrato não registrada para esta modalidade.',
  missing_proposal_rate: 'Taxa da proposta não informada para esta modalidade.',
  contract_fixed_fees_not_declared: 'Tarifas fixas do contrato não declaradas (ausência não é tarifa zero).',
  unsupported_or_unreferenced_contract_fee: 'Há tarifa do contrato em unidade diferente de mensal ou sem serviço identificado.',
  proposal_fixed_fees_not_declared: 'Gateway ou aluguel de terminal da proposta não informado.',
  additional_services_require_cost_reference: 'A proposta declara serviços adicionais sem custo de referência.',
  proposal_outside_validity: 'O mês analisado está fora da validade declarada da proposta.',
  currency_mismatch: 'Moedas diferentes entre contrato, proposta e perfil; não há conversão.'
});
export const LIMITATION_LABELS = Object.freeze({
  anticipation_not_modeled: 'Antecipação de recebíveis não está no cálculo.',
  settlement_funding_effect_not_modeled: 'O efeito financeiro do prazo de liquidação não está no cálculo.',
  taxes_not_modeled: 'Tributos não estão no cálculo.',
  transaction_fees_tiers_minima_and_caps_not_modeled: 'Tarifas por transação, faixas, pisos e tetos não estão no cálculo.',
  unrecorded_additional_charges_not_modeled: 'Cobranças não registradas não estão no cálculo.',
  installment_specific_rates_not_modeled: 'Parcelado usa uma taxa única; taxas por número de parcelas não estão no cálculo.',
  contract_transition_costs_not_modeled: 'Custos de troca e multa rescisória não estão no cálculo.'
});
const reasonText = (code) => REASON_LABELS[code] || 'Condição registrada impede comparar este componente.';
const brl = (value) => moneyIn(value, 'BRL') ?? 'Não calculado';
const pct = (value) => value === null || value === undefined ? 'Não informada' : `${String(value).replace('.', ',')}%`;
const days = (value) => value === null || value === undefined ? 'Não informado' : `${value} ${value === 1 ? 'dia' : 'dias'}`;
const lastDay = (month) => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };

/** Lê o formulário sem converter vazio em zero; devolve erros em português. */
export function readProfile(values) {
  const errors = [];
  const number = (raw) => (raw === '' || raw === null || raw === undefined ? null : Number(String(raw).replace(',', '.')));
  if (!/^\d{4}-\d{2}$/.test(values.month || '')) errors.push('Informe o mês analisado.');
  if (values.currency !== 'BRL') errors.push('Confirme a moeda. Esta análise só modela reais (BRL), sem conversão.');
  const volume = number(values.monthly_volume);
  if (volume === null || !Number.isFinite(volume) || volume < 0) errors.push('Informe o volume mensal (cartões e PIX). Vazio não é zero.');
  const shares = Object.fromEntries(SLICES.map(([key]) => [key, number(values[key])]));
  if (Object.values(shares).some((value) => value === null || !Number.isFinite(value) || value < 0 || value > 100)) errors.push('Informe as quatro participações do mix, de 0 a 100%.');
  else {
    const total = Object.values(shares).reduce((sum, value) => sum + value, 0);
    if (Math.abs(total - 100) > 1e-8) errors.push(`O mix soma ${String(Math.round(total * 100) / 100).replace('.', ',')}%. Ajuste para 100%; o Arandu não corrige sozinho.`);
  }
  const terminals = number(values.terminals);
  if (terminals === null || !Number.isInteger(terminals) || terminals < 0) errors.push('Informe a quantidade de terminais (número inteiro).');
  if (!values.source_reference || values.source_reference.trim().length < 3) errors.push('Informe a fonte dos volumes (ex.: relatório da adquirente de março).');
  if (errors.length) return { errors };
  return { profile: { period_start: `${values.month}-01`, period_end: lastDay(values.month), currency: 'BRL', monthly_volume: volume, ...shares, terminals, source_reference: values.source_reference.trim() } };
}

/** Painel: escolha da proposta, perfil declarado e resultado do backend. */
export function acquiringEconomicsPanel(ctx, { contract, proposals = [], externalCount = 0 }) {
  const root = el('section', { class: 'cc-section economics-panel', id: 'acquiring-economics', 'aria-labelledby': 'acq-econ-title' });
  const head = [el('h3', { id: 'acq-econ-title', text: 'Comparar custo de processamento: contrato × proposta' }),
    el('p', { class: 'muted small', text: 'Estimativa dos componentes declarados para um mês, com o seu volume e mix. Não é economia negociada nem realizada, não é custo financeiro total e não escolhe instituição.' })];
  const choices = proposals.flatMap((p) => (p.versions || []).map((v) => ({ id: p.id, version: v.version, label: `${p.provider_name || 'Instituição'} · versão ${v.version}${v.submitted_at ? ` enviada ${formatDate(v.submitted_at)}` : ''}` })));
  if (!choices.length) {
    root.append(...head, el('p', { class: 'callout callout-info compact', role: 'note', text: `Ainda não há proposta enviada pela instituição no portal para comparar.${externalCount ? ' Propostas registradas pela empresa (canal externo) ficam na comparação da solicitação; esta análise ainda não as usa.' : ''}` }));
    return root;
  }
  const values = {};
  const input = (name, attrs) => { const node = el('input', { name, ...attrs }); node.addEventListener('input', () => { values[name] = node.value; }); return node; };
  const proposal = el('select', { name: 'proposal' }, choices.map((c, i) => el('option', { value: String(i), text: c.label })));
  const currency = el('select', { name: 'currency' }, [el('option', { value: '', text: 'Escolha a moeda do volume' }), el('option', { value: 'BRL', text: 'Real (BRL)' })]);
  currency.addEventListener('change', () => { values.currency = currency.value; });
  const fields = [
    field({ label: 'Proposta e versão analisada', control: proposal }),
    field({ label: 'Mês analisado', control: input('month', { type: 'month', required: true }), hint: 'Um mês-calendário completo. Os termos do contrato vigentes no início do mês são a referência.' }),
    field({ label: 'Moeda do volume', control: currency, hint: 'Somente reais nesta versão; outras moedas não são convertidas.' }),
    field({ label: 'Volume financeiro mensal (cartões e PIX)', control: input('monthly_volume', { type: 'number', min: '0', step: '0.01', inputmode: 'decimal', required: true }) }),
    ...SLICES.map(([key, label]) => field({ label: `${label} (% do volume)`, control: input(key, { type: 'number', min: '0', max: '100', step: '0.01', inputmode: 'decimal', required: true }) })),
    field({ label: 'Quantidade de terminais', control: input('terminals', { type: 'number', min: '0', step: '1', inputmode: 'numeric', required: true }) }),
    field({ label: 'Fonte dos volumes', control: input('source_reference', { type: 'text', maxlength: '500', required: true, placeholder: 'Ex.: extrato da adquirente, março/2026' }), hint: 'Declaração da empresa; o Arandu não confere o conteúdo do relatório.' })
  ];
  const errors = el('div', { role: 'alert', class: 'economics-errors' });
  const result = el('div', { class: 'economics-result', 'aria-live': 'polite' });
  let busy = false;
  const submit = button('Calcular estimativa', { variant: 'primary', iconName: 'scale', onClick: async () => {
    if (busy) return;
    const read = readProfile(values);
    errors.replaceChildren(...(read.errors || []).map((text) => el('p', { class: 'small', text })));
    if (read.errors) return;
    const choice = choices[Number(proposal.value)];
    busy = true; submit.disabled = true;
    result.replaceChildren(el('p', { class: 'muted small', text: 'Calculando com os termos registrados…' }));
    try {
      const out = await ctx.api('acquiring-economics', { method: 'POST', body: JSON.stringify({ organization_id: ctx.organization.id, contract_id: contract.id, proposal_id: choice.id, proposal_version: choice.version, profile: read.profile }) });
      result.replaceChildren(renderAnalysis(ctx, out.analysis, choice));
    } catch (error) {
      // Leitura sem efeito colateral: repetir é seguro. O formulário fica preenchido.
      const message = error.status === 404 ? 'Contrato ou proposta indisponível para esta análise (produto, entidade ou acesso).'
        : error.status === 422 ? 'O histórico do contrato excede a cobertura desta análise.' : `${error.message || 'Não foi possível calcular agora.'} Os dados digitados continuam aqui; tentar de novo não grava nada.`;
      result.replaceChildren(el('p', { class: 'callout callout-danger compact', role: 'alert', text: message }));
      toast(message, 'error');
    } finally { busy = false; submit.disabled = false; }
  } });
  root.append(...head, el('div', { class: 'form-grid economics-form' }, fields), errors, el('div', { class: 'row-actions' }, [submit]), result);
  return root;
}

export function renderAnalysis(ctx, analysis, choice = null) {
  if (!analysis || analysis.valid === false) return el('div', { class: 'stack' }, [el('p', { class: 'callout callout-warning compact', role: 'note', text: 'Não foi possível comparar com o perfil informado.' }),
    el('ul', { class: 'plain-list small' }, (analysis?.reasons || []).map((code) => el('li', { text: reasonText(code) })))]);
  const t = analysis.totals || {};
  const comparable = analysis.comparable === true && t.estimated_difference !== null && t.estimated_difference !== undefined;
  const diff = t.estimated_difference;
  const headline = !comparable
    ? el('p', { class: 'callout callout-warning', role: 'status', dataset: { totals: 'not-comparable' } }, [icon('alert', { size: 16 }), el('span', { text: ' Sem total: ao menos um componente não é comparável. Os componentes com dados suficientes aparecem abaixo.' })])
    : el('div', { class: 'economics-totals', role: 'status', dataset: { totals: 'comparable' } }, [
      el('dl', { class: 'deflist deflist-3' }, [['Contrato vigente (estimado)', brl(t.contract_cost)], ['Proposta (estimado)', brl(t.proposal_cost)], ['Diferença estimada', brl(diff)]]
        .map(([label, value]) => el('div', { class: 'deflist-row' }, [el('dt', { text: label }), el('dd', { text: value })]))),
      el('p', { class: 'small', text: diff > 0 ? `No recorte modelado, a proposta custaria ${brl(diff)} a menos no mês que o contrato vigente.` : diff < 0 ? `No recorte modelado, a proposta custaria ${brl(-diff)} a mais no mês que o contrato vigente.` : 'No recorte modelado, contrato e proposta têm o mesmo custo estimado no mês.' }),
      el('p', { class: 'muted small', text: 'Diferença = contrato − proposta. É estimativa de componentes declarados, não economia negociada ou realizada.' })]);
  const rows = (analysis.components || []).map((c) => el('tr', { dataset: { component: c.key, comparable: String(Boolean(c.comparable)) } }, [
    el('th', { scope: 'row', 'data-label': 'Componente', text: COMPONENT_LABELS[c.key] || 'Componente' }),
    el('td', { 'data-label': 'Base', text: c.unit === 'per_month' ? 'Mensal' : `${brl(c.volume)} (${pct(c.share_pct)} do volume)` }),
    el('td', { 'data-label': 'Taxa contrato', text: c.unit === 'per_month' ? '—' : pct(c.contract_rate) }),
    el('td', { 'data-label': 'Taxa proposta', text: c.unit === 'per_month' ? '—' : pct(c.proposal_rate) }),
    el('td', { 'data-label': 'Contrato', text: brl(c.contract_cost) }), el('td', { 'data-label': 'Proposta', text: brl(c.proposal_cost) }),
    el('td', { 'data-label': 'Diferença', text: c.comparable ? brl(c.difference) : (c.reasons || []).map(reasonText).join(' ') })
  ]));
  const src = analysis.sources || {};
  const cond = analysis.conditions || {};
  return el('div', { class: 'stack economics-analysis' }, [
    headline,
    el('div', { class: 'table-scroll' }, el('table', { class: 'data-table compact' }, [el('caption', { class: 'sr-only', text: 'Componentes do custo estimado' }),
      el('thead', {}, el('tr', {}, ['Componente', 'Base', 'Taxa contrato', 'Taxa proposta', 'Contrato', 'Proposta', 'Diferença ou motivo'].map((h) => el('th', { scope: 'col', text: h })))), el('tbody', {}, rows)])),
    el('section', { class: 'stack' }, [el('h4', { text: 'Condições fora do custo (comparar à parte)' }), el('dl', { class: 'deflist deflist-3' }, [
      ['Liquidação no contrato', days(cond.contract_settlement_days)], ['Liquidação na proposta', days(cond.proposal_settlement_days)],
      ['Antecipação no contrato (% a.m.)', pct(cond.contract_anticipation_pct_month)], ['Antecipação na proposta (% a.m.)', pct(cond.proposal_anticipation_pct_month)]
    ].map(([label, value]) => el('div', { class: 'deflist-row' }, [el('dt', { text: label }), el('dd', { class: /Não informad/.test(value) ? 'missing' : '', text: value })])))]),
    el('details', { class: 'economics-method', open: !comparable }, [el('summary', { text: 'O que não está no cálculo e de onde vêm os números' }),
      el('ul', { class: 'plain-list small' }, (analysis.limitations || []).map((code) => el('li', { text: LIMITATION_LABELS[code] || 'Item não modelado.' }))),
      el('p', { class: 'small', text: `Período: ${formatDate(analysis.profile?.period_start)} a ${formatDate(analysis.profile?.period_end)} · volume ${brl(analysis.profile?.monthly_volume)} · fonte declarada: ${analysis.profile?.source_reference || 'não informada'}.` }),
      el('p', { class: 'small', text: `Contrato: termos versão ${src.contract?.version ?? 'não identificada'}${src.contract?.effective_from ? ` (vigente desde ${formatDate(src.contract.effective_from)})` : ''}${src.contract?.amendment_id ? ', via aditivo' : ''}. Proposta: versão ${src.proposal?.version ?? choice?.version ?? '—'}${src.proposal?.submitted_at ? `, enviada em ${formatDateTime(src.proposal.submitted_at)}` : ''} pela instituição no portal.` }),
      el('p', { class: 'muted small', text: 'Fórmula por modalidade: volume × participação × taxa, arredondado a centavos. Tarifas fixas: soma das mensais declaradas no contrato; proposta = terminais × aluguel + gateway. Nada foi gravado.' }),
      el('nav', { class: 'row-actions' }, [src.contract?.href ? el('a', { href: ctx.href(src.contract.href), text: 'Abrir contrato' }) : null, src.proposal?.href ? el('a', { href: ctx.href(src.proposal.href), text: 'Abrir solicitação' }) : null].filter(Boolean))])
  ]);
}
