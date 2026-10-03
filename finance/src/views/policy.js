// Policy & Approval Engine v2 na interface (docs/FINANCIAL_POLICY_ENGINE.md).
//
// A avaliação é do banco: a tela mostra o que a policy do cliente exige —
// policy aplicável, versão, regra acionada, etapas, prazos, exceções e
// histórico — e nunca opina sobre a operação. Para quem só aprova, aparece o
// essencial (quem, em que ordem, até quando); o detalhe das regras fica em
// seções recolhidas. Num transporte que não conhece o engine (demonstração),
// tudo cai no fluxo de aprovação manual de antes.

import { el, icon, formatDateTime, timeAgo, ROLE_LABELS } from '../core.js';
import { button, tag, pill, field, emptyState, errorState, loading, toast, confirmDialog, promptDialog, drawer } from '../ui.js';
import { memberName, memberTitle } from './shared.js';
import {
  POLICY_FACTS, POLICY_ROLES, STAGE_SCOPES, PRODUCTS, PROVIDER_STATUS, STEP_REASON_CODES, EXCEPTION_REASON_CODES, FLAG_KINDS,
  APPROVAL_STATUS_LABELS, STAGE_STATUS_LABELS, EXCEPTION_STATUS_LABELS, UNKNOWN_FACT_LABELS,
  validatePolicyDocument, describeRule, describeStage, describeCondition
} from '../../../lib/finance/policy.mjs';

const STAGE_TONE = { active: 'warning', approved: 'success', waived: 'info', rejected: 'danger', changes_requested: 'warning', expired: 'danger', cancelled: 'neutral', superseded: 'neutral', pending: 'neutral' };
const EXCEPTION_TONE = { requested: 'warning', approved: 'success', rejected: 'danger', cancelled: 'neutral' };
const slug = (text) => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^([0-9])/, 'r_$1').slice(0, 40) || 'regra';
const clone = (value) => JSON.parse(JSON.stringify(value));

/** Carrega policies, versões e sinalizadores (uma vez por página). */
export function loadPolicies(ctx) {
  if (ctx.audience !== 'company' || !ctx.organization) return Promise.resolve(null);
  ctx.policiesPromise ||= ctx.api(`approval-policies?organization_id=${encodeURIComponent(ctx.organization.id)}`).catch(() => null);
  return ctx.policiesPromise;
}

function activeVersion(policy) { return (policy.versions || []).find((version) => version.status === 'active') || null; }
function draftVersion(policy) { return (policy.versions || []).find((version) => version.status === 'draft') || null; }
function scopeName(entities, entityId) {
  if (!entityId) return 'Grupo (todas as entidades)';
  const entity = entities?.byId?.get(entityId);
  return entity ? (entity.short_name || entity.legal_name) : 'Entidade';
}

// ------------------------------------------------------------- governança
/** Seção de Configurações: policies por escopo, versões, sinalizadores e prazos. */
export function policySettings(ctx, entities) {
  const box = el('div', { class: 'stack policy-settings' }, loading());
  const render = async () => {
    ctx.policiesPromise = null;
    const result = await loadPolicies(ctx);
    if (!result) {
      box.replaceChildren(emptyState({ title: 'Policies de aprovação indisponíveis neste ambiente', text: 'O pedido de aprovação com aprovadores escolhidos em ordem continua disponível.', compact: true, iconName: 'shield' }));
      return;
    }
    const options = { entities: entities?.rows || [], flags: result.flags || [] };
    const byScope = new Map((result.rows || []).map((policy) => [policy.legal_entity_id || 'group', policy]));
    const scopes = [{ id: null, label: scopeName(entities, null) }, ...(entities?.rows || []).filter((row) => row.status === 'active').map((row) => ({ id: row.id, label: scopeName(entities, row.id), kind: row.kind }))];
    const list = el('div', { class: 'stack' });
    for (const scope of scopes) {
      const policy = byScope.get(scope.id || 'group');
      if (!policy && !result.can_admin) continue;
      list.append(policyCard(ctx, { policy, scope, options, canAdmin: result.can_admin, onChange: render }));
    }
    if (!list.children.length) list.append(emptyState({ title: 'Nenhuma policy ativa', text: 'Sem policy, vale a regra geral abaixo e o pedido de aprovação com aprovadores escolhidos em ordem.', compact: true, iconName: 'shield' }));
    const intro = el('p', { class: 'muted small', text: 'Precedência: a policy do grupo vale para todas as entidades; a da entidade (ou da entidade-mãe de uma unidade) acrescenta etapas e nunca remove as do grupo. Sem regra casada, vale o fallback da policy. Versão ativada é imutável; pedido em andamento segue a versão gravada nele.' });
    const parts = [intro, list];
    if (result.can_admin) parts.push(flagSettings(ctx, result.flags || [], render));
    if (ctx.can?.('create_rfq')) {
      parts.push(el('div', { class: 'row-actions' }, button('Processar prazos de aprovação agora', { size: 'sm', iconName: 'clock', onClick: async () => {
        try {
          const out = await ctx.api('approval-policies/process-deadlines', { method: 'POST', body: JSON.stringify({ organization_id: ctx.organization.id }) });
          toast(out.processed ? `${out.processed} pendência(s) de prazo tratada(s): escaladas ou expiradas.` : 'Nenhum prazo vencido.');
        } catch (error) { toast(error.message, 'error'); }
      } })), el('p', { class: 'muted small', text: 'A rotina diária também processa prazos. Escalar avisa e cria tarefa; nada é aprovado por tempo.' }));
    }
    box.replaceChildren(...parts);
  };
  render().catch((error) => box.replaceChildren(errorState({ error })));
  return box;
}

