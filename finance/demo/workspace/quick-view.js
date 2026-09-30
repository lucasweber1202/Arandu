// Quick view: consultar sem trocar de página.
//
// Um painel lateral (folha inferior no celular) com o essencial de uma
// solicitação, proposta, provedor ou contrato e um atalho para "Abrir
// completo". Usa o <dialog> modal do produto: foco preso dentro do painel,
// Escape fecha, o foco volta para quem abriu e a página por trás — rolagem,
// filtros, busca — não se mexe.
//
// Neutralidade: propostas aparecem em ordem alfabética e só com valores
// informados pelo provedor. Nada aqui ordena, pontua ou recomenda.

import { PRODUCTS } from '../../../lib/finance/products.mjs';
import { el, icon, money, fieldValue, formatDate, relativeDays, daysUntil, productLabel, demandHeadline, RFQ_STATUS, CONTRACT_STATUS, PROPOSAL_STATUS, PROVIDER_KINDS, renewalStage, timeAgo } from '../../src/core.js';
import { drawer, pill, tag, linkButton, button, emptyState, toast } from '../../src/ui.js';
import { isFavorite, toggleFavorite, recordRecent } from './preferences.js';

const KEY_TERMS = {
  credit: ['offered_amount', 'interest_rate_month', 'cet_year', 'term_months', 'grace_months', 'valid_until'],
  acquiring: ['mdr_debit', 'mdr_credit_cash', 'mdr_credit_installment', 'pix_fee', 'anticipation_rate', 'settlement_days']
};
const HEADLINE_TERM = { credit: 'interest_rate_month', acquiring: 'mdr_credit_cash' };

function spec(product, key) { return PRODUCTS[product]?.proposalFields.find((field) => field.key === key) || null; }
function termValue(product, key, terms) {
  const field = spec(product, key);
  if (!field) return null;
  const raw = fieldValue(field, terms?.[key]);
  if (raw === null) return null;
  const unit = (field.label.match(/\(([^)]*)\)$/) || [])[1] || '';
  return `${raw}${{ meses: ' meses', dias: ' dias', '% a.m.': ' a.m.', '% a.a.': ' a.a.' }[unit] || ''}`;
}
const shortLabel = (product, key) => (spec(product, key)?.label || key).replace(/\s*\(.*\)$/, '');

function facts(rows) {
  return el('dl', { class: 'qv-facts' }, rows.filter(Boolean).map(([label, value, className = '']) =>
    el('div', { class: 'qv-fact' }, [el('dt', { text: label }), el('dd', { class: className, text: value ?? '—' })])));
}
function section(title, body, { count = null } = {}) {
  return el('section', { class: 'qv-section' }, [el('h3', { class: 'qv-section-title' }, [el('span', { text: title }), count !== null ? el('span', { class: 'qv-count', text: String(count) }) : null]), body]);
}

function favoriteButton(type, id, title) {
  const on = isFavorite(type, id);
  const node = button(on ? 'Favorito' : 'Favoritar', { variant: 'ghost', size: 'sm', iconName: 'star', attrs: { 'aria-pressed': String(on), class: `btn btn-ghost btn-sm dw-fav${on ? ' is-on' : ''}` } });
  node.addEventListener('click', () => {
    const next = toggleFavorite(type, id, title);
    node.setAttribute('aria-pressed', String(next));
    node.classList.toggle('is-on', next);
    node.querySelector('.btn-label').textContent = next ? 'Favorito' : 'Favoritar';
    toast(next ? `“${title}” está nos favoritos.` : `“${title}” saiu dos favoritos.`, 'info');
  });
  return node;
}
function copyLinkButton(href) {
  return button('Copiar link', { variant: 'ghost', size: 'sm', iconName: 'copy', onClick: async () => {
    const url = new URL(href, location.origin).toString();
    try { await navigator.clipboard.writeText(url); toast('Link copiado.', 'info'); }
    catch { toast(`Copie o link: ${url}`, 'info'); }
  } });
}

