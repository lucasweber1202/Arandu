// Portal da instituição: ver oportunidades, entender a demanda, responder e
// acompanhar. Mais simples que o portal da empresa, de propósito.

import { PRODUCTS, PRODUCT_IDS } from '../../../lib/finance/products.mjs';
import { el, icon, formatDate, formatDateTime, relativeDays, daysUntil, productLabel, demandHeadline, fieldValue, PROPOSAL_STATUS, timeAgo } from '../core.js';
import { card, pill, tag, button, linkButton, emptyState, errorState, loading, definitionList, toast, confirmDialog, field, catalogControl, saveIndicator, onSubmit } from '../ui.js';
import { collaboration, revisionDiff } from './shared.js';
import { proposalChanges } from '../../../lib/finance/comparison-context.mjs';
import { greeting } from './dashboard.js';

const OPEN = ['open', 'collecting'];

function assignmentState(row) {
  const open = OPEN.includes(row.rfq_status);
  if (!open && !row.version) return { key: 'closed', label: 'Encerrada sem resposta', tone: 'neutral', icon: 'clock' };
  // Coleta encerrada não é processo encerrado: a empresa ainda está avaliando.
  if (row.rfq_status === 'comparing') return { key: 'sent', label: 'Em avaliação pela empresa', tone: 'accent', icon: 'scale' };
  if (!open) return { key: 'closed', label: row.selected ? 'Proposta escolhida' : 'Processo encerrado', tone: row.selected ? 'success' : 'neutral', icon: row.selected ? 'checkCircle' : 'clock' };
  if (row.version && row.submitted_rfq_revision && row.rfq_revision > row.submitted_rfq_revision) return { key: 'outdated', label: 'Solicitação mudou', tone: 'warning', icon: 'alert' };
  if (!row.version) return { key: 'todo', label: row.has_draft ? 'Rascunho salvo' : 'Responder', tone: 'accent', icon: 'edit' };
  return { key: 'sent', label: `Enviada · v${row.version}`, tone: 'success', icon: 'send' };
}
// Pendências da própria proposta, a partir dos termos da versão enviada:
// condições obrigatórias em branco e validade. Nada da empresa ou de concorrentes.
export function proposalPending(row) {
  const fields = PRODUCTS[row.product]?.proposalFields || [];
  const terms = row.terms || {};
  const blank = (value) => value === null || value === undefined || value === '';
  const missing = row.version ? fields.filter((spec) => spec.required && spec.key !== 'institution' && blank(terms[spec.key])).map((spec) => spec.label.replace(/\s*\(.*\)$/, '')) : [];
  const live = [...OPEN, 'comparing'].includes(row.rfq_status);
  const days = row.version && terms.valid_until ? daysUntil(terms.valid_until) : null;
  const validity = !row.version || !live ? null
    : !terms.valid_until ? { tone: 'neutral', text: 'Validade da sua proposta não informada' }
      : days < 0 ? { tone: 'danger', text: `Validade da sua proposta venceu em ${formatDate(terms.valid_until)}` }
        : days <= 5 ? { tone: 'warning', text: `Sua proposta vale até ${formatDate(terms.valid_until)} (${relativeDays(terms.valid_until)})` }
          : { tone: 'neutral', text: `Sua proposta vale até ${formatDate(terms.valid_until)}` };
  return { missing, validity, expiring: Boolean(validity && validity.tone !== 'neutral') };
}
function proposalHref(ctx, row) { return ctx.href(`/provider/proposal.html?proposal=${encodeURIComponent(row.proposal_id)}`); }

function opportunityRow(ctx, row) {
  const state = assignmentState(row);
  const pending = proposalPending(row);
  const days = daysUntil(row.response_deadline);
  const cta = { todo: row.has_draft ? 'Continuar' : 'Responder', outdated: 'Revisar proposta', sent: row.rfq_status === 'comparing' ? 'Ver' : 'Ver ou revisar', closed: 'Ver' }[state.key];
  return el('article', { class: `opportunity state-${state.key}`, id: `rfq-${row.rfq_id}` }, [
    el('div', { class: 'opportunity-main' }, [
      el('p', { class: 'opportunity-kicker', text: [row.buyer_name, productLabel(row.product, { short: true })].filter(Boolean).join(' · ') }),
      el('h2', { class: 'opportunity-title' }, el('a', { class: 'stretched', href: proposalHref(ctx, row), text: row.title })),
      el('p', { class: 'opportunity-meta', text: `${demandHeadline({ product: row.product, demand: row.demand })} · revisão ${row.rfq_revision || 1}${OPEN.includes(row.rfq_status) ? ` · ${row.response_deadline ? `prazo ${formatDate(row.response_deadline)}` : 'sem prazo definido'}` : ''}` }),
      pending.missing.length ? el('p', { class: 'opportunity-pending warn-text small', text: `${pending.missing.length === 1 ? 'Condição obrigatória não informada' : 'Condições obrigatórias não informadas'} na versão enviada: ${pending.missing.join(', ')}` }) : null,
      pending.validity ? el('p', { class: `opportunity-pending small${pending.validity.tone === 'neutral' ? ' muted' : ' warn-text'}`, text: pending.validity.text }) : null
    ]),
    el('div', { class: 'opportunity-side' }, [
      pill(state, { size: 'sm' }),
      OPEN.includes(row.rfq_status) && row.response_deadline ? el('span', { class: `opportunity-deadline${days !== null && days <= 2 ? ' urgent' : ''}` }, [icon('clock', { size: 12 }), el('span', { text: `Prazo ${relativeDays(row.response_deadline)}` })]) : null,
      el('span', { class: 'opportunity-cta', 'aria-hidden': 'true' }, [el('span', { text: cta }), icon('chevronRight', { size: 14 })])
    ])
  ]);
}