function policyCard(ctx, { policy, scope, options, canAdmin, onChange }) {
  const active = policy ? activeVersion(policy) : null;
  const draft = policy ? draftVersion(policy) : null;
  const head = el('div', { class: 'policy-head' }, [
    el('div', { class: 'policy-head-text' }, [
      el('h3', { class: 'policy-title', text: policy?.name || scope.label }),
      el('p', { class: 'muted small', text: `${scope.label}${active ? ` · versão ${active.version} ativa desde ${formatDateTime(active.activated_at)}` : policy?.status === 'retired' ? ' · aposentada' : ' · sem versão ativa'}` })
    ]),
    el('div', { class: 'policy-tags' }, [active ? tag(`v${active.version}`, 'success') : tag('Sem policy', 'neutral'), draft ? tag(`Rascunho v${draft.version}`, 'warning') : null])
  ]);
  const body = [head];
  if (active) body.push(documentSummary(active.document, options));
  const actions = el('div', { class: 'row-actions' });
  if (canAdmin) {
    actions.append(button(draft ? `Editar rascunho v${draft.version}` : active ? 'Nova versão' : 'Criar policy', { size: 'sm', iconName: 'edit', onClick: () => openPolicyEditor(ctx, { policy, scope, base: draft || active, options, onChange }) }));
    if (draft) {
      actions.append(button(`Ativar v${draft.version}`, { size: 'sm', variant: 'primary', iconName: 'check', onClick: async () => {
        if (!await confirmDialog({ title: `Ativar a versão ${draft.version}?`, description: 'Ela passa a valer para pedidos novos. Pedidos em andamento continuam na versão gravada neles. Depois de ativada, a versão não pode ser editada.', confirmLabel: 'Ativar' })) return;
        try { await ctx.api('approval-policies/activate', { method: 'POST', body: JSON.stringify({ version_id: draft.id }) }); toast(`Versão ${draft.version} ativada.`); onChange(); } catch (error) { toast(error.message, 'error'); }
      } }), button('Descartar rascunho', { size: 'sm', variant: 'ghost', iconName: 'x', onClick: async () => {
        if (!await confirmDialog({ title: 'Descartar o rascunho?', confirmLabel: 'Descartar', tone: 'danger' })) return;
        try { await ctx.api('approval-policies/discard', { method: 'POST', body: JSON.stringify({ version_id: draft.id }) }); toast('Rascunho descartado.'); onChange(); } catch (error) { toast(error.message, 'error'); }
      } }));
    }
    if (active) {
      actions.append(button('Aposentar', { size: 'sm', variant: 'danger-ghost', iconName: 'x', onClick: async () => {
        if (!await confirmDialog({ title: 'Aposentar esta policy?', description: 'Pedidos novos deixam de seguir esta policy (vale a do grupo ou a regra geral). Pedidos em andamento continuam na versão gravada.', confirmLabel: 'Aposentar', tone: 'danger' })) return;
        try { await ctx.api('approval-policies/retire', { method: 'POST', body: JSON.stringify({ policy_id: policy.id }) }); toast('Policy aposentada.'); onChange(); } catch (error) { toast(error.message, 'error'); }
      } }));
    }
  }
  if (actions.children.length) body.push(actions);
  const history = (policy?.versions || []).filter((version) => version.status !== 'draft');
  if (history.length) {
    body.push(el('details', { class: 'history' }, [el('summary', { text: `Histórico de versões (${history.length})` }), el('ol', { class: 'plain-list policy-history' }, history.map((version) => el('li', {}, [
      el('strong', { text: `v${version.version}` }), el('span', { text: ` · ${({ active: 'ativa', superseded: 'substituída', retired: 'aposentada' })[version.status] || version.status}` }),
      el('span', { class: 'muted small', text: ` · ativada ${formatDateTime(version.activated_at)} por ${memberName(ctx.members, version.activated_by)}${version.ended_at ? ` · encerrada ${formatDateTime(version.ended_at)}` : ''}` }),
      version.change_note ? el('span', { class: 'muted small', text: ` · “${version.change_note}”` }) : null
    ])))]));
  }
  return el('article', { class: 'card policy-card' }, el('div', { class: 'card-body stack' }, body));
}

function documentSummary(document, options) {
  const rules = el('ol', { class: 'policy-rules' }, (document.rules || []).map((rule) => {
    const described = describeRule(rule, options);
    return el('li', { class: 'policy-rule' }, [el('strong', { text: rule.label }), el('span', { class: 'muted small', text: `Quando: ${described.when}` }),
      el('ul', { class: 'plain-list small' }, described.requires.map((text) => el('li', { text })))]);
  }));
  const extras = [];
  if (document.fallback) extras.push(`Fallback (nenhuma regra casou): ${describeRule({ ...document.fallback, when: [] }, options).requires.join('; ')}`);
  if (document.sod?.requester_cannot_decide) extras.push('Quem pede a aprovação não registra a decisão.');
  if (document.sod?.decider_not_sole_final_approver === false) extras.push('A pessoa que decide pode ser a única aprovadora da etapa final.');
  if (document.expire_after_hours) extras.push(`Pedido expira em ${document.expire_after_hours} h sem conclusão.`);
  extras.push(`Exceções decididas por: ${(document.exception_approver_roles || ['admin']).map((role) => ROLE_LABELS[role] || role).join(', ')}.`);
  return el('div', { class: 'stack-sm' }, [(document.rules || []).length ? rules : el('p', { class: 'muted small', text: 'Sem regras; só o fallback.' }),
    el('ul', { class: 'plain-list small muted' }, extras.map((text) => el('li', { text })))]);
}

// ------------------------------------------------------------- editor
const EMPTY_STAGE = () => ({ key: 'aprovacao', label: 'Aprovação', sequence: 1, roles: ['finance_manager'], scope: 'any', min_approvals: 1, due_hours: 48, allow_delegation: true });
const EMPTY_RULE = (index) => ({ id: `regra_${index}`, label: 'Nova regra', when: [], stages: [EMPTY_STAGE()] });

function conditionDefaults(fact) {
  const spec = POLICY_FACTS[fact];
  const op = Object.keys(spec.ops)[0];
  const value = { money: 1000000, currencies: ['BRL'], products: ['credit'], entities: [], provider_status: ['NAO_VERIFICADO'], bool: true, count: 3, months: 36, date: '2030-12-31', flag: '' }[spec.type];
  return { fact, op, value, ...(spec.type === 'money' ? { currency: 'BRL' } : {}) };
}

function checkboxGroup(legend, values, selected, onChange, labels = ROLE_LABELS) {
  const group = el('fieldset', { class: 'check-row' }, el('legend', { class: 'field-label', text: legend }));
  for (const value of values) {
    const box = el('input', { type: 'checkbox', checked: selected.includes(value), value });
    box.addEventListener('change', () => onChange([...group.querySelectorAll('input:checked')].map((input) => input.value)));
    group.append(el('label', { class: 'check-option' }, [box, el('span', { text: labels[value] || value })]));
  }
  return group;
}

