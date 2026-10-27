// Central de Relacionamentos 2.0: fila de trabalho por instituição.
// Deriva só dos registros já carregados (contratos, solicitações, tarefas);
// nenhum armazenamento, cálculo financeiro ou ranking novo. Cada item diz a
// situação, quem pode agir, de onde vem a informação e para onde seguir.

import { el, icon, formatDate, relativeDays, plural, productLabel, renewalStage, RFQ_STATUS } from '../core.js';
import { button, emptyState } from '../ui.js';
import { CONTRACT_CATEGORIES } from '../../../lib/finance/contract-terms.mjs';
import { TASK_EDITORS } from './shared.js';
import { entityName } from './entities.js';

// Limites do resumo (`overview`): atingir um deles significa que pode haver mais registros.
export const OVERVIEW_LIMITS = Object.freeze({ contracts: 200, tasks: 100, rfqs: 200, providers: 200 });

const LIVE_RFQ = ['open', 'collecting', 'comparing'];
const LIVE_CONTRACT = ['active', 'renewing'];
export const SITUATIONS = Object.freeze({
  expired: { label: 'Vigência terminou', tone: 'danger', rank: 0 },
  past_notice: { label: 'Aviso prévio registrado já passou', tone: 'danger', rank: 1 },
  task_overdue: { label: 'Tarefa vencida', tone: 'danger', rank: 1 },
  window: { label: 'Janela de renovação aberta', tone: 'warning', rank: 2 },
  renewing: { label: 'Renovação em andamento', tone: 'info', rank: 3 },
  negotiation: { label: 'Negociação em andamento', tone: 'info', rank: 3 },
  task: { label: 'Tarefa aberta', tone: 'neutral', rank: 4 },
  no_end: { label: 'Término não informado', tone: 'warning', rank: 5 }
});
const categoryLabel = (key) => CONTRACT_CATEGORIES[key] || (key ? productLabel(key) : 'Categoria não informada');

