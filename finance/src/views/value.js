import { el } from '../core.js';
import { card, button, field, drawer, loading, errorState, emptyState, toast } from '../ui.js';
import { VALUE_KINDS, VALUE_CURRENCIES, VALUE_DIMENSIONS, validateValueInput } from '../../../lib/finance/value-realization.mjs';
import { loadEntities, entityName } from './entities.js';
import { graphContextCard } from './graph-context.js';

const money = (n, currency) => n === null || n === undefined ? 'Sem cálculo defensável' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(Number(n));
const select = (options) => el('select', {}, options.map(([value, text]) => el('option', { value, text })));
const DIMENSIONS = { service: 'Serviço', unit: 'Unidade econômica', volume: 'Volume', indexer: 'Indexador', term_months: 'Prazo (meses)', amortization: 'Amortização', fees: 'Tarifas incluídas', guarantee: 'Garantias', grace_months: 'Carência (meses)' };

export async function value(ctx) {
  const entities = await loadEntities(ctx);
  const root = el('div', { class: 'stack portfolio' });
  const year = new Date().getUTCFullYear();
  const filters = {
    start: el('input', { type: 'date', value: `${year}-01-01` }), end: el('input', { type: 'date', value: `${year}-12-31` }),
    kind: select([['', 'Todos os tipos'], ...Object.entries(VALUE_KINDS)]),
    currency: select([['', 'Todas as moedas'], ...VALUE_CURRENCIES.map((x) => [x, x])]),
    legal_entity_id: select([['', 'Meu escopo completo'], ...entities.rows.map((x) => [x.id, entityName(entities, x.id)])]),
    provider_id: select([['', 'Todos os provedores'], ...(ctx.data.providers || []).map((x) => [x.id, x.name])])
  };
  const result = el('div', { class: 'stack' }, loading());
  let cursor = null;
  let busy = false;
  const labels = { start: 'Período inicial', end: 'Período final', kind: 'Tipo de valor', currency: 'Moeda', legal_entity_id: 'Entidade', provider_id: 'Provedor' };
  const apply = button('Aplicar filtros', { onClick: () => { cursor = null; load(); } });
  root.append(card({ title: 'Escopo da apuração', body: [el('div', { class: 'form-grid' }, Object.entries(filters).map(([name, control]) => field({ label: labels[name], control }))), apply] }), result);
  const manage = ['admin', 'finance_manager'].includes(ctx.viewer?.role);
  ctx.header({ title: 'Valor de procurement', subtitle: 'Negociado, realizado e custo evitado separados. Custos declarados e evidência do cliente; sem conversão de moeda ou recomendação.', actions: manage ? [button('Registrar estimativa', { variant: 'primary', onClick: () => estimateForm(ctx, load) })] : [] });
  async function load() {
    if (busy) return;
    busy = true;
    result.replaceChildren(loading());
    try {
      const q = new URLSearchParams({ organization_id: ctx.organization.id });
      for (const [k, control] of Object.entries(filters)) if (control.value) q.set(k, control.value);
      if (cursor) q.set('after', cursor);
      const data = await ctx.api(`value?${q}`);
      const totals = data.totals.map((t) => card({ title: `${VALUE_KINDS[t.kind]} · ${t.currency}`, body: [el('strong', { text: money(t.value_amount, t.currency) }), el('p', { class: 'muted small', text: `${t.comparable} de ${t.records} registros comparáveis. Total considera registros ativos do período e filtros selecionados.` })] }));
      const rows = data.rows.length ? el('div', { class: 'table-scroll' }, el('table', { class: 'data-table compact' }, [
        el('thead', {}, el('tr', {}, ['Registro', 'Tipo', 'Período', 'Valor', 'Estado', 'Detalhe'].map((text) => el('th', { scope: 'col', text })))),
        el('tbody', {}, data.rows.map((r) => el('tr', {}, [el('td', { text: r.title }), el('td', { text: VALUE_KINDS[r.kind] }), el('td', { text: `${r.period_start} – ${r.period_end}` }), el('td', { text: money(r.value_amount, r.currency) }), el('td', { text: `${r.status === 'active' ? 'Ativo' : 'Invalidado'} · ${r.comparability}` }), el('td', {}, button('Ver evidência', { onClick: () => detail(r.id) }))])))
      ])) : emptyState({ title: 'Sem registros no período', text: 'Valor desconhecido não equivale a zero. Registre um baseline rastreável e custos totais comparáveis.' });
      result.replaceChildren(...totals, rows, ...(data.next ? [button('Próxima página', { onClick: () => { cursor = data.next; load(); } })] : []), ...(cursor ? [button('Primeira página', { onClick: () => { cursor = null; load(); } })] : []));
    } catch (error) { result.replaceChildren(errorState({ error, onRetry: load })); }
    finally { busy = false; }
  }
  async function detail(id) {
    try {
      const data = await ctx.api(`value/detail?id=${encodeURIComponent(id)}`);
      const r = data.record;
      const body = el('div', { class: 'stack' }, [
        el('p', { text: `${VALUE_KINDS[r.kind]} · ${money(r.value_amount, r.currency)} · ${r.period_start} – ${r.period_end}` }),
        el('p', { text: `Baseline: ${r.baseline.source} · ${r.baseline.reference} · ${r.baseline.as_of} · ${money(r.baseline.amount, r.currency)}. Custo de destino: ${money(r.target_amount, r.currency)}.` }),
        el('p', { text: `Entidade: ${entityName(entities, r.legal_entity_id)}. Responsável: ${r.owner_id}. Registrado: ${r.created_at}.` }),
        el('p', { text: `Evidência: ${r.evidence_reference}. Justificativa: ${r.reason}.` }),
        el('p', { text: `Metodologia v${data.methodology?.version || 1}: ${r.methodology_snapshot.formula}. ${r.methodology_snapshot.verification}` }),
        card({ title: `Contrato de destino · versão ${r.contract_version}`, body: el('pre', { class: 'small', style: 'white-space:pre-wrap;overflow-wrap:anywhere', text: JSON.stringify(r.target_snapshot, null, 2) }) }),
        card({ title: 'Comparabilidade econômica', body: VALUE_DIMENSIONS.map((k) => el('p', { class: 'small', text: `${DIMENSIONS[k]}: baseline ${JSON.stringify(r.baseline.dimensions[k] ?? null)} · destino ${JSON.stringify(r.target_dimensions[k] ?? null)}` })) }),
        ...(data.observations || []).map((o) => el('p', { text: `Observação: ${o.source} · ${o.evidence_reference} · ${o.period_start} – ${o.period_end}, cobertura ${o.coverage}. Verificada por ${o.verified_by} em ${o.verified_at}: ${o.verification_reason}` })),
        ...(r.invalidation_reason ? [el('p', { text: `Invalidado: ${r.invalidation_reason} · ${r.invalidated_at}` })] : [])
      ]);
      body.append(await graphContextCard(ctx, { type: 'contract', id: r.contract_id, title: 'Contexto financeiro do contrato' }));
      const actions = [];
      let dialog;
      if (manage && r.status === 'active') {
        if (r.kind === 'NEGOTIATED_SAVINGS' && r.comparability === 'comparable') actions.push(button('Registrar realização verificada', { onClick: () => observeForm(ctx, r, () => { dialog.close(); load(); }) }));
        actions.push(button('Invalidar com justificativa', { onClick: () => reasonForm(ctx, r, () => { dialog.close(); load(); }) }));
      }
      dialog = drawer({ title: r.title, body, footer: actions.length ? el('div', { class: 'actions' }, actions) : null });
    } catch (e) { toast(e.message, 'error'); }
  }
  await load();
  const id = new URL(location.href).searchParams.get('id');
  if (id) await detail(id);
  return root;
}

