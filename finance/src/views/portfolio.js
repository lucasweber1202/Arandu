import { graphContextCard } from './graph-context.js';
// Financial Portfolio: dívida, facilities, limites e garantias.
//
// Visão de procurement e relacionamento, não ledger: saldo e uso de limite
// são fotografias datadas registradas pela empresa (com origem), e toda visão
// é por moeda — nada é somado entre moedas. Ausência de dado aparece como
// ausência. Nenhuma métrica é nota, risco ou recomendação.

import { el, icon, formatDate, percent, enumLabel } from '../core.js';
import { card, button, tag, field, drawer, toast, emptyState, errorState, loading } from '../ui.js';
import { FACILITY_KINDS, GUARANTEE_KINDS } from '../../../lib/finance/portfolio.mjs';
import { INDEXERS, AMORTIZATION } from '../../../lib/finance/contract-terms.mjs';
import { entityTree } from '../../../lib/finance/entities.mjs';
import { loadEntities, entityName, entityContextSelect, inContext } from './entities.js';

const SOURCES = { declared: 'Declarado pela empresa', contract: 'Contrato', import: 'Importação', integration: 'Integração', statement: 'Extrato' };

function amount(value, currency) {
  if (value === null || value === undefined || value === '') return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(value));
}

function stat(label, value, hint) {
  return el('div', { class: 'portfolio-stat' }, [el('span', { class: 'portfolio-stat-label', text: label }), el('strong', { class: 'portfolio-stat-value', text: value }), hint ? el('span', { class: 'muted small', text: hint }) : null]);
}

function shareList(rows, currency, labelOf = (row) => row.key) {
  if (!rows.length) return el('p', { class: 'muted small', text: 'Sem saldo conhecido.' });
  return el('ul', { class: 'share-list', role: 'list' }, rows.map((row) => el('li', { class: 'share-row' }, [
    el('span', { class: 'share-label', text: labelOf(row) }),
    el('span', { class: 'share-bar', 'aria-hidden': 'true' }, el('span', { class: 'share-fill', style: `width:${Math.max(2, Math.min(100, row.share_pct || 0))}%` })),
    el('span', { class: 'share-value', text: `${amount(row.amount, currency)} · ${percent(row.share_pct)}` })
  ])));
}

function currencyCard(view, definitions) {
  const wall = view.maturity_wall.length ? el('div', { class: 'table-scroll' }, el('table', { class: 'data-table compact maturity-table' }, [
    el('thead', {}, el('tr', {}, ['Ano', 'Cronograma declarado', 'Saldo no vencimento final'].map((label) => el('th', { scope: 'col', text: label })))),
    el('tbody', {}, view.maturity_wall.map((row) => el('tr', {}, [el('td', { 'data-label': 'Ano', text: row.year }), el('td', { 'data-label': 'Cronograma declarado', text: amount(row.scheduled, view.currency) }),
      el('td', { 'data-label': 'Saldo no vencimento final', text: amount(row.final_balance, view.currency) })])))
  ])) : el('p', { class: 'muted small', text: 'Sem vencimentos futuros com cronograma ou saldo conhecido.' });
  return card({
    title: `Portfólio em ${view.currency}`, subtitle: `${view.facilities} facility(ies) ativa(s)`, className: 'portfolio-currency',
    body: [
      el('div', { class: 'portfolio-stats' }, [
        stat('Limite aprovado', amount(view.approved_limit, view.currency), definitions.approved_limit),
        stat('Limite usado', amount(view.used_limit, view.currency), view.limit_without_usage ? `${view.limit_without_usage} facility(ies) sem uso registrado` : null),
        stat('Limite disponível', amount(view.available_limit, view.currency), definitions.available_limit),
        stat('Saldo devedor conhecido', amount(view.outstanding, view.currency), view.outstanding_unknown ? `${view.outstanding_unknown} facility(ies) sem saldo registrado` : null)
      ]),
      el('div', { class: 'portfolio-grid' }, [
        el('section', {}, [el('h3', { text: 'Vencimentos por ano' }), wall, el('p', { class: 'muted small', text: definitions.maturity_wall })]),
        el('section', {}, [el('h3', { text: 'Mix de indexadores' }), shareList(view.indexer_mix, view.currency, (row) => (row.key === 'nao_informado' ? 'Não informado' : row.key.toUpperCase())),
          el('p', { class: 'muted small', text: definitions.indexer_mix })]),
        el('section', {}, [el('h3', { text: 'Participação por provedor (saldo)' }), shareList(view.provider_concentration.outstanding, view.currency, (row) => row.provider),
          el('p', { class: 'muted small', text: definitions.provider_concentration })])
      ])
    ]
  });
}