/** Itens de trabalho, do mais urgente ao menos; ausência nunca vira "em dia". */
export function relationshipWorkItems({ contracts = [], rfqs = [], tasks = [], members = [], viewerId = null }) {
  const items = [];
  const contractsById = new Map(contracts.map((row) => [row.id, row]));
  // Pessoa fora da lista atual de membros não vira "Membro": a ausência é dita.
  const owner = (id) => {
    if (!id) return null;
    const member = members.find((row) => row.user_id === id);
    const name = member ? member.display_name || 'Membro da equipe' : 'pessoa sem acesso atual à organização';
    return id === viewerId ? `${name} (você)` : name;
  };
  for (const contract of contracts) {
    if (!LIVE_CONTRACT.includes(contract.status) || !contract.provider_id) continue;
    const name = contract.title || categoryLabel(contract.product);
    const base = { providerId: contract.provider_id, providerName: contract.provider_name, entityId: contract.legal_entity_id || null, category: contract.product || null,
      who: owner(contract.owner_id), role: 'contrato', actor: 'manage', href: `/finance/contracts.html?abrir=contrato#contract-${contract.id}`, cta: 'Abrir contrato',
      source: `Contrato ${contract.origin === 'imported' ? 'registrado pela empresa (carteira existente)' : 'registrado a partir de decisão no Arandu'}${contract.current_version ? ` · termos v${contract.current_version}` : ' · termos não estruturados'}` };
    if (!contract.ends_on) { items.push({ ...base, id: `c-${contract.id}`, situation: 'no_end', title: name, detail: 'Sem data de término o Arandu não acompanha renovação nem aviso prévio.', due: null }); continue; }
    const stage = renewalStage(contract);
    const notice = `aviso prévio de ${contract.renewal_notice_days} dias registrado no cadastro (confira no documento)`;
    const situation = stage.stage === 'expired' ? 'expired' : stage.stage === 'past_notice' ? 'past_notice' : contract.status === 'renewing' ? 'renewing' : stage.stage === 'window' ? 'window' : null;
    if (!situation) continue;
    const detail = {
      expired: `Término em ${formatDate(contract.ends_on)}; ainda registrado como vigente. Atualize o status ou registre a renovação.`,
      past_notice: `Marco de aviso em ${formatDate(stage.deadline)} (${notice}). Término em ${formatDate(contract.ends_on)}.`,
      renewing: `Contrato em renovação; término em ${formatDate(contract.ends_on)}. Compare as propostas antes do marco de aviso (${formatDate(stage.deadline)}).`,
      window: `Decidir até ${formatDate(stage.deadline)} (${relativeDays(stage.deadline)}), ${notice}. Término em ${formatDate(contract.ends_on)}.`
    }[situation];
    items.push({ ...base, id: `c-${contract.id}`, situation, title: name, detail, due: situation === 'expired' ? contract.ends_on : stage.deadline,
      cta: ['window', 'past_notice'].includes(situation) ? 'Decidir renovação no contrato' : base.cta });
  }
  for (const rfq of rfqs) {
    if (!LIVE_RFQ.includes(rfq.status)) continue;
    // Uma negociação, um item: as instituições convidadas vão juntas (o filtro por
    // instituição continua casando cada uma). Repetir por convite enchia a fila.
    const invited = (rfq.invites || []).filter((row) => !['revoked', 'expired'].includes(row.status));
    const names = invited.map((row) => row.provider_name).filter(Boolean);
    const collecting = ['open', 'collecting'].includes(rfq.status);
    const accepted = invited.filter((row) => row.status === 'accepted').length;
    items.push({ id: `r-${rfq.id}`, situation: 'negotiation', providerId: invited[0]?.provider_id || null, providerIds: invited.map((row) => row.provider_id),
      providerName: names.length ? names.join(', ') : null, entityId: rfq.legal_entity_id || null, category: rfq.product || null, title: rfq.title || 'Solicitação',
      detail: `${RFQ_STATUS[rfq.status]?.label || 'Em andamento'}${!rfq.response_deadline ? ' · sem prazo de resposta' : collecting ? ` · prazo de resposta ${formatDate(rfq.response_deadline)}` : ` · coleta encerrada (prazo era ${formatDate(rfq.response_deadline)})`}${invited.length ? '' : ' · nenhuma instituição convidada ainda'}.`,
      due: collecting ? rfq.response_deadline || null : null, who: rfq.owner_id ? owner(rfq.owner_id) : rfq.owner_name || null, role: 'negociação', actor: 'manage', href: `/finance/rfq.html?id=${rfq.id}`, cta: 'Abrir negociação',
      source: `Solicitação revisão ${rfq.revision || 1}${invited.length ? ` · ${invited.length} ${invited.length === 1 ? 'instituição convidada' : 'instituições convidadas'}, ${accepted} com convite aceito` : ''}` });
  }
  for (const task of tasks) {
    if (task.related_type !== 'contract') continue;
    const contract = contractsById.get(task.related_id);
    // Tarefa de contrato fora do recorte carregado: aparece (sem inventar instituição) em vez de sumir.
    if (contract && !contract.provider_id) continue;
    const overdue = task.due_on && task.due_on < new Date().toISOString().slice(0, 10);
    items.push({ id: `t-${task.id}`, situation: overdue ? 'task_overdue' : 'task', providerId: contract?.provider_id || null, providerName: contract?.provider_name || null, entityId: contract?.legal_entity_id ?? null, entityUnknown: !contract,
      category: contract?.product || null, title: task.title, detail: task.due_on ? `Prazo ${formatDate(task.due_on)} (${relativeDays(task.due_on)}).` : 'Sem prazo definido (não é atraso).',
      due: task.due_on || null, who: owner(task.assignee_id), role: 'tarefa', actor: 'task', href: `/finance/tasks.html#task-${task.id}`, cta: 'Abrir tarefa',
      contractHref: `/finance/contracts.html?abrir=contrato#contract-${task.related_id}`,
      source: contract ? `Tarefa ligada ao contrato ${contract.title || categoryLabel(contract.product)}` : 'Tarefa ligada a um contrato fora dos contratos carregados nesta tela' });
  }
  const due = (item) => item.due || '9999-12-31';
  return items.sort((a, b) => SITUATIONS[a.situation].rank - SITUATIONS[b.situation].rank || due(a).localeCompare(due(b)));
}

