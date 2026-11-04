// Termos especializados (financial-product-terms-1) e simulador de custo de
// fiança (bank-guarantee-explicit-cost-v1).
//
// - Campos, rótulos, tipos, limites e opções vêm de lib/finance/product-terms.mjs,
//   a MESMA fonte que gera a validação SQL e o `specialized_schema` do registro.
//   A tela só checa forma (tipo/obrigatório); a regra financeira é do servidor.
// - Gravação pela API canônica `contract-terms` (nova versão com expected_version),
//   preservando os demais termos da versão vigente.
// - O simulador só envia contrato+versão e cenários declarados; o cálculo,
//   componentes e incomparabilidade vêm do servidor. Sem ranking nem "economia".

import { el, icon, formatDate } from '../core.js';
import { button, drawer, field, toast, sessionLink, loading, mutedText } from '../ui.js';
import { PRODUCT_TERM_SCHEMAS, PRODUCT_TERMS_VERSION, productTermMetadata } from '../../../lib/finance/product-terms.mjs';

export const MODALITY_LABEL = Object.freeze({ bank_guarantee: 'Fiança bancária', fx_spot: 'Câmbio à vista (spot)', fx_forward: 'Câmbio a termo (forward)', ndf: 'NDF (termo sem entrega física)', swap: 'Swap' });
const SIDE = { buy_base: 'Compra da moeda base', sell_base: 'Venda da moeda base' };
const REASON = {
  currency_mismatch: 'Moeda do cenário diferente da moeda da garantia; não há conversão cambial.',
  outside_contractual_validity: 'Período do cenário fora da vigência declarada da garantia.',
  amount_exceeds_declared_guarantee: 'Valor do cenário acima do valor garantido declarado.',
  unsupported_or_incomplete_guarantee_terms: 'A versão do contrato não tem termos de fiança completos.',
  numeric_precision_limit: 'Valores fora da precisão suportada.', invalid_scenario: 'Cenário inválido.'
};
const fmtNumber = (v, places = 2) => typeof v === 'number' ? v.toLocaleString('pt-BR', { minimumFractionDigits: places, maximumFractionDigits: places }) : '—';
const money = (v, cur) => typeof v === 'number' ? `${cur || ''} ${fmtNumber(v, 2)}`.trim() : '—';

/** Modalidades especializadas aceitas pela categoria canônica do contrato. */
export function modalitiesFor(category) { return Object.entries(PRODUCT_TERM_SCHEMAS).filter(([, s]) => s.category === category).map(([k]) => k); }

export function formatTermValue(f, v, values = {}) {
  if (v === undefined || v === null || v === '') return 'Não informado';
  if (f.type === 'date') return formatDate(v);
  if (f.type === 'enum') return f.key === 'side' ? SIDE[v] || v : v;
  if (f.unit === 'currency_amount') return money(v, values.currency || values.base_currency);
  if (f.unit === 'percent_per_year') return `${fmtNumber(v, 4).replace(/0+$/, '').replace(/,$/, '')}% a.a.`;
  if (f.type === 'number') return fmtNumber(v, Math.min(f.decimal_places ?? 2, 8)).replace(/(,\d*?)0+$/, '$1').replace(/,$/, '');
  return String(v);
}

