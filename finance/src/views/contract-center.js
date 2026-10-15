import { graphContextCard } from './graph-context.js';
// Contract & Renewal Center v2 na interface: contrato como objeto operacional.
//
// Termos estruturados por versão (nunca sobrescritos), diff factual entre
// versões, aditivos, marcos próprios e obrigações recorrentes. O banco decide
// quem escreve (papel + escopo de entidade); a tela só esconde o que a pessoa
// claramente não pode fazer e mostra o erro do servidor quando ele recusa.

import { el, icon, formatDate, formatDateTime, money, percent, enumLabel, PROVIDER_KINDS } from '../core.js';
import { button, tag, field, drawer, toast, loading, errorState, catalogControl, confirmDialog, onSubmit } from '../ui.js';
import { CONTRACT_CATEGORIES, MILESTONE_KINDS, RECURRENCES, FEE_UNITS, contractTermFields } from '../../../lib/finance/contract-terms.mjs';
import { entityTree } from '../../../lib/finance/entities.mjs';

const FEE_UNIT_LABELS = {
  per_month: 'por mês', per_transaction: 'por transação', per_item: 'por item', percent_of_volume: '% do volume',
  percent_of_amount: '% do valor', one_off: 'única', per_year: 'por ano'
};
const SOURCE_LABELS = { registration: 'Estruturação inicial', correction: 'Correção', amendment: 'Aditivo', import: 'Importação da carteira' };
const MILESTONE_STATUS = { scheduled: ['Agendado', 'info'], done: ['Concluído', 'success'], cancelled: ['Cancelado', 'neutral'] };

function termValue(spec, value, currency) {
  if (value === null || value === undefined || value === '') return null;
  if (spec.type === 'fees') return value.map((fee) => `${fee.service}: ${fee.unit.startsWith('percent') ? percent(fee.amount) : money(fee.amount)} ${FEE_UNIT_LABELS[fee.unit] || fee.unit}`).join(' · ');
  if (spec.type === 'money') return currency && currency !== 'BRL' ? `${currency} ${Number(value).toLocaleString('pt-BR')}` : money(value);
  if (spec.type === 'percent') return percent(value);
  if (spec.type === 'enum') return enumLabel(value);
  return String(value);
}

function termsList(category, terms, currency) {
  const rows = contractTermFields(category).map((spec) => [spec, termValue(spec, terms?.[spec.key], terms?.currency || currency)]).filter(([, value]) => value !== null);
  if (!rows.length) return el('p', { class: 'muted', text: 'Nenhum termo estruturado registrado ainda.' });
  return el('dl', { class: 'deflist deflist-2' }, rows.map(([spec, value]) => el('div', { class: 'deflist-row' }, [el('dt', { text: spec.label }), el('dd', { text: value })])));
}