export async function portfolio(ctx) {
  const entities = await loadEntities(ctx);
  const manage = ctx.can('edit_profile');
  const context = entityContextSelect(entities, { onChange: () => ctx.rerender() });
  const add = manage ? button('Registrar facility', { variant: 'primary', iconName: 'plus', onClick: () => facilityForm(ctx, entities) }) : null;
  const addGuarantee = manage ? button('Registrar garantia', { iconName: 'shield', onClick: () => guaranteeForm(ctx, entities, null) }) : null;
  ctx.header({ title: 'Dívida, limites e garantias', subtitle: 'Visão de procurement e relacionamento, por moeda. Dados registrados pela empresa, com origem e data.', actions: [context, addGuarantee, add].filter(Boolean) });
  const root = el('div', { class: 'stack portfolio' }, loading('Carregando portfólio…'));
  let horizon = 12;
  const load = async () => {
    try {
      const result = await ctx.api(`portfolio?organization_id=${encodeURIComponent(ctx.organization.id)}&horizon_months=${horizon}`);
      root.replaceChildren(...render(result));
    } catch (error) {
      root.replaceChildren(error.status === 404 ? emptyState({ title: 'Portfólio indisponível neste ambiente', iconName: 'layers', text: 'A visão de dívida e limites não está disponível aqui.' }) : errorState({ error, onRetry: load }));
    }
  };

  function render(result) {
    const facilities = result.facilities.filter((row) => inContext(entities, row));
    const guarantees = result.guarantees.filter((row) => inContext(entities, row));
    if (!result.facilities.length && !result.guarantees.length) {
      return [emptyState({ title: 'Nenhuma facility registrada', iconName: 'layers', text: 'Registre empréstimos, linhas e limites atuais com a origem de cada dado. O Arandu organiza vencimentos, limites e concentração; não calcula juros nem substitui a contabilidade.', action: add })];
    }
    const filtered = facilities.length !== result.facilities.length;
    const out = [];
    if (filtered) out.push(el('p', { class: 'callout callout-info compact' }, [icon('info', { size: 14 }), el('span', { text: 'Os totais por moeda consideram todo o seu escopo de acesso; a lista abaixo segue a entidade em foco.' })]));
    out.push(...result.views.currencies.map((view) => currencyCard(view, result.views.definitions)));

    const horizonSelect = el('select', { 'aria-label': 'Horizonte de refinanciamento' });
    for (const months of [3, 6, 12, 18, 24, 36]) horizonSelect.add(new Option(`${months} meses`, String(months)));
    horizonSelect.value = String(horizon);
    horizonSelect.addEventListener('change', () => { horizon = Number(horizonSelect.value); root.replaceChildren(loading()); load(); });
    out.push(card({
      title: 'Janelas de refinanciamento', subtitle: result.views.definitions.refinancing_window, actions: [horizonSelect],
      body: result.views.refinancing_windows.length ? el('ul', { class: 'mini-list', role: 'list' }, result.views.refinancing_windows.map((row) => el('li', { class: 'mini-row' }, [
        el('span', { class: 'mini-icon tone-warning' }, icon('calendar', { size: 14 })),
        el('div', { class: 'mini-main' }, [el('strong', { text: row.name }), el('span', { class: 'mini-meta', text: `${row.provider || 'Provedor'} · ${entityName(entities, row.legal_entity_id)} · saldo ${amount(row.outstanding, row.currency)}${row.as_of ? ` em ${formatDate(row.as_of)}` : ''}` })]),
        el('span', { class: 'mini-side warn', text: formatDate(row.maturity_on) })
      ]))) : el('p', { class: 'muted', text: 'Nenhum vencimento final no horizonte escolhido.' })
    }));

    out.push(card({ title: 'Facilities', subtitle: 'Cada facility mostra a origem e a última confirmação do dado.', body: facilityTable(ctx, entities, facilities, result) }));
    out.push(card({
      title: 'Garantias comprometidas', subtitle: result.views.definitions.committed_guarantees,
      body: [
        ...result.views.guarantees.map((view) => el('div', { class: 'guarantee-summary' }, [el('strong', { text: `${view.currency}: ${amount(view.committed, view.currency)} em ${view.count} garantia(s) ativa(s)` }),
          view.unknown_amount ? el('span', { class: 'muted small', text: ` · ${view.unknown_amount} sem valor registrado` }) : null])),
        guarantees.length ? el('ul', { class: 'plain-list guarantee-list' }, guarantees.map((row) => el('li', {}, [
          el('strong', { text: GUARANTEE_KINDS[row.kind] || row.kind }), el('span', { text: ` · ${row.description} · ${amount(row.committed_amount, row.currency)} · ${entityName(entities, row.legal_entity_id)}` }),
          row.status !== 'active' ? tag(row.status === 'released' ? 'liberada' : 'expirada') : null,
          manage ? button('Editar', { size: 'sm', variant: 'ghost', onClick: () => guaranteeForm(ctx, entities, row, result) }) : null
        ]))) : el('p', { class: 'muted', text: 'Nenhuma garantia registrada.' })
      ]
    }));
    if (result.views.review_due.length) {
      out.push(el('p', { class: 'callout callout-warning' }, [icon('alert'), el('span', { text: `${result.views.review_due.length} facility(ies) com dado vencido para revisão: ${result.views.review_due.map((row) => row.name).join(', ')}. Confirme ou atualize.` })]));
    }
    out.push(el('p', { class: 'muted small', text: result.boundary }));
    return out;
  }

  load();
  return root;
}