function numberInput(value, { min, max, onInput, placeholder = '' }) {
  const input = el('input', { type: 'number', inputmode: 'numeric', min: String(min), max: String(max), value: value ?? '', placeholder });
  input.addEventListener('input', () => onInput(input.value === '' ? null : Number(input.value)));
  return input;
}

function stageEditor(stage, { onRemove, onChange }) {
  const label = el('input', { maxlength: '120', value: stage.label });
  label.addEventListener('input', () => { stage.label = label.value; if (!stage._keyEdited) stage.key = slug(label.value); onChange(false); });
  const scope = el('select', {}, Object.entries(STAGE_SCOPES).map(([value, text]) => el('option', { value, text, selected: stage.scope === value })));
  scope.addEventListener('change', () => { stage.scope = scope.value; onChange(false); });
  const delegation = el('input', { type: 'checkbox', checked: stage.allow_delegation !== false });
  delegation.addEventListener('change', () => { stage.allow_delegation = delegation.checked; });
  return el('div', { class: 'policy-stage-editor' }, [
    field({ label: 'Nome da etapa', control: label, hint: `Chave: ${stage.key}` }),
    el('div', { class: 'policy-inline' }, [
      field({ label: 'Sequência', control: numberInput(stage.sequence, { min: 1, max: 9, onInput: (value) => { stage.sequence = value; } }), hint: 'Mesma sequência = em paralelo.' }),
      field({ label: 'Mínimo de aprovações', control: numberInput(stage.min_approvals, { min: 1, max: 5, onInput: (value) => { stage.min_approvals = value; } }) }),
      field({ label: 'Prazo (horas)', control: numberInput(stage.due_hours, { min: 1, max: 720, placeholder: 'sem prazo', onInput: (value) => { stage.due_hours = value; } }), optionalLabel: true })
    ]),
    checkboxGroup('Papéis que podem aprovar', POLICY_ROLES, stage.roles, (roles) => { stage.roles = roles; }),
    field({ label: 'Escopo de quem aprova', control: scope }),
    el('label', { class: 'check-option' }, [delegation, el('span', { text: 'Permite substituto por delegação (o substituto também precisa cumprir papel e escopo)' })]),
    el('div', { class: 'row-actions' }, button('Remover etapa', { size: 'sm', variant: 'ghost', iconName: 'x', onClick: onRemove }))
  ]);
}

function conditionEditor(condition, { options, onRemove, onChange }) {
  const spec = POLICY_FACTS[condition.fact];
  const fact = el('select', { 'aria-label': 'Fato' }, Object.entries(POLICY_FACTS).map(([value, item]) => el('option', { value, text: item.label, selected: value === condition.fact })));
  fact.addEventListener('change', () => { Object.keys(condition).forEach((key) => delete condition[key]); Object.assign(condition, conditionDefaults(fact.value)); onChange(true); });
  const op = el('select', { 'aria-label': 'Operador' }, Object.entries(spec.ops).map(([value, text]) => el('option', { value, text, selected: value === condition.op })));
  op.addEventListener('change', () => { condition.op = op.value; });
  let value;
  const multi = (choices, current) => {
    const select = el('select', { multiple: true, size: String(Math.min(4, Math.max(2, choices.length))), 'aria-label': 'Valores' },
      choices.map(([key, text]) => el('option', { value: key, text, selected: (current || []).includes(key) })));
    select.addEventListener('change', () => { condition.value = [...select.selectedOptions].map((option) => option.value); });
    return select;
  };
  switch (spec.type) {
    case 'money': {
      const amount = numberInput(condition.value, { min: 0, max: 1e15, onInput: (next) => { condition.value = next; } });
      const currency = el('input', { maxlength: '3', value: condition.currency || 'BRL', 'aria-label': 'Moeda', class: 'input-currency' });
      currency.addEventListener('input', () => { condition.currency = currency.value.toUpperCase(); });
      value = el('div', { class: 'policy-inline' }, [currency, amount]);
      break;
    }
    case 'currencies': {
      value = el('input', { value: (condition.value || []).join(', '), 'aria-label': 'Moedas (separadas por vírgula)' });
      value.addEventListener('input', () => { condition.value = value.value.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean); });
      break;
    }
    case 'products': value = multi(Object.entries(PRODUCTS), condition.value); break;
    case 'provider_status': value = multi(Object.entries(PROVIDER_STATUS), condition.value); break;
    case 'entities': value = multi(options.entities.map((entity) => [entity.id, entity.short_name || entity.legal_name]), condition.value); break;
    case 'bool': {
      value = el('select', { 'aria-label': 'Valor' }, [el('option', { value: 'true', text: 'sim', selected: condition.value === true }), el('option', { value: 'false', text: 'não', selected: condition.value === false })]);
      value.addEventListener('change', () => { condition.value = value.value === 'true'; });
      break;
    }
    case 'count': value = numberInput(condition.value, { min: 1, max: 20, onInput: (next) => { condition.value = next; } }); break;
    case 'months': value = numberInput(condition.value, { min: 0, max: 600, onInput: (next) => { condition.value = next; } }); break;
    case 'date': {
      value = el('input', { type: 'date', value: condition.value || '', 'aria-label': 'Data' });
      value.addEventListener('input', () => { condition.value = value.value; });
      break;
    }
    case 'flag': {
      value = el('select', { 'aria-label': 'Sinalizador' }, [el('option', { value: '', text: 'Escolha…' }), ...options.flags.map((flag) => el('option', { value: flag.key, text: flag.label, selected: flag.key === condition.value }))]);
      value.addEventListener('change', () => { condition.value = value.value; });
      break;
    }
    default: value = el('span');
  }
  return el('div', { class: 'policy-condition' }, [fact, op, value, button('Remover', { size: 'sm', variant: 'ghost', iconName: 'x', onClick: onRemove })]);
}