function submitForm(title, controls, handler) {
  const form = el('form', { class: 'stack' }, controls);
  const errors = el('p', { class: 'callout callout-error', role: 'alert', hidden: true });
  const save = button('Registrar', { variant: 'primary', type: 'submit' });
  form.append(errors, save);
  const dialog = drawer({ title, body: form });
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); save.disabled = true; errors.hidden = true;
    try { await handler(); dialog.close(); toast('Registro preservado com evidência.'); }
    catch (e) { errors.textContent = e.message; errors.hidden = false; }
    finally { save.disabled = false; }
  });
}
function estimateForm(ctx, reload) {
  const inputs = {
    title: el('input', { required: true, maxlength: 200 }), kind: select(Object.entries(VALUE_KINDS).filter(([k]) => k !== 'REALIZED_SAVINGS')),
    contract_id: select([['', 'Selecione um contrato'], ...(ctx.data.contracts || []).map((c) => [c.id, c.title || c.id])]),
    currency: select(VALUE_CURRENCIES.map((c) => [c, c])), period_start: el('input', { type: 'date', required: true }), period_end: el('input', { type: 'date', required: true }),
    source: select([['manual', 'Declaração documentada'], ['contract', 'Contrato'], ['proposal', 'Proposta'], ['approved_budget', 'Orçamento aprovado'], ['import', 'Importação']]),
    reference: el('input', { required: true, maxlength: 200 }), as_of: el('input', { type: 'date', required: true }), amount: el('input', { type: 'number', min: 0, max: 1e12, step: '.01', required: true }),
    target_amount: el('input', { type: 'number', min: 0, max: 1e12, step: '.01', required: true }),
    comparability: select([['incomplete', 'Dados incompletos — sem cálculo'], ['not_comparable', 'Condições distintas — sem cálculo'], ['comparable', 'Custos totais e condições comparáveis']]),
    evidence_reference: el('input', { required: true, maxlength: 200 }), reason: el('textarea', { required: true, maxlength: 1000 })
  };
  const labels = { title: 'Título', kind: 'Tipo estimado', contract_id: 'Contrato de destino', currency: 'Moeda', period_start: 'Início do período', period_end: 'Fim do período', source: 'Fonte do baseline', reference: 'Referência do baseline', as_of: 'Data do baseline', amount: 'Custo total do baseline', target_amount: 'Custo total negociado ou evitado', comparability: 'Comparabilidade', evidence_reference: 'Referência da evidência', reason: 'Justificativa e ajustes' };
  const baselineDimensions = {}, targetDimensions = {};
  const dimensions = VALUE_DIMENSIONS.map((k) => {
    baselineDimensions[k] = el('input', { maxlength: 200 }); targetDimensions[k] = el('input', { maxlength: 200 });
    return el('div', { class: 'form-grid' }, [field({ label: `${DIMENSIONS[k]} — baseline`, control: baselineDimensions[k] }), field({ label: `${DIMENSIONS[k]} — destino`, control: targetDimensions[k] })]);
  });
  submitForm('Registrar estimativa de valor', [el('p', { class: 'muted small', text: 'Informe custos totais do mesmo período. Para calcular, declare todos os critérios econômicos; use “não aplicável” explicitamente quando houver evidência. Redução de spread isolada não comprova economia. O cálculo pode ser negativo.' }), ...Object.entries(inputs).map(([k, control]) => field({ label: labels[k], control, required: true })), ...dimensions], async () => {
    const vals = Object.fromEntries(Object.entries(inputs).map(([k, c]) => [k, c.value]));
    const ds = (controls) => Object.fromEntries(Object.entries(controls).filter(([, c]) => c.value.trim()).map(([k, c]) => [k, c.value.trim()]));
    const b = { organization_id: ctx.organization.id, ...vals, target_amount: Number(vals.target_amount), target_dimensions: ds(targetDimensions), baseline: { source: vals.source, reference: vals.reference, as_of: vals.as_of, amount: Number(vals.amount), currency: vals.currency, unit: 'period_total', period_start: vals.period_start, period_end: vals.period_end, dimensions: ds(baselineDimensions) } };
    const error = validateValueInput(b); if (error) throw new Error(error);
    await ctx.api('value', { method: 'POST', body: JSON.stringify(b) }); await reload();
  });
}
function observeForm(ctx, r, reload) {
  const amount = el('input', { type: 'number', min: 0, max: 1e12, step: '.01', required: true });
  const reference = el('input', { maxlength: 200, required: true });
  const reason = el('textarea', { maxlength: 1000, required: true });
  const source = select([['statement', 'Extrato'], ['invoice', 'Fatura'], ['import', 'Importação'], ['manual', 'Declaração documentada']]);
  const verified = el('input', { type: 'checkbox', required: true });
  submitForm('Registrar realização verificada', [el('p', { text: `Observação do período completo ${r.period_start} – ${r.period_end}, em ${r.currency}. O período deve estar encerrado. Este registro não altera a estimativa negociada.` }), field({ label: 'Custo total observado', control: amount }), field({ label: 'Fonte', control: source }), field({ label: 'Referência da evidência', control: reference }), field({ label: 'Justificativa da verificação', control: reason }), field({ label: 'Confirmei a evidência e a cobertura completa do período', control: verified })], async () => {
    await ctx.api('value/observe', { method: 'POST', body: JSON.stringify({ record_id: r.id, observed_amount: Number(amount.value), currency: r.currency, period_start: r.period_start, period_end: r.period_end, coverage: 'complete', source: source.value, evidence_reference: reference.value, verification_reason: reason.value, verified: verified.checked }) }); await reload();
  });
}
function reasonForm(ctx, r, reload) {
  const reason = el('textarea', { required: true, maxlength: 1000 });
  submitForm('Invalidar registro', [el('p', { text: 'A evidência continua preservada. O registro deixa os totais ativos; correções exigem novo registro.' }), field({ label: 'Justificativa', control: reason })], async () => {
    await ctx.api('value/invalidate', { method: 'POST', body: JSON.stringify({ record_id: r.id, reason: reason.value }) }); await reload();
  });
}
