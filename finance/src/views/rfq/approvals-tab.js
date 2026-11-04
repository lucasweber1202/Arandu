/* global __ARANDU_DEMO__ */
// Aba Aprovações: pedidos, etapas, ações e formulário de pedido. Carregada ao abrir a aba.
// Extraído de views/rfq.js (v7.0).

import { el, icon, money, percent, APPROVAL_STATUS, timeAgo } from '../../core.js';
import { pill, button, emptyState, errorState, loading, toast, confirmDialog, promptDialog, field, person, onSubmit, sessionLink } from '../../ui.js';
import { approvalSteps, approvalActions, currentStep, approvalSummaryLine } from '../shared/approvals.js';
import { memberName, memberTitle } from '../shared/people.js';
import { keyTerms } from '../shared/terms.js';

export function lazyPolicyTimeline(ctx, request, options) {
  const box = el('div', { 'aria-busy': 'true' }, loading());
  const load = async () => {
    box.setAttribute('aria-busy', 'true');
    try { const { policyTimeline } = await import('../policy.js'); box.replaceChildren(policyTimeline(ctx, request, options)); }
    catch (error) { box.replaceChildren(errorState({ error, onRetry: load })); }
    finally { box.setAttribute('aria-busy', 'false'); }
  };
  load();
  return box;
}

export function approvalCard(ctx, request, rfq, { onChange, compact = false } = {}) {
  const external=request.snapshot?.selected_source;
  const proposal = external?{provider_name:`${external.provider_name||'Instituição declarada'} · fonte externa`,terms:external.terms,currency:external.currency}:(rfq.proposals || []).find((row) => row.id === request.proposal_id);
  const step = currentStep(request);
  const mine = request.viewer_can_act ?? (step && step.approver_id === ctx.viewer?.id);
  const summary = request.policy_snapshot ? `${(request.stages || []).filter((stage) => ['approved', 'waived'].includes(stage.status)).length} de ${(request.stages || []).length} etapas` : approvalSummaryLine(request);
  const node = el('article', { class: `approval-card${mine ? ' mine' : ''}`, id: `request-${request.id}` }, [
    el('header', { class: 'approval-head' }, [
      el('div', {}, [
        el('p', { class: 'approval-kicker', text: `${summary} · solicitado por ${memberName(ctx.members, request.requested_by)} ${timeAgo(request.requested_at)}` }),
        el('h3', { class: 'approval-title', text: proposal ? `${proposal.provider_name} · proposta v${request.proposal_version}` : `Proposta v${request.proposal_version}` })
      ]),
      pill(request.stale && request.status === 'pending' ? { label: 'Desatualizada', tone: 'danger', icon: 'alert' } : APPROVAL_STATUS[request.status])
    ]),
    request.stale ? el('p', { class: 'callout callout-warning compact' }, [icon('alert', { size: 14 }), el('span', { text: 'A solicitação ou a proposta mudou depois do pedido. Esta aprovação não vale para a versão atual; peça uma nova.' })]) : null,
    external?el('p',{class:'callout callout-info',text:`Transcrição externa · versão ${external.current_version} · revisão da solicitação ${external.rfq_revision}. ${external.notice||'A conferência não autentica o emissor, não comprova assinatura ou aceite institucional.'}`}):null,
    request.rationale ? el('blockquote', { class: 'rationale' }, [el('span', { class: 'rationale-label', text: 'Contexto do solicitante' }), el('p', { text: request.rationale })]) : null,
    proposal && !compact ? keyTerms(rfq.product, proposal.terms,external?{currency:external.currency??null}:{}) : null,
    request.policy_snapshot ? lazyPolicyTimeline(ctx, request, { onChange }) : approvalSteps(request, ctx.members)
  ]);
  if (mine && !request.stale) node.append(el('div', { class: 'approval-cta' }, [el('p', { class: 'approval-your-turn' }, [icon('clock', { size: 14 }), el('span', { text: request.policy_snapshot ? 'Você é aprovador(a) de uma etapa ativa.' : 'Sua decisão é a próxima etapa.' })]), approvalActions(ctx, request, { onDone: onChange })]));
  if (request.status === 'pending' && request.policy_snapshot && ctx.can?.('create_rfq')) {
    node.append(el('div', { class: 'row-actions' }, button('Substituir este pedido', { variant: 'ghost', size: 'sm', iconName: 'edit', onClick: async () => {
      const reason = await promptDialog({ title: 'Substituir o pedido?', description: 'O pedido atual é encerrado como substituído (por exemplo, para reavaliar sob a versão nova da policy). Nada muda sozinho: depois você pede uma nova aprovação.', label: 'Motivo', minLength: 3, confirmLabel: 'Substituir', tone: 'danger' });
      if (reason === null) return;
      try { await ctx.send('approvals/supersede', { request_id: request.id, reason }); toast('Pedido substituído. Solicite uma nova aprovação.'); onChange?.(); }
      catch (error) { toast(error.message, 'error'); }
    } })));
  }
  if (request.status === 'pending' && request.requested_by === ctx.viewer?.id) {
    node.append(el('div', { class: 'row-actions' }, button('Cancelar pedido de aprovação', { variant: 'ghost', size: 'sm', iconName: 'x', onClick: async () => {
      if (!await confirmDialog({ title: 'Cancelar o pedido?', description: 'Os aprovadores deixam de ver a pendência. O histórico é mantido.', confirmLabel: 'Cancelar pedido', tone: 'danger' })) return;
      try { await ctx.send('approvals/cancel', { request_id: request.id }); toast('Pedido de aprovação cancelado.'); onChange?.(); }
      catch (error) { toast(error.message, 'error'); }
    } })));
  }
  return node;
}