function requirementEditor(block) {
  block.requirements ||= {};
  const min = numberInput(block.requirements.min_proposals, { min: 2, max: 10, placeholder: 'sem mínimo', onInput: (value) => {
    if (value === null) delete block.requirements.min_proposals; else block.requirements.min_proposals = value;
  } });
  const justification = el('input', { type: 'checkbox', checked: Boolean(block.requirements.justification) });
  justification.addEventListener('change', () => { if (justification.checked) block.requirements.justification = true; else delete block.requirements.justification; });
  return el('div', { class: 'policy-inline' }, [
    field({ label: 'Mínimo de propostas', control: min, optionalLabel: true, hint: 'Abaixo disso, só com exceção aprovada.' }),
    el('label', { class: 'check-option' }, [justification, el('span', { text: 'Exige justificativa de quem pede' })])
  ]);
}

function stagesSection(block, rerender) {
  block.stages ||= [];
  return el('div', { class: 'stack-sm' }, [
    el('p', { class: 'field-label', text: 'Etapas exigidas' }),
    ...block.stages.map((stage, index) => stageEditor(stage, { onRemove: () => { block.stages.splice(index, 1); rerender(); }, onChange: (full) => { if (full) rerender(); } })),
    block.stages.length < 4 ? button('Adicionar etapa', { size: 'sm', iconName: 'plus', onClick: () => { block.stages.push(EMPTY_STAGE()); rerender(); } }) : null
  ]);
}

/** Remove campos de controle da tela e vazios antes de enviar. */
function cleanDocument(document) {
  const out = clone(document);
  const tidyStage = (stage) => { delete stage._keyEdited; if (stage.due_hours === null || stage.due_hours === undefined) delete stage.due_hours; return stage; };
  const tidyBlock = (block) => {
    block.stages = (block.stages || []).map(tidyStage);
    if (block.requirements && !Object.keys(block.requirements).length) delete block.requirements;
    return block;
  };
  out.rules = (out.rules || []).map(tidyBlock);
  if (out.fallback) { tidyBlock(out.fallback); if (!out.fallback.stages.length && !out.fallback.requirements) delete out.fallback; }
  if (!out.expire_after_hours) delete out.expire_after_hours;
  return out;
}

export function openPolicyEditor(ctx, { policy, scope, base, options, onChange }) {
  const document = base ? clone(base.document) : { rules: [EMPTY_RULE(1)], sod: { requester_cannot_decide: false, decider_not_sole_final_approver: true }, exception_approver_roles: ['admin'], escalation_roles: ['admin'], expire_after_hours: 336 };
  document.sod ||= {};
  const name = el('input', { maxlength: '160', value: policy?.name || (scope.id ? `Alçadas — ${scope.label}` : 'Alçadas do grupo') });
  const note = el('input', { maxlength: '1000', placeholder: 'Ex.: sobe o limite da tesouraria para R$ 5 mi' });
  const editor = el('div', { class: 'stack' });
  const error = el('p', { class: 'field-error', role: 'alert', hidden: true });
  const json = el('textarea', { rows: '10', class: 'mono', 'aria-label': 'Documento da policy em JSON' });
  let savedVersion = base?.status === 'draft' ? base.id : null;
  const simulation = el('div', { class: 'stack-sm' });

  const rerender = () => {
    editor.replaceChildren(
      ...document.rules.map((rule, index) => {
        const ruleLabel = el('input', { maxlength: '160', value: rule.label });
        ruleLabel.addEventListener('input', () => { rule.label = ruleLabel.value; if (!rule._idEdited && !base) rule.id = slug(ruleLabel.value); });
        return el('section', { class: 'card policy-rule-editor' }, el('div', { class: 'card-body stack-sm' }, [
          el('div', { class: 'policy-head' }, [el('h4', { text: `Regra ${index + 1}` }), button('Remover regra', { size: 'sm', variant: 'ghost', iconName: 'x', onClick: () => { document.rules.splice(index, 1); rerender(); } })]),
          field({ label: 'Descrição da regra', control: ruleLabel, hint: `Identificador: ${rule.id} (aparece na trilha de cada pedido)` }),
          el('p', { class: 'field-label', text: 'Quando (todas as condições; sem condição = sempre)' }),
          ...(rule.when || []).map((condition, conditionIndex) => conditionEditor(condition, { options, onRemove: () => { rule.when.splice(conditionIndex, 1); rerender(); }, onChange: (full) => { if (full) rerender(); } })),
          (rule.when || []).length < 10 ? button('Adicionar condição', { size: 'sm', iconName: 'plus', onClick: () => { (rule.when ||= []).push(conditionDefaults('amount')); rerender(); } }) : null,
          stagesSection(rule, rerender),
          requirementEditor(rule)
        ]));
      }),
      document.rules.length < 30 ? button('Adicionar regra', { iconName: 'plus', onClick: () => { document.rules.push(EMPTY_RULE(document.rules.length + 1)); rerender(); } }) : null,
      el('section', { class: 'card' }, el('div', { class: 'card-body stack-sm' }, [
        el('h4', { text: 'Fallback (quando nenhuma regra desta policy casar)' }),
        document.fallback ? stagesSection(document.fallback, rerender) : button('Definir fallback', { size: 'sm', iconName: 'plus', onClick: () => { document.fallback = { stages: [EMPTY_STAGE()] }; rerender(); } }),
        document.fallback ? button('Remover fallback', { size: 'sm', variant: 'ghost', iconName: 'x', onClick: () => { delete document.fallback; rerender(); } }) : null
      ])),
      governanceEditor(document)
    );
    json.value = JSON.stringify(cleanDocument(document), null, 2);
  };

  const advanced = el('details', {}, [el('summary', { text: 'Documento em JSON (avançado)' }), json,
    button('Aplicar JSON ao editor', { size: 'sm', onClick: () => {
      try {
        const parsed = JSON.parse(json.value);
        const checked = validatePolicyDocument(parsed);
        if (!checked.ok) { error.textContent = checked.error; error.hidden = false; return; }
        Object.keys(document).forEach((key) => delete document[key]);
        Object.assign(document, parsed, { sod: parsed.sod || {} });
        error.hidden = true;
        rerender();
      } catch { error.textContent = 'JSON inválido.'; error.hidden = false; }
    } })]);

  const save = async () => {
    error.hidden = true;
    const payload = cleanDocument(document);
    const checked = validatePolicyDocument(payload);
    if (!checked.ok) { error.textContent = checked.error; error.hidden = false; return null; }
    try {
      const out = await ctx.api('approval-policies', { method: 'POST', body: JSON.stringify({
        organization_id: ctx.organization.id, legal_entity_id: scope.id, name: name.value.trim(), document: payload, change_note: note.value.trim() || null }) });
      savedVersion = out.version_id;
      toast('Rascunho salvo. Ative quando estiver pronto.');
      onChange?.();
      return savedVersion;
    } catch (failure) { error.textContent = failure.message; error.hidden = false; return null; }
  };

  const simulateForm = simulationForm(ctx, options, async (facts) => {
    const version = savedVersion || await save();
    if (!version) return;
    try {
      const out = await ctx.api('approval-policies/simulate', { method: 'POST', body: JSON.stringify({ version_id: version, facts }) });
      simulation.replaceChildren(planSummary(ctx, out.evaluation, { simulation: true }));
    } catch (failure) { simulation.replaceChildren(errorState({ error: failure })); }
  });

  rerender();
  drawer({
    title: base ? `Nova versão — ${scope.label}` : `Criar policy — ${scope.label}`,
    subtitle: 'Regras do cliente: quem aprova, em que ordem e quando. O Arandu não pontua nem recomenda.',
    className: 'drawer-wide',
    body: [el('div', { class: 'stack' }, [field({ label: 'Nome da policy', control: name }), field({ label: 'O que muda nesta versão', control: note, optionalLabel: true }),
      editor, advanced, el('details', { class: 'policy-simulation' }, [el('summary', { text: 'Simular esta versão com fatos de exemplo' }), simulateForm, simulation]), error])],
    footer: [button('Salvar rascunho', { variant: 'primary', iconName: 'check', onClick: save })]
  });
}

