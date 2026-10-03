// Policy & Approval Engine v2 na interface.
//
// A policy é da empresa: quais fatos do processo exigem quais etapas humanas.
// A avaliação acontece no banco e fica gravada no pedido de aprovação; aqui só
// se publica (admin) e se mostra a prévia do que será exigido.

import { el, icon, formatDateTime } from '../core.js';
import { button, tag, field, toast, loading, errorState } from '../ui.js';
import { describeRule } from '../../../lib/finance/policy.mjs';
import { entityTree } from '../../../lib/finance/entities.mjs';
import { entityName } from './entities.js';

const memberLabel = (ctx) => (id) => (ctx.members || []).find((member) => member.user_id === id)?.display_name || 'membro';

/** Configurações → Políticas de aprovação v2. */
export function policySettings(ctx, entities) {
  const box = el('div', { class: 'stack' }, loading());
  const load = () => ctx.api(`policies?organization_id=${encodeURIComponent(ctx.organization.id)}`).then((result) => {
    const active = result.rows.filter((row) => row.status === 'active');
    const history = result.rows.filter((row) => row.status !== 'active');
    const parts = [el('p', { class: 'muted small', text: result.notice })];
    parts.push(active.length ? el('ul', { class: 'policy-list', role: 'list' }, active.map((policy) => el('li', { class: 'version-row' }, [
      el('div', { class: 'version-head' }, [tag(`v${policy.version}`, 'accent'), el('strong', { text: policy.name }),
        tag(policy.legal_entity_id ? `Local: ${entityName(entities, policy.legal_entity_id)}` : 'Global (grupo)', policy.legal_entity_id ? 'neutral' : 'accent'),
        el('span', { class: 'muted small', text: `publicada ${formatDateTime(policy.created_at)}` })]),
      el('ul', { class: 'diff-list' }, policy.rules.map((rule) => el('li', { text: `${rule.label} — ${describeRule(rule, { memberName: memberLabel(ctx) })}` }))),
      ctx.can('admin') ? button('Aposentar', { size: 'sm', variant: 'ghost', onClick: async () => {
        try { await ctx.api('policies/retire', { method: 'POST', body: JSON.stringify({ policy_id: policy.id }) }); toast('Policy aposentada. Pedidos em andamento mantêm a avaliação gravada.'); box.replaceChildren(loading()); load(); }
        catch (error) { toast(error.message, 'error'); }
      } }) : null
    ]))) : el('p', { class: 'muted', text: 'Nenhuma policy v2 ativa. A regra geral acima (exigir aprovação antes de decidir) continua valendo.' }));
    if (history.length) parts.push(el('details', {}, [el('summary', { text: `Versões anteriores (${history.length})` }),
      el('ul', { class: 'plain-list' }, history.map((policy) => el('li', { text: `${policy.name} v${policy.version} · aposentada ${formatDateTime(policy.retired_at)}` })))]));
    if (ctx.can('admin')) parts.push(policyBuilder(ctx, entities, () => { box.replaceChildren(loading()); load(); }));
    box.replaceChildren(...parts);
  }).catch((error) => box.replaceChildren(errorState({ error })));
  load();
  return box;
}

function ruleEditor(ctx, index) {
  const label = el('input', { maxlength: '160', value: index === 0 ? 'Crédito acima de R$ 5 milhões' : '' });
  const credit = el('input', { type: 'checkbox', checked: index === 0 });
  const acquiring = el('input', { type: 'checkbox' });
  const amountGte = el('input', { type: 'number', min: '0', step: 'any', value: index === 0 ? '5000000' : '' });
  const amountLt = el('input', { type: 'number', min: '0', step: 'any' });
  const termGt = el('input', { type: 'number', min: '0', step: '1' });
  const proposalsLt = el('input', { type: 'number', min: '1', max: '20', step: '1' });
  const providerNew = el('input', { type: 'checkbox' });
  const collateral = el('input', { type: 'checkbox' });
  const approvals = el('input', { type: 'number', min: '1', max: '5', step: '1', value: index === 0 ? '2' : '' });
  const treasury = el('input', { type: 'checkbox', checked: index === 0 });
  const minProposals = el('input', { type: 'number', min: '1', max: '20', step: '1' });
  const justification = el('input', { type: 'checkbox' });
  const stepHours = el('input', { type: 'number', min: '1', max: '720', step: '1' });
  const escalate = el('select');
  escalate.add(new Option('Ninguém (admins do grupo)', ''));
  for (const member of ctx.members || []) escalate.add(new Option(member.display_name || 'Membro', member.user_id));
  const sod = el('input', { type: 'checkbox' });
  const check = (input, text) => el('label', { class: 'check-row' }, [input, el('span', { text })]);
  const wrap = el('fieldset', { class: 'rule-editor' }, [el('legend', { text: `Regra ${index + 1}` }),
    field({ label: 'Rótulo da regra', control: label, required: true }),
    el('p', { class: 'field-label', text: 'Quando (todas as condições preenchidas valem)' }),
    el('div', { class: 'field-grid' }, [check(credit, 'Crédito'), check(acquiring, 'Adquirência'), field({ label: 'Valor a partir de', control: amountGte, optionalLabel: true }),
      field({ label: 'Valor abaixo de', control: amountLt, optionalLabel: true }), field({ label: 'Prazo acima de (meses)', control: termGt, optionalLabel: true }),
      field({ label: 'Menos propostas que', control: proposalsLt, optionalLabel: true }), check(providerNew, 'Provedor sem contrato anterior'), check(collateral, 'Proposta exige garantia')]),
    el('p', { class: 'field-label', text: 'Exige' }),
    el('div', { class: 'field-grid' }, [field({ label: 'Mínimo de aprovadores', control: approvals, optionalLabel: true }), check(treasury, 'Ao menos 1 aprovador da tesouraria do grupo (admin/gestão, escopo de grupo)'),
      field({ label: 'Mínimo de propostas (abaixo disso, justificativa)', control: minProposals, optionalLabel: true }), check(justification, 'Justificativa sempre'),
      field({ label: 'Prazo por etapa (horas)', control: stepHours, optionalLabel: true }), field({ label: 'Escalar atraso para', control: escalate }),
      check(sod, 'Quem pediu a aprovação não registra a decisão')])]);
  wrap.read = () => {
    const products = [credit.checked && 'credit', acquiring.checked && 'acquiring'].filter(Boolean);
    const when = {};
    if (products.length) when.products = products;
    if (amountGte.value) when.amount_gte = Number(amountGte.value);
    if (amountLt.value) when.amount_lt = Number(amountLt.value);
    if (termGt.value) when.term_months_gt = Number(termGt.value);
    if (proposalsLt.value) when.proposals_lt = Number(proposalsLt.value);
    if (providerNew.checked) when.provider_new = true;
    if (collateral.checked) when.collateral_required = true;
    const require = {};
    if (approvals.value) require.approvals = Number(approvals.value);
    if (treasury.checked) require.approver_groups = [{ roles: ['admin', 'finance_manager'], scope: 'group', label: 'Tesouraria do grupo' }];
    if (minProposals.value) require.min_proposals = Number(minProposals.value);
    if (justification.checked) require.justification = true;
    if (stepHours.value) require.step_hours = Number(stepHours.value);
    if (escalate.value) require.escalate_to = escalate.value;
    if (sod.checked) require.sod_decider = true;
    if (!Object.keys(require).length) require.approval_required = true;
    return { id: `regra_${index + 1}`, label: label.value.trim(), when, require };
  };
  return wrap;
}