/** Fila de trabalho com filtros por instituição, entidade, condição e situação. */
export function relationshipWorkQueue(ctx, { entities, onOpenProvider = null, importButton = null }) {
  const contracts = ctx.data.contracts || [];
  const items = relationshipWorkItems({ contracts, rfqs: ctx.data.rfqs || [], tasks: ctx.data.tasks || [], members: ctx.members || [], viewerId: ctx.viewer?.id || null });
  const capped = Object.entries(OVERVIEW_LIMITS).filter(([key, limit]) => (ctx.data[key] || []).length >= limit).map(([key]) => ({ contracts: 'contratos', tasks: 'tarefas abertas', rfqs: 'solicitações', providers: 'instituições' })[key]);
  const providers = ctx.data.providers || [];
  const withContract = new Set(contracts.filter((row) => LIVE_CONTRACT.includes(row.status)).map((row) => row.provider_id));
  const select = (label, options) => {
    const node = el('select', { 'aria-label': label }, [el('option', { value: '', text: `${label}: todas` }), ...options.map(([value, text]) => el('option', { value, text }))]);
    return node;
  };
  const byProvider = select('Instituição', providers.map((row) => [row.id, row.name]));
  const byEntity = entities?.rows?.length ? select('Entidade', [['__group__', 'Grupo (sem entidade)'], ...entities.rows.map((row) => [row.id, entityName(entities, row.id)])]) : null;
  const categories = [...new Set(items.map((item) => item.category).filter(Boolean))];
  const byCategory = categories.length > 1 ? select('Condição', categories.map((key) => [key, categoryLabel(key)])) : null;
  const bySituation = select('Situação', Object.entries(SITUATIONS).filter(([key]) => items.some((item) => item.situation === key)).map(([key, meta]) => [key, meta.label]));
  const status = el('p', { class: 'muted small', role: 'status', 'aria-live': 'polite' });
  const list = el('ol', { class: 'rel-queue', 'aria-label': 'Fila de próximas ações' });
  const more = button('Mostrar todos', { size: 'sm', variant: 'ghost' });
  let expanded = false;
  const LIMIT = 8;
  const draw = () => {
    const visible = items.filter((item) => (!byProvider.value || (item.providerIds || [item.providerId]).includes(byProvider.value))
      && (!byEntity?.value || (item.entityUnknown ? false : byEntity.value === '__group__' ? !item.entityId : item.entityId === byEntity.value || entities.byId?.get(item.entityId)?.parent_id === byEntity.value))
      && (!byCategory?.value || item.category === byCategory.value) && (!bySituation.value || item.situation === bySituation.value));
    const urgent = visible.filter((item) => SITUATIONS[item.situation].tone === 'danger').length;
    const scope = capped.length ? ' nos registros carregados' : '';
    status.textContent = visible.length ? `${plural(visible.length, 'item pede atenção', 'itens pedem atenção')}${scope}${urgent ? `, ${urgent} com prazo vencido` : ''}. Ordem: vencido, prazo próximo, em andamento, informação ausente.` : '';
    list.replaceChildren(...visible.slice(0, expanded ? visible.length : LIMIT).map((item) => queueItem(ctx, item, onOpenProvider, entities)));
    if (!visible.length) list.replaceChildren(el('li', { class: 'rel-queue-empty' }, emptyState({ compact: true, iconName: 'checkCircle', title: 'Nada pendente neste filtro',
      text: capped.length ? 'Nada pendente entre os registros carregados, mas o resumo atingiu o limite de leitura: pode haver pendências fora dele. Abra Contratos ou Tarefas para consultar a lista completa.' : 'Nenhum contrato vencido, em janela de renovação, sem término, negociação ou tarefa aberta nos registros carregados. Isso não cobre contratos que ainda não foram registrados.' })));
    more.hidden = expanded || visible.length <= LIMIT;
  };
  more.addEventListener('click', () => { expanded = true; draw(); });
  for (const control of [byProvider, byEntity, byCategory, bySituation].filter(Boolean)) control.addEventListener('change', () => { expanded = false; draw(); });
  draw();
  const missing = providers.filter((row) => !withContract.has(row.id));
  return el('section', { class: 'card rel-center', id: 'relationship-center', 'aria-labelledby': 'rel-center-title' }, [
    el('div', { class: 'card-head' }, el('div', { class: 'card-head-text' }, [el('h2', { class: 'card-title', id: 'rel-center-title', text: 'O que pede ação nos relacionamentos' }),
      el('p', { class: 'card-subtitle', text: 'Contratos, renovações, negociações e tarefas de cada instituição, com quem pode agir e a origem da informação.' })])),
    el('div', { class: 'card-body stack' }, [
      el('div', { class: 'rel-filters' }, [byProvider, byEntity, byCategory, bySituation].filter(Boolean)),
      capped.length ? el('p', { class: 'callout callout-info compact', role: 'note', id: 'rel-center-scope' }, [icon('info', { size: 14 }), el('span', { text: `Recorte: o resumo lê até ${OVERVIEW_LIMITS.contracts} contratos, ${OVERVIEW_LIMITS.tasks} tarefas abertas e ${OVERVIEW_LIMITS.rfqs} solicitações, e chegou ao limite em ${capped.join(', ')}. A fila mostra só o que foi carregado; as listas de Contratos e Tarefas consultam o restante.` })]) : null,
      status, list, more,
      missing.length ? el('details', { class: 'rel-missing' }, [el('summary', { text: `${plural(missing.length, 'instituição sem contrato vigente registrado', 'instituições sem contrato vigente registrado')}` }),
        el('p', { class: 'muted small', text: 'Comece pelo que a empresa já tem: registre o contrato existente para acompanhar condições, prazo e renovação, mesmo que a instituição não use o Arandu.' }),
        el('ul', { class: 'plain-list' }, missing.map((row) => el('li', { class: 'rel-missing-row' }, [el('span', { text: row.name }), importButton ? importButton(row.id) : null].filter(Boolean))))]) : null
    ].filter(Boolean))
  ]);
}

