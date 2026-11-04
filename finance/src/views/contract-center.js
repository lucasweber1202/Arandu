/* global __ARANDU_DEMO__ */
// Contract & Renewal Center v2 na interface: contrato como objeto operacional.
//
// Termos estruturados por versão (nunca sobrescritos), diff factual entre
// versões, aditivos, marcos próprios e obrigações recorrentes. O banco decide
// quem escreve (papel + escopo de entidade); a tela só esconde o que a pessoa
// claramente não pode fazer e mostra o erro do servidor quando ele recusa.
import { graphContextCard } from './graph-context.js';
import { el, icon, formatDate, formatDateTime, percent } from '../core.js';
import { button, tag, field, drawer, toast, loading, errorState, confirmDialog, onSubmit, readableError, mutedText, toastError } from '../ui.js';
import { CONTRACT_CATEGORIES, MILESTONE_KINDS, RECURRENCES, contractTermFields } from '../../../lib/finance/contract-terms.mjs';
import { termValue, termsList, termsEditor } from './contract-center/terms.js';
import { contractSummaryCard } from './contract-center/summary.js';

const SOURCE_LABELS = { registration: 'Estruturação inicial', correction: 'Correção', amendment: 'Aditivo', import: 'Importação da carteira' };
const MILESTONE_STATUS = { scheduled: ['Agendado', 'info'], done: ['Concluído', 'success'], cancelled: ['Cancelado', 'neutral'] };

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
export function importContractButton(ctx, entities, { label = 'Registrar contrato existente', variant = 'secondary', providerId = null, size = null } = {}) {
  if (!ctx.can('create_rfq')) return null;
  return button(label, { variant, size, iconName: 'plus', attrs: { 'data-intent': 'registrar-contrato' }, onClick: () => import('./contract-center/import.js').then((m) => m.openImportContract(ctx, entities, { providerId })).catch((error) => toast(readableError(error), 'error')) });
}