function policyBuilder(ctx, entities, onPublished) {
  const name = el('input', { maxlength: '160', value: 'Alçadas do grupo' });
  const key = el('input', { maxlength: '41', value: 'alcadas_grupo', pattern: '[a-z][a-z0-9_]{1,40}' });
  const scope = el('select');
  scope.add(new Option('Global (todo o grupo)', ''));
  for (const row of entityTree(entities.rows)) if (row.status === 'active') scope.add(new Option(`Local: ${row.short_name || row.legal_name}`, row.id));
  const rules = el('div', { class: 'stack' });
  const addRule = () => rules.append(ruleEditor(ctx, rules.children.length));
  addRule();
  const form = el('form', { class: 'stack', id: 'policy-form', novalidate: true }, [
    el('div', { class: 'field-grid' }, [field({ label: 'Nome', control: name, required: true }), field({ label: 'Identificador (mesmo identificador = nova versão)', control: key, required: true }),
      entities.rows.length ? field({ label: 'Escopo', control: scope }) : null]),
    rules, button('Adicionar regra', { size: 'sm', iconName: 'plus', onClick: addRule }),
    el('p', { class: 'callout callout-info compact' }, [icon('info', { size: 14 }), el('span', { text: 'Global e local se somam e vale o mais restrito. Publicar cria uma versão imutável; pedidos de aprovação já abertos mantêm a avaliação da versão anterior.' })]),
    el('div', { class: 'form-actions' }, button('Publicar policy', { variant: 'primary', type: 'submit', iconName: 'check' }))]);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await ctx.api('policies', { method: 'POST', body: JSON.stringify({ organization_id: ctx.organization.id, policy_key: key.value.trim(), name: name.value.trim(),
        legal_entity_id: scope.value || null, rules: [...rules.children].map((editor) => editor.read()) }) });
      toast('Policy publicada como nova versão.');
      onPublished();
    } catch (error) { toast(error.message, 'error'); }
  });
  return el('details', { class: 'policy-builder' }, [el('summary', { text: 'Publicar policy ou nova versão' }), form]);
}

/** Prévia da policy para o pedido de aprovação; devolve o elemento e o estado. */
export function policyPreview(ctx, rfq) {
  const box = el('div', { class: 'policy-preview', role: 'status', 'aria-live': 'polite', hidden: true });
  const state = { requirements: null };
  box.refresh = async (proposalId) => {
    try {
      const { evaluation } = await ctx.api(`policy-preview?rfq_id=${encodeURIComponent(rfq.id)}${proposalId ? `&proposal_id=${encodeURIComponent(proposalId)}` : ''}`);
      state.requirements = evaluation?.requirements || null;
      const matched = evaluation?.matched || [];
      const req = state.requirements || {};
      box.replaceChildren(
        el('p', { class: 'field-label', text: 'O que a política da empresa exige para este processo' }),
        matched.length ? el('ul', { class: 'diff-list' }, matched.map((item) => el('li', { text: item.label }))) : el('p', { class: 'muted small', text: 'Nenhuma regra se aplica a este processo.' }),
        matched.length ? el('p', { class: 'small', text: [
          req.approvals ? `${req.approvals} aprovador(es) no mínimo` : null,
          ...(req.approver_groups || []).map((group) => `ao menos 1 de "${group.label}"`),
          req.justification_required ? 'justificativa obrigatória' : null,
          req.step_hours ? `${req.step_hours} h por etapa` : null,
          req.sod_decider ? 'quem pede não registra a decisão' : null
        ].filter(Boolean).join(' · ') }) : null);
      box.hidden = false;
      box.dispatchEvent(new CustomEvent('policy', { detail: state.requirements }));
    } catch {
      // Transporte sem policy v2 (ex.: sandbox): segue sem prévia.
      box.hidden = true;
      state.requirements = null;
    }
  };
  return { box, state };
}