const ACTORS = { manage: 'Pode agir: administração e gestão financeira', task: 'Pode agir: administração, gestão financeira e análise' };
function queueItem(ctx, item, onOpenProvider, entities) {
  const meta = SITUATIONS[item.situation];
  const canAct = item.actor === 'task' ? TASK_EDITORS.includes(ctx.viewer?.role) : ctx.can('create_rfq');
  const entityText = !entities?.rows?.length ? null : item.entityUnknown ? 'Entidade não carregada' : entityName(entities, item.entityId);
  // Negociação com várias instituições não abre um relacionamento só.
  const provider = item.providerIds && item.providerIds.length > 1 ? null : (ctx.data.providers || []).find((row) => row.id === item.providerId);
  return el('li', { class: `rel-item tone-${meta.tone}`, dataset: { situation: item.situation } }, [
    el('div', { class: 'rel-item-main' }, [
      el('p', { class: 'rel-item-kicker' }, [el('span', { class: `pill pill-${meta.tone} pill-sm` }, [el('span', { class: 'pill-dot', 'aria-hidden': 'true' }), el('span', { text: meta.label })]),
        el('span', { class: 'muted small', text: item.providerName || provider?.name || (item.entityUnknown ? 'Instituição do contrato não carregada' : 'Sem instituição convidada') }),
        entityText ? el('span', { class: 'muted small rel-item-entity', text: `· ${entityText}` }) : null]),
      el('h3', { class: 'rel-item-title', text: item.title }),
      el('p', { class: 'small', text: item.detail }),
      el('p', { class: 'muted small rel-item-meta' }, [icon('users', { size: 12 }), ` ${item.who ? `Responsável pela ${item.role === 'contrato' ? 'relação contratual' : item.role}: ${item.who}` : item.role === 'tarefa' ? 'Tarefa sem responsável' : 'Responsável não informado no registro'}`]),
      el('p', { class: 'muted small rel-item-meta' }, [icon('lock', { size: 12 }), ` ${canAct ? 'Você pode agir neste item.' : `${ACTORS[item.actor]}; seu papel acompanha.`}`]),
      el('p', { class: 'muted small rel-item-meta' }, [icon('file', { size: 12 }), ` Origem: ${item.source}`])
    ]),
    el('div', { class: 'rel-item-actions' }, [
      el('a', { class: 'btn btn-secondary btn-sm', href: ctx.href(item.href) }, [el('span', { class: 'btn-label', text: item.cta }), icon('arrowRight', { size: 14 })]),
      item.contractHref ? el('a', { class: 'btn btn-ghost btn-sm', href: ctx.href(item.contractHref), text: 'Contrato' }) : null,
      provider && onOpenProvider ? button('Relacionamento', { size: 'sm', variant: 'ghost', attrs: { 'aria-label': `Relacionamento com ${provider.name}` }, onClick: () => onOpenProvider(provider) }) : null
    ].filter(Boolean))
  ]);
}