function governanceEditor(document) {
  const rcd = el('input', { type: 'checkbox', checked: Boolean(document.sod.requester_cannot_decide) });
  rcd.addEventListener('change', () => { document.sod.requester_cannot_decide = rcd.checked; });
  const dnsfa = el('input', { type: 'checkbox', checked: document.sod.decider_not_sole_final_approver !== false });
  dnsfa.addEventListener('change', () => { document.sod.decider_not_sole_final_approver = dnsfa.checked; });
  return el('section', { class: 'card' }, el('div', { class: 'card-body stack-sm' }, [
    el('h4', { text: 'Segregação de funções, exceções e prazos' }),
    el('p', { class: 'muted small', text: 'Sempre valem: quem pede não aprova; ninguém ocupa duas etapas do mesmo pedido; só membros da empresa compradora aprovam.' }),
    el('label', { class: 'check-option' }, [rcd, el('span', { text: 'Quem pede a aprovação não registra a decisão' })]),
    el('label', { class: 'check-option' }, [dnsfa, el('span', { text: 'Quem decide não pode ser o único aprovador da etapa final' })]),
    checkboxGroup('Quem decide exceções desta policy', POLICY_ROLES, document.exception_approver_roles || ['admin'], (roles) => { document.exception_approver_roles = roles; }),
    checkboxGroup('Quem recebe escalação de prazo', POLICY_ROLES, document.escalation_roles || ['admin'], (roles) => { document.escalation_roles = roles; }),
    field({ label: 'Validade do pedido (horas)', control: numberInput(document.expire_after_hours, { min: 1, max: 2160, placeholder: 'sem validade', onInput: (value) => { document.expire_after_hours = value; } }), optionalLabel: true,
      hint: 'Pedido não concluído nesse prazo expira (não é aprovado).' })
  ]));
}

function simulationForm(ctx, options, onRun) {
  const product = el('select', {}, Object.entries(PRODUCTS).map(([value, text]) => el('option', { value, text })));
  const currency = el('input', { maxlength: '3', value: ctx.organization?.base_currency || 'BRL', class: 'input-currency' });
  const amount = el('input', { type: 'number', min: '0', value: '1000000' });
  const proposals = el('input', { type: 'number', min: '0', max: '50', value: '2' });
  const entity = el('select', {}, [el('option', { value: '', text: 'Nível de grupo' }), ...options.entities.map((row) => el('option', { value: row.id, text: row.short_name || row.legal_name }))]);
  const providerNew = el('input', { type: 'checkbox' });
  const guarantee = el('input', { type: 'checkbox' });
  const covenant = el('input', { type: 'checkbox' });
  const duration = el('input', { type: 'number', min: '0', max: '600', value: '24' });
  const form = el('form', { class: 'stack-sm', novalidate: true }, [
    el('div', { class: 'policy-inline' }, [field({ label: 'Produto', control: product }), field({ label: 'Moeda', control: currency }), field({ label: 'Valor', control: amount })]),
    el('div', { class: 'policy-inline' }, [field({ label: 'Propostas', control: proposals }), field({ label: 'Prazo (meses)', control: duration }), field({ label: 'Entidade', control: entity })]),
    el('div', { class: 'check-row' }, [el('label', { class: 'check-option' }, [providerNew, el('span', { text: 'Provedor novo' })]),
      el('label', { class: 'check-option' }, [guarantee, el('span', { text: 'Garantia exigida' })]), el('label', { class: 'check-option' }, [covenant, el('span', { text: 'Covenant presente' })])]),
    button('Simular', { type: 'submit', size: 'sm', iconName: 'checkCircle' })
  ]);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const entityRow = options.entities.find((row) => row.id === entity.value);
    onRun({ product: product.value, currency: currency.value.toUpperCase(), amount: amount.value === '' ? null : Number(amount.value), proposals_count: Number(proposals.value || 0),
      contract_duration_months: duration.value === '' ? null : Number(duration.value), legal_entity_id: entity.value || null, legal_entity_parent_id: entityRow?.parent_id || null,
      provider_new: providerNew.checked, guarantee_required: guarantee.checked, covenant_present: covenant.checked, flags: [] });
  });
  return form;
}

