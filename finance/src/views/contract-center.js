import { graphContextCard } from './graph-context.js';
// Contract & Renewal Center v2 na interface: contrato como objeto operacional.
//
// Termos estruturados por versão (nunca sobrescritos), diff factual entre
// versões, aditivos, marcos próprios e obrigações recorrentes. O banco decide
// quem escreve (papel + escopo de entidade); a tela só esconde o que a pessoa
// claramente não pode fazer e mostra o erro do servidor quando ele recusa.

import { el, icon, formatDate, formatDateTime, money, percent, enumLabel } from '../core.js';
import { button, tag, field, drawer, toast, loading, errorState, catalogControl, confirmDialog } from '../ui.js';
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
  return wrap;
}

/** Botão + formulário de contrato existente (carteira fora de RFQ). */
export function importContractButton(ctx, entities) {
  if (!ctx.can('create_rfq')) return null;
  return button('Registrar contrato existente', { iconName: 'plus', onClick: () => {
    const form = el('form', { class: 'stack', id: 'contract-import-form', novalidate: true });
    const category = el('select', { name: 'product' });
    for (const [value, label] of Object.entries(CONTRACT_CATEGORIES)) category.add(new Option(label, value));
    const provider = el('select', { name: 'provider_id', required: true });
    for (const row of ctx.data.providers || []) provider.add(new Option(row.name, row.id));
    const title = el('input', { name: 'title', maxlength: '200', required: true });
    const starts = el('input', { name: 'starts_on', type: 'date', required: true });
    const ends = el('input', { name: 'ends_on', type: 'date', required: true });
    const notice = el('input', { name: 'renewal_notice_days', type: 'number', min: '0', max: '3650', value: '60' });
    const autoRenew = el('input', { name: 'auto_renew', type: 'checkbox' });
    const entity = el('select', { name: 'legal_entity_id' });
    if (entities.scope === 'group') entity.add(new Option('Nível de grupo', ''));
    for (const row of entityTree(entities.rows)) if (row.status === 'active') entity.add(new Option(`${row.depth ? '— ' : ''}${row.short_name || row.legal_name}`, row.id));
    let editor = termsEditor(category.value);
    const editorSlot = el('div', {}, editor);
    category.addEventListener('change', () => { editor = termsEditor(category.value); editorSlot.replaceChildren(editor); });
    form.append(
      field({ label: 'Categoria', control: category }),
      field({ label: 'Provedor', control: provider, required: true, hint: (ctx.data.providers || []).length ? null : 'Cadastre o provedor antes em Provedores.' }),
      field({ label: 'Título', control: title, required: true }),
      entities.rows.length ? field({ label: 'Entidade', control: entity }) : null,
      el('div', { class: 'field-grid' }, [field({ label: 'Início', control: starts, required: true }), field({ label: 'Fim', control: ends, required: true }),
        field({ label: 'Aviso prévio (dias)', control: notice }), el('label', { class: 'check-row' }, [autoRenew, el('span', { text: 'Renovação automática' })])]),
      el('details', { class: 'terms-details' }, [el('summary', { text: 'Termos estruturados (opcional agora, versão 1)' }), editorSlot]),
      el('p', { class: 'callout callout-info compact' }, [icon('info', { size: 14 }), el('span', { text: 'Registre o que está no contrato assinado. O Arandu não calcula nem infere termos; correções futuras viram nova versão com justificativa.' })])
    );
    const save = button('Registrar contrato', { variant: 'primary', type: 'submit', iconName: 'check', attrs: { form: 'contract-import-form' } });
    const dialog = drawer({ title: 'Registrar contrato existente', subtitle: 'Carteira atual da empresa, fora de uma concorrência no Arandu.', body: form, footer: [button('Cancelar', { variant: 'ghost', onClick: () => dialog.close() }), save] });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (title.value.trim().length < 2 || !starts.value || !ends.value || !provider.value) { toast('Preencha provedor, título, início e fim.', 'error'); return; }
      save.disabled = true;
      try {
        const result = await ctx.api('contract-import', { method: 'POST', body: JSON.stringify({
          organization_id: ctx.organization.id, product: category.value, provider_id: provider.value, title: title.value.trim(),
          starts_on: starts.value, ends_on: ends.value, renewal_notice_days: Number(notice.value || 60), auto_renew: autoRenew.checked,
          legal_entity_id: entity.value || null, terms: editor.read()
        }) });
        dialog.close();
        toast('Contrato registrado na carteira.');
        location.hash = `#contract-${result.id}`;
        ctx.reload();
      } catch (error) { toast(error.message, 'error'); save.disabled = false; }
    });
  } });
}

/** Painel do contrato: termos, versões, aditivos, marcos e contratos filhos. */
export function openContract(ctx, contract) {
  const body = el('div', { class: 'stack contract-center' }, loading('Carregando contrato…'));
  const dialog = drawer({ title: contract.title || contract.provider_name || 'Contrato', subtitle: `${CONTRACT_CATEGORIES[contract.product] || contract.product} · ${formatDate(contract.starts_on)} → ${formatDate(contract.ends_on)}`, body, className: 'drawer-wide' });
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
      version.changes.length ? el('ul', { class: 'diff-list' }, version.changes.map((change) => el('li', { text: `${change.label}: ${change.change === 'added' ? 'incluído' : change.change === 'removed' ? 'removido' : 'alterado'} — ${formatDiff(change.before)} → ${formatDiff(change.after)}` }))) : null
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

  function formatDiff(value) {
    if (value === null || value === undefined) return '—';
    if (Array.isArray(value)) return `${value.length} tarifa(s)`;
    return String(value);
  }

  function termsForm(current, terms) {
    const editor = termsEditor(current.product, terms);
    const reason = el('textarea', { rows: '2', maxlength: '1000' });
    const form = el('form', { class: 'stack', novalidate: true }, [editor, current.current_version ? field({ label: 'Justificativa da correção', control: reason, required: true, hint: 'A versão anterior continua no histórico.' }) : null,
      el('div', { class: 'form-actions' }, button(current.current_version ? 'Gravar nova versão' : 'Gravar versão 1', { variant: 'primary', type: 'submit', iconName: 'check' }))]);
    form.addEventListener('submit', async (event) => {
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
    form.addEventListener('submit', async (event) => {
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
    form.addEventListener('submit', async (event) => {
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

  load();
  return dialog;
}