function facilityTable(ctx, entities, facilities, result) {
  if (!facilities.length) return el('p', { class: 'muted', text: 'Nenhuma facility nesta entidade.' });
  const manage = ctx.can('edit_profile');
  const latest = new Map();
  for (const row of result.balances) if (!latest.has(row.facility_id)) latest.set(row.facility_id, row);
  const table = el('table', { class: 'data-table facility-table' });
  table.append(el('thead', {}, el('tr', {}, ['Facility', 'Entidade', 'Limite / principal', 'Último saldo / uso', 'Vencimento', 'Origem', ''].map((label) => el('th', { scope: 'col', text: label })))));
  const body = el('tbody');
  for (const facility of facilities) {
    const snapshot = latest.get(facility.id);
    body.append(el('tr', { dataset: { entity: 'facility', id: facility.id } }, [
      el('td', { 'data-label': 'Facility', class: 'cell-primary' }, [el('strong', { text: facility.name }), el('span', { class: 'row-sub', text: `${FACILITY_KINDS[facility.kind]} · ${facility.provider_name}${facility.indexer ? ` · ${facility.indexer.toUpperCase()}${facility.spread_pct_year !== null && facility.spread_pct_year !== undefined ? ` + ${percent(facility.spread_pct_year)} a.a.` : ''}` : ''}` })]),
      el('td', { 'data-label': 'Entidade', text: entityName(entities, facility.legal_entity_id) }),
      el('td', { 'data-label': 'Limite / principal', text: facility.approved_limit !== null && facility.approved_limit !== undefined ? amount(facility.approved_limit, facility.currency) : amount(facility.principal_amount, facility.currency) }),
      el('td', { 'data-label': 'Último saldo / uso', text: snapshot ? `${amount(snapshot.outstanding_amount ?? snapshot.used_limit_amount, facility.currency)} em ${formatDate(snapshot.as_of)} (${SOURCES[snapshot.source] || snapshot.source})` : 'Sem fotografia registrada' }),
      el('td', { 'data-label': 'Vencimento', text: facility.maturity_on ? formatDate(facility.maturity_on) : '—' }),
      el('td', { 'data-label': 'Origem', text: `${SOURCES[facility.source] || facility.source}${facility.verified_at ? ` · confirmado ${formatDate(facility.verified_at)}` : ''}` }),
      el('td', { 'data-label': 'Ações' }, [button('Relações', { size: 'sm', onClick: () => drawer({ title: facility.name, body: graphContextCard(ctx, { type: 'facility', id: facility.id }) }) }), manage ? el('div', { class: 'row-actions' }, [
        button('Saldo', { size: 'sm', onClick: () => balanceForm(ctx, facility) }),
        button('Cronograma', { size: 'sm', variant: 'ghost', onClick: () => scheduleForm(ctx, facility) }),
        button('Confirmar', { size: 'sm', variant: 'ghost', onClick: async () => { try { await ctx.api('facilities/confirm', { method: 'POST', body: JSON.stringify({ facility_id: facility.id }) }); toast('Dado confirmado como atual.'); ctx.reload(); } catch (error) { toast(error.message, 'error'); } } }),
        button('Editar', { size: 'sm', variant: 'ghost', onClick: () => facilityForm(ctx, entities, facility) })
      ]) : null])
    ]));
  }
  table.append(body);
  return el('div', { class: 'table-scroll' }, table);
}