function flagSettings(ctx, flags, onChange) {
  const key = el('input', { maxlength: '41', placeholder: 'ex.: sanctions_review' });
  const label = el('input', { maxlength: '120', placeholder: 'Ex.: Revisão de sanções' });
  const kind = el('select', {}, Object.entries(FLAG_KINDS).map(([value, text]) => el('option', { value, text })));
  const persist = async (body) => {
    try { await ctx.api('approval-policies/flags', { method: 'POST', body: JSON.stringify({ organization_id: ctx.organization.id, ...body }) }); toast('Sinalizador salvo.'); onChange(); }
    catch (error) { toast(error.message, 'error'); }
  };
  const form = el('form', { class: 'policy-inline', novalidate: true }, [field({ label: 'Chave', control: key }), field({ label: 'Nome', control: label }), field({ label: 'Tipo', control: kind }),
    button('Adicionar', { type: 'submit', size: 'sm', iconName: 'plus' })]);
  form.addEventListener('submit', (event) => { event.preventDefault(); persist({ key: key.value.trim(), label: label.value.trim(), kind: kind.value, active: true }); });
  return el('details', {}, [el('summary', { text: `Sinalizadores de exceção, risco e compliance (${flags.length})` }),
    el('p', { class: 'muted small', text: 'Definidos pela sua empresa. Quem pede a aprovação os declara; a declaração fica gravada no pedido. Regras podem exigir etapas quando um sinalizador estiver presente.' }),
    el('ul', { class: 'plain-list' }, flags.map((flag) => el('li', {}, [el('strong', { text: flag.label }), el('span', { class: 'muted small', text: ` · ${flag.key} · ${FLAG_KINDS[flag.kind] || flag.kind}` }), flag.active ? null : tag('inativo'),
      button(flag.active ? 'Desativar' : 'Reativar', { size: 'sm', variant: 'ghost', onClick: () => persist({ key: flag.key, label: flag.label, kind: flag.kind, active: !flag.active }) })]))),
    form]);
}

// ------------------------------------------------------------- delegações
export function delegationSettings(ctx) {
  const box = el('div', { class: 'stack-sm' }, loading());
  const render = () => ctx.api(`approval-delegations?organization_id=${encodeURIComponent(ctx.organization.id)}`).then(({ rows }) => {
    const now = Date.now();
    const list = (rows || []).length ? el('ul', { class: 'plain-list' }, rows.map((row) => {
      const live = !row.revoked_at && Date.parse(row.starts_at) <= now && Date.parse(row.ends_at) > now;
      return el('li', {}, [el('strong', { text: `${memberName(ctx.members, row.delegator_id)} → ${memberName(ctx.members, row.delegate_id)}` }),
        el('span', { class: 'muted small', text: ` · ${formatDateTime(row.starts_at)} a ${formatDateTime(row.ends_at)} · ${row.reason}` }),
        row.revoked_at ? tag('revogada') : live ? tag('vigente', 'success') : tag('agendada', 'info'),
        !row.revoked_at && (row.delegator_id === ctx.viewer?.id || ctx.viewer?.role === 'admin') ? button('Revogar', { size: 'sm', variant: 'ghost', onClick: async () => {
          try { await ctx.api('approval-delegations/revoke', { method: 'POST', body: JSON.stringify({ delegation_id: row.id }) }); toast('Delegação revogada.'); render(); } catch (error) { toast(error.message, 'error'); }
        } }) : null]);
    })) : el('p', { class: 'muted small', text: 'Nenhuma delegação registrada.' });
    const delegate = el('select', {}, [el('option', { value: '', text: 'Escolha quem substitui você…' }), ...(ctx.members || []).filter((member) => member.user_id !== ctx.viewer?.id && member.role !== 'provider_user')
      .map((member) => el('option', { value: member.user_id, text: `${member.display_name || memberName(ctx.members, member.user_id)} · ${ROLE_LABELS[member.role] || member.role}` }))]);
    const ends = el('input', { type: 'date' });
    const reason = el('input', { maxlength: '500', placeholder: 'Ex.: férias de 10 a 20/11' });
    const form = el('form', { class: 'policy-inline', novalidate: true }, [field({ label: 'Substituto', control: delegate }), field({ label: 'Até', control: ends }), field({ label: 'Motivo', control: reason }),
      button('Delegar', { type: 'submit', size: 'sm', iconName: 'send' })]);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!delegate.value || !ends.value) { toast('Escolha o substituto e a data final.', 'error'); return; }
      try {
        await ctx.api('approval-delegations', { method: 'POST', body: JSON.stringify({ organization_id: ctx.organization.id, delegate_id: delegate.value, starts_at: new Date().toISOString(), ends_at: `${ends.value}T23:59:00`, reason: reason.value.trim() }) });
        toast('Delegação registrada.'); render();
      } catch (error) { toast(error.message, 'error'); }
    });
    box.replaceChildren(el('p', { class: 'muted small', text: 'Durante a delegação, o substituto pode votar nas suas etapas que admitem delegação — desde que ele mesmo tenha o papel e o acesso à entidade exigidos, e não participe de outra etapa do mesmo pedido. A trilha registra o voto em seu nome.' }), list, form);
  }).catch(() => box.replaceChildren(el('p', { class: 'muted small', text: 'Delegação indisponível neste ambiente.' })));
  render();
  return box;
}