export function approvalsTab(ctx, rfq, approvals, { manage }) {
  const wrap = el('div', { class: 'stack' });
  const proposals = [...(rfq.proposals || []),...(rfq.external_decision_alternatives || [])];
  const [latest, ...older] = approvals;
  if (latest) wrap.append(approvalCard(ctx, latest, rfq, { onChange: () => ctx.reload() }));
  const canRequest = manage && proposals.length && (['collecting', 'comparing'].includes(rfq.status) || (rfq.status==='open' && rfq.external_decision_alternatives?.length)) && (!latest || latest.status !== 'pending' || latest.stale) && !rfq.decision_id;
  if (canRequest) wrap.append(approvalRequestForm(ctx, rfq, latest));
  if (!latest && !canRequest) wrap.append(emptyState({ title: 'Nenhuma aprovação solicitada', text: proposals.length ? 'Quem gerencia a solicitação pode pedir aprovação de uma proposta a um ou mais aprovadores, em ordem.' : 'A aprovação fica disponível quando houver propostas.', iconName: 'checkCircle' }));
  if (older.length) wrap.append(el('details', { class: 'history' }, [el('summary', { text: `Pedidos anteriores (${older.length})` }), ...older.map((request) => approvalCard(ctx, request, rfq, { compact: true }))]));
  return wrap;
}