export function openContract(ctx, contract, { initialDetail = null } = {}) {
  const body = el('div', { class: 'stack contract-center' }, loading('Carregando contrato…'));
  const dialog = drawer({ title: contract.title || contract.provider_name || 'Contrato', subtitle: `${CONTRACT_CATEGORIES[contract.product] || contract.product} · ${formatDate(contract.starts_on)} → ${formatDate(contract.ends_on)}`, body, className: 'drawer-wide', onClose: () => { const url = new URL(location.href); if (url.searchParams.get('abrir') === 'contrato' && location.hash === `#contract-${contract.id}`) { url.searchParams.delete('abrir'); history.replaceState(null, '', url.pathname + url.search); } } });
  const manage = ctx.can('create_rfq');
  const load = () => ctx.api(`contract-detail?id=${encodeURIComponent(contract.id)}`).then((detail) => body.replaceChildren(...render(detail)))
    .catch((error) => body.replaceChildren(errorState({ error, onRetry: load })));
  const after = (message) => { toast(message); load(); ctx.reload?.(); };

  let lastDetail = null;
  if (!(__ARANDU_DEMO__ && ctx.mode === 'demo')) import('./copilot.js').then((m) => { m.setCopilotContext({ type: 'contract', id: contract.id, label: contract.title || contract.provider_name || 'Contrato' }); dialog.addEventListener('close', () => m.clearCopilotContext(contract.id)); });
  function render(detail) {
    lastDetail = detail;
    const current = detail.contract;
    const effective = detail.effective;
    const sections = [contractSummaryCard(ctx, detail, {
      onStructureTerms: () => termsForm(current, effective?.terms || {}),
      onAmendment: () => amendmentForm(current, effective?.terms || {}) })];
    // The legacy browser sandbox does not implement contextual task writes.
    if (!(__ARANDU_DEMO__ && ctx.mode === 'demo')) {
      const label = current.title || current.provider_name || 'Contrato';
      const ask = (question) => import('./copilot.js').then((m) => m.openCopilot(ctx, { context: { type: 'contract', id: current.id, label }, question }));
      sections.push(el('div', { class: 'crm-actions contract-copilot', role: 'group', 'aria-label': 'Perguntar ao Copilot sobre este contrato' }, [
        button('Explicar condições', { size: 'sm', variant: 'ghost', iconName: 'sparkles', onClick: () => ask('Explique as condições deste contrato com base na versão vigente dos termos.') }),
        button('Próximos vencimentos', { size: 'sm', variant: 'ghost', onClick: () => ask('Quando vence este contrato, qual o aviso prévio registrado e o que está pendente?') }),
        button('Histórico de relacionamento', { size: 'sm', variant: 'ghost', onClick: () => ask('Quais atividades e processos comerciais estão ligados a este contrato?') }),
        button('Importar tarifas cobradas', { size: 'sm', variant: 'ghost', iconName: 'download', onClick: () => import('./fee-import.js').then((m) => m.openFeeImport(ctx, { contracts: [current, ...(ctx.data?.contracts || []).filter((c) => c.id !== current.id)], contractId: current.id })) })]));
      const work = el('div', {}, loading('Carregando trabalho do contrato…'));
      sections.push(work);
      import('./contract-work.js').then(module => { if (work.isConnected) work.replaceWith(module.contractWork(ctx, {...current, source_rfq:detail.source_rfq})); }).catch(error => { if (work.isConnected) work.replaceChildren(errorState({error})); });
    }
    // Termos efetivos e histórico de versões com diff factual.
    const versions = el('ol', { class: 'version-list', role: 'list' }, detail.versions.map((version) => el('li', { class: 'version-row' }, [
      el('div', { class: 'version-head' }, [tag(`v${version.version}`, 'accent'), el('strong', { text: SOURCE_LABELS[version.source] || version.source }),
        mutedText(`vigência ${formatDate(version.effective_from)} · registrada ${formatDateTime(version.recorded_at)}`, 'span')]),
      version.reason ? el('p', { class: 'small', text: `Justificativa: ${version.reason}` }) : null,
      version.changes.length ? el('ul', { class: 'diff-list' }, version.changes.map((change) => el('li', { text: `${change.label}: ${change.change === 'added' ? 'incluído' : change.change === 'removed' ? 'removido' : 'alterado'} — ${formatDiff(current, change.key, change.before)} → ${formatDiff(current, change.key, change.after)}` }))) : null
    ])));
    const termsActions = manage ? button(current.current_version ? 'Corrigir termos (nova versão)' : 'Estruturar termos', { size: 'sm', iconName: 'edit', onClick: () => termsForm(current, effective?.terms || {}) }) : null;
    sections.push(el('section', { class: 'cc-section' }, [el('div', { class: 'cc-head' }, [el('h3', { text: `Termos vigentes${effective ? ` (v${effective.version})` : ''}` }), termsActions]),
      termsList(current.product, effective?.terms, current.currency),
      detail.versions.length ? el('details', { class: 'cc-history' }, [el('summary', { text: `Histórico de versões (${detail.versions.length})` }), versions]) : null]));
    if (!(__ARANDU_DEMO__ && ctx.mode === 'demo')) {
      const crmSlot = el('div');
      sections.push(crmSlot);
      import('./crm/linked-panel.js').then((m) => { if (crmSlot.parentNode) crmSlot.replaceWith(m.crmLinkedPanel(ctx, { relatedId: current.id, providerId: current.provider_id, providerName: current.provider_name, noun: 'este contrato' })); });
    }
    // Próximas ações e conciliação de tarifas do contrato (mesmas fontes da Central).
    // O build de demonstração não tem API e não empacota o módulo.
    if (!__ARANDU_DEMO__ && !(__ARANDU_DEMO__ && ctx.mode === 'demo')) {
      const nextSlot = el('div');
      sections.splice(Math.min(1, sections.length), 0, nextSlot);
      import('./context-signals.js').then((m) => { if (nextSlot.parentNode) nextSlot.replaceWith(m.contractContextSection(ctx, current)); }).catch(() => nextSlot.remove());
    }
    // Condições especializadas (fiança, câmbio, hedge): mesma fonte do registro canônico.
    if (!(__ARANDU_DEMO__ && ctx.mode === 'demo')) {
      const slot = el('div');
      sections.push(slot);
      import('./product-terms-panel.js').then((m) => { const node = m.specializedTermsSection(ctx, { contract: current, effective, contracts: ctx.data?.contracts || [], onSaved: () => after('Condições registradas.') }); if (node && slot.isConnected) slot.replaceWith(node); else slot.remove(); });
    }

    // Aditivos.
    const amendments = detail.amendments.length ? el('ol', { class: 'version-list', role: 'list' }, detail.amendments.map((item) => el('li', { class: 'version-row' }, [
      el('div', { class: 'version-head' }, [tag(`${item.number}º aditivo`, 'neutral'), el('strong', { text: item.title }), mutedText(`vigência ${formatDate(item.effective_from)}${item.signed_on ? ` · assinado ${formatDate(item.signed_on)}` : ''}`, 'span')]),
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
        el('div', { class: 'milestone-main' }, [el('strong', { text: item.title }), mutedText(`${MILESTONE_KINDS[item.kind]} · ${formatDate(item.due_on)} · avisa ${item.lead_days} dias antes · ${RECURRENCES[item.recurrence]}`, 'span')]),
        tag(label, tone), ...actions]);
    })) : el('p', { class: 'muted', text: 'Sem marcos próprios. Os marcos de renovação (90/60/30 dias) continuam automáticos.' });
    sections.push(el('section', { class: 'cc-section' }, [el('div', { class: 'cc-head' }, [el('h3', { text: 'Marcos e obrigações' }),
      manage && ['active', 'renewing'].includes(current.status) ? button('Novo marco', { size: 'sm', iconName: 'plus', onClick: () => milestoneForm(current) }) : null]), milestones]));

    if (detail.children.length) {
      sections.push(el('section', { class: 'cc-section' }, [el('h3', { text: 'Contratos vinculados (filhos)' }),
        el('ul', { class: 'plain-list' }, detail.children.map((child) => el('li', { text: `${child.title || CONTRACT_CATEGORIES[child.product]} · até ${formatDate(child.ends_on)}` })))]));
    }
    if (current.parent_contract_id) sections.push(mutedText('Este contrato é filho de outro contrato da carteira.'));
    sections.push(ownerSection(current));
    sections.push(graphContextCard(ctx, { type: 'contract', id: current.id }));
    return sections;
  }

  // Responsável pelo contrato: troca explícita, confirmada pela releitura do servidor.
  // Não mexe em termos, versão nem no responsável da tarefa de renovação.
  let ownerNotice = '';
  function ownerSection(current) {
    const who = (id) => { const member = (ctx.members || []).find((row) => row.user_id === id); return id ? member?.display_name || (member ? 'Membro da equipe' : 'Pessoa sem acesso atual a esta organização') : 'Não informado'; };
    const status = el('p', { class: 'muted small', role: 'status', 'aria-live': 'polite' });
    const conflictNote = ownerNotice ? el('p', { class: 'callout callout-warning compact', role: 'alert', text: ownerNotice }) : null;
    ownerNotice = '';
    const section = el('section', { class: 'cc-section', 'aria-labelledby': `owner-${current.id}` }, [
      el('div', { class: 'cc-head' }, el('h3', { id: `owner-${current.id}`, text: 'Responsável pelo contrato' })),
      el('p', { text: who(current.owner_id) }),
      mutedText('Responde pelo relacionamento deste contrato. Tarefas e aprovações têm responsáveis próprios.')]);
    if (conflictNote) section.append(conflictNote);
    const candidates = (ctx.members || []).filter((member) => member.user_id && ['admin', 'finance_manager', 'analyst'].includes(member.role) && member.user_id !== current.owner_id);
    if (!manage || !current.owner_id || !['active', 'renewing'].includes(current.status) || !candidates.length) return section;
    const select = el('select', { name: 'owner_id' });
    select.add(new Option('Escolha a pessoa', ''));
    for (const member of candidates) select.add(new Option(member.display_name || 'Membro da equipe', member.user_id));
    const submit = button('Alterar responsável', { size: 'sm', type: 'submit' });
    const form = el('form', { class: 'stack', novalidate: true }, [field({ label: 'Novo responsável pelo contrato', control: select }), submit, status]);
    onSubmit(form, async (event) => {
      event.preventDefault();
      if (!select.value) { select.closest('.field').setError('Escolha quem passa a responder pelo contrato.'); select.focus(); return; }
      submit.disabled = true; select.disabled = true; status.textContent = 'Conferindo a alteração no servidor…';
      try {
        await ctx.send('contract-owner', { contract_id: current.id, expected_owner_id: current.owner_id, owner_id: select.value });
        const reread = await ctx.api(`contract-detail?id=${encodeURIComponent(current.id)}`);
        if (reread.contract?.owner_id !== select.value) throw new Error('A alteração não foi confirmada na releitura. Atualize o contrato antes de tentar de novo.');
        toast('Responsável pelo contrato alterado.');
        body.replaceChildren(...render(reread)); ctx.reload?.();
      } catch (error) {
        status.textContent = error.code === 'contract_owner_conflict' ? 'Outra pessoa alterou o responsável enquanto você escolhia. O contrato foi relido; confira antes de tentar de novo.'
          : error.code === 'contract_owner_unavailable' ? 'Esta pessoa não pode ser responsável por este contrato (papel, acesso à entidade ou conta). Nada foi alterado.'
            : error.status === 403 ? 'Seu papel não permite alterar o responsável deste contrato. Nada foi alterado.'
              : !error.status || error.status >= 500 ? 'A alteração não foi confirmada. Atualize o contrato para ver o responsável registrado antes de tentar de novo.'
                : error.message;
        // Conflito: relê o contrato e mantém a explicação visível depois da releitura.
        if (error.code === 'contract_owner_conflict') { ownerNotice = status.textContent; load(); }
        submit.disabled = false; select.disabled = false;
      }
    });
    section.append(el('details', { class: 'cc-history' }, [el('summary', { text: 'Alterar responsável' }), form]));
    return section;
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
        await ctx.send('contract-terms', { contract_id: current.id, expected_version: current.current_version, terms: { ...editor.read(), ...(terms?.product_terms ? { product_terms: terms.product_terms } : {}) }, reason: reason.value.trim() || null });
        after('Termos gravados como nova versão.');
      } catch (error) { toastError(error); }
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
        await ctx.send('contract-amendments', {
          contract_id: current.id, title: title.value.trim(), effective_from: effectiveFrom.value, signed_on: signed.value || null, summary: summary.value.trim() || null,
          new_ends_on: newEnds.value || null, new_notice_days: newNotice.value === '' ? null : Number(newNotice.value),
          ...(changeTerms.checked ? { terms: { ...editor.read(), ...(terms?.product_terms ? { product_terms: terms.product_terms } : {}) }, expected_version: current.current_version } : {})
        });
        after('Aditivo registrado.');
      } catch (error) { toastError(error); }
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
        await ctx.send('contract-milestones', { contract_id: current.id, kind: kind.value, title: title.value.trim(), due_on: due.value,
          lead_days: Number(lead.value || 30), recurrence: recurrence.value, ends_after: until.value || null, owner_id: owner.value || null });
        after('Marco criado. A tarefa aparece quando a antecedência começar.');
      } catch (error) { toastError(error); }
    });
    body.replaceChildren(el('h3', { text: 'Novo marco' }), form, button('Voltar', { variant: 'ghost', onClick: load }));
  }

  async function settle(item, action) {
    try {
      const result = await ctx.send('contract-milestones', { milestone_id: item.id, action }, 'PATCH');
      after(result.status === 'scheduled' ? 'Ocorrência concluída; o marco avançou para a próxima data.' : action === 'done' ? 'Marco concluído.' : 'Marco cancelado.');
    } catch (error) { toastError(error); }
  }

  if (initialDetail) body.replaceChildren(...render(initialDetail));
  else load();
  return dialog;
}


