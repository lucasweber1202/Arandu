// Quick view universal: consultar sem trocar de página.
//
// Todo resumo segue o mesmo modelo:
//   CABEÇALHO  estado + título (no topo do painel)
//   RESUMO     o essencial: valor, prazo, situação
//   CONTEXTO   o secundário: listas, notas, histórico curto
//   AÇÕES      favoritar, copiar link, comparar… e "Abrir completo"
// Painel lateral no desktop, folha inferior no celular. Usa o <dialog> modal
// do produto: foco preso, Escape fecha, o foco volta para quem abriu e a
// página por trás — rolagem, filtros, busca — não se mexe.
//
// Neutralidade: propostas em ordem alfabética, só com valores informados.
// Nada aqui ordena, pontua ou recomenda.

import { PRODUCTS } from '../../../lib/finance/products.mjs';
import { el, icon, money, fieldValue, formatDate, relativeDays, daysUntil, productLabel, demandHeadline, RFQ_STATUS, CONTRACT_STATUS, PROPOSAL_STATUS, PROVIDER_KINDS, renewalStage, timeAgo } from '../../src/core.js';
import { drawer, pill, tag, linkButton, button, emptyState, toast } from '../../src/ui.js';
import { isFavorite, toggleFavorite, recordRecent } from './preferences.js';
import { rfqStages, contractStages, timeline } from './timeline.js';
import { trayCheckbox } from './comparison-tray.js';
import { openApproval } from './approval.js';
import { rfqNext, contractNext, taskNext } from './next-action.js';
import { nextBlock } from './work-ui.js';

/** Contexto da gramática da próxima ação (aprovações vêm do cache da camada). */
export const workContext = (ctx) => ({ approvals: ctx.demoApprovals || [], viewerId: ctx.viewer?.id, members: ctx.members, contracts: ctx.data?.contracts || [] });
// Inspector ancorado (telas largas, listas): registrado por index.js para evitar import circular.
let inspectorHook = null;
export function setInspectorHook(hook) { inspectorHook = hook; }

const KEY_TERMS = {
  credit: ['offered_amount', 'interest_rate_month', 'cet_year', 'term_months', 'grace_months', 'valid_until'],
  acquiring: ['mdr_debit', 'mdr_credit_cash', 'mdr_credit_installment', 'pix_fee', 'anticipation_rate', 'settlement_days']
};
const HEADLINE_TERM = { credit: 'interest_rate_month', acquiring: 'mdr_credit_cash' };

function spec(product, key) { return PRODUCTS[product]?.proposalFields.find((field) => field.key === key) || null; }
export function termValue(product, key, terms) {
  const field = spec(product, key);
  if (!field) return null;
  const raw = fieldValue(field, terms?.[key]);
  if (raw === null) return null;
  const unit = (field.label.match(/\(([^)]*)\)$/) || [])[1] || '';
  return `${raw}${{ meses: ' meses', dias: ' dias', '% a.m.': ' a.m.', '% a.a.': ' a.a.' }[unit] || ''}`;
}
const shortLabel = (product, key) => (spec(product, key)?.label || key).replace(/\s*\(.*\)$/, '');

// ------------------------------------------------------------ moldura
function facts(rows) {
  return el('dl', { class: 'qv-facts' }, rows.filter(Boolean).map(([label, value, className = '']) =>
    el('div', { class: 'qv-fact' }, [el('dt', { text: label }), el('dd', { class: className, text: value ?? '—' })])));
}
function section(title, body, { count = null } = {}) {
  return el('section', { class: 'qv-section' }, [el('h3', { class: 'qv-section-title' }, [el('span', { text: title }), count !== null ? el('span', { class: 'qv-count num', text: String(count) }) : null]), body]);
}
/** Resumo no topo: estado, rótulo, número principal e detalhe. */
function summary({ state = null, kicker, figure, sub = null, chips = [] }) {
  return el('div', { class: 'qv-hero' }, [
    el('p', { class: 'qv-kicker' }, [state, el('span', { text: kicker })]),
    figure ? el('p', { class: 'qv-figure num', text: figure }) : null,
    sub ? el('p', { class: 'qv-figure-sub', text: sub }) : null,
    chips.filter(Boolean).length ? el('div', { class: 'qv-badges' }, chips.filter(Boolean)) : null
  ]);
}
function chip(text, { urgent = false, iconName = 'clock' } = {}) { return el('span', { class: `qv-chip${urgent ? ' is-urgent' : ''}` }, [icon(iconName, { size: 12 }), el('span', { text })]); }