// ------------------------------------------------------------- plano
/** Plano derivado (prévia, simulação ou snapshot de um pedido). */
export function planSummary(ctx, evaluation, { simulation = false, stages = null } = {}) {
  if (!evaluation) return el('span');
  const parts = [];
  const policies = (evaluation.policies || []).map((policy) => `${policy.name} v${policy.version} (${policy.scope === 'group' ? 'grupo' : 'entidade'})`);
  parts.push(el('p', { class: 'small' }, [el('strong', { text: simulation ? 'Simulação: ' : 'Policy aplicável: ' }), el('span', { text: policies.length ? policies.join(' + ') : 'nenhuma policy ativa' })]));
  const matched = evaluation.matched || [];
  if (matched.length) {
    parts.push(el('ul', { class: 'plain-list small' }, matched.map((rule) => el('li', {}, [icon('flag', { size: 12 }), el('span', { text: ` ${rule.label}` }),
      rule.conservative ? el('span', { class: 'muted', text: ` — acionada por falta de dado: ${(rule.unknown_facts || []).map((fact) => UNKNOWN_FACT_LABELS[fact] || fact).join(', ')}` }) : null]))));
  }
  const plan = stages || evaluation.stages || [];
  if (plan.length) {
    const bySequence = new Map();
    for (const stage of plan) bySequence.set(stage.sequence, [...(bySequence.get(stage.sequence) || []), stage]);
    parts.push(el('ol', { class: 'policy-plan' }, [...bySequence.entries()].sort((a, b) => a[0] - b[0]).map(([sequence, group]) => el('li', {}, [
      el('span', { class: 'policy-plan-seq', text: `${sequence}` }),
      el('div', { class: 'stack-xs' }, group.map((stage) => el('span', { class: 'small', text: describeStage(stage) }))),
      group.length > 1 ? tag('em paralelo', 'info') : null
    ]))));
  } else {
    parts.push(el('p', { class: 'muted small', text: 'Nenhuma etapa de aprovação exigida pela policy.' }));
  }
  for (const blocker of evaluation.blockers || []) {
    parts.push(el('p', { class: 'callout callout-warning compact' }, [icon('alert', { size: 14 }), el('span', { text: `A regra exige ao menos ${blocker.required} propostas; há ${blocker.actual}. Só segue com exceção aprovada.` })]));
  }
  if (evaluation.requirements?.justification) parts.push(el('p', { class: 'muted small', text: 'A policy exige justificativa de quem pede.' }));
  return el('div', { class: 'policy-plan-box stack-sm' }, parts);
}

// ------------------------------------------------------------- linha do tempo
/** Etapas, exceções e versão da policy de um pedido gravado. */
export function policyTimeline(ctx, request, { onChange } = {}) {
  const snapshot = request.policy_snapshot;
  if (!snapshot) return null;
  const stages = [...(request.stages || [])].sort((a, b) => a.sequence - b.sequence || a.stage_key.localeCompare(b.stage_key));
  const steps = request.steps || [];
  const items = stages.map((stage) => {
    const people = steps.filter((step) => step.stage_id === stage.id);
    const due = stage.status === 'active' && stage.due_at ? ` · prazo ${formatDateTime(stage.due_at)}${Date.parse(stage.due_at) < Date.now() ? ' (vencido)' : ''}` : '';
    return el('li', { class: `step step-${STAGE_TONE[stage.status] || 'neutral'}` }, [
      el('span', { class: 'step-icon' }, icon(stage.status === 'approved' ? 'checkCircle' : stage.status === 'active' ? 'clock' : stage.status === 'rejected' ? 'x' : 'more', { size: 14 })),
      el('span', { class: 'step-body' }, [
        el('span', { class: 'step-who' }, [el('strong', { text: `${stage.sequence}. ${stage.label}` }), el('span', { class: 'muted', text: ` · ${STAGE_STATUS_LABELS[stage.status] || stage.status}${due}${stage.escalated_at ? ' · escalada' : ''}` })]),
        el('span', { class: 'step-state', text: `${stage.min_approvals} de ${people.length} indicado(s): ${people.map((step) => {
          const acted = step.acted_by && step.acted_by !== step.approver_id ? ` (por ${memberName(ctx.members, step.acted_by)}, delegação)` : '';
          const verb = { approved: 'aprovou', rejected: 'rejeitou', changes_requested: 'devolveu', not_required: 'não precisou', waived: 'dispensado', expired: 'expirou', superseded: 'substituído', cancelled: 'encerrado' }[step.status] || 'aguardando';
          return `${memberName(ctx.members, step.approver_id)} ${verb}${acted}`;
        }).join('; ')}` }),
        ...people.filter((step) => step.comment).map((step) => el('span', { class: 'step-comment', text: `“${step.comment}”${step.reason_code ? ` — ${STEP_REASON_CODES[step.reason_code] || step.reason_code}` : ''}` }))
      ])
    ]);
  });
  const header = el('p', { class: 'small' }, [el('strong', { text: 'Policy: ' }), el('span', { text: (snapshot.policies || []).map((policy) => `${policy.name} v${policy.version}`).join(' + ') || '—' }),
    el('span', { class: 'muted', text: ` · avaliada ${formatDateTime(request.evaluated_at || snapshot.evaluated_at)}${request.expires_at ? ` · válida até ${formatDateTime(request.expires_at)}` : ''}` })]);
  const rules = el('details', {}, [el('summary', { text: `Regras acionadas (${(snapshot.matched || []).length})` }), planSummary(ctx, snapshot, { stages: [] })]);
  const exceptions = exceptionList(ctx, request, { onChange });
  return el('section', { class: 'policy-timeline stack-sm', 'aria-label': 'Fluxo de aprovação pela policy' }, [header, el('ol', { class: 'steps-list' }, items), exceptions, rules,
    request.justification ? el('p', { class: 'small' }, [el('strong', { text: 'Justificativa: ' }), el('span', { text: request.justification })]) : null,
    request.resolution_note ? el('p', { class: 'muted small', text: `Encerramento: ${request.resolution_note}` }) : null]);
}