/** Seção do contrato: termos especializados vigentes, edição e simulação. */
export function specializedTermsSection(ctx, { contract, effective, contracts = [], onSaved = null }) {
  const modalities = modalitiesFor(contract.product);
  if (!modalities.length) return null;
  const terms = effective?.terms || {};
  const pt = terms.product_terms;
  const meta = pt ? productTermMetadata(pt.modality) : null;
  const write = ctx.can?.('create_rfq');
  const section = el('section', { class: 'cc-section product-terms', id: 'termos-especializados', 'aria-labelledby': 'pt-title' }, [
    el('div', { class: 'cc-head' }, [el('h3', { id: 'pt-title', text: 'Condições especializadas do produto' }),
      el('div', { class: 'crm-actions' }, [
        write ? button(pt ? 'Atualizar condições' : 'Registrar condições', { size: 'sm', iconName: pt ? 'edit' : 'plus', onClick: () => termsForm(ctx, { contract, effective, modalities, onSaved }) }) : null,
        pt?.modality === 'bank_guarantee' ? button('Simular custo da fiança', { size: 'sm', variant: 'primary', iconName: 'scale', onClick: () => openGuaranteeSimulator(ctx, { contract, contracts }) }) : null])])
  ]);
  if (!pt || !meta) {
    section.append(mutedText(`Sem condições estruturadas de ${modalities.map((m) => MODALITY_LABEL[m]).join(', ')}. Registre a partir da cláusula do contrato para consultar prazos e, na fiança, simular encargos.`));
    return section;
  }
  section.append(
    el('p', { class: 'small' }, [el('strong', { text: MODALITY_LABEL[pt.modality] }), ` · versão ${effective.version} do contrato · fonte: ${pt.values.source_reference}`]),
    el('dl', { class: 'deflist deflist-2' }, meta.fields.filter((f) => f.key !== 'source_reference').map((f) => el('div', { class: 'deflist-row' }, [el('dt', { text: f.label }), el('dd', { text: formatTermValue(f, pt.values[f.key], pt.values) })]))),
    mutedText(`Termos declarados${meta.methodology ? '' : '; esta modalidade ainda não tem cálculo econômico no Arandu'}. Sem curva, preço de mercado ou marcação a mercado. Não habilita solicitação (RFQ).`));
  return section;
}