async function acceptInvite(ctx, token, { button: trigger = null } = {}) {
  if (trigger) trigger.disabled = true;
  try {
    const result = await ctx.api('invites/accept', { method: 'POST', body: JSON.stringify({ token, provider_organization_id: ctx.organization.id }) });
    toast('Convite aceito. A solicitação já está nas suas oportunidades.');
    if (result.proposal_id) location.assign(ctx.href(`/provider/proposal.html?proposal=${encodeURIComponent(result.proposal_id)}`));
    else location.assign(ctx.href('/provider/rfqs.html'));
    return true;
  } catch (error) {
    toast(error.message, 'error');
    if (trigger) trigger.disabled = false;
    return false;
  }
}

export async function providerHome(ctx) {
  const rows = ctx.data.assignments || [];
  const invites = ctx.data.pending_invites || [];
  ctx.header({ title: 'Portal da instituição', subtitle: `${greeting(ctx.viewer?.name)} · ${ctx.organization.legal_name}` });
  const root = el('div', { class: 'provider-home' });

  const todo = rows.filter((row) => ['todo', 'outdated'].includes(assignmentState(row).key))
    .sort((a, b) => String(a.response_deadline || '9999').localeCompare(String(b.response_deadline || '9999')));
  let hero;
  // O que vence primeiro manda: um rascunho que encerra em 3 dias vem antes de
  // um convite que encerra em 6.
  const deadline = (value) => String(value || '9999');
  const inviteFirst = invites.length && (!todo.length || deadline([...invites].sort((a, b) => deadline(a.response_deadline).localeCompare(deadline(b.response_deadline)))[0].response_deadline) <= deadline(todo[0].response_deadline));
  if (inviteFirst) {
    const invite = [...invites].sort((a, b) => deadline(a.response_deadline).localeCompare(deadline(b.response_deadline)))[0];
    const accept = button('Aceitar convite', { variant: 'primary', iconName: 'check', onClick: (event) => acceptInvite(ctx, invite.demo_token, { button: event.currentTarget }) });
    // buyer_name é opcional na API: sem ele, nada de comprador inventado nem "undefined".
    hero = { title: invite.buyer_name ? `Aceite o convite de ${invite.buyer_name}` : `Aceite o convite: ${invite.title}`, text: `${invite.buyer_name ? `${invite.title} · ` : ''}${productLabel(invite.product, { short: true })}${invite.response_deadline ? ` · prazo ${relativeDays(invite.response_deadline)}` : ''}`, action: accept };
  } else if (todo.length) {
    const next = todo[0];
    const state = assignmentState(next);
    hero = { title: state.key === 'outdated' ? `Revise sua proposta: ${next.title}` : `Responda: ${next.title}`,
      text: state.key === 'outdated' ? `A empresa publicou a revisão ${next.rfq_revision}. Sua proposta responde à revisão ${next.submitted_rfq_revision}.`
        : [next.buyer_name, `${next.buyer_name ? 'prazo' : 'Prazo'} ${relativeDays(next.response_deadline) || 'não definido'}`, next.has_draft ? 'rascunho salvo' : null].filter(Boolean).join(' · '),
      action: linkButton(state.key === 'outdated' ? 'Revisar proposta' : next.has_draft ? 'Continuar resposta' : 'Responder agora', proposalHref(ctx, next), { variant: 'primary', iconName: 'arrowRight' }) };
  } else if (rows.some((row) => OPEN.includes(row.rfq_status) && proposalPending(row).expiring)) {
    const next = rows.filter((row) => OPEN.includes(row.rfq_status) && proposalPending(row).expiring).sort((a, b) => String(a.terms?.valid_until).localeCompare(String(b.terms?.valid_until)))[0];
    hero = { title: `Confira a validade da sua proposta: ${next.title}`, text: `${proposalPending(next).validity.text}. A coleta ainda está aberta: você pode enviar uma nova versão.`,
      action: linkButton('Ver ou revisar proposta', proposalHref(ctx, next), { variant: 'primary', iconName: 'arrowRight' }) };
  } else {
    hero = { title: rows.length ? 'Nada pendente agora' : 'Nenhuma oportunidade ainda', text: rows.length ? 'Suas propostas foram enviadas. Você será avisado se a empresa revisar a solicitação ou comentar.' : 'Quando uma empresa convidar a sua instituição, a oportunidade aparece aqui.', action: null };
  }
  root.append(el('section', { class: 'next-hero', id: 'provider-status', 'aria-labelledby': 'next-hero-title' }, [
    el('span', { class: 'next-step-kicker', text: 'Sua próxima ação' }),
    el('h2', { class: 'next-hero-title', id: 'next-hero-title', text: hero.title }),
    el('p', { class: 'next-hero-text', text: hero.text }), hero.action
  ]));

  if (invites.length) {
    root.append(card({ id: 'convites', title: 'Convites recebidos', subtitle: 'Aceitar libera a solicitação completa para a sua instituição. Você decide depois se envia proposta.',
      body: el('ul', { class: 'invite-cards', role: 'list' }, invites.map((invite) => el('li', { class: 'invite-card' }, [
        el('div', {}, [el('p', { class: 'opportunity-kicker', text: [invite.buyer_name, productLabel(invite.product, { short: true })].filter(Boolean).join(' · ') }), el('p', { class: 'invite-title', text: invite.title }),
          el('p', { class: 'muted small', text: `Recebido ${timeAgo(invite.created_at)}${invite.response_deadline ? ` · prazo ${formatDate(invite.response_deadline)}` : ''}` })]),
        // A ação principal já está no destaque acima: aqui o botão não compete com ela.
        button('Aceitar', { variant: inviteFirst ? 'secondary' : 'primary', size: 'sm', iconName: 'check', onClick: (event) => acceptInvite(ctx, invite.demo_token, { button: event.currentTarget }) })
      ]))) }));
  }
  // Caixa por estado: o que ainda não foi começado, o que tem rascunho, o que
  // foi enviado e o que encerrou — cada grupo com o que falta fazer nele.
  const key = (row) => assignmentState(row).key;
  const groups = [
    ['Para responder', 'Ainda sem proposta, ou a solicitação mudou depois do seu envio.', rows.filter((row) => key(row) === 'outdated' || (key(row) === 'todo' && !row.has_draft))],
    ['Rascunhos', 'Salvos só para a sua instituição. A empresa não vê até você enviar.', rows.filter((row) => key(row) === 'todo' && row.has_draft)],
    ['Enviadas', 'Cada alteração cria uma nova versão; as anteriores ficam no histórico da proposta.', rows.filter((row) => key(row) === 'sent')],
    ['Encerradas', null, rows.filter((row) => key(row) === 'closed')]
  ];
  for (const [title, subtitle, list] of groups) {
    if (!list.length) continue;
    root.append(card({ title: `${title} (${list.length})`, subtitle, flush: true, body: el('div', { class: 'opportunity-list' }, list.map((row) => opportunityRow(ctx, row))) }));
  }
  // Fronteira visível: o portal mostra só o que é desta instituição.
  if (rows.length || invites.length) root.append(el('p', { class: 'muted small provider-scope', role: 'note' }, [icon('shield', { size: 14 }),
    el('span', { text: ` Você vê apenas as solicitações para as quais ${ctx.organization.legal_name} foi convidada, e apenas as suas propostas. Propostas de outras instituições e a comparação da empresa nunca aparecem aqui.` })]));
  if (!rows.length && !invites.length) root.append(card({ title: 'Recebeu um link de convite?', body: [el('p', { class: 'muted', text: 'Abra o link que a empresa enviou ou cole o código do convite.' }), linkButton('Aceitar convite', ctx.href('/provider/invite.html'), { iconName: 'send' })] }));
  return root;
}