function select(name, options, value = '') {
  const control = el('select', { name });
  for (const [optionValue, label] of options) control.add(new Option(label, optionValue));
  // Sem valor válido, fica a primeira opção (um select nunca fica sem seleção).
  if ([...control.options].some((option) => option.value === String(value ?? ''))) control.value = String(value ?? '');
  return control;
}
function entitySelect(entities, value) {
  const options = entities.scope === 'group' ? [['', 'Nível de grupo']] : [];
  for (const row of entityTree(entities.rows)) if (row.status === 'active') options.push([row.id, `${row.depth ? '— ' : ''}${row.short_name || row.legal_name}`]);
  return select('legal_entity_id', options, value || '');
}

function submitDrawer({ title, subtitle, form, onSubmit, label }) {
  const save = button(label, { variant: 'primary', type: 'submit', iconName: 'check', attrs: { form: form.id } });
  const dialog = drawer({ title, subtitle, body: form, footer: [button('Cancelar', { variant: 'ghost', onClick: () => dialog.close() }), save] });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    save.disabled = true;
    try { if (await onSubmit()) dialog.close(); } catch (error) { toast(error.message, 'error'); } finally { save.disabled = false; }
  });
  return dialog;
}

function facilityForm(ctx, entities, facility = null) {
  const value = (key) => facility?.[key] ?? '';
  const form = el('form', { class: 'field-grid', id: 'facility-form', novalidate: true });
  const controls = {
    name: el('input', { name: 'name', maxlength: '200', value: value('name') }),
    kind: select('kind', Object.entries(FACILITY_KINDS), value('kind') || 'term_loan'),
    provider_id: select('provider_id', (ctx.data.providers || []).map((row) => [row.id, row.name]), value('provider_id')),
    legal_entity_id: entitySelect(entities, value('legal_entity_id')),
    currency: el('input', { name: 'currency', maxlength: '3', class: 'input-short', value: value('currency') || 'BRL' }),
    approved_limit: el('input', { name: 'approved_limit', type: 'number', min: '0', step: 'any', value: value('approved_limit') }),
    principal_amount: el('input', { name: 'principal_amount', type: 'number', min: '0', step: 'any', value: value('principal_amount') }),
    indexer: select('indexer', [['', 'Não informado'], ...INDEXERS.map((item) => [item, item.toUpperCase()])], value('indexer')),
    spread_pct_year: el('input', { name: 'spread_pct_year', type: 'number', step: 'any', value: value('spread_pct_year') }),
    amortization: select('amortization', [['', 'Não informado'], ...AMORTIZATION.map((item) => [item, enumLabel(item)])], value('amortization')),
    starts_on: el('input', { name: 'starts_on', type: 'date', value: value('starts_on') }),
    maturity_on: el('input', { name: 'maturity_on', type: 'date', value: value('maturity_on') }),
    source: select('source', [['declared', SOURCES.declared], ['contract', SOURCES.contract], ['import', SOURCES.import]], value('source') || 'declared'),
    source_reference: el('input', { name: 'source_reference', maxlength: '300', value: value('source_reference'), placeholder: 'Ex.: CCB 123, aditivo 2' }),
    review_after_days: el('input', { name: 'review_after_days', type: 'number', min: '7', max: '1825', value: value('review_after_days') || '90' })
  };
  form.append(
    field({ label: 'Nome', control: controls.name, required: true }), field({ label: 'Tipo', control: controls.kind }),
    field({ label: 'Provedor', control: controls.provider_id, required: true }), entities.rows.length ? field({ label: 'Entidade devedora', control: controls.legal_entity_id }) : null,
    field({ label: 'Moeda', control: controls.currency }), field({ label: 'Limite aprovado', control: controls.approved_limit, optionalLabel: true }),
    field({ label: 'Principal contratado', control: controls.principal_amount, optionalLabel: true, hint: 'Informe limite ou principal (ou os dois).' }),
    field({ label: 'Indexador', control: controls.indexer }), field({ label: 'Spread (% a.a.)', control: controls.spread_pct_year, optionalLabel: true }),
    field({ label: 'Amortização', control: controls.amortization }), field({ label: 'Início', control: controls.starts_on, optionalLabel: true }),
    field({ label: 'Vencimento final', control: controls.maturity_on, optionalLabel: true }), field({ label: 'Origem do dado', control: controls.source }),
    field({ label: 'Referência da origem', control: controls.source_reference, optionalLabel: true }), field({ label: 'Revisar a cada (dias)', control: controls.review_after_days })
  );
  return submitDrawer({ title: facility ? 'Editar facility' : 'Registrar facility', subtitle: 'Alterações ficam no histórico da facility.', form, label: facility ? 'Salvar' : 'Registrar', onSubmit: async () => {
    if (controls.name.value.trim().length < 2 || !controls.provider_id.value) { toast('Informe nome e provedor.', 'error'); return false; }
    const body = Object.fromEntries(Object.entries(controls).map(([key, control]) => [key, control.value.trim?.() ?? control.value]));
    for (const key of Object.keys(body)) if (body[key] === '') delete body[key];
    await ctx.api('facilities', { method: 'POST', body: JSON.stringify({ organization_id: ctx.organization.id, ...(facility ? { facility_id: facility.id } : {}), ...body }) });
    toast(facility ? 'Facility atualizada.' : 'Facility registrada.');
    ctx.reload();
    return true;
  } });
}