function favoriteButton(type, id, title) {
  const on = isFavorite(type, id);
  const node = button(on ? 'Favorito' : 'Favoritar', { variant: 'ghost', size: 'sm', iconName: 'star', attrs: { 'aria-pressed': String(on), class: `btn btn-ghost btn-sm dw-fav${on ? ' is-on' : ''}` } });
  node.addEventListener('click', () => {
    const next = toggleFavorite(type, id, title);
    node.setAttribute('aria-pressed', String(next));
    node.classList.toggle('is-on', next);
    node.querySelector('.btn-label').textContent = next ? 'Favorito' : 'Favoritar';
    toast(next ? 'Adicionado aos favoritos.' : 'Removido dos favoritos.', 'info');
  });
  return node;
}
export function copyLink(href) {
  const url = new URL(href, location.origin).toString();
  navigator.clipboard?.writeText(url).then(() => toast('Link copiado.', 'info'), () => toast(`Copie o link: ${url}`, 'info'));
}
const copyButton = (href) => button('Copiar link', { variant: 'ghost', size: 'sm', iconName: 'copy', onClick: () => copyLink(href) });
const openButton = (label, href) => linkButton(label, href, { variant: 'primary', size: 'sm', iconName: 'arrowRight', attrs: { 'data-qv-open': '' } });

// ----------------------------------------------------------- solicitação
function rfqView(ctx, rfq) {
  const live = ['open', 'collecting'].includes(rfq.status);
  const days = daysUntil(rfq.response_deadline);
  const invited = (rfq.invites || []).length || rfq.invites_count || 0;
  const proposals = [...(rfq.proposals || [])].sort((a, b) => String(a.provider_name).localeCompare(String(b.provider_name), 'pt-BR'));
  const demand = rfq.demand || {};
  const figure = rfq.product === 'credit' ? money(demand.amount) : `${money(demand.monthly_volume)}/mês`;
  const sub = rfq.product === 'credit'
    ? [productLabel(rfq.product), demand.term_months ? `${demand.term_months} meses` : null, demand.grace_months ? `${demand.grace_months} de carência` : null, `revisão ${rfq.revision || 1}`].filter(Boolean).join(' · ')
    : [productLabel(rfq.product), demand.average_ticket ? `ticket médio ${money(demand.average_ticket)}` : null, `revisão ${rfq.revision || 1}`].filter(Boolean).join(' · ');
  const list = el('ul', { class: 'qv-list', role: 'list' }, proposals.map((proposal) => {
    const key = HEADLINE_TERM[rfq.product];
    const value = termValue(rfq.product, key, proposal.terms);
    const outdated = proposal.rfq_revision && proposal.rfq_revision < (rfq.revision || 1);
    return el('li', { class: 'qv-item' }, [
      trayCheckbox(rfq, proposal, { label: '' }),
      el('span', { class: 'qv-item-main' }, [el('span', { class: 'qv-item-title', text: proposal.provider_name }),
        el('span', { class: `qv-item-meta${outdated ? ' warn-text' : ''}`, text: `v${proposal.version} · responde à rev. ${proposal.rfq_revision || '—'}${outdated ? ' (desatualizada)' : ''}` })]),
      el('span', { class: 'qv-item-side num' }, [el('span', { class: 'qv-item-value', text: value || 'não informado' }), el('span', { class: 'qv-item-meta', text: shortLabel(rfq.product, key) })])
    ]);
  }));
  const href = ctx.href(`/finance/rfq.html?id=${encodeURIComponent(rfq.id)}`);
  return {
    title: rfq.title, subtitle: `${productLabel(rfq.product, { short: true })} · ${demandHeadline(rfq)}`, href,
    body: [
      summary({ state: pill(rfq.pending_approval ? { label: 'Em aprovação', tone: 'warning', icon: 'clock' } : RFQ_STATUS[rfq.status], { size: 'sm' }), kicker: 'Solicitação', figure, sub,
        chips: [rfq.response_deadline && live ? chip(`Prazo ${relativeDays(rfq.response_deadline)}`, { urgent: days !== null && days <= 2 }) : null, invited ? chip(`${(rfq.proposals || []).length} de ${invited} responderam`, { iconName: 'inbox' }) : null] }),
      nextBlock(ctx, rfqNext(rfq, workContext(ctx))),
      timeline(rfqStages(rfq), { compact: true, label: 'Etapa do processo' }),
      facts([
        ['Prazo de resposta', rfq.response_deadline ? formatDate(rfq.response_deadline) : 'Sem prazo', live && days !== null && days <= 2 ? 'is-urgent' : ''],
        ['Responsável', rfq.owner_name || '—'],
        ['Provedores convidados', invited ? `${invited} · ${(rfq.proposals || []).length} responderam` : 'Nenhum convite ainda'],
        ['Atualizada', timeAgo(rfq.updated_at || rfq.created_at)]
      ]),
      section('Propostas', proposals.length
        ? el('div', {}, [list, el('p', { class: 'qv-note', text: 'Ordem alfabética, com valores informados. Marque para comparar; a comparação completa fica na solicitação.' })])
        : emptyState({ title: 'Nenhuma proposta recebida ainda', text: invited ? `${invited} provedor${invited > 1 ? 'es foram convidados' : ' foi convidado'}${rfq.response_deadline && live ? `. O prazo termina ${relativeDays(rfq.response_deadline)}.` : '.'}` : 'Convide provedores para começar a receber propostas.', compact: true, iconName: 'inbox' }), { count: proposals.length }),
      rfq.description ? section('Contexto', el('p', { class: 'qv-prose', text: rfq.description })) : null
    ],
    footer: [favoriteButton('rfq', rfq.id, rfq.title), copyButton(href),
      proposals.length > 1 ? linkButton('Comparar', `${href}#comparacao`, { size: 'sm', iconName: 'scale' }) : null,
      openButton('Abrir solicitação completa', href)]
  };
}