export async function providerRfqs(ctx) {
  const rows = ctx.data.assignments || [];
  ctx.header({ title: 'Oportunidades', subtitle: 'Solicitações para as quais a sua instituição foi convidada.' });
  if (!rows.length) return emptyState({ title: 'Nenhuma oportunidade ainda', text: 'Aceite um convite para ver a solicitação e responder.', iconName: 'inbox', action: linkButton('Aceitar convite', ctx.href('/provider/invite.html'), { iconName: 'send' }) });
  const filters = el('div', { class: 'chips', role: 'group', 'aria-label': 'Filtrar oportunidades' });
  const list = el('div', { class: 'opportunity-list card card-flush' });
  let active = '';
  const options = [['', 'Todas'], ['todo', 'Para responder'], ['sent', 'Enviadas'], ['closed', 'Encerradas']];
  const draw = () => {
    const visible = rows.filter((row) => !active || assignmentState(row).key === active || (active === 'todo' && assignmentState(row).key === 'outdated'));
    list.replaceChildren(...(visible.length ? visible.map((row) => opportunityRow(ctx, row)) : [emptyState({ title: 'Nada neste filtro', compact: true })]));
  };
  for (const [value, label] of options) {
    const count = value ? rows.filter((row) => assignmentState(row).key === value || (value === 'todo' && assignmentState(row).key === 'outdated')).length : rows.length;
    const chip = el('button', { type: 'button', class: 'chip', 'aria-pressed': String(value === active), dataset: { value } }, [el('span', { text: label }), el('span', { class: 'chip-count', text: String(count) })]);
    chip.addEventListener('click', () => { active = value; for (const node of filters.children) node.setAttribute('aria-pressed', String(node.dataset.value === value)); draw(); });
    filters.append(chip);
  }
  draw();
  if (location.hash.startsWith('#rfq-')) queueMicrotask(() => document.querySelector(location.hash)?.scrollIntoView({ block: 'center' }));
  return el('div', { class: 'stack' }, [el('div', { class: 'toolbar-chips' }, filters), list]);
}