// ----------------------------------------------------------- solicitação
function rfqView(ctx, rfq) {
  const live = ['open', 'collecting'].includes(rfq.status);
  const days = daysUntil(rfq.response_deadline);
  const invited = (rfq.invites || []).length || rfq.invites_count || 0;
  const proposals = [...(rfq.proposals || [])].sort((a, b) => String(a.provider_name).localeCompare(String(b.provider_name), 'pt-BR'));
  const demand = rfq.demand || {};
  const figure = rfq.product === 'credit' ? money(demand.amount, { compact: true }) : `${money(demand.monthly_volume, { compact: true })}/mês`;
  const figureSub = rfq.product === 'credit'
    ? [demand.term_months ? `${demand.term_months} meses` : null, demand.grace_months ? `${demand.grace_months} de carência` : null, demand.purpose ? fieldValue({ type: 'enum' }, demand.purpose) : null].filter(Boolean).join(' · ')
    : [demand.average_ticket ? `ticket médio ${money(demand.average_ticket)}` : null, demand.average_installments ? `${demand.average_installments} parcelas em média` : null].filter(Boolean).join(' · ');
  const hero = el('div', { class: 'qv-hero' }, [
    el('p', { class: 'qv-kicker', text: `${productLabel(rfq.product)} · revisão ${rfq.revision || 1}` }),
    el('p', { class: 'qv-figure num', text: figure }),
    figureSub ? el('p', { class: 'qv-figure-sub', text: figureSub }) : null,
    el('div', { class: 'qv-badges' }, [pill(rfq.pending_approval ? { label: 'Em aprovação', tone: 'warning', icon: 'clock' } : RFQ_STATUS[rfq.status], { size: 'sm' }),
      rfq.response_deadline && live ? el('span', { class: `qv-chip${days !== null && days <= 2 ? ' is-urgent' : ''}` }, [icon('clock', { size: 12 }), el('span', { text: `Prazo ${relativeDays(rfq.response_deadline)}` })]) : null])
  ]);
  const list = el('ul', { class: 'qv-list', role: 'list' }, proposals.map((proposal) => {
    const key = HEADLINE_TERM[rfq.product];
    const value = termValue(rfq.product, key, proposal.terms);
    const outdated = proposal.rfq_revision && proposal.rfq_revision < (rfq.revision || 1);
    return el('li', { class: 'qv-item' }, [
      el('span', { class: 'qv-item-main' }, [el('span', { class: 'qv-item-title', text: proposal.provider_name }),
        el('span', { class: `qv-item-meta${outdated ? ' warn-text' : ''}`, text: `v${proposal.version} · responde à rev. ${proposal.rfq_revision || '—'}${outdated ? ' (desatualizada)' : ''}` })]),
      el('span', { class: 'qv-item-side num' }, [el('span', { class: 'qv-item-value', text: value || 'não informado' }), el('span', { class: 'qv-item-meta', text: shortLabel(rfq.product, key) })])
    ]);
  }));
  const body = [
    hero,
    facts([
      ['Prazo de resposta', rfq.response_deadline ? `${formatDate(rfq.response_deadline)}${live ? ` · ${relativeDays(rfq.response_deadline)}` : ''}` : 'Sem prazo', live && days !== null && days <= 2 ? 'is-urgent' : ''],
      ['Responsável', rfq.owner_name || '—'],
      ['Provedores convidados', invited ? `${invited} · ${(rfq.proposals || []).length} responderam` : 'Nenhum convite ainda'],
      ['Atualizada', timeAgo(rfq.updated_at || rfq.created_at)]
    ]),
    section('Propostas', proposals.length
      ? el('div', {}, [list, el('p', { class: 'qv-note', text: 'Ordem alfabética, com valores informados pelos provedores. A comparação completa fica na solicitação.' })])
      : emptyState({ title: 'Nenhuma proposta recebida', text: live ? 'As respostas aparecem aqui assim que os provedores enviarem.' : 'Esta solicitação não recebeu propostas.', compact: true, iconName: 'inbox' }), { count: proposals.length }),
    rfq.description ? section('Contexto', el('p', { class: 'qv-prose', text: rfq.description })) : null
  ];
  const href = ctx.href(`/finance/rfq.html?id=${encodeURIComponent(rfq.id)}`);
  return {
    title: rfq.title, subtitle: `${productLabel(rfq.product, { short: true })} · ${demandHeadline(rfq)}`, body, href,
    footer: [favoriteButton('rfq', rfq.id, rfq.title), copyLinkButton(href),
      proposals.length > 1 ? linkButton('Comparar', `${href}#comparacao`, { size: 'sm', iconName: 'scale' }) : null,
      linkButton('Abrir solicitação completa', href, { variant: 'primary', size: 'sm', iconName: 'arrowRight', attrs: { 'data-qv-open': '' } })]
  };
}