export function approvalRequestForm(ctx, rfq, latest) {
  const externalRequestKey=`external-approval-${crypto.randomUUID()}`;
  const proposals = [...(rfq.proposals || []),...(rfq.external_decision_alternatives || [])];
  const eligible = (ctx.members || []).filter((member) => member.user_id !== ctx.viewer?.id && member.role !== 'provider_user');
  const form = el('form', { class: 'card approval-form', id: 'approval-request', novalidate: true });
  const subtitle = el('p', { class: 'card-subtitle', text: 'Escolha a proposta e explique o porquê. A policy da empresa, quando existir, define quem aprova e em que ordem.' });
  form.append(el('div', { class: 'card-head' }, el('div', { class: 'card-head-text' }, [
    el('h3', { class: 'card-title', text: latest && latest.status !== 'pending' ? 'Solicitar nova aprovação' : 'Solicitar aprovação' }), subtitle
  ])));
  const body = el('div', { class: 'card-body stack' });
  const proposalGroup = el('fieldset', { class: 'radio-cards' }, el('legend', { class: 'field-label', text: 'Proposta para aprovação' }));
  // Nenhuma proposta vem marcada quando há escolha: a ordem da lista não é
  // recomendação (Constitution §1.2) e a escolha é sempre de quem pede.
  const single = proposals.length === 1;
  proposals.forEach((proposal) => {
    proposalGroup.append(el('label', { class: 'radio-card' }, [
      el('input', { type: 'radio', name: 'proposal_id', value: proposal.id, checked: single, required: true }),
      el('span', { class: 'radio-card-text' }, [el('strong', { text: proposal.provider_name }), el('span', { class: 'muted small', text: `v${proposal.version} · ${rfq.product === 'credit' ? `${percent(proposal.terms?.interest_rate_month)} a.m. · ${money(proposal.terms?.offered_amount, { compact: true })}` : `MDR crédito ${percent(proposal.terms?.mdr_credit_cash)} · PIX ${percent(proposal.terms?.pix_fee)}`}` })])
    ]));
  });

  // Modo manual (sem policy): aprovadores em ordem, como antes.
  const order = [];
  const approverGroup = el('fieldset', { class: 'approver-pick' }, el('legend', { class: 'field-label', text: 'Aprovadores, na ordem em que devem decidir' }));
  const orderNote = el('p', { class: 'field-hint', text: 'Marque na ordem desejada. O solicitante não pode aprovar o próprio pedido.' });
  for (const member of eligible) {
    const box = el('input', { type: 'checkbox', value: member.user_id, name: 'approver' });
    const badge = el('span', { class: 'order-badge', 'aria-hidden': 'true' });
    box.addEventListener('change', () => {
      if (box.checked) order.push(member.user_id); else order.splice(order.indexOf(member.user_id), 1);
      for (const input of approverGroup.querySelectorAll('input')) {
        const position = order.indexOf(input.value);
        input.closest('label').querySelector('.order-badge').textContent = position >= 0 ? String(position + 1) : '';
      }
    });
    approverGroup.append(el('label', { class: 'approver-option' }, [box, badge, person(member.display_name || memberName(ctx.members, member.user_id), member.title || memberTitle(ctx.members, member.user_id))]));
  }
  if (!eligible.length) approverGroup.append(el('p', { class: 'muted', text: 'Convide outro membro da empresa para poder solicitar aprovação.' }));
  approverGroup.append(orderNote);

  // Modo policy: prévia do plano, indicação por etapa, fatos declarados.
  const modeBox = el('div', { class: 'stack' }, single ? loading('Conferindo a policy da empresa…')
    : el('p', { class: 'muted small', id: 'approval-choose-first', text: 'Escolha a proposta para ver quem aprova: a policy da empresa, quando existe, depende da operação escolhida.' }));
  const proposalError = el('p', { class: 'field-error', role: 'alert', hidden: true });
  const declared = {};
  let evaluation = null;
  let policyFacts = null;
  let previewFailed = false;
  let flags = [];
  let assignments = {};
  const justification = el('textarea', { name: 'justification', rows: '3', maxlength: '2000', placeholder: 'Ex.: única instituição com linha disponível no prazo da operação.' });
  const justificationField = field({ label: 'Justificativa exigida pela policy', control: justification, hint: 'Ao menos 10 caracteres. Fica gravada no pedido.' });
  const declaredBox = () => {
    const needsCovenant = (evaluation.unknown_facts || []).includes('covenant_present') || declared.covenant_present !== undefined;
    const parts = [];
    if (needsCovenant) {
      const covenant = el('select', {}, [el('option', { value: '', text: 'Não informado (a policy assume o caso mais exigente)' }), el('option', { value: 'true', text: 'Sim' }), el('option', { value: 'false', text: 'Não' })]);
      covenant.value = declared.covenant_present === undefined ? '' : String(declared.covenant_present);
      covenant.addEventListener('change', () => { if (covenant.value === '') delete declared.covenant_present; else declared.covenant_present = covenant.value === 'true'; refresh(); });
      parts.push(field({ label: policyFacts.covenant_present.label, control: covenant }));
    }
    if (flags.length) {
      const group = el('fieldset', { class: 'check-row' }, el('legend', { class: 'field-label', text: 'Sinalizadores da empresa que se aplicam a esta operação' }));
      for (const flag of flags) {
        const box = el('input', { type: 'checkbox', value: flag.key, checked: (declared.flags || []).includes(flag.key) });
        box.addEventListener('change', () => { declared.flags = [...group.querySelectorAll('input:checked')].map((input) => input.value); refresh(); });
        group.append(el('label', { class: 'check-option' }, [box, el('span', { text: flag.label })]));
      }
      parts.push(group, el('p', { class: 'field-hint', text: 'A declaração fica gravada no pedido, com seu nome.' }));
    }
    return parts.length ? el('div', { class: 'stack-sm' }, parts) : null;
  };
  const refresh = async () => {
    const proposalId = new FormData(form).get('proposal_id');
    try {
      const out = await ctx.send('approval-policies/preview', { rfq_id: rfq.id, proposal_id: proposalId, declared });
      evaluation = out.evaluation;
      previewFailed = false;
    } catch (failure) {
      // Prévia que falhou não é "sem policy": cair no modo de aprovadores livres
      // poderia pedir aprovação fora das etapas exigidas. Nada é enviado até a
      // policy ser conferida de novo. 404 = ambiente sem policies (sandbox legado).
      evaluation = null;
      previewFailed = failure.status !== 404;
      if (previewFailed) {
        modeBox.replaceChildren(errorState({ title: 'Não conseguimos conferir a policy de aprovação desta proposta', error: failure, onRetry: refresh }));
        return;
      }
    }
    const policyMode = evaluation?.engine === 'policy' && ((evaluation.stages || []).length || (evaluation.blockers || []).length);
    if (!policyMode) {
      evaluation = null;
      modeBox.replaceChildren(approverGroup);
      return;
    }
    let policyUi;
    // Fatos da policy (mesmo módulo que policy.js usa): só no modo policy, fora do carregamento inicial.
    try { [policyUi, { POLICY_FACTS: policyFacts }] = await Promise.all([import('../policy.js'), import('../../../../lib/finance/policy.mjs')]); }
    catch (failure) {
      previewFailed = true;
      modeBox.replaceChildren(errorState({ title: 'Não conseguimos carregar as etapas de aprovação', error: failure, onRetry: refresh }));
      return;
    }
    const { loadPolicies, planSummary, stageAssignments } = policyUi;
    flags = ((await loadPolicies(ctx))?.flags || []).filter((flag) => flag.active);
    const keep = assignments;
    assignments = {};
    for (const stage of evaluation.stages || []) assignments[stage.key] = (keep[stage.key] || []).slice();
    subtitle.textContent = 'A policy da empresa define as etapas abaixo. Indique quem aprova cada uma; o banco confere papel, escopo e segregação de funções.';
    modeBox.replaceChildren(planSummary(ctx, evaluation), declaredBox() || el('span'), stageAssignments(ctx, evaluation.stages || [], assignments),
      evaluation.requirements?.justification ? justificationField : el('span'));
  };
  proposalGroup.addEventListener('change', () => { proposalError.hidden = true; refresh(); });

  const rationale = el('textarea', { name: 'rationale', rows: '4', maxlength: '4000', placeholder: 'Ex.: menor custo total estimado e valor integral; garantias validadas com o jurídico.' });
  const rationaleField = field({ label: 'Contexto para quem aprova', control: rationale, required: true, hint: 'Quem aprova vê este texto junto com a proposta e a comparação.' });
  const error = el('p', { class: 'field-error', role: 'alert', hidden: true });
  const submit = button('Solicitar aprovação', { variant: 'primary', type: 'submit', iconName: 'send' });
  body.append(proposalGroup, proposalError, modeBox, rationaleField, error, el('div', { class: 'form-actions' }, submit));
  form.append(body);
  onSubmit(form, async (event) => {
    event.preventDefault();
    error.hidden = true;
    if (proposals.length && !new FormData(form).get('proposal_id')) {
      proposalError.textContent = 'Escolha a proposta que vai para aprovação.';
      proposalError.hidden = false;
      proposalGroup.querySelector('input')?.focus();
      return;
    }
    if (!rationale.value.trim()) { rationaleField.setError('Explique o contexto para quem vai aprovar.'); rationale.focus(); return; }
    const proposalId = new FormData(form).get('proposal_id');
    if (previewFailed) { error.textContent = 'A policy desta proposta ainda não foi conferida. Use "Tentar novamente" acima; nada foi enviado.'; error.hidden = false; return; }
    if (evaluation) {
      const missing = (evaluation.stages || []).find((stage) => (assignments[stage.key] || []).length < stage.min_approvals);
      if (missing) { error.textContent = `Indique ${missing.min_approvals} aprovador(es) para "${missing.label}".`; error.hidden = false; return; }
      if (evaluation.requirements?.justification && justification.value.trim().length < 10) { justificationField.setError('A policy exige justificativa com ao menos 10 caracteres.'); justification.focus(); return; }
    } else if (!order.length) { error.textContent = 'Escolha pelo menos um aprovador.'; error.hidden = false; return; }
    submit.disabled = true;
    try {
      const payload = evaluation
        ? { rfq_id: rfq.id, proposal_id: proposalId, assignments, rationale: rationale.value, justification: justification.value.trim() || null, declared }
        : { rfq_id: rfq.id, proposal_id: proposalId, approver_ids: order, rationale: rationale.value };
      const external=proposals.find(row=>row.id===proposalId&&row.origin==='buyer_recorded_external');
      await ctx.send(external?'external-proposals/approval':'approvals/request', external?{...payload,id:external.id,expected_version:external.version,rfq_revision:rfq.revision,request_key:externalRequestKey}:payload);
      toast(evaluation ? 'Aprovação solicitada pela policy. Os aprovadores da primeira etapa foram avisados.' : `Aprovação solicitada. ${memberName(ctx.members, order[0])} foi avisado(a).`);
      ctx.reload();
    } catch (failure) {
      error.replaceChildren(failure.message, ...(sessionLink(failure) ? [' ', sessionLink(failure)] : []));
      error.hidden = false;
      // Resultado incerto: o pedido pode ter sido aberto. Conferir antes de pedir de novo.
      if (!failure.status || failure.status >= 500) error.append(' ', button('Recarregar e conferir', { size: 'sm', iconName: 'refresh', onClick: () => ctx.reload() }));
      else submit.disabled = false;
    }
  });
  if (single) queueMicrotask(refresh);
  return form;
}