function termsForm(ctx, { contract, effective, modalities, onSaved }) {
  const current = effective?.terms?.product_terms;
  const modality = el('select', { class: 'input', disabled: Boolean(current) }, modalities.map((m) => new Option(MODALITY_LABEL[m], m, false, m === current?.modality)));
  const area = el('div', { class: 'stack product-terms-fields' });
  const reason = el('input', { class: 'input', maxlength: '200', placeholder: 'Ex.: cláusula 4.2 do contrato assinado' });
  const errors = el('div', { class: 'callout callout-error compact', role: 'alert', hidden: true });
  const save = button('Gravar nova versão', { variant: 'primary', type: 'submit' });
  let controls = [];
  const draw = () => {
    const schema = PRODUCT_TERM_SCHEMAS[modality.value];
    const values = current?.modality === modality.value ? current.values : {};
    controls = schema.fields.map((f) => {
      const c = f.type === 'enum' ? el('select', { class: 'input' }, [new Option('Selecione', ''), ...f.options.map((o) => new Option(f.key === 'side' ? SIDE[o] || o : o, o, false, values[f.key] === o))])
        : el('input', { class: 'input', type: f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text', ...(f.type === 'number' ? { step: f.decimal_places === 2 ? '0.01' : 'any', min: String(f.min ?? '') } : {}), ...(f.type === 'currency' ? { maxlength: '3', placeholder: 'BRL' } : {}), ...(f.type === 'text' ? { maxlength: String(f.maxLength || 200) } : {}) });
      if (values[f.key] !== undefined && f.type !== 'enum') c.value = String(values[f.key]);
      const hint = f.unit === 'percent_per_year' ? 'Percentual ao ano, ex.: 2,5 → 2.5' : f.unit === 'currency_amount' ? 'Valor com até duas casas decimais.' : f.key === 'source_reference' ? 'Cláusula, documento ou página de onde vem o dado.' : null;
      return { f, c, wrap: field({ label: f.label, control: c, required: f.required, hint }) };
    });
    const groups = [['Identificação', (f) => ['source_reference', 'beneficiary', 'fixing_source'].includes(f.key)], ['Valores e moedas', (f) => f.type === 'currency' || f.unit === 'currency_amount' || f.key === 'agreed_rate'], ['Datas', (f) => f.type === 'date'], ['Taxas e convenções', () => true]];
    const used = new Set();
    area.replaceChildren(...groups.map(([title, pick]) => {
      const items = controls.filter((x) => !used.has(x) && pick(x.f));
      items.forEach((x) => used.add(x));
      return items.length ? el('fieldset', { class: 'stack-sm' }, [el('legend', { class: 'small', text: title }), ...items.map((x) => x.wrap)]) : null;
    }).filter(Boolean));
  };
  modality.addEventListener('change', draw);
  draw();
  const form = el('form', { class: 'stack', novalidate: true }, [
    mutedText('Os campos seguem a modalidade. Gravar cria uma nova versão do contrato; as anteriores ficam imutáveis e os demais termos vigentes são preservados.'),
    field({ label: 'Modalidade', control: modality, required: true, hint: current ? 'A modalidade registrada não muda; para outra, registre um novo contrato.' : null }), area,
    field({ label: 'Motivo da nova versão', control: reason, optionalLabel: true }), errors, save]);
  const dialog = drawer({ title: `${current ? 'Atualizar' : 'Registrar'} condições · ${contract.title || 'Contrato'}`, body: form, className: 'drawer-wide' });
  let pending = false;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (pending) return;
    const values = {}; let bad = null;
    for (const { f, c, wrap } of controls) {
      const raw = c.value.trim();
      let msg = '';
      if (!raw) msg = f.required ? `Informe ${f.label.toLowerCase()}.` : '';
      else if (f.type === 'number') { const n = Number(raw.replace(',', '.')); if (!Number.isFinite(n)) msg = 'Número inválido.'; else values[f.key] = n; }
      else if (f.type === 'currency') { if (!/^[A-Z]{3}$/.test(raw.toUpperCase())) msg = 'Código de três letras, ex.: BRL.'; else values[f.key] = raw.toUpperCase(); }
      else values[f.key] = raw;
      wrap.setError(msg);
      if (msg && !bad) bad = c;
    }
    if (bad) { bad.focus(); return; }
    pending = true; save.disabled = true; errors.hidden = true;
    const product_terms = { schema_version: PRODUCT_TERMS_VERSION, modality: modality.value, values };
    const currency = values.currency || values.base_currency || effective?.terms?.currency;
    try {
      await ctx.send('contract-terms', { contract_id: contract.id, expected_version: contract.current_version, terms: { ...(effective?.terms || {}), ...(currency ? { currency } : {}), product_terms }, reason: reason.value.trim() || null });
      dialog.close(); toast('Condições registradas em nova versão do contrato.'); onSaved?.();
    } catch (error) {
      errors.replaceChildren(el('span', { text: error.status === 409 ? 'O contrato mudou desde que você o abriu, ou a versão perderia termos especializados. Nada foi sobrescrito: recarregue o contrato.'
        : error.status === 400 ? 'O servidor recusou as condições: confira datas (início antes do fim), moedas diferentes no par, casas decimais e campos obrigatórios. Nada foi gravado.'
          : error.status === 403 ? 'Seu acesso não permite alterar este contrato.' : (error.message || 'Não foi possível gravar.') }), ...(sessionLink(error) ? [' ', sessionLink(error)] : []));
      errors.hidden = false; save.disabled = false;
    } finally { pending = false; }
  });
}