// ------------------------------------------------------------- proposta
const REQUIRED_FIRST = {
  credit: [['Condições principais', ['institution', 'product_name', 'offered_amount', 'interest_rate_month', 'term_months']], ['Custo e amortização', ['cet_year', 'index', 'index_spread', 'fees_amount', 'declared_total_cost', 'amortization', 'grace_months']], ['Garantias, prazo e observações', ['collateral_required', 'valid_until', 'contracting_days', 'conditions_precedent', 'notes']]],
  acquiring: [['Condições principais', ['institution', 'product_name', 'mdr_debit', 'mdr_credit_cash']], ['Demais taxas e liquidação', ['mdr_credit_installment', 'pix_fee', 'anticipation_rate', 'settlement_days', 'terminal_rent', 'gateway_cost']], ['Contrato e observações', ['contract_months', 'early_exit_penalty', 'chargeback_terms', 'extra_services', 'valid_until', 'contracting_days', 'conditions_precedent', 'notes']]]
};

export async function providerProposal(ctx) {
  const rows = ctx.data.assignments || [];
  const wanted = new URLSearchParams(location.search).get('proposal');
  let assignment = rows.find((row) => row.proposal_id === wanted) || (!wanted ? rows.find((row) => ['todo', 'outdated'].includes(assignmentState(row).key)) || rows[0] : null);
  if (wanted && ctx.mode !== 'demo') {
    try {
      const result = await ctx.api(`assignments?organization_id=${encodeURIComponent(ctx.organization.id)}&proposal_id=${encodeURIComponent(wanted)}`);
      assignment = result.rows?.find(row=>row.proposal_id === wanted);
    } catch (error) { return errorState({error, onRetry:()=>ctx.reload()}); }
  }
  if (!assignment) {
    ctx.header({ title: 'Responder proposta', crumbs: [{ label: 'Oportunidades', href: ctx.href('/provider/rfqs.html') }] });
    return emptyState({ title: wanted ? 'Proposta não encontrada' : 'Nada para responder', text: wanted ? 'Este link não pertence à sua instituição ou a solicitação foi removida.' : 'Aceite um convite para responder a uma solicitação.', iconName: 'inbox',
      action: linkButton('Ver oportunidades', ctx.href('/provider/rfqs.html'), { iconName: 'arrowRight' }) });
  }
  const spec = PRODUCTS[PRODUCT_IDS.includes(assignment.product) ? assignment.product : 'credit'];
  const state = assignmentState(assignment);
  const open = OPEN.includes(assignment.rfq_status);
  const days = daysUntil(assignment.response_deadline);
  ctx.header({ crumbs: [{ label: 'Oportunidades', href: ctx.href('/provider/rfqs.html') }, { label: assignment.title }], title: assignment.title,
    // Quem pediu vem no topo, também no celular: a instituição responde sabendo a quem.
    meta: [tag(productLabel(assignment.product, { short: true })), pill(state),
      assignment.buyer_name ? el('span', { class: 'meta-item meta-buyer' }, [icon('building', { size: 14 }), el('span', { text: `Solicitado por ${assignment.buyer_name}` })]) : null,
      el('span', { class: 'meta-item' }, [icon('repeat', { size: 14 }), el('span', { text: `Revisão ${assignment.rfq_revision || 1} da solicitação` })]),
      assignment.response_deadline ? el('span', { class: `meta-item${open && days !== null && days <= 2 ? ' urgent' : ''}` }, [icon('calendar', { size: 14 }), el('span', { text: `Prazo ${formatDate(assignment.response_deadline)}${open ? ` · ${relativeDays(assignment.response_deadline)}` : ''}` })]) : null] });
  const root = el('div', { class: 'split provider-proposal' });

  // Estado da proposta em linguagem direta.
  const status = el('div', { class: 'proposal-status', role: 'status' });
  const setStatus = (kind, title, text) => status.replaceChildren(el('div', { class: `callout callout-${kind}` }, [icon(kind === 'success' ? 'checkCircle' : kind === 'warning' ? 'alert' : 'info'), el('div', {}, [el('strong', { text: title }), text ? el('p', { text }) : null])]));
  if (!open) setStatus('info', 'Esta solicitação não está mais recebendo propostas.', assignment.version ? `Sua última versão (v${assignment.version}) continua registrada para a empresa.` : 'Nenhuma proposta foi enviada.');
  else if (state.key === 'outdated') {
    setStatus('warning', `A solicitação mudou desde a sua proposta (revisão ${assignment.submitted_rfq_revision} → ${assignment.rfq_revision}).`, 'Confira o que mudou e envie uma nova versão se necessário. A versão anterior continua registrada.');
    const review = el('div', {class:'revision-review', 'aria-live':'polite'});
    status.querySelector('.callout > div').append(review);
    let reading = false;
    const loadRevisions = async () => {
      if (reading) return;
      reading = true;
      review.replaceChildren(loading('Conferindo as revisões da solicitação…'));
      try {
        const {rows: revisions} = await ctx.api(`rfq-revisions?organization_id=${encodeURIComponent(ctx.organization.id)}&rfq_id=${encodeURIComponent(assignment.rfq_id)}&from_revision=${assignment.submitted_rfq_revision}&to_revision=${assignment.rfq_revision}`);
        const before = revisions?.find(row => row.revision === assignment.submitted_rfq_revision)?.snapshot;
        const after = revisions?.find(row => row.revision === assignment.rfq_revision)?.snapshot;
        if (!before || !after) throw new Error('Não recuperamos as duas revisões autorizadas. Confira a demanda atual ao lado antes de revisar sua proposta.');
        const changes = revisionDiff(assignment.product, before, after);
        review.replaceChildren(changes.length ? el('ul', {class:'diff-list'}, changes.map(change => el('li', {}, [el('span', {class:'diff-label', text:`${change.label}: `}), el('span', {class:'diff-before', text:change.before}), ' → ', el('span', {class:'diff-after', text:change.after})])))
          : el('p', {class:'small', text:'Nenhuma diferença nos campos comparáveis dessas duas revisões. Confira também os documentos e esclarecimentos atuais.'}));
      } catch (error) { review.replaceChildren(errorState({error, onRetry:loadRevisions})); }
      finally { reading = false; }
    };
    loadRevisions();
  } else if (assignment.version) setStatus('success', `Proposta enviada · versão ${assignment.version}`, `Respondendo à revisão ${assignment.submitted_rfq_revision || assignment.rfq_revision}. Alterações criam uma nova versão; a anterior continua registrada para a empresa.`);
  else if (days !== null && days < 0) setStatus('warning', 'O prazo de resposta já passou.', 'A empresa ainda não encerrou a coleta, então o envio continua possível, mas a proposta fica registrada como enviada após o prazo.');
  else setStatus('info', 'Rascunho — ainda não enviado.', 'A empresa só vê sua proposta depois que você enviar. O rascunho é salvo automaticamente e é visível apenas para a sua instituição.');

  // Formulário em blocos: o obrigatório primeiro, o resto sob demanda.
  const form = el('form', { id: 'proposal-form', class: 'proposal-form', novalidate: true });
  const specs = Object.fromEntries(spec.proposalFields.map((item) => [item.key, item]));
  const wraps = new Map();
  (REQUIRED_FIRST[assignment.product] || []).forEach(([title, keys], index) => {
    const grid = el('div', { class: 'field-grid' });
    for (const key of keys) {
      const item = specs[key];
      if (!item) continue;
      const control = catalogControl(item, assignment.terms?.[key] ?? null);
      control.setAttribute('aria-label', item.label);
      if (key === 'institution' && !control.value) control.value = ctx.organization.legal_name;
      const wrap = field({ label: item.label, control, required: Boolean(item.required), className: item.type === 'text' && (item.max ?? 0) > 400 ? 'span-2' : '' });
      wraps.set(key, wrap);
      grid.append(wrap);
    }
    if (index === 0) form.append(el('fieldset', { class: 'form-section' }, [el('legend', { class: 'form-section-title', text: title }), grid]));
    else form.append(el('details', { class: 'form-section collapsible', open: Object.keys(assignment.terms || {}).some((key) => keys.includes(key)) || null }, [el('summary', { class: 'form-section-title', text: `${title} (opcional)` }), grid]));
  });
  const note = el('input', { name: '__note', maxlength: '1000', placeholder: 'Ex.: ajustamos a carência conforme a revisão 3' });
  form.append(field({ label: 'Nota para a empresa', control: note, optionalLabel: true, hint: 'Aparece junto da versão enviada.' }));
  const completion = el('p', { class: 'completion', role: 'status', 'aria-live': 'polite' });
  const indicator = saveIndicator('idle', 'Rascunho ainda não salvo');
  const saveButton = button('Salvar agora', { size: 'sm', iconName: 'check', attrs: { id: 'save-draft' } });
  // O nome acessível é completo; no celular o texto visível encurta para caber em uma linha.
  const submitLabel = () => [el('span', { text: 'Revisar e enviar' }), el('span', { class: 'label-extra', text: ' proposta' })];
  const submit = el('button', { type: 'submit', class: 'btn btn-primary', 'aria-label': 'Revisar e enviar proposta' }, [icon('send'), el('span', { class: 'btn-label' }, submitLabel())]);
  form.append(el('div', { class: 'proposal-bar' }, [el('div', { class: 'proposal-bar-status' }, [completion, indicator.node]), el('div', { class: 'proposal-bar-actions' }, [saveButton, submit])]),
    el('p', { class: 'muted small', text: 'Depois do envio, cada alteração cria uma nova versão. A empresa vê todas as versões, com data e a revisão da solicitação que cada uma respondeu.' }));

  const required = spec.proposalFields.filter((item) => item.required);
  const values = () => {
    const entries = Object.fromEntries(new FormData(form));
    delete entries.__note;
    for (const [key, value] of Object.entries(entries)) if (value === '') delete entries[key];
    return entries;
  };
  const updateCompletion = () => {
    const current = values();
    const missing = required.filter((item) => current[item.key] === undefined);
    completion.replaceChildren(icon(missing.length ? 'edit' : 'checkCircle', { size: 14 }), el('span', { text: missing.length ? `${required.length - missing.length} de ${required.length} campos obrigatórios · falta ${missing.map((item) => item.label.replace(/\s*\(.*\)$/, '')).join(', ')}` : 'Campos obrigatórios completos' }));
  };
  updateCompletion();
  if (!open) { for (const control of form.querySelectorAll('input,select,textarea,button')) control.disabled = true; }

  let revision = 0;
  let dirty = false;
  let blocked = false;
  let timer;
  let chain = Promise.resolve();
  let ready = Promise.resolve();
  let saving = 0;
  let sending = false;
  const save = async () => {
    if (!dirty || blocked || !open) return;
    clearTimeout(timer);
    const terms = values();
    dirty = false;
    saving += 1;
    indicator.set('saving', 'Salvando…');
    chain = chain.then(async () => {
      await ready;
      const result = await ctx.api('proposal-draft', { method: 'PATCH', body: JSON.stringify({ proposal_id: assignment.proposal_id, terms, expected_revision: revision, base_version: assignment.version || 0 }) });
      revision = result.revision;
      indicator.set(dirty ? 'dirty' : 'saved', dirty ? 'Alterações não salvas…' : `Rascunho salvo às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`);
    }).catch((error) => {
      dirty = true;
      blocked = error.status === 409;
      indicator.set(blocked ? 'conflict' : 'error', blocked ? 'Rascunho alterado em outra aba — recarregue a página' : 'Falha ao salvar — use “Salvar agora”');
      if (blocked) toast('Este rascunho mudou em outra aba ou a proposta já foi enviada. Recarregue para continuar com a versão mais recente.', 'error', { action: button('Recarregar', { size: 'sm', onClick: () => location.reload() }) });
    }).finally(() => { saving -= 1; });
    await chain;
  };
  if (open) {
    ready = ctx.api(`proposal-draft?proposal_id=${encodeURIComponent(assignment.proposal_id)}`).then(({ draft }) => {
      if (!draft) { indicator.set('idle', assignment.version ? 'Sem alterações desde o envio' : 'Rascunho ainda não salvo'); return; }
      revision = draft.revision;
      if (dirty) return;
      for (const [key, value] of Object.entries(draft.terms || {})) {
        const input = form.elements.namedItem(key);
        if (input && value !== null && value !== undefined) { input.value = String(value); input.dispatchEvent(new Event('field:sync')); }
      }
      updateCompletion();
      indicator.set('saved', `Rascunho recuperado (salvo ${formatDateTime(draft.updated_at)})`);
    }).catch((error) => indicator.set('error', `Não foi possível carregar o rascunho: ${error.message}`));
    const touched = (event) => {
      wraps.get(event.target.name)?.setError('');
      dirty = true;
      updateCompletion();
      if (blocked) return;
      indicator.set('dirty', 'Alterações não salvas…');
      clearTimeout(timer);
      timer = setTimeout(save, 900);
    };
    form.addEventListener('input', touched);
    form.addEventListener('change', touched);
    saveButton.addEventListener('click', () => { if (!blocked) { dirty = true; save(); } });
    // Mesma proteção do editor de solicitação: antes, fechar a aba na espera do
    // salvamento automático (ou depois de uma falha de rede) perdia o que foi
    // digitado sem aviso, e a volta da conexão não tentava salvar de novo.
    const pendingChanges = () => form.isConnected && !blocked && !sending && (dirty || saving > 0);
    window.addEventListener('online', () => { if (pendingChanges() && dirty) save(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && pendingChanges() && dirty) save(); });
    window.addEventListener('beforeunload', (event) => {
      if (!pendingChanges()) return;
      if (dirty) save();
      if (ctx.mode !== 'demo') event.preventDefault();
    });
  }

  onSubmit(form, async (event) => {
    event.preventDefault();
    const terms = values();
    let firstInvalid = null;
    for (const item of required) {
      if (terms[item.key] === undefined) { wraps.get(item.key)?.setError('Obrigatório para enviar.'); firstInvalid ||= form.elements.namedItem(item.key); }
    }
    for (const control of form.querySelectorAll('input[type=number]')) if (control.value !== '' && !control.checkValidity()) { wraps.get(control.name)?.setError(control.validationMessage); firstInvalid ||= control; }
    if (firstInvalid) { firstInvalid.closest('details')?.setAttribute('open', ''); firstInvalid.focus(); toast('Preencha os campos obrigatórios antes de enviar.', 'error'); return; }
    clearTimeout(timer);
    if (dirty) await save();
    await chain;
    if (blocked) { toast('Recarregue a página para resolver o conflito de rascunho.', 'error'); return; }
    const summary = el('dl', { class: 'deflist deflist-2' }, spec.proposalFields.filter((item) => terms[item.key] !== undefined).map((item) =>
      el('div', { class: 'deflist-row' }, [el('dt', { text: item.label }), el('dd', { text: fieldValue(item, terms[item.key]) })])));
    const ok = await confirmDialog({ title: assignment.version ? `Enviar a versão ${assignment.version + 1}?` : 'Enviar proposta?', confirmLabel: 'Enviar proposta',
      description: `A empresa verá estas condições como resposta à revisão ${assignment.rfq_revision || 1} da solicitação.`, body: summary });
    if (!ok) return;
    submit.disabled = true;
    sending = true;
    submit.querySelector('.btn-label').textContent = 'Enviando…';
    try {
      const result = await ctx.api('proposals', { method: 'POST', body: JSON.stringify({ proposal_id: assignment.proposal_id, terms, note: note.value || null }) });
      toast(result.replay ? 'Nada mudou desde a última versão enviada.' : `Proposta enviada como versão ${result.version}.`);
      setTimeout(() => location.reload(), 600);
    } catch (error) {
      toast(error.message, 'error');
      submit.disabled = false;
      sending = false;
      submit.querySelector('.btn-label').replaceChildren(...submitLabel());
    }
  });

  // No celular o resumo do pedido vem antes do formulário: ninguém responde sem saber o que foi pedido.
  const peek = el('details', { class: 'demand-peek card' }, [
    el('summary', {}, [el('span', { class: 'demand-peek-title', text: assignment.buyer_name ? `O que ${assignment.buyer_name} pediu` : 'O que a empresa pediu' }), el('span', { class: 'muted small', text: demandHeadline({ product: assignment.product, demand: assignment.demand }) })]),
    el('div', { class: 'card-body' }, definitionList(PRODUCTS[assignment.product].demandFields, assignment.demand, { columns: 1 }))
  ]);
  // Processo sem coleta aberta: nada editável na tela, só o que foi enviado.
  const formCard = open
    ? card({ title: assignment.version ? 'Suas condições' : 'Sua proposta', subtitle: 'Preencha o essencial; os demais blocos são opcionais e ajudam a empresa a comparar.', body: form })
    : card({ title: assignment.version ? `Condições enviadas (versão ${assignment.version})` : 'Nenhuma proposta enviada', subtitle: assignment.version ? 'Registro somente leitura. A coleta desta solicitação está encerrada.' : null,
      body: assignment.version ? definitionList(spec.proposalFields, assignment.terms, { showMissing: true }) : emptyState({ title: 'A coleta encerrou sem proposta da sua instituição', compact: true }) });
  const proposalDocs = card({ title: 'Documentos da proposta', headingLevel: 3, subtitle: 'Anexe term sheet, minuta ou planilha de condições para a empresa compradora.', body: el('div', {}, loading()) });
  const buyerDocs = card({ title: 'Documentos da empresa', headingLevel: 3, subtitle: 'Arquivos que a empresa compartilhou com os provedores convidados.', body: el('div', {}, loading()) });
  import('./documents.js').then(({ documentsPanel }) => {
    proposalDocs.querySelector('.card-body').replaceChildren(documentsPanel(ctx, { entityType: 'proposal', entityId: assignment.proposal_id, canUpload: open,
      shareLabel: 'Compartilhado com a empresa compradora', ownerLabel: 'Somente sua instituição' }));
    buyerDocs.querySelector('.card-body').replaceChildren(documentsPanel(ctx, { entityType: 'rfq', entityId: assignment.rfq_id, canUpload: false }));
  });
  const main = el('div', { class: 'split-main' }, [status, peek, formCard, proposalDocs]);
  const history = (assignment.history || []).length ? card({ title: 'Histórico de versões', headingLevel: 3, subtitle: 'Só as versões da sua instituição, como foram enviadas.', body: versionHistory(assignment, spec) }) : null;
  const side = el('div', { class: 'split-side' }, [
    card({ title: 'O que a empresa quer', subtitle: `${assignment.buyer_name || 'Empresa compradora'} · revisão ${assignment.rfq_revision || 1}`, body: [
      assignment.description ? el('p', { class: 'prose', text: assignment.description }) : null,
      definitionList(PRODUCTS[assignment.product].demandFields, assignment.demand, { columns: 1 }),
      el('p', { class: 'callout callout-info compact' }, [icon('lock', { size: 14 }), el('span', { text: 'Você não vê propostas de outros provedores, notas internas nem a comparação da empresa.' })])
    ] }),
    buyerDocs,
    history,
    card({ title: 'Perguntas e esclarecimentos', headingLevel: 3, body: collaboration(ctx, { id: assignment.rfq_id, title: assignment.title }, { provider: true }) })
  ]);
  root.append(main, side);
  return root;
}

