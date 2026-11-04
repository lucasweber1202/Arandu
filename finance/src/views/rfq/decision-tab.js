/* global __ARANDU_DEMO__ */
// Aba Decisão: registro da decisão humana e do contrato. Carregada ao abrir a aba.
// Extraído de views/rfq.js (v7.0).

import { PRODUCTS } from '../../../../lib/finance/products.mjs';
import { el, icon, fieldValue, formatDate, formatDateTime } from '../../core.js';
import { card, button, linkButton, emptyState, errorState, loading, toast, confirmDialog, field, onSubmit } from '../../ui.js';
import { approvalSummaryLine } from '../shared/approvals.js';
import { memberName } from '../shared/people.js';
import { keyTerms } from '../shared/terms.js';
import { proposalChanges } from '../../../../lib/finance/comparison-context.mjs';

export function decisionTab(ctx, rfq, { decision, contract, policy, approvals, manage, externalUi }) {
  const wrap = el('div', { class: 'stack' });
  const externalRequestKey=`external-decision-${crypto.randomUUID()}`;
  const proposals = [...(rfq.proposals || []),...(rfq.external_decision_alternatives || [])];
  if (decision) {
    const liveChosen = proposals.find((row) => row.id === decision.proposal_id);
    const selected = decision.selected_proposal;
    const frozenMissing = Object.hasOwn(decision, 'selected_proposal') && !selected;
    const chosen = selected ? {...liveChosen, ...selected, id:decision.external_proposal_id||decision.proposal_id, provider_name:selected.provider_name||liveChosen?.provider_name || 'Instituição escolhida'} : frozenMissing ? null : liveChosen;
    if(decision.external_proposal_id && externalUi) wrap.append(externalUi.externalDecisionNotice());
    const weights = Object.entries(decision.criteria?.weights || {});
    const specs = Object.fromEntries(PRODUCTS[rfq.product].proposalFields.map((item) => [item.key, item]));
    wrap.append(card({ title: 'Decisão registrada', id: 'decisao-registrada', body: [
      el('div', { class: 'decision-summary' }, [
        el('span', { class: 'decision-icon' }, icon('flag', { size: 18 })),
        el('div', {}, [el('p', { class: 'decision-title', text: chosen ? `${chosen.provider_name} · proposta v${decision.proposal_version || chosen.version}` : 'Proposta escolhida' }),
          el('p', { class: 'muted small', text: `Por ${memberName(ctx.members, decision.decided_by)} em ${formatDateTime(decision.decided_at)}` })])
      ]),
      decision.rationale ? el('blockquote', { class: 'rationale' }, [el('span', { class: 'rationale-label', text: 'Justificativa' }), el('p', { text: decision.rationale })]) : null,
      el('p', { class: 'muted small', text: weights.length ? `Critérios definidos pela empresa: ${weights.map(([key, value]) => `${specs[key]?.label || key} (${value})`).join(' · ')}` : 'Decisão sem pesos registrados.' }),
      selected ? el('p', {class:'muted small',text:`Condições preservadas no momento da decisão · proposta v${selected.version}.`}) : null,
      chosen ? keyTerms(rfq.product, chosen.terms, decision.external_proposal_id?{currency:chosen.currency??null}:{}) : null
    ] }));
    if (contract) wrap.append(card({ title: 'Contrato', body: [el('p', { text: `Vigência de ${formatDate(contract.starts_on)} a ${formatDate(contract.ends_on)} · aviso prévio de ${contract.renewal_notice_days} dias.` }),
      linkButton('Abrir ciclo de vida do contrato', ctx.href(`/finance/contracts.html#contract-${contract.id}`), { iconName: 'arrowRight', variant: 'primary' })] }));
    else if (frozenMissing) wrap.append(emptyState({title:'Condições da decisão indisponíveis',text:'Não foi possível recuperar a proposta preservada na decisão. Recarregue e confira o histórico antes de registrar o contrato.',iconName:'alert'}));
    else if (manage && decision.external_proposal_id) wrap.append(externalUi ? externalUi.externalContractContinuation(ctx,rfq,decision) : errorState({error:new Error('Continuidade externa indisponível.'),onRetry:()=>ctx.reload()}));
    else if (manage) wrap.append(contractForm(ctx, rfq, decision, chosen));
    else wrap.append(emptyState({ title: 'Contrato ainda não registrado', text: 'Quem gerencia a solicitação registra o contrato com vigência e aviso prévio.', iconName: 'briefcase', compact: true }));
    return wrap;
  }
  if(rfq.external_decision_error) wrap.append(el('p',{class:'callout callout-warning',text:'As alternativas externas não puderam ser consultadas. Recarregue antes de selecionar uma fonte externa.'}));
  if (!proposals.length) { wrap.append(emptyState({ title: 'A decisão fica disponível com propostas', text: 'Assim que houver ao menos uma proposta enviada, a empresa pode registrar sua escolha.', iconName: 'flag' })); return wrap; }
  if (!['collecting', 'comparing'].includes(rfq.status) && !(rfq.status==='open'&&rfq.external_decision_alternatives?.length)) { wrap.append(emptyState({ title: 'Sem decisão para este estado', text: 'Decisões são registradas enquanto a solicitação está em coleta ou avaliação.', iconName: 'flag' })); return wrap; }
  const approved = approvals.find((row) => row.status === 'approved' && !row.stale);
  const pending = approvals.find((row) => row.status === 'pending');
  if (policy.required_for_decision && !approved) {
    wrap.append(el('div', { class: 'callout callout-warning' }, [icon('lock'), el('div', {}, [
      el('strong', { text: 'Sua empresa exige aprovação antes da decisão.' }),
      el('p', { text: pending ? `Há um pedido em andamento (${approvalSummaryLine(pending)}). A decisão libera quando ele for aprovado.` : 'Solicite a aprovação da proposta escolhida na aba Aprovações.' }),
      linkButton(pending ? 'Acompanhar aprovação' : 'Solicitar aprovação', '#aprovacoes', { size: 'sm', iconName: 'arrowRight' })
    ])]));
    return wrap;
  }
  if (!manage) { wrap.append(emptyState({ title: 'Nenhuma decisão registrada', text: 'Quem gerencia a solicitação registra a decisão.', iconName: 'flag' })); return wrap; }
  const conflict = ctx.decisionConflicts?.[rfq.id];
  const conflicted = conflict ? proposals.find((row) => row.id === conflict.proposal_id) : null;
  const form = el('form', { class: 'card', id: 'decision-form', novalidate: true });
  const group = el('fieldset', { class: 'radio-cards' }, el('legend', { class: 'field-label', text: 'Proposta escolhida' }));
  for (const proposal of proposals) {
    const locked = approved && approved.proposal_id !== proposal.id;
    group.append(el('label', { class: `radio-card${locked ? ' disabled' : ''}` }, [
      // Sem aprovação nem conflito, nada vem marcado quando há mais de uma
      // proposta: a decisão é um clique consciente, nunca a primeira da lista.
      el('input', { type: 'radio', name: 'proposal_id', value: proposal.id, checked: approved ? approved.proposal_id === proposal.id : conflicted ? proposal.id === conflicted.id : proposals.length === 1, disabled: locked, required: true }),
      el('span', { class: 'radio-card-text' }, [el('strong', { text: proposal.provider_name }), el('span', { class: 'muted small', text: locked ? 'Não aprovada' : `v${proposal.version}${approved?.proposal_id === proposal.id ? ' · aprovada' : ''}` })])
    ]));
  }
  // Conflito de versão (§36.2): o servidor recusou porque a proposta mudou
  // enquanto a pessoa decidia. Nada foi gravado; antes de tentar de novo, a tela
  // mostra o que mudou e pede confirmação explícita das condições atuais.
  const reviewed = el('input', { type: 'checkbox', name: 'reviewed_current_version', required: true });
  const conflictNode = conflicted && conflicted.version !== conflict.expected_version ? (() => {
    const before = conflicted.previous_version?.version === conflict.expected_version ? conflicted.previous_version : null;
    const fields = PRODUCTS[rfq.product].proposalFields;
    const changes = before ? proposalChanges(rfq.product, conflicted, before).map((key) => fields.find((item) => item.key === key)).filter(Boolean)
      .map((spec) => el('li', { text: `${spec.label}: ${fieldValue(spec, before.terms?.[spec.key]) ?? 'não informado'} → ${fieldValue(spec, conflicted.terms?.[spec.key]) ?? 'não informado'}` })) : [];
    return el('div', { class: 'callout callout-warning', id: 'decision-conflict', role: 'alert' }, [icon('alert'), el('div', { class: 'stack' }, [
      el('strong', { text: `A proposta de ${conflicted.provider_name} mudou para a versão ${conflicted.version} enquanto você decidia. Nada foi registrado.` }),
      changes.length ? el('ul', { class: 'conflict-changes' }, changes)
        : el('p', { text: `A versão que você viu (v${conflict.expected_version}) não está mais disponível para comparação nesta tela. Confira as condições atuais na aba Comparação.` }),
      el('label', { class: 'check' }, [reviewed, el('span', { text: `Revisei as condições da versão ${conflicted.version} e quero seguir com a decisão` })])
    ])]);
  })() : null;
  const choiceError = el('p', { class: 'field-error', role: 'alert', hidden: true });
  group.addEventListener('change', () => { choiceError.hidden = true; });
  const rationale = el('textarea', { name: 'rationale', rows: '3', maxlength: '4000', 'aria-label': 'Justificativa da decisão' });
  const weights = ctx.weights[rfq.id];
  const useWeights = el('input', { type: 'checkbox', name: 'use_weights', checked: Boolean(weights) });
  const submit = button('Registrar decisão', { variant: 'primary', type: 'submit', iconName: 'flag' });
  form.append(el('div', { class: 'card-head' }, el('div', { class: 'card-head-text' }, [el('h3', { class: 'card-title', text: 'Registrar decisão' }),
    el('p', { class: 'card-subtitle', text: 'A decisão é da empresa. O Arandu guarda quem decidiu, quando, a proposta e uma fotografia de todas as propostas deste momento.' })])),
  el('div', { class: 'card-body stack' }, [conflictNode, group, choiceError, field({ label: 'Justificativa', control: rationale, optionalLabel: true }),
    weights ? el('label', { class: 'check' }, [useWeights, el('span', { text: 'Registrar os pesos aplicados na comparação como critério desta decisão' })]) : null,
    el('div', { class: 'form-actions' }, submit)]));
  onSubmit(form, async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const chosen = proposals.find((row) => row.id === data.get('proposal_id'));
    if (!chosen) {
      choiceError.textContent = 'Escolha a proposta da decisão.';
      choiceError.hidden = false;
      group.querySelector('input:not(:disabled)')?.focus();
      return;
    }
    if (conflictNode && chosen?.id === conflicted.id && !reviewed.checked) {
      toast(`Confirme que revisou a versão ${conflicted.version} antes de registrar a decisão.`, 'error');
      reviewed.focus();
      return;
    }
    if (!await confirmDialog({ title: `Registrar a escolha de ${chosen?.provider_name}?`, description: chosen?.origin==='buyer_recorded_external'?externalUi.externalDecisionConfirmation:'A decisão fica registrada de forma permanente e a solicitação passa para “Decidida”. Em seguida você registra o contrato.', confirmLabel: 'Registrar decisão' })) return;
    submit.disabled = true;
    try {
      const external=chosen?.origin==='buyer_recorded_external';
      await ctx.send(external?'external-proposals/decision':'decisions', external?{id:chosen.id,expected_version:chosen.version,rfq_revision:rfq.revision,request_key:externalRequestKey,rationale:data.get('rationale'),weights:useWeights.checked?weights||{}:{}}:{ rfq_id: rfq.id, proposal_id: data.get('proposal_id'), expected_version: chosen?.version, rationale: data.get('rationale'), criteria: { weights: useWeights.checked ? weights || {} : {} } });
      if (ctx.decisionConflicts) delete ctx.decisionConflicts[rfq.id];
      toast(chosen?.origin==='buyer_recorded_external'?'Decisão interna registrada. O vínculo contratual é uma etapa separada.':'Decisão registrada. Agora registre o contrato.');
      ctx.reload();
    } catch (error) {
      toast(error.message, 'error');
      // Versão nova da proposta ou alteração simultânea: nada foi registrado; a
      // página recarrega para mostrar as condições atuais antes de decidir de novo.
      if (error.code === 'proposal_version_changed' || error.code === 'concurrent_update') {
        (ctx.decisionConflicts ||= {})[rfq.id] = { proposal_id: chosen?.id, expected_version: chosen?.version };
        ctx.reload();
      }
      else if (chosen?.origin==='buyer_recorded_external' && (!error.status || error.status>=500)) {
        choiceError.hidden=false;choiceError.textContent='O resultado ainda é desconhecido. Consulte antes de reenviar.';
        choiceError.append(externalUi.externalDecisionRecovery(ctx,chosen.id,externalRequestKey,()=>{submit.disabled=false;}));
      } else submit.disabled = false;
    }
  });
  wrap.append(form);
  return wrap;
}

export function contractForm(ctx, rfq, decision, chosen) {
  const slot = el('div', {}, loading('Preparando o registro do contrato…'));
  import('../contract-registration.js').then(module=>{if(slot.isConnected) slot.replaceChildren(module.contractForm(ctx, rfq, decision, chosen));})
    .catch(error=>slot.replaceChildren(errorState({error, onRetry:()=>ctx.reload()})));
  return slot;
}