/** Simulador: contratos de fiança da mesma entidade × cenários declarados. */
export function openGuaranteeSimulator(ctx, { contract, contracts = [] }) {
  const pool = [contract, ...contracts.filter((c) => c.id !== contract.id && c.product === 'guarantee' && (c.legal_entity_id || null) === (contract.legal_entity_id || null) && c.current_version)].slice(0, 10);
  const picks = pool.map((c) => { const box = el('input', { type: 'checkbox', checked: c.id === contract.id }); box.checked = c.id === contract.id; return { c, box }; });
  const scenarios = el('div', { class: 'stack-sm' });
  const addScenario = (seed = {}) => {
    if (scenarios.children.length >= 10) return;
    const n = scenarios.children.length + 1;
    const row = el('fieldset', { class: 'scenario-row', dataset: { scenario: String(n) } }, [el('legend', { class: 'small', text: `Cenário ${n}` })]);
    const inputs = {
      label: el('input', { class: 'input', maxlength: '80', value: seed.label || (n === 1 ? 'Base' : `Cenário ${n}`) }),
      period_start: el('input', { class: 'input', type: 'date', value: seed.period_start || '' }), period_end: el('input', { class: 'input', type: 'date', value: seed.period_end || '' }),
      currency: el('input', { class: 'input', maxlength: '3', value: seed.currency || 'BRL' }), guaranteed_amount: el('input', { class: 'input', type: 'number', step: '0.01', min: '0.01', value: seed.guaranteed_amount ?? '' }),
      source_reference: el('input', { class: 'input', maxlength: '500', value: seed.source_reference || 'Cenário informado pela equipe' })
    };
    row.inputs = inputs;
    row.append(el('div', { class: 'scenario-grid' }, [field({ label: 'Nome', control: inputs.label }), field({ label: 'Início', control: inputs.period_start, required: true }), field({ label: 'Fim', control: inputs.period_end, required: true, hint: 'Período [início, fim): o último dia não conta.' }),
      field({ label: 'Moeda', control: inputs.currency, required: true }), field({ label: 'Valor garantido no cenário', control: inputs.guaranteed_amount, required: true }), field({ label: 'Premissa / fonte', control: inputs.source_reference, required: true })]),
      ...(n > 1 ? [button('Remover cenário', { size: 'sm', variant: 'ghost', onClick: () => row.remove() })] : []));
    scenarios.append(row);
  };
  addScenario();
  const result = el('div', { class: 'stack', 'aria-live': 'polite' });
  const run = button('Calcular', { variant: 'primary', iconName: 'scale' });
  run.addEventListener('click', async () => {
    const sources = picks.filter((p) => p.box.checked).map((p) => ({ contract_id: p.c.id, version: p.c.current_version }));
    const list = [...scenarios.children].map((row) => { const i = row.inputs; return { label: i.label.value.trim() || 'Cenário', period_start: i.period_start.value, period_end: i.period_end.value, currency: i.currency.value.trim().toUpperCase(), guaranteed_amount: Number(i.guaranteed_amount.value), source_reference: i.source_reference.value.trim() }; });
    const bad = !sources.length ? 'Selecione ao menos um contrato.' : list.find((s) => !s.period_start || !s.period_end || s.period_end <= s.period_start) ? 'Cada cenário precisa de início antes do fim.' : list.find((s) => !(s.guaranteed_amount > 0)) ? 'Informe o valor garantido de cada cenário.' : list.find((s) => !/^[A-Z]{3}$/.test(s.currency)) ? 'Moeda em código de três letras.' : list.find((s) => s.source_reference.length < 3) ? 'Descreva a premissa de cada cenário.' : null;
    if (bad) { result.replaceChildren(el('p', { class: 'callout callout-error compact', role: 'alert', text: bad })); return; }
    run.disabled = true; result.replaceChildren(loading('Calculando…'));
    try {
      const out = await ctx.send('guarantee-economics', { organization_id: ctx.organization.id, sources, scenarios: list });
      result.replaceChildren(analysisView(ctx, out.analysis));
    } catch (error) {
      result.replaceChildren(el('p', { class: 'callout callout-error compact', role: 'alert', text: error.status === 404 ? 'Um dos contratos não está disponível neste contexto (precisa ser fiança da mesma entidade).' : error.status === 400 ? 'Fontes ou cenários recusados pelo servidor: confira datas, moeda, valor e premissa.' : 'Não foi possível calcular agora. Nada foi gravado.' }));
    } finally { run.disabled = false; }
  });
  return drawer({ title: 'Simulador de custo de fiança', subtitle: 'Encargos explícitos das versões declaradas, por cenário.', className: 'drawer-wide guarantee-sim', body: el('div', { class: 'stack' }, [
    el('p', { class: 'callout callout-info compact', role: 'note', text: 'Calcula comissão, despesa inicial e outras despesas a partir dos termos registrados em cada contrato. Não é preço de mercado, custo total, perda esperada ou economia; não ordena instituições.' }),
    el('fieldset', { class: 'stack-sm' }, [el('legend', { class: 'small', text: 'Contratos de fiança comparados (versão vigente)' }),
      ...picks.map(({ c, box }) => el('label', { class: 'checkbox' }, [box, ` ${c.title || 'Contrato'} · ${c.provider_name || 'instituição'} · versão ${c.current_version}`]))]),
    scenarios, el('div', { class: 'crm-actions' }, [button('Adicionar cenário', { size: 'sm', iconName: 'plus', onClick: () => addScenario() }), run]), result]) });
}