/**
 * Versões enviadas pela própria instituição: o snapshot imutável que o servidor
 * devolve (history[].terms), com o que mudou em relação à versão anterior pela
 * mesma regra da comparação (proposalChanges). Nunca usa o rascunho atual.
 */
export function versionHistory(assignment, spec) {
  const entries = [...(assignment.history || [])].sort((a, b) => b.version - a.version);
  const fields = Object.fromEntries(spec.proposalFields.map((item) => [item.key, item]));
  const show = (item, value) => fieldValue(item, value) ?? 'não informado';
  return el('ol', { class: 'timeline version-history' }, entries.map((entry) => {
    const previous = entries.find((row) => row.version === entry.version - 1);
    const hasTerms = entry.terms && typeof entry.terms === 'object';
    const changes = hasTerms && previous?.terms ? proposalChanges(assignment.product, entry, previous).map((key) => fields[key]).filter(Boolean) : [];
    return el('li', { class: 'timeline-item', id: `versao-${entry.version}` }, [
      el('span', { class: 'timeline-dot', 'aria-hidden': 'true' }), el('div', { class: 'timeline-content' }, [
        el('p', { class: 'timeline-title' }, [el('strong', { text: `Versão ${entry.version}` }), entry.rfq_revision ? tag(`responde à rev. ${entry.rfq_revision}`) : null]),
        el('p', { class: 'timeline-meta', text: `Enviada ${formatDateTime(entry.submitted_at)}` }),
        entry.note ? el('p', { class: 'muted small', text: `Nota: ${entry.note}` }) : null,
        previous && hasTerms && previous.terms ? (changes.length
          ? el('ul', { class: 'diff-list small', 'aria-label': `Mudanças desde a versão ${previous.version}` }, changes.map((item) => el('li', {}, [el('span', { class: 'diff-label', text: `${item.label}: ` }),
            el('span', { class: 'diff-before', text: show(item, previous.terms[item.key]) }), ' → ', el('span', { class: 'diff-after', text: show(item, entry.terms[item.key]) })])))
          : el('p', { class: 'muted small', text: `Mesmas condições da versão ${previous.version}.` })) : null,
        hasTerms ? el('details', { class: 'version-terms' }, [el('summary', { text: 'Condições desta versão' }), definitionList(spec.proposalFields, entry.terms, { showMissing: true, columns: 1 })]) : null
      ])]);
  }));
}