function exceptionList(ctx, request, { onChange }) {
  const snapshot = request.policy_snapshot;
  const exceptions = request.exceptions || [];
  const canManage = ctx.can?.('create_rfq');
  const box = el('div', { class: 'stack-xs' });
  if (exceptions.length) {
    box.append(el('p', { class: 'field-label', text: 'Exceções' }), el('ul', { class: 'plain-list' }, exceptions.map((item) => {
      const rule = (snapshot.matched || []).find((row) => row.policy_version_id === item.policy_version_id && row.rule_id === item.rule_id);
      const canDecide = item.status === 'requested' && request.status === 'pending' && ![item.requested_by, request.requested_by].includes(ctx.viewer?.id);
      return el('li', { class: 'stack-xs' }, [
        el('span', {}, [pill({ label: EXCEPTION_STATUS_LABELS[item.status] || item.status, tone: EXCEPTION_TONE[item.status] || 'neutral' }), el('strong', { text: ` ${rule?.label || item.rule_id}` })]),
        el('span', { class: 'small', text: `${EXCEPTION_REASON_CODES[item.reason_code] || item.reason_code}: ${item.reason} — pedida por ${memberName(ctx.members, item.requested_by)} ${timeAgo(item.created_at)}` }),
        (item.evidence || []).length ? el('span', { class: 'muted small', text: `Evidências: ${item.evidence.map((ev) => ev.label + (ev.reference ? ` (${ev.reference})` : '')).join('; ')}` }) : null,
        item.decided_at ? el('span', { class: 'muted small', text: `Decidida por ${memberName(ctx.members, item.decided_by)} ${timeAgo(item.decided_at)}: “${item.decision_comment}”` }) : null,
        canDecide ? el('div', { class: 'row-actions' }, [
          button('Aprovar exceção', { size: 'sm', variant: 'primary', onClick: () => decideException(ctx, item, 'approved', onChange) }),
          button('Rejeitar exceção', { size: 'sm', variant: 'danger-ghost', onClick: () => decideException(ctx, item, 'rejected', onChange) })]) : null,
        item.status === 'requested' && item.requested_by === ctx.viewer?.id ? button('Cancelar exceção', { size: 'sm', variant: 'ghost', onClick: async () => {
          try { await ctx.api('approval-exceptions/cancel', { method: 'POST', body: JSON.stringify({ exception_id: item.id }) }); toast('Exceção cancelada.'); onChange?.(); } catch (error) { toast(error.message, 'error'); }
        } }) : null
      ]);
    })));
  }
  if (request.status === 'pending' && canManage && (snapshot.matched || []).length) {
    box.append(button('Pedir exceção a uma regra', { size: 'sm', iconName: 'flag', onClick: () => requestException(ctx, request, onChange) }));
  }
  return box.children.length ? box : null;
}

async function decideException(ctx, item, decision, onChange) {
  const comment = await promptDialog({ title: decision === 'approved' ? 'Aprovar a exceção' : 'Rejeitar a exceção', description: 'A decisão fica registrada com seu nome, data e motivo.', label: 'Motivo da decisão', minLength: 3,
    confirmLabel: decision === 'approved' ? 'Aprovar exceção' : 'Rejeitar exceção', tone: decision === 'approved' ? 'primary' : 'danger' });
  if (comment === null) return;
  try {
    const out = await ctx.api('approval-exceptions/decide', { method: 'POST', body: JSON.stringify({ exception_id: item.id, decision, comment }) });
    toast(out.request_status === 'approved' ? 'Exceção aprovada; o pedido foi concluído.' : decision === 'approved' ? 'Exceção aprovada.' : 'Exceção rejeitada.');
    onChange?.();
  } catch (error) { toast(error.message, 'error'); }
}

function requestException(ctx, request, onChange) {
  const matched = request.policy_snapshot.matched || [];
  const rule = el('select', {}, matched.map((row, index) => el('option', { value: String(index), text: `${row.label}${row.fallback ? ' (fallback)' : ''}` })));
  const code = el('select', {}, Object.entries(EXCEPTION_REASON_CODES).map(([value, text]) => el('option', { value, text })));
  const reason = el('textarea', { rows: '4', maxlength: '2000', placeholder: 'Explique por que a regra não deve valer neste caso.' });
  const evidence = el('input', { maxlength: '300', placeholder: 'Ex.: ata do comitê de crédito de 02/10' });
  const error = el('p', { class: 'field-error', role: 'alert', hidden: true });
  const dialog = drawer({ title: 'Pedir exceção', subtitle: 'Exceção é registro próprio: quem pediu, regra, motivo, evidência e quem decidiu.', body: [el('div', { class: 'stack' }, [
    field({ label: 'Regra a dispensar', control: rule }), field({ label: 'Motivo', control: code }), field({ label: 'Explicação', control: reason, hint: 'Ao menos 10 caracteres.' }),
    field({ label: 'Evidência (referência)', control: evidence, optionalLabel: true }), error])],
    footer: [button('Enviar pedido de exceção', { variant: 'primary', iconName: 'send', onClick: async () => {
      const target = matched[Number(rule.value)];
      try {
        await ctx.api('approval-exceptions', { method: 'POST', body: JSON.stringify({ request_id: request.id, policy_version_id: target.policy_version_id, rule_id: target.rule_id, reason_code: code.value,
          reason: reason.value.trim(), evidence: evidence.value.trim() ? [{ label: 'Referência', reference: evidence.value.trim() }] : [] }) });
        toast('Exceção pedida. Quem decide exceções desta policy vê o pedido no processo.');
        dialog.close();
        onChange?.();
      } catch (failure) { error.textContent = failure.message; error.hidden = false; }
    } })] });
}

/** Indicação de aprovadores por etapa do plano, filtrando por papel e escopo conhecidos. */
export function stageAssignments(ctx, stages, assignments) {
  const box = el('div', { class: 'stack-sm' });
  for (const stage of stages) {
    assignments[stage.key] ||= [];
    const group = el('fieldset', { class: 'approver-pick' }, el('legend', { class: 'field-label', text: `${stage.sequence}. ${stage.label} — ${stage.min_approvals} aprovação(ões)` }));
    group.append(el('p', { class: 'field-hint', text: describeStage(stage) }));
    const candidates = (ctx.members || []).filter((member) => member.user_id !== ctx.viewer?.id && stage.roles.includes(member.role)
      && (stage.scope !== 'group' || (member.entity_scope || 'group') === 'group') && (stage.scope !== 'entity' || member.entity_scope === 'entities'));
    for (const member of candidates) {
      const box2 = el('input', { type: 'checkbox', value: member.user_id, checked: assignments[stage.key].includes(member.user_id) });
      box2.addEventListener('change', () => {
        const list = assignments[stage.key];
        if (box2.checked) list.push(member.user_id); else list.splice(list.indexOf(member.user_id), 1);
      });
      group.append(el('label', { class: 'approver-option' }, [box2, el('span', { class: 'order-badge', 'aria-hidden': 'true' }), el('span', { text: `${member.display_name || memberName(ctx.members, member.user_id)} · ${member.title || memberTitle(ctx.members, member.user_id) || ROLE_LABELS[member.role]}` })]));
    }
    if (!candidates.length) group.append(el('p', { class: 'muted small', text: 'Nenhum membro com o papel e o escopo desta etapa. Ajuste o escopo de acesso ou a policy.' }));
    box.append(group);
  }
  return box;
}

export { APPROVAL_STATUS_LABELS, STEP_REASON_CODES, describeCondition };