/** Editor de termos do catálogo (com tarifas como linhas). */
function termsEditor(category, initial = {}) {
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

const sourceText = (source) => [source.document_title ? `Do documento "${source.document_title}"` : 'De um documento do contrato',
  source.page ? `pág. ${source.page}` : null, source.confirmed_at ? `confirmado em ${formatDate(source.confirmed_at)}` : 'confirmado'].filter(Boolean).join(', ');
const UNIT_TEXT = { percent: '%', percent_per_month: '% ao mês', percent_per_year: '% ao ano', days: 'dias' };
const unusableText = (item) => `${item.label}: ${item.reason === 'unit_mismatch'
  ? `o documento traz o valor em ${UNIT_TEXT[item.unit] || 'outra unidade'}, e o Arandu não converte`
  : 'o valor confirmado não cabe neste campo'} (${sourceText(item.source).replace(/^D/, 'd')}). Preencha a partir do contrato assinado.`;

/**
 * Valores já confirmados na revisão de documentos do contrato (e da proposta
 * que o originou). Só preenche campos vazios; a pessoa revisa e grava a versão.
 */
function confirmedFactsPanel(ctx, contractId, editor) {
  const panel = el('div', { class: 'callout compact', hidden: true, role: 'region', 'aria-label': 'Valores confirmados em documentos' });
  ctx.api(`contract-fact-suggestions?contract_id=${encodeURIComponent(contractId)}`).then((out) => {
    const suggestions = out.suggestions || [];
    const conflicts = out.conflicts || [];
    const unusable = out.unusable || [];
    if (!suggestions.length && !conflicts.length && !unusable.length) return;
    const status = el('p', { class: 'small', role: 'status', 'aria-live': 'polite' });
    const parts = [icon('file', { size: 14 }), el('span', { text: suggestions.length
      ? `${suggestions.length} ${suggestions.length === 1 ? 'valor confirmado' : 'valores confirmados'} na revisão de documentos deste contrato.`
      : conflicts.length ? 'Há valores confirmados em documentos deste contrato que não concordam entre si.'
        : 'Há valores confirmados em documentos deste contrato que não preenchem os termos sozinhos.' })];
    if (suggestions.length) parts.push(button('Preencher campos vazios', { size: 'sm', onClick: () => {
      let filled = 0, kept = 0;
      for (const item of suggestions) {
        const result = editor.fillIfEmpty(item.key, item.value, sourceText(item.source));
        if (result === 'filled') filled += 1; else if (result === 'kept') kept += 1;
      }
      status.textContent = [`${filled} ${filled === 1 ? 'campo preenchido' : 'campos preenchidos'} com a origem indicada.`,
        kept ? `${kept} mantido(s) como você digitou.` : null, 'Revise antes de gravar.'].filter(Boolean).join(' ');
    } }));
    const conflictList = conflicts.length ? el('ul', { class: 'plain-list small' }, conflicts.map((item) =>
      el('li', { text: `${item.label}: ${item.reason === 'currency_mismatch' ? 'documentos em moedas diferentes' : `valores diferentes (${item.values.map((v) => (typeof v.value === 'number' ? v.value.toLocaleString('pt-BR') : v.value)).join(' × ')})`}; preencha a partir do contrato assinado.` }))) : null;
    // Unidade ou formato que não serve ao campo: dito, nunca convertido nem descartado em silêncio.
    const unusableList = unusable.length ? el('ul', { class: 'plain-list small' }, unusable.map((item) => el('li', { text: unusableText(item) }))) : null;
    panel.replaceChildren(el('div', { class: 'stack' }, [el('div', { class: 'callout-line' }, parts), conflictList, unusableList, status].filter(Boolean)));
    panel.hidden = false;
  }).catch(() => {});
  return panel;
}

/** Botão + formulário de contrato existente (carteira fora de RFQ). */
export function importContractButton(ctx, entities, { label = 'Registrar contrato existente', variant = 'secondary' } = {}) {
  if (!ctx.can('create_rfq')) return null;
  return button(label, { variant, iconName: 'plus', attrs: { 'data-intent': 'registrar-contrato' }, onClick: () => openImportContract(ctx, entities) });
}

const NEW_PROVIDER = '__nova__';
const addDays = (day, days) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

function openImportContract(ctx, entities) {
  const form = el('form', { class: 'stack', id: 'contract-import-form', novalidate: true });
  const category = el('select', { name: 'product' });
  for (const [value, text] of Object.entries(CONTRACT_CATEGORIES)) category.add(new Option(text, value));
  // Instituição: escolhe uma cadastrada ou cadastra ali mesmo, sem sair do registro.
  const providers = [...(ctx.data.providers || [])];
  const provider = el('select', { name: 'provider_id', required: true });
  const fillProviders = (selected = '') => {
    provider.replaceChildren(new Option(providers.length ? 'Escolha a instituição' : 'Nenhuma instituição cadastrada', ''),
      ...providers.map((row) => new Option(row.name, row.id)), new Option('+ Cadastrar nova instituição', NEW_PROVIDER));
    provider.value = selected;
  };
  fillProviders(providers.length === 1 ? providers[0].id : '');
  const providerName = el('input', { name: 'provider_name', maxlength: '200', autocomplete: 'organization' });
  const providerKind = el('select', { name: 'provider_kind' });
  for (const [value, text] of Object.entries(PROVIDER_KINDS)) providerKind.add(new Option(text, value));
  const providerNameField = field({ label: 'Nome da instituição', control: providerName, required: true });
  const newProvider = el('fieldset', { class: 'stack inline-create', hidden: true }, [el('legend', { class: 'small', text: 'Nova instituição' }), providerNameField,
    field({ label: 'Tipo', control: providerKind }), el('p', { class: 'muted small', text: 'Cadastrada junto com o contrato. Contato, site e evidências ficam em Provedores.' })]);
  const title = el('input', { name: 'title', maxlength: '200', required: true, placeholder: 'Ex.: Capital de giro 2026' });
  const starts = el('input', { name: 'starts_on', type: 'date', required: true });
  const ends = el('input', { name: 'ends_on', type: 'date', required: true });
  const notice = el('input', { name: 'renewal_notice_days', type: 'number', min: '0', max: '3650', step: '1', value: '60', inputmode: 'numeric' });
  const autoRenew = el('input', { name: 'auto_renew', type: 'checkbox' });
  const entity = el('select', { name: 'legal_entity_id' });
  if (entities.scope === 'group') entity.add(new Option('Nível de grupo', ''));
  for (const row of entityTree(entities.rows)) if (row.status === 'active') entity.add(new Option(`${row.depth ? '— ' : ''}${row.short_name || row.legal_name}`, row.id));
  // Contrato principal: só do mesmo provedor (o banco recusa o resto).
  const parent = el('select', { name: 'parent_contract_id' });
  const parentField = field({ label: 'Contrato principal', control: parent, optionalLabel: true, hint: 'Para aditivo comercial ou pacote vinculado a um contrato já registrado com a mesma instituição.' });
  const fillParents = () => {
    const options = (ctx.data.contracts || []).filter((row) => row.provider_id && row.provider_id === provider.value);
    parent.replaceChildren(new Option('Nenhum (contrato independente)', ''), ...options.map((row) => new Option(`${row.title || CONTRACT_CATEGORIES[row.product] || 'Contrato'} · até ${formatDate(row.ends_on)}`, row.id)));
    parentField.hidden = !options.length;
  };
  fillParents();
  let editor = termsEditor(category.value);
  const editorSlot = el('div', {}, editor);
  category.addEventListener('change', () => { editor = termsEditor(category.value); editorSlot.replaceChildren(editor); });
  const providerField = field({ label: 'Instituição financeira', control: provider, required: true });
  const titleField = field({ label: 'Título', control: title, required: true, hint: 'Como a equipe reconhece o contrato.' });
  const startsField = field({ label: 'Início', control: starts, required: true });
  const endsField = field({ label: 'Fim', control: ends, required: true });
  const noticeField = field({ label: 'Aviso prévio (dias)', control: notice, hint: 'Antecedência exigida para renovar, renegociar ou encerrar.' });
  // Próxima ação calculada com a mesma regra do banco: fim − aviso prévio.
  const preview = el('p', { class: 'callout compact', role: 'status', 'aria-live': 'polite', hidden: true });
  const today = new Date().toISOString().slice(0, 10);
  const updatePreview = () => {
    const days = Number(notice.value || 60);
    if (!starts.value || !ends.value || ends.value < starts.value || !Number.isInteger(days) || days < 0) { preview.hidden = true; return; }
    const review = addDays(ends.value, -days);
    preview.replaceChildren(icon(ends.value < today ? 'clock' : 'calendar', { size: 14 }), el('span', { text: ends.value < today
      ? `Contrato encerrado em ${formatDate(ends.value)}: fica na memória da carteira, sem tarefa de renovação.`
      : review <= today
        ? `O prazo do aviso prévio já começou (${formatDate(review)}). O contrato entra em renovação e a tarefa “Revisar renovação” vence hoje.`
        : `Próxima ação: tarefa “Revisar renovação” para ${formatDate(review)}, ${days} dias antes do fim.` }));
    preview.className = `callout compact ${ends.value >= today && review <= today ? 'callout-warning' : 'callout-info'}`;
    preview.hidden = false;
  };
  for (const control of [starts, ends, notice]) control.addEventListener('input', updatePreview);
  provider.addEventListener('change', () => {
    newProvider.hidden = provider.value !== NEW_PROVIDER;
    providerField.setError('');
    fillParents();
    if (!newProvider.hidden) providerName.focus();
  });
  form.append(
    field({ label: 'Categoria', control: category }),
    providerField, newProvider, titleField,
    ...(entities.rows.length ? [field({ label: 'Entidade', control: entity, hint: 'Empresa do grupo que assinou o contrato.' })] : []),
    el('div', { class: 'field-grid' }, [startsField, endsField, noticeField, el('label', { class: 'check-row' }, [autoRenew, el('span', { text: 'Renovação automática' })])]),
    preview, parentField,
    el('details', { class: 'terms-details' }, [el('summary', { text: 'Termos estruturados (opcional agora, versão 1)' }), editorSlot]),
    el('p', { class: 'callout callout-info compact' }, [icon('info', { size: 14 }), el('span', { text: 'Registre o que está no contrato assinado. O Arandu não calcula nem infere termos; correções futuras viram nova versão com justificativa.' })])
  );
  const save = button('Registrar contrato', { variant: 'primary', type: 'submit', iconName: 'check', attrs: { form: 'contract-import-form' } });
  // Formulário longo num painel: clique fora, Esc ou Cancelar com dados
  // preenchidos pedem confirmação em vez de descartar o que foi digitado.
  let dirty = false;
  form.addEventListener('input', () => { dirty = true; });
  form.addEventListener('change', () => { dirty = true; });
  const confirmClose = () => !dirty || confirmDialog({ title: 'Descartar o registro do contrato?', description: 'O que você preencheu ainda não foi gravado e será perdido.', confirmLabel: 'Descartar', tone: 'danger' });
  const dialog = drawer({ title: 'Registrar contrato existente', subtitle: 'Carteira atual da empresa, fora de uma concorrência no Arandu.', body: form, confirmClose,
    footer: [button('Cancelar', { variant: 'ghost', onClick: () => dialog.dismiss() }), save] });

  const validate = () => {
    const errors = [];
    const check = (wrap, control, message) => { wrap.setError(message || ''); if (message) errors.push(control); };
    check(providerField, provider, provider.value ? null : 'Escolha a instituição ou cadastre uma nova.');
    if (provider.value === NEW_PROVIDER) check(providerNameField, providerName, providerName.value.trim().length >= 2 ? null : 'Informe o nome da instituição.');
    else providerNameField.setError('');
    check(titleField, title, title.value.trim().length < 2 ? 'Dê um título com pelo menos 2 caracteres.' : /[<>]/.test(title.value) ? 'Use texto simples, sem < ou >.' : null);
    check(startsField, starts, starts.value ? null : 'Informe a data de início.');
    check(endsField, ends, !ends.value ? 'Informe a data de fim.' : starts.value && ends.value < starts.value ? 'O fim não pode anteceder o início.' : null);
    const days = notice.value === '' ? 60 : Number(notice.value);
    check(noticeField, notice, Number.isInteger(days) && days >= 0 && days <= 3650 ? null : 'Use um número inteiro de 0 a 3650 dias.');
    if (errors.length) errors[0].focus();
    return !errors.length;
  };
  let providerId = null;
  onSubmit(form, async (event) => {
    event.preventDefault();
    if (!validate()) return;
    save.disabled = true;
    try {
      if (provider.value === NEW_PROVIDER && !providerId) {
        const created = await ctx.api('providers', { method: 'POST', body: JSON.stringify({ organization_id: ctx.organization.id, name: providerName.value.trim(), kind: providerKind.value }) });
        providerId = created.row?.id;
        if (!providerId) throw new Error('A instituição não foi cadastrada. Tente de novo.');
        // Um novo envio depois de falha no contrato reaproveita a instituição criada.
        providers.push({ id: providerId, name: providerName.value.trim() });
        fillProviders(providerId);
        newProvider.hidden = true;
        fillParents();
      }
      const result = await ctx.api('contract-import', { method: 'POST', body: JSON.stringify({
        organization_id: ctx.organization.id, product: category.value, provider_id: provider.value,
        title: title.value.trim(), starts_on: starts.value, ends_on: ends.value, renewal_notice_days: notice.value === '' ? 60 : Number(notice.value),
        auto_renew: autoRenew.checked, legal_entity_id: entity.value || null, parent_contract_id: parent.value || null, terms: editor.read()
      }) });
      dialog.close();
      const task = result.next_task;
      toast(task ? `Contrato registrado. Próxima ação: revisar a renovação até ${formatDate(task.due_on)} (em Tarefas).` : 'Contrato registrado na carteira, sem renovação pendente.');
      location.hash = `#contract-${result.id}`;
      ctx.reload();
    } catch (error) {
      if (error.code === 'contract_duplicate') titleField.setError(error.message);
      else if (error.code === 'invalid_parent_contract') parentField.setError(error.message);
      else if (error.code === 'invalid_period' || error.code === 'invalid_date') endsField.setError(error.message);
      toast(error.message, 'error');
      save.disabled = false;
    }
  });
  (providers.length ? title : provider).focus();
}

/** Painel do contrato: termos, versões, aditivos, marcos e contratos filhos. */
export function openContract(ctx, contract, { initialDetail = null } = {}) {
  const body = el('div', { class: 'stack contract-center' }, loading('Carregando contrato…'));
  const dialog = drawer({ title: contract.title || contract.provider_name || 'Contrato', subtitle: `${CONTRACT_CATEGORIES[contract.product] || contract.product} · ${formatDate(contract.starts_on)} → ${formatDate(contract.ends_on)}`, body, className: 'drawer-wide', onClose: () => { const url = new URL(location.href); if (url.searchParams.get('abrir') === 'contrato' && location.hash === `#contract-${contract.id}`) { url.searchParams.delete('abrir'); history.replaceState(null, '', url.pathname + url.search); } } });
  const manage = ctx.can('create_rfq');
  const load = () => ctx.api(`contract-detail?id=${encodeURIComponent(contract.id)}`).then((detail) => body.replaceChildren(...render(detail)))
    .catch((error) => body.replaceChildren(errorState({ error, onRetry: load })));
  const after = (message) => { toast(message); load(); ctx.reload?.(); };

  let lastDetail = null;
  function render(detail) {
    lastDetail = detail;
    const current = detail.contract;
    const effective = detail.effective;
    const sections = [];
    // Termos efetivos e histórico de versões com diff factual.
    const versions = el('ol', { class: 'version-list', role: 'list' }, detail.versions.map((version) => el('li', { class: 'version-row' }, [
      el('div', { class: 'version-head' }, [tag(`v${version.version}`, 'accent'), el('strong', { text: SOURCE_LABELS[version.source] || version.source }),
        el('span', { class: 'muted small', text: `vigência ${formatDate(version.effective_from)} · registrada ${formatDateTime(version.recorded_at)}` })]),
      version.reason ? el('p', { class: 'small', text: `Justificativa: ${version.reason}` }) : null,
      version.changes.length ? el('ul', { class: 'diff-list' }, version.changes.map((change) => el('li', { text: `${change.label}: ${change.change === 'added' ? 'incluído' : change.change === 'removed' ? 'removido' : 'alterado'} — ${formatDiff(current, change.key, change.before)} → ${formatDiff(current, change.key, change.after)}` }))) : null
    ])));
    const termsActions = manage ? button(current.current_version ? 'Corrigir termos (nova versão)' : 'Estruturar termos', { size: 'sm', iconName: 'edit', onClick: () => termsForm(current, effective?.terms || {}) }) : null;
    sections.push(el('section', { class: 'cc-section' }, [el('div', { class: 'cc-head' }, [el('h3', { text: `Termos vigentes${effective ? ` (v${effective.version})` : ''}` }), termsActions]),
      termsList(current.product, effective?.terms, current.currency),
      detail.versions.length ? el('details', { class: 'cc-history' }, [el('summary', { text: `Histórico de versões (${detail.versions.length})` }), versions]) : null]));

    // Aditivos.
    const amendments = detail.amendments.length ? el('ol', { class: 'version-list', role: 'list' }, detail.amendments.map((item) => el('li', { class: 'version-row' }, [
      el('div', { class: 'version-head' }, [tag(`${item.number}º aditivo`, 'neutral'), el('strong', { text: item.title }), el('span', { class: 'muted small', text: `vigência ${formatDate(item.effective_from)}${item.signed_on ? ` · assinado ${formatDate(item.signed_on)}` : ''}` })]),
      item.summary ? el('p', { class: 'small', text: item.summary }) : null,
      item.new_ends_on ? el('p', { class: 'small muted', text: `Fim: ${formatDate(item.previous_ends_on)} → ${formatDate(item.new_ends_on)}` }) : null,
      item.new_notice_days !== null && item.new_notice_days !== undefined ? el('p', { class: 'small muted', text: `Aviso prévio: ${item.previous_notice_days} → ${item.new_notice_days} dias` }) : null
    ]))) : el('p', { class: 'muted', text: 'Nenhum aditivo registrado.' });
    sections.push(el('section', { class: 'cc-section' }, [el('div', { class: 'cc-head' }, [el('h3', { text: 'Aditivos' }),
      manage && ['active', 'renewing'].includes(current.status) ? button('Registrar aditivo', { size: 'sm', iconName: 'plus', onClick: () => amendmentForm(current, effective?.terms || {}) }) : null]), amendments]));

    // Marcos e obrigações recorrentes.
    const milestones = detail.milestones.length ? el('ul', { class: 'milestone-list', role: 'list' }, detail.milestones.map((item) => {
      const [label, tone] = MILESTONE_STATUS[item.status];
      const actions = manage && item.status === 'scheduled' ? [
        button(item.recurrence !== 'none' ? 'Concluir ocorrência' : 'Concluir', { size: 'sm', onClick: () => settle(item, 'done') }),
        button('Cancelar', { size: 'sm', variant: 'ghost', onClick: () => settle(item, 'cancelled') })] : [];
      return el('li', { class: 'milestone-row' }, [
        el('div', { class: 'milestone-main' }, [el('strong', { text: item.title }), el('span', { class: 'muted small', text: `${MILESTONE_KINDS[item.kind]} · ${formatDate(item.due_on)} · avisa ${item.lead_days} dias antes · ${RECURRENCES[item.recurrence]}` })]),
        tag(label, tone), ...actions]);
    })) : el('p', { class: 'muted', text: 'Sem marcos próprios. Os marcos de renovação (90/60/30 dias) continuam automáticos.' });
    sections.push(el('section', { class: 'cc-section' }, [el('div', { class: 'cc-head' }, [el('h3', { text: 'Marcos e obrigações' }),
      manage && ['active', 'renewing'].includes(current.status) ? button('Novo marco', { size: 'sm', iconName: 'plus', onClick: () => milestoneForm(current) }) : null]), milestones]));

    if (detail.children.length) {
      sections.push(el('section', { class: 'cc-section' }, [el('h3', { text: 'Contratos vinculados (filhos)' }),
        el('ul', { class: 'plain-list' }, detail.children.map((child) => el('li', { text: `${child.title || CONTRACT_CATEGORIES[child.product]} · até ${formatDate(child.ends_on)}` })))]));
    }
    if (current.parent_contract_id) sections.push(el('p', { class: 'muted small', text: 'Este contrato é filho de outro contrato da carteira.' }));
    sections.push(graphContextCard(ctx, { type: 'contract', id: current.id }));
    return sections;
  }

  // Mesma leitura dos termos vigentes: moeda, percentual e indexador por
  // extenso. Antes o histórico mostrava "5000000 → 5100000" e o código "cdi".
  function formatDiff(current, key, value) {
    if (value === null || value === undefined || value === '') return 'não informado';
    if (Array.isArray(value)) return `${value.length} ${value.length === 1 ? 'tarifa' : 'tarifas'}`;
    const spec = contractTermFields(current.product).find((item) => item.key === key);
    return (spec && termValue(spec, value, current.currency)) || String(value);
  }

  function termsForm(current, terms) {
    const editor = termsEditor(current.product, terms);
    const reason = el('textarea', { rows: '2', maxlength: '1000' });
    const form = el('form', { class: 'stack', novalidate: true }, [confirmedFactsPanel(ctx, current.id, editor), editor, current.current_version ? field({ label: 'Justificativa da correção', control: reason, required: true, hint: 'A versão anterior continua no histórico.' }) : null,
      el('div', { class: 'form-actions' }, button(current.current_version ? 'Gravar nova versão' : 'Gravar versão 1', { variant: 'primary', type: 'submit', iconName: 'check' }))]);
    onSubmit(form, async (event) => {
      event.preventDefault();
      if (current.current_version && reason.value.trim().length < 3) { toast('Explique a correção.', 'error'); return; }
      try {
        await ctx.api('contract-terms', { method: 'POST', body: JSON.stringify({ contract_id: current.id, expected_version: current.current_version, terms: editor.read(), reason: reason.value.trim() || null }) });
        after('Termos gravados como nova versão.');
      } catch (error) { toast(error.message, 'error'); }
    });
    body.replaceChildren(el('h3', { text: current.current_version ? 'Corrigir termos' : 'Estruturar termos' }), form, button('Voltar', { variant: 'ghost', onClick: load }));
  }

  function amendmentForm(current, terms) {
    const title = el('input', { maxlength: '200', required: true, value: `${(lastDetail?.amendments.length || 0) + 1}º aditivo` });
    const effectiveFrom = el('input', { type: 'date', required: true });
    const signed = el('input', { type: 'date' });
    const summary = el('textarea', { rows: '3', maxlength: '4000' });
    const newEnds = el('input', { type: 'date' });
    const newNotice = el('input', { type: 'number', min: '0', max: '3650' });
    const changeTerms = el('input', { type: 'checkbox' });
    const editor = termsEditor(current.product, terms);
    editor.hidden = true;
    changeTerms.addEventListener('change', () => { editor.hidden = !changeTerms.checked; });
    const form = el('form', { class: 'stack', novalidate: true }, [
      field({ label: 'Título', control: title, required: true }),
      el('div', { class: 'field-grid' }, [field({ label: 'Vigência a partir de', control: effectiveFrom, required: true }), field({ label: 'Assinado em', control: signed, optionalLabel: true }),
        field({ label: 'Novo fim do contrato', control: newEnds, optionalLabel: true, hint: `Atual: ${formatDate(current.ends_on)}` }), field({ label: 'Novo aviso prévio (dias)', control: newNotice, optionalLabel: true, hint: `Atual: ${current.renewal_notice_days} dias` })]),
      field({ label: 'O que mudou', control: summary, optionalLabel: true }),
      el('label', { class: 'check-row' }, [changeTerms, el('span', { text: 'O aditivo altera termos estruturados (gera nova versão)' })]), editor,
      el('div', { class: 'form-actions' }, button('Registrar aditivo', { variant: 'primary', type: 'submit', iconName: 'check' }))]);
    onSubmit(form, async (event) => {
      event.preventDefault();
      if (!effectiveFrom.value) { toast('Informe a vigência do aditivo.', 'error'); return; }
      if (!await confirmDialog({ title: 'Registrar aditivo?', description: 'Aditivo é histórico: não pode ser editado nem apagado depois. Datas anteriores ficam preservadas nele.', confirmLabel: 'Registrar' })) return;
      try {
        await ctx.api('contract-amendments', { method: 'POST', body: JSON.stringify({
          contract_id: current.id, title: title.value.trim(), effective_from: effectiveFrom.value, signed_on: signed.value || null, summary: summary.value.trim() || null,
          new_ends_on: newEnds.value || null, new_notice_days: newNotice.value === '' ? null : Number(newNotice.value),
          ...(changeTerms.checked ? { terms: editor.read(), expected_version: current.current_version } : {})
        }) });
        after('Aditivo registrado.');
      } catch (error) { toast(error.message, 'error'); }
    });
    body.replaceChildren(el('h3', { text: 'Registrar aditivo' }), form, button('Voltar', { variant: 'ghost', onClick: load }));
  }

  function milestoneForm(current) {
    const kind = el('select');
    for (const [value, label] of Object.entries(MILESTONE_KINDS)) kind.add(new Option(label, value));
    const title = el('input', { maxlength: '200', required: true });
    const due = el('input', { type: 'date', required: true });
    const lead = el('input', { type: 'number', min: '0', max: '365', value: '30' });
    const recurrence = el('select');
    for (const [value, label] of Object.entries(RECURRENCES)) recurrence.add(new Option(label, value));
    const until = el('input', { type: 'date' });
    const owner = el('select');
    owner.add(new Option('Responsável do contrato', ''));
    for (const member of ctx.members || []) owner.add(new Option(member.display_name || 'Membro', member.user_id));
    const form = el('form', { class: 'stack', novalidate: true }, [
      el('div', { class: 'field-grid' }, [field({ label: 'Tipo', control: kind }), field({ label: 'Título', control: title, required: true }),
        field({ label: 'Data', control: due, required: true }), field({ label: 'Avisar com antecedência (dias)', control: lead }),
        field({ label: 'Recorrência', control: recurrence }), field({ label: 'Repetir até', control: until, optionalLabel: true }),
        field({ label: 'Responsável', control: owner })]),
      el('div', { class: 'form-actions' }, button('Criar marco', { variant: 'primary', type: 'submit', iconName: 'check' }))]);
    onSubmit(form, async (event) => {
      event.preventDefault();
      if (title.value.trim().length < 2 || !due.value) { toast('Informe título e data do marco.', 'error'); return; }
      try {
        await ctx.api('contract-milestones', { method: 'POST', body: JSON.stringify({ contract_id: current.id, kind: kind.value, title: title.value.trim(), due_on: due.value,
          lead_days: Number(lead.value || 30), recurrence: recurrence.value, ends_after: until.value || null, owner_id: owner.value || null }) });
        after('Marco criado. A tarefa aparece quando a antecedência começar.');
      } catch (error) { toast(error.message, 'error'); }
    });
    body.replaceChildren(el('h3', { text: 'Novo marco' }), form, button('Voltar', { variant: 'ghost', onClick: load }));
  }

  async function settle(item, action) {
    try {
      const result = await ctx.api('contract-milestones', { method: 'PATCH', body: JSON.stringify({ milestone_id: item.id, action }) });
      after(result.status === 'scheduled' ? 'Ocorrência concluída; o marco avançou para a próxima data.' : action === 'done' ? 'Marco concluído.' : 'Marco cancelado.');
    } catch (error) { toast(error.message, 'error'); }
  }

  if (initialDetail) body.replaceChildren(...render(initialDetail));
  else load();
  return dialog;
}