// --------------------------------------------------------------- proposta
function proposalView(ctx, rfq, proposal) {
  const keys = KEY_TERMS[rfq.product] || [];
  const validDays = daysUntil(proposal.terms?.valid_until);
  const body = [
    el('div', { class: 'qv-hero' }, [
      el('p', { class: 'qv-kicker', text: `${PROVIDER_KINDS[proposal.provider_kind] || 'Provedor'} · versão ${proposal.version}` }),
      el('p', { class: 'qv-figure', text: proposal.provider_name }),
      el('p', { class: 'qv-figure-sub', text: rfq.title }),
      el('div', { class: 'qv-badges' }, [pill(PROPOSAL_STATUS[proposal.status] || PROPOSAL_STATUS.submitted, { size: 'sm' }),
        proposal.terms?.valid_until ? el('span', { class: `qv-chip${validDays !== null && validDays < 5 ? ' is-urgent' : ''}` }, [icon('calendar', { size: 12 }),
          el('span', { text: validDays !== null && validDays < 0 ? 'Validade vencida' : `Válida até ${formatDate(proposal.terms.valid_until, { withYear: false })}` })]) : null])
    ]),
    section('Condições informadas', el('dl', { class: 'qv-terms' }, keys.map((key) => {
      const value = termValue(rfq.product, key, proposal.terms);
      return el('div', { class: 'qv-term' }, [el('dt', { text: shortLabel(rfq.product, key) }), el('dd', { class: value === null ? 'missing' : 'num', text: value ?? 'Não informado' })]);
    }))),
    facts([
      ['Enviada', proposal.submitted_at ? `${formatDate(proposal.submitted_at)} · ${timeAgo(proposal.submitted_at)}` : '—'],
      ['Responde à revisão', proposal.rfq_revision ? `${proposal.rfq_revision} de ${rfq.revision || 1}` : '—', proposal.rfq_revision && proposal.rfq_revision < (rfq.revision || 1) ? 'warn-text' : ''],
      ['Versões enviadas', String(proposal.versions_count || proposal.version || 1)]
    ]),
    proposal.note ? section('Nota do provedor', el('p', { class: 'qv-prose', text: proposal.note })) : null
  ];
  const href = ctx.href(`/finance/rfq.html?id=${encodeURIComponent(rfq.id)}#propostas`);
  return {
    title: proposal.provider_name, subtitle: `Proposta para ${rfq.title}`, body, href,
    footer: [copyLinkButton(href), linkButton('Comparar', ctx.href(`/finance/rfq.html?id=${encodeURIComponent(rfq.id)}#comparacao`), { size: 'sm', iconName: 'scale' }),
      linkButton('Abrir na solicitação', href, { variant: 'primary', size: 'sm', iconName: 'arrowRight', attrs: { 'data-qv-open': '' } })]
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
  const body = [
    el('div', { class: 'qv-hero' }, [
      el('p', { class: 'qv-kicker', text: `${PROVIDER_KINDS[provider.kind] || 'Provedor'} · ${provider.region || 'região não informada'}` }),
      el('p', { class: 'qv-figure', text: provider.name }),
      el('div', { class: 'qv-badges' }, [provider.verification_state === 'EVIDENCIA_REGISTRADA' ? tag(`Evidência registrada em ${formatDate(provider.regulator_checked_at)}`, 'success') : tag('Sem verificação registrada'),
        ...(provider.products || []).map((product) => tag(productLabel(product, { short: true })))])
    ]),
    section('Participações', rows.length ? el('ul', { class: 'qv-list', role: 'list' }, rows.map(({ rfq, invite, proposal }) => el('li', { class: 'qv-item' }, [
      el('span', { class: 'qv-item-main' }, [el('a', { class: 'qv-item-title', href: ctx.href(`/finance/rfq.html?id=${rfq.id}`), text: rfq.title }),
        el('span', { class: 'qv-item-meta', text: proposal ? `Proposta v${proposal.version} enviada ${timeAgo(proposal.submitted_at)}` : invite?.status === 'accepted' ? 'Convite aceito · sem proposta ainda' : 'Convidado · aguardando aceite' })]),
      pill(RFQ_STATUS[rfq.status], { size: 'sm' })
    ]))) : emptyState({ title: 'Ainda não participou de solicitações', compact: true, iconName: 'send' }), { count: rows.length }),
    contracts.length ? section('Contratos', el('ul', { class: 'qv-list', role: 'list' }, contracts.map((contract) => el('li', { class: 'qv-item' }, [
      el('span', { class: 'qv-item-main' }, [el('span', { class: 'qv-item-title', text: productLabel(contract.product) }), el('span', { class: 'qv-item-meta', text: `${formatDate(contract.starts_on)} → ${formatDate(contract.ends_on)}` })]),
      pill(CONTRACT_STATUS[contract.status], { size: 'sm' })
    ])))) : null,
    provider.notes ? section('Notas internas', el('p', { class: 'qv-prose', text: provider.notes })) : null,
    el('p', { class: 'qv-note', text: 'O cadastro é uma referência da sua empresa, não uma atestação de regularidade.' })
  ];
  const href = ctx.href(`/finance/providers.html#provider-${provider.id}`);
  return { title: provider.name, subtitle: PROVIDER_KINDS[provider.kind] || 'Provedor', body, href,
    footer: [favoriteButton('provider', provider.id, provider.name), copyLinkButton(href), linkButton('Abrir em Provedores', href, { variant: 'primary', size: 'sm', iconName: 'arrowRight', attrs: { 'data-qv-open': '' } })] };
}

// -------------------------------------------------------------- contrato
function contractNext(contract) {
  if (!['active', 'renewing'].includes(contract.status)) return 'Contrato encerrado, mantido para histórico.';
  const stage = renewalStage(contract);
  if (contract.status === 'renewing' && stage.stage !== 'past_notice') return `Nova concorrência em andamento. Compare antes do aviso prévio (${formatDate(stage.deadline)}).`;
  if (stage.stage === 'window') return `Janela de renovação aberta. Decida até ${formatDate(stage.deadline)} (${relativeDays(stage.deadline)}).`;
  if (stage.stage === 'past_notice') return `O prazo do aviso prévio passou em ${formatDate(stage.deadline)}. Vence ${relativeDays(contract.ends_on)}.`;
  return `Nada a fazer agora. A janela de decisão abre ${relativeDays(stage.opensAt)} (${formatDate(stage.opensAt)}).`;
}
function contractView(ctx, contract) {
  const stage = renewalStage(contract);
  const source = (ctx.data.rfqs || []).find((rfq) => rfq.id === contract.rfq_id);
  const attention = ['window', 'past_notice'].includes(stage.stage);
  const body = [
    el('div', { class: 'qv-hero' }, [
      el('p', { class: 'qv-kicker', text: productLabel(contract.product) }),
      el('p', { class: 'qv-figure', text: contract.provider_name || 'Provedor' }),
      el('div', { class: 'qv-badges' }, [pill(CONTRACT_STATUS[contract.status], { size: 'sm' }),
        ['active', 'renewing'].includes(contract.status) && Number.isFinite(contract.days_to_end) ? el('span', { class: `qv-chip${contract.days_to_end <= 60 ? ' is-urgent' : ''}` }, [icon('calendar', { size: 12 }), el('span', { text: contract.days_to_end >= 0 ? `vence em ${contract.days_to_end} dias` : 'vencido' })]) : null])
    ]),
    el('p', { class: `qv-next${attention ? ' is-attention' : ''}` }, [icon(attention ? 'alert' : 'checkCircle', { size: 16 }), el('span', { text: contractNext(contract) })]),
    facts([
      ['Vigência', `${formatDate(contract.starts_on)} → ${formatDate(contract.ends_on)}`],
      ['Aviso prévio', `${contract.renewal_notice_days} dias · ${formatDate(contract.review_from)}`],
      ['Custo registrado', contract.cost_summary || 'Não informado', contract.cost_summary ? '' : 'missing'],
      contract.main_conditions ? ['Condições', contract.main_conditions] : null,
      source ? ['Processo de origem', source.title] : null
    ])
  ];
  const href = ctx.href(`/finance/contracts.html#contract-${contract.id}`);
  return { title: contract.provider_name || 'Contrato', subtitle: `Contrato · ${productLabel(contract.product, { short: true })}`, body, href,
    footer: [favoriteButton('contract', contract.id, contract.provider_name || 'Contrato'), copyLinkButton(href),
      source ? linkButton('Processo de origem', ctx.href(`/finance/rfq.html?id=${source.id}#decisao`), { size: 'sm', iconName: 'file' }) : null,
      linkButton('Abrir em Contratos', href, { variant: 'primary', size: 'sm', iconName: 'arrowRight', attrs: { 'data-qv-open': '' } })] };
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
  return null;
}

let openDialog = null;
/** Abre a quick view; devolve false quando o item não está disponível (o chamador segue o link). */
export function openQuickView(ctx, type, id) {
  if (ctx.audience !== 'company') return false;
  const entity = resolveEntity(ctx, type, id);
  if (!entity) return false;
  openDialog?.close();
  const view = entity.build();
  if (type !== 'proposal') recordRecent(type, id, entity.title);
  const dialog = drawer({ title: view.title, subtitle: view.subtitle, body: view.body, footer: view.footer.filter(Boolean), className: 'quick-view', onClose: () => { if (openDialog === dialog) openDialog = null; } });
  dialog.dataset.entity = `${type}:${id}`;
  openDialog = dialog;
  return true;
}