function balanceForm(ctx, facility) {
  const asOf = el('input', { type: 'date', name: 'as_of', required: true, value: new Date().toISOString().slice(0, 10) });
  const outstanding = el('input', { type: 'number', min: '0', step: 'any', name: 'outstanding_amount' });
  const used = el('input', { type: 'number', min: '0', step: 'any', name: 'used_limit_amount' });
  const source = select('source', [['declared', SOURCES.declared], ['statement', SOURCES.statement], ['import', SOURCES.import]], 'declared');
  const reference = el('input', { name: 'source_reference', maxlength: '300' });
  const form = el('form', { class: 'field-grid', id: 'balance-form', novalidate: true }, [
    field({ label: 'Data de referência', control: asOf, required: true }), field({ label: 'Saldo devedor', control: outstanding, optionalLabel: true }),
    field({ label: 'Uso do limite', control: used, optionalLabel: true }), field({ label: 'Origem', control: source }), field({ label: 'Referência', control: reference, optionalLabel: true }),
    el('p', { class: 'muted small span-2', text: 'Cada fotografia é guardada com data e origem; fotografias anteriores não são alteradas.' })]);
  return submitDrawer({ title: `Saldo de ${facility.name}`, form, label: 'Registrar fotografia', onSubmit: async () => {
    if (!outstanding.value && !used.value) { toast('Informe saldo devedor ou uso do limite.', 'error'); return false; }
    await ctx.api('facility-balances', { method: 'POST', body: JSON.stringify({ facility_id: facility.id, as_of: asOf.value, outstanding_amount: outstanding.value || null, used_limit_amount: used.value || null, source: source.value, source_reference: reference.value || null }) });
    toast('Fotografia de saldo registrada.');
    ctx.reload();
    return true;
  } });
}