export async function providerInvite(ctx) {
  ctx.header({ title: 'Aceitar convite', subtitle: 'O convite vincula a solicitação à sua instituição.' });
  let token = '';
  const hash = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
  const query = new URLSearchParams(location.search);
  token = (hash.get('token') || query.get('token') || '').trim();
  if (query.has('token')) {
    // Token é segredo de uso único: sai do endereço imediatamente.
    query.delete('token');
    try { history.replaceState(null, '', `${location.pathname}${query.toString() ? `?${query}` : ''}`); } catch { /* segue com o token em memória */ }
  }
  const stateNode = el('p', { id: 'invite-state' });
  if (!token) { stateNode.className = 'callout callout-info'; stateNode.textContent = 'Nenhum token no endereço. Cole abaixo o token que você recebeu.'; }
  else if (!/^[0-9a-f]{64}$/.test(token)) { stateNode.className = 'callout callout-danger'; stateNode.textContent = 'Este link não tem o formato de um convite do Arandu. Confira se ele foi copiado por inteiro.'; }
  else { stateNode.className = 'callout callout-info'; stateNode.textContent = 'Confirme a organização que vai responder e aceite o convite.'; }
  const form = el('form', { id: 'invite-form', class: 'stack', novalidate: true });
  const tokenInput = el('input', { name: 'token', value: token, minlength: '64', maxlength: '64', autocomplete: 'off', spellcheck: 'false', class: 'mono' });
  form.append(field({ label: 'Token do convite', control: tokenInput, hint: '64 caracteres. Chega por e-mail ou pelo link que a empresa enviou.' }));
  if (ctx.signedOut) {
    form.append(el('div', { class: 'callout callout-info' }, [icon('lock'), el('span', { text: 'Entre na conta da sua instituição para aceitar.' }), linkButton('Entrar', `/login.html?next=${encodeURIComponent('/provider/invite.html')}`, { size: 'sm', variant: 'primary' })]));
  } else if (!ctx.organizations?.length) {
    form.append(el('p', { class: 'callout callout-warning', text: 'Esta conta ainda não pertence a nenhuma organização provedora. Crie a organização da sua instituição antes de aceitar: o convite é vinculado a ela.' }));
  } else {
    const select = el('select', { name: 'provider_organization_id' });
    for (const organization of ctx.organizations) select.add(new Option(organization.legal_name, organization.id));
    select.value = ctx.organization?.id;
    const submit = button('Aceitar convite', { variant: 'primary', type: 'submit', iconName: 'check' });
    form.append(field({ label: 'Organização que vai responder', control: select }), el('div', { class: 'form-actions' }, submit));
    onSubmit(form, async (event) => {
      event.preventDefault();
      if (!/^[0-9a-f]{64}$/.test(tokenInput.value.trim())) { tokenInput.closest('.field').setError('O token tem 64 caracteres (0-9, a-f).'); return; }
      submit.disabled = true;
      try {
        const result = await ctx.api('invites/accept', { method: 'POST', body: JSON.stringify({ token: tokenInput.value.trim(), provider_organization_id: select.value }) });
        stateNode.className = 'callout callout-success';
        stateNode.textContent = 'Convite aceito. A solicitação já aparece nas suas oportunidades.';
        toast('Convite aceito.');
        location.assign(ctx.href(result.proposal_id ? `/provider/proposal.html?proposal=${encodeURIComponent(result.proposal_id)}` : '/provider/rfqs.html'));
      } catch (error) {
        stateNode.className = 'callout callout-danger';
        stateNode.textContent = error.status === 401 ? 'Entre na sua conta de provedor para aceitar o convite.' : error.message;
        submit.disabled = false;
      }
    });
  }
  return el('div', { class: 'narrow' }, card({ body: [stateNode, form, el('p', { class: 'muted small', text: 'O convite vale uma vez e expira. Ele vincula a solicitação à organização provedora da qual você é membro — não é possível responder em nome de outra instituição.' })] }));
}

export { loading, errorState, PROPOSAL_STATUS };