// --------------------------------------------------------------- proposta
function proposalView(ctx, rfq, proposal) {
  const validDays = daysUntil(proposal.terms?.valid_until);
  const href = ctx.href(`/finance/rfq.html?id=${encodeURIComponent(rfq.id)}#propostas`);
  return {
    title: proposal.provider_name, subtitle: `Proposta para ${rfq.title}`, href,
    body: [
      summary({ state: pill(PROPOSAL_STATUS[proposal.status] || PROPOSAL_STATUS.submitted, { size: 'sm' }), kicker: `${PROVIDER_KINDS[proposal.provider_kind] || 'Provedor'} · versão ${proposal.version}`,
        figure: termValue(rfq.product, HEADLINE_TERM[rfq.product], proposal.terms) || proposal.provider_name, sub: `${shortLabel(rfq.product, HEADLINE_TERM[rfq.product])} · ${rfq.title}`,
        chips: [proposal.terms?.valid_until ? chip(validDays !== null && validDays < 0 ? 'Validade vencida' : `Válida até ${formatDate(proposal.terms.valid_until, { withYear: false })}`, { urgent: validDays !== null && validDays < 5, iconName: 'calendar' }) : null] }),
      section('Condições informadas', el('dl', { class: 'qv-terms' }, (KEY_TERMS[rfq.product] || []).map((key) => {
        const value = termValue(rfq.product, key, proposal.terms);
        return el('div', { class: 'qv-term' }, [el('dt', { text: shortLabel(rfq.product, key) }), el('dd', { class: value === null ? 'missing' : 'num', text: value ?? 'Não informado' })]);
      }))),
      facts([
        ['Enviada', proposal.submitted_at ? `${formatDate(proposal.submitted_at)} · ${timeAgo(proposal.submitted_at)}` : '—'],
        ['Responde à revisão', proposal.rfq_revision ? `${proposal.rfq_revision} de ${rfq.revision || 1}` : '—', proposal.rfq_revision && proposal.rfq_revision < (rfq.revision || 1) ? 'warn-text' : ''],
        ['Versões enviadas', String(proposal.versions_count || proposal.version || 1)]
      ]),
      proposal.note ? section('Nota do provedor', el('p', { class: 'qv-prose', text: proposal.note })) : null
    ],
    footer: [trayCheckbox(rfq, proposal, { label: 'Comparar' }), copyButton(href), openButton('Abrir na solicitação', href)]
  };
}