function scheduleForm(ctx, facility) {
  const rows = el('div', { class: 'schedule-rows' });
  const addRow = () => {
    const due = el('input', { type: 'date', 'aria-label': 'Vencimento da parcela' });
    const principal = el('input', { type: 'number', min: '0', step: 'any', 'aria-label': 'Principal da parcela' });
    const row = el('div', { class: 'fee-row' }, [due, principal, button('Remover', { size: 'sm', variant: 'ghost', onClick: () => row.remove() })]);
    row.read = () => (due.value && principal.value !== '' ? { due_on: due.value, principal_amount: Number(principal.value) } : null);
    rows.append(row);
  };
  addRow();
  const form = el('form', { class: 'stack', id: 'schedule-form', novalidate: true }, [
    el('p', { class: 'muted small', text: `Cronograma declarado de amortização (versão atual: ${facility.schedule_version || 0}). Registrar substitui como nova versão; a anterior continua no histórico.` }),
    rows, button('Adicionar parcela', { size: 'sm', iconName: 'plus', onClick: addRow })]);
  return submitDrawer({ title: `Cronograma de ${facility.name}`, form, label: 'Registrar cronograma', onSubmit: async () => {
    const items = [...rows.children].map((row) => row.read()).filter(Boolean);
    if (!items.length) { toast('Informe ao menos uma parcela com data e principal.', 'error'); return false; }
    await ctx.api('facility-schedule', { method: 'POST', body: JSON.stringify({ facility_id: facility.id, expected_version: facility.schedule_version || 0, items }) });
    toast('Cronograma registrado.');
    ctx.reload();
    return true;
  } });
}

function guaranteeForm(ctx, entities, guarantee = null, result = null) {
  const value = (key) => guarantee?.[key] ?? '';
  const controls = {
    kind: select('kind', Object.entries(GUARANTEE_KINDS), value('kind') || 'receivables'),
    description: el('input', { name: 'description', maxlength: '500', value: value('description') }),
    legal_entity_id: entitySelect(entities, value('legal_entity_id')),
    currency: el('input', { name: 'currency', maxlength: '3', class: 'input-short', value: value('currency') || 'BRL' }),
    committed_amount: el('input', { name: 'committed_amount', type: 'number', min: '0', step: 'any', value: value('committed_amount') }),
    facility_id: select('facility_id', [['', 'Nenhuma'], ...((result?.facilities || []).map((row) => [row.id, row.name]))], value('facility_id')),
    starts_on: el('input', { name: 'starts_on', type: 'date', value: value('starts_on') }),
    ends_on: el('input', { name: 'ends_on', type: 'date', value: value('ends_on') }),
    status: select('status', [['active', 'Ativa'], ['released', 'Liberada'], ['expired', 'Expirada']], value('status') || 'active')
  };
  const form = el('form', { class: 'field-grid', id: 'guarantee-form', novalidate: true }, [
    field({ label: 'Tipo', control: controls.kind }), field({ label: 'Descrição', control: controls.description, required: true }),
    entities.rows.length ? field({ label: 'Entidade', control: controls.legal_entity_id }) : null, field({ label: 'Moeda', control: controls.currency }),
    field({ label: 'Valor comprometido', control: controls.committed_amount, optionalLabel: true }), field({ label: 'Facility vinculada', control: controls.facility_id }),
    field({ label: 'Início', control: controls.starts_on, optionalLabel: true }), field({ label: 'Fim', control: controls.ends_on, optionalLabel: true }), field({ label: 'Estado', control: controls.status })]);
  return submitDrawer({ title: guarantee ? 'Editar garantia' : 'Registrar garantia', form, label: 'Salvar', onSubmit: async () => {
    if (controls.description.value.trim().length < 3) { toast('Descreva a garantia.', 'error'); return false; }
    const body = Object.fromEntries(Object.entries(controls).map(([key, control]) => [key, control.value.trim?.() ?? control.value]));
    for (const key of Object.keys(body)) if (body[key] === '') delete body[key];
    await ctx.api('guarantees', { method: 'POST', body: JSON.stringify({ organization_id: ctx.organization.id, ...(guarantee ? { guarantee_id: guarantee.id } : {}), ...body }) });
    toast('Garantia salva.');
    ctx.reload();
    return true;
  } });
}