export function analysisView(ctx, analysis) {
  const scenarios = analysis?.scenarios || [];
  const sources = scenarios[0]?.results.map((r) => r.source) || [];
  const table = el('table', { class: 'data-table compact guarantee-table' }, [
    el('thead', {}, el('tr', {}, [el('th', { scope: 'col', text: 'Cenário' }), ...sources.map((s) => el('th', { scope: 'col' }, [s.object_type === 'contract' && s.id ? el('a', { href: ctx.href(`/finance/contracts.html?abrir=contrato#contract-${s.id}`), text: s.label || 'Contrato' }) : (s.label || 'Contrato'), mutedText(` · v${s.version}`, 'span')]))])),
    el('tbody', {}, scenarios.map((sc) => el('tr', {}, [
      el('th', { scope: 'row' }, [el('strong', { text: sc.scenario.label }), el('span', { class: 'muted small cell-sub', text: `${formatDate(sc.scenario.period_start)} → ${formatDate(sc.scenario.period_end)} · ${money(sc.scenario.guaranteed_amount, sc.scenario.currency)}` })]),
      ...sc.results.map((r) => el('td', { 'data-label': r.source.label || 'Contrato', dataset: { comparable: String(r.comparable) } }, r.comparable ? [
        el('strong', { class: 'num', text: money(r.total, r.currency) }),
        el('ul', { class: 'plain-list small cost-components' }, [
          el('li', { text: `Comissão: ${money(r.components.commission, r.currency)} (${r.inputs.days} dias / base ${r.inputs.basis}, ${formatTermValue({ unit: 'percent_per_year', type: 'number' }, r.inputs.commission_pct_year)})` }),
          el('li', { text: `Despesa inicial: ${money(r.components.upfront_fee, r.currency)}` }), el('li', { text: `Outras despesas: ${money(r.components.other_expenses, r.currency)}` })])
      ] : [el('span', { class: 'tag tag-warning', text: 'Não comparável' }), el('ul', { class: 'plain-list small' }, (r.reasons || []).map((x) => el('li', { text: REASON[x] || 'Condição não suportada.' })))]))
    ])))
  ]);
  return el('section', { class: 'stack-sm', 'aria-label': 'Resultado da simulação' }, [
    el('div', { class: 'table-card' }, table),
    el('details', {}, [el('summary', { text: 'Metodologia e limites' }), el('p', { class: 'small', text: 'Comissão = valor do cenário × taxa anual ÷ 100 × dias corridos ÷ base (360 ou 365, conforme a convenção do contrato). Período [início, fim) em dias UTC. Despesas iniciais só entram quando o cenário começa no início da vigência. Componentes arredondados a centavos.' }),
      el('ul', { class: 'plain-list small' }, [el('li', { text: 'Somente encargos explícitos da fiança: não inclui tributos, custo de garantia real, funding ou perda esperada.' }), el('li', { text: 'Compara versões declaradas como cenário: não é aprovação, contratação nem economia realizada.' }), el('li', { text: 'Sem ordenação de instituições; a decisão é da empresa.' })]),
      el('p', { class: 'muted small' }, [icon('info', { size: 12 }), ' Resultado não é salvo.'])])
  ]);
}