// -------------------------------------------------------------- provedor
function providerView(ctx, provider) {
  const rows = [];
  for (const rfq of ctx.data.rfqs || []) {
    const invite = (rfq.invites || []).find((item) => item.provider_id === provider.id);
    const proposal = (rfq.proposals || []).find((item) => item.provider_id === provider.id);
    if (invite || proposal) rows.push({ rfq, invite, proposal });
  }
  const contracts = (ctx.data.contracts || []).filter((contract) => contract.provider_id === provider.id);
  const href = ctx.href(`/finance/providers.html#provider-${provider.id}`);
  return {
    title: provider.name, subtitle: PROVIDER_KINDS[provider.kind] || 'Provedor', href,
    body: [
      summary({ state: provider.verification_state === 'EVIDENCIA_REGISTRADA' ? tag('Evidência registrada', 'success') : tag('Sem verificação registrada'), kicker: `${PROVIDER_KINDS[provider.kind] || 'Provedor'} · ${provider.region || 'região não informada'}`,
        figure: null, sub: null, chips: (provider.products || []).map((product) => tag(productLabel(product, { short: true }))) }),
      section('Participações', rows.length ? el('ul', { class: 'qv-list', role: 'list' }, rows.map(({ rfq, invite, proposal }) => el('li', { class: 'qv-item' }, [
        el('span', { class: 'qv-item-main' }, [el('a', { class: 'qv-item-title', href: ctx.href(`/finance/rfq.html?id=${rfq.id}`), text: rfq.title }),
          el('span', { class: 'qv-item-meta', text: proposal ? `Proposta v${proposal.version} enviada ${timeAgo(proposal.submitted_at)}` : invite?.status === 'accepted' ? 'Convite aceito · sem proposta ainda' : 'Convidado · aguardando aceite' })]),
        pill(RFQ_STATUS[rfq.status], { size: 'sm' })
      ]))) : emptyState({ title: 'Ainda não participou de solicitações', text: 'Convide este provedor numa solicitação aberta.', compact: true, iconName: 'send' }), { count: rows.length }),
      contracts.length ? section('Contratos', el('ul', { class: 'qv-list', role: 'list' }, contracts.map((contract) => el('li', { class: 'qv-item' }, [
        el('span', { class: 'qv-item-main' }, [el('span', { class: 'qv-item-title', text: productLabel(contract.product) }), el('span', { class: 'qv-item-meta num', text: `${formatDate(contract.starts_on)} → ${formatDate(contract.ends_on)}` })]),
        pill(CONTRACT_STATUS[contract.status], { size: 'sm' })
      ])))) : null,
      provider.notes ? section('Notas internas', el('p', { class: 'qv-prose', text: provider.notes })) : null,
      el('p', { class: 'qv-note', text: 'O cadastro é uma referência da sua empresa, não uma atestação de regularidade.' })
    ],
    footer: [favoriteButton('provider', provider.id, provider.name), copyButton(href), openButton('Abrir em Provedores', href)]
  };
}

// -------------------------------------------------------------- contrato
function contractView(ctx, contract) {
  const stage = renewalStage(contract);
  const source = (ctx.data.rfqs || []).find((rfq) => rfq.id === contract.rfq_id);
  const href = ctx.href(`/finance/contracts.html#contract-${contract.id}`);
  const live = ['active', 'renewing'].includes(contract.status);
  return {
    title: contract.provider_name || 'Contrato', subtitle: `Contrato · ${productLabel(contract.product, { short: true })}`, href,
    body: [
      summary({ state: pill(CONTRACT_STATUS[contract.status], { size: 'sm' }), kicker: productLabel(contract.product), figure: live && Number.isFinite(contract.days_to_end) ? (contract.days_to_end >= 0 ? `${contract.days_to_end} dias` : 'Vencido') : null,
        sub: live ? `até o vencimento em ${formatDate(contract.ends_on)}` : `${formatDate(contract.starts_on)} → ${formatDate(contract.ends_on)}` }),
      nextBlock(ctx, contractNext(contract, workContext(ctx)), { action: false }),
      live ? timeline(contractStages(contract), { label: 'Ciclo de vida do contrato', hereText: '' }) : null,
      facts([
        ['Vigência', `${formatDate(contract.starts_on)} → ${formatDate(contract.ends_on)}`],
        ['Aviso prévio', `${contract.renewal_notice_days} dias · ${formatDate(contract.review_from)}`],
        ['Custo registrado', contract.cost_summary || 'Não informado', contract.cost_summary ? '' : 'missing'],
        contract.main_conditions ? ['Condições', contract.main_conditions] : null,
        source ? ['Processo de origem', source.title] : null
      ])
    ],
    footer: [favoriteButton('contract', contract.id, contract.provider_name || 'Contrato'), copyButton(href),
      source ? linkButton('Processo de origem', ctx.href(`/finance/rfq.html?id=${source.id}#decisao`), { size: 'sm', iconName: 'file' }) : null,
      openButton('Abrir em Contratos', href)]
  };
}

// ----------------------------------------------------------------- tarefa
function taskView(ctx, task) {
  const days = daysUntil(task.due_on);
  const related = task.related_type === 'rfq' ? (ctx.data.rfqs || []).find((rfq) => rfq.id === task.related_id) : null;
  const href = ctx.href(`/finance/tasks.html#task-${task.id}`);
  const done = button(task.status === 'done' ? 'Concluída' : 'Concluir tarefa', { size: 'sm', iconName: 'check', attrs: { disabled: task.status === 'done' } });
  done.addEventListener('click', async () => {
    done.disabled = true;
    try {
      await ctx.api('tasks', { method: 'PATCH', body: JSON.stringify({ organization_id: ctx.organization.id, task_id: task.id, status: 'done' }) });
      done.querySelector('.btn-label').textContent = 'Concluída';
      toast('Tarefa concluída.');
      ctx.reload();
    } catch (error) { done.disabled = false; toast(error.message, 'error'); }
  });
  return {
    title: task.title, subtitle: 'Tarefa', href,
    body: [
      summary({ state: pill(task.status === 'done' ? { label: 'Concluída', tone: 'success', icon: 'checkCircle' } : { label: 'Aberta', tone: 'neutral', icon: 'clock' }, { size: 'sm' }), kicker: 'Tarefa',
        figure: task.due_on ? relativeDays(task.due_on) : 'Sem prazo', sub: task.due_on ? `prazo ${formatDate(task.due_on)}` : null,
        chips: [days !== null && days < 0 && task.status !== 'done' ? chip('Vencida', { urgent: true }) : null] }),
      nextBlock(ctx, taskNext(task, workContext(ctx)), { action: false }),
      facts([['Responsável', task.assignee_name || 'Sem responsável'], related ? ['Relacionada a', related.title] : null, task.related_type === 'contract' ? ['Relacionada a', 'Contrato'] : null])
    ],
    footer: [related ? linkButton('Abrir solicitação', ctx.href(`/finance/rfq.html?id=${related.id}`), { size: 'sm', iconName: 'file' }) : null, done, openButton('Abrir em Tarefas', href)]
  };
}

// ------------------------------------------------------------------ API
export function resolveEntity(ctx, type, id) {
  const rfqs = ctx.data?.rfqs || [];
  if (type === 'rfq') { const rfq = rfqs.find((row) => row.id === id); return rfq ? { title: rfq.title, build: () => rfqView(ctx, rfq) } : null; }
  if (type === 'proposal') {
    for (const rfq of rfqs) { const proposal = (rfq.proposals || []).find((row) => row.id === id); if (proposal) return { title: `${proposal.provider_name} · ${rfq.title}`, build: () => proposalView(ctx, rfq, proposal) }; }
    return null;
  }
  if (type === 'provider') { const provider = (ctx.data.providers || []).find((row) => row.id === id); return provider ? { title: provider.name, build: () => providerView(ctx, provider) } : null; }
  if (type === 'contract') { const contract = (ctx.data.contracts || []).find((row) => row.id === id); return contract ? { title: contract.provider_name || 'Contrato', build: () => contractView(ctx, contract) } : null; }
  if (type === 'task') { const task = (ctx.data.tasks || []).find((row) => row.id === id); return task ? { title: task.title, build: () => taskView(ctx, task) } : null; }
  return null;
}

let openDialog = null;
/** Abre a quick view; devolve false quando o item não está disponível (o chamador segue o link). */
export function openQuickView(ctx, type, id) {
  if (ctx.audience !== 'company') return false;
  if (type === 'approval') {
    ctx.loadApprovals().then((rows) => {
      const request = rows.find((row) => row.id === id);
      const rfq = request && (ctx.data.rfqs || []).find((row) => row.id === request.rfq_id);
      if (request && rfq) { openDialog?.close(); openDialog = openApproval(ctx, request, rfq); }
    });
    return true;
  }
  const entity = resolveEntity(ctx, type, id);
  if (!entity) return false;
  if (inspectorHook?.(ctx, type, id)) return true;
  openDialog?.close();
  const view = entity.build();
  if (['rfq', 'contract', 'provider'].includes(type)) recordRecent(type, id, entity.title);
  const dialog = drawer({ title: view.title, subtitle: view.subtitle, body: view.body.filter(Boolean), footer: view.footer.filter(Boolean), className: `quick-view qv-${type}`, onClose: () => { if (openDialog === dialog) openDialog = null; } });
  dialog.dataset.entity = `${type}:${id}`;
  openDialog = dialog;
  return true;
}
