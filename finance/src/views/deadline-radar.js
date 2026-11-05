// Caixa de trabalho com prazos: término e aviso prévio de contratos, prazo de
// resposta de solicitações, tarefas abertas e aprovações pendentes, num só
// lugar, cada item levando ao seu registro de origem.
//
// Fontes: a visão geral (`overview`) que a página já leu, as aprovações
// (`approvals`, a mesma leitura da caixa de aprovações, reaproveitada via
// ctx.loadApprovals) e as entidades (`entities`). Nada é inventado: prazo
// ausente não vira atraso (vai para "Sem prazo registrado"), aviso prévio usa os
// dias registrados no contrato (renewalStage, mesma regra da carteira), quem
// pode decidir uma aprovação vem do servidor (viewer_can_act) e falha de leitura
// é dita, nunca tratada como "nada pendente".

import { el, icon, formatDate, daysUntil, renewalStage, plural, textSpan } from '../core.js';
import { tag, mutedText, button } from '../ui.js';
import { loadEntities, entityName } from './entities.js';

// Limites das leituras (lib/api/domains/finance.mjs).
export const OVERVIEW_CAPS = Object.freeze({ contracts: 200, rfqs: 200, tasks: 100, approvals: 100 });
export const HORIZON_DAYS = 90;
const OPEN_RFQ = new Set(['open', 'collecting']);
const LIVE_CONTRACT = new Set(['active', 'renewing']);
const CLOSED_OBLIGATION = new Set(['compliant', 'waived', 'not_applicable']);

export const BUCKETS = Object.freeze([
  { key: 'overdue', label: 'Vencidos', tone: 'danger', test: (days) => days < 0 },
  { key: 'week', label: 'Próximos 7 dias', tone: 'warning', test: (days) => days >= 0 && days <= 7 },
  { key: 'month', label: '8 a 30 dias', tone: 'info', test: (days) => days > 7 && days <= 30 },
  { key: 'quarter', label: '31 a 90 dias', tone: 'neutral', test: (days) => days > 30 && days <= HORIZON_DAYS }
]);

const KIND_LABEL = { obligation: 'Obrigação', notice: 'Aviso prévio', contract_end: 'Término do contrato', rfq_deadline: 'Prazo de resposta', task: 'Tarefa', approval: 'Aprovação', approval_wait: 'Aprovação' };

/** Data mais próxima de uma aprovação: prazo da etapa ativa ou expiração do pedido. */
function approvalDue(row) {
  const dates = (row.stages || []).filter((stage) => stage.status === 'active' && stage.due_at).map((stage) => String(stage.due_at).slice(0, 10));
  if (row.expires_at) dates.push(String(row.expires_at).slice(0, 10));
  return dates.sort()[0] || null;
}

/**
 * Itens de trabalho. Pura: recebe dados, devolve itens. `date` nulo = sem prazo
 * registrado (exibido à parte, nunca como atraso). Itens com data além do
 * horizonte ficam fora.
 */
export function deadlineItems({ contracts = [], rfqs = [], tasks = [] } = {}, { horizon = HORIZON_DAYS, approvals = [], viewerId = null, obligations = [] } = {}) {
  const items = [];
  const contractsById = new Map(contracts.map((row) => [row.id, row]));
  const rfqsById = new Map(rfqs.map((row) => [row.id, row]));
  const push = (item) => {
    if (!item.date) { items.push({ ...item, days: null }); return; }
    const days = daysUntil(item.date);
    if (days === null || days > horizon) return;
    items.push({ ...item, days });
  };
  for (const contract of contracts) {
    if (!LIVE_CONTRACT.has(contract?.status)) continue;
    const title = contract.title || 'Contrato';
    const href = `/finance/contracts.html?abrir=contrato#contract-${contract.id}`;
    const base = { owner: contract.owner_id || null, provider: contract.provider_name || null, providerIds: contract.provider_id ? [contract.provider_id] : [], entityId: contract.legal_entity_id || null, href, sourceId: contract.id };
    if (!contract.ends_on) { push({ ...base, kind: 'contract_end', date: null, title: `Término não informado: ${title}`, detail: 'Sem data de término o Arandu não acompanha aviso prévio nem renovação' }); continue; }
    const stage = renewalStage(contract);
    const noticeKnown = contract.renewal_notice_days !== null && contract.renewal_notice_days !== undefined && Number(contract.renewal_notice_days) > 0;
    if (noticeKnown && stage.deadline && stage.stage !== 'expired') {
      push({ ...base, kind: 'notice', date: stage.deadline, title: `Decidir renovação: ${title}`, detail: `${contract.renewal_notice_days} dias de aviso registrados no cadastro; confira no documento` });
    }
    push({ ...base, kind: 'contract_end', date: contract.ends_on, title: `Término: ${title}`, detail: noticeKnown ? 'Término contratual' : 'Término contratual · aviso prévio não registrado' });
  }
  for (const rfq of rfqs) {
    if (!OPEN_RFQ.has(rfq?.status) || !rfq.response_deadline) continue;
    const invites = (rfq.invites || []).filter((row) => !['revoked', 'expired'].includes(row.status));
    push({ kind: 'rfq_deadline', date: rfq.response_deadline, title: `Respostas: ${rfq.title || 'Solicitação'}`, detail: invites.length ? plural(invites.length, 'instituição convidada', 'instituições convidadas') : 'Nenhuma instituição convidada',
      owner: rfq.owner_id || null, provider: null, providerIds: invites.map((row) => row.provider_id).filter(Boolean), entityId: rfq.legal_entity_id || null, href: `/finance/rfq.html?id=${rfq.id}`, sourceId: rfq.id });
  }
  for (const task of tasks) {
    if (task?.status !== 'open') continue;
    // Tarefa de contrato herda instituição e entidade do contrato carregado; sem ele, nada é inferido.
    const contract = task.related_type === 'contract' ? contractsById.get(task.related_id) : null;
    push({ kind: 'task', date: task.due_on || null, title: task.title || 'Tarefa', detail: contract ? `Tarefa do contrato ${contract.title || 'sem título'}` : 'Tarefa da equipe',
      owner: task.assignee_id || null, provider: contract?.provider_name || null, providerIds: contract?.provider_id ? [contract.provider_id] : [], entityId: contract?.legal_entity_id || null,
      href: `/finance/tasks.html#task-${task.id}`, sourceId: task.id });
  }
  for (const row of approvals) {
    if (row?.status !== 'pending') continue;
    const rfq = rfqsById.get(row.rfq_id);
    const mine = Boolean(row.viewer_can_act);
    const invites = (rfq?.invites || []).map((invite) => invite.provider_id).filter(Boolean);
    push({ kind: mine ? 'approval' : 'approval_wait', date: approvalDue(row), title: `${mine ? 'Decidir aprovação' : 'Em aprovação'}: ${rfq?.title || 'Solicitação'}`,
      detail: mine ? 'Você está entre os aprovadores da etapa atual' : 'Aguardando a etapa atual; você não é aprovador dela',
      owner: mine ? viewerId : null, ownerLabel: mine ? null : 'Aprovadores da etapa atual', provider: null, providerIds: invites, entityId: rfq?.legal_entity_id || null,
      href: `/finance/rfq.html?id=${row.rfq_id}#aprovacao`, sourceId: row.id });
  }
  // Covenants e obrigações (registro de covenants): período em aberto com prazo.
  // Conforme, waiver vigente ou não aplicável não é trabalho pendente; sem prazo
  // vai para "Sem prazo registrado", nunca para atraso.
  for (const row of obligations) {
    if (!row?.id || CLOSED_OBLIGATION.has(row.status)) continue;
    const contract = row.contract_id ? contractsById.get(row.contract_id) : null;
    const providerId = row.provider_id || contract?.provider_id || null;
    push({ kind: 'obligation', date: row.due_on || null, title: `${row.kind_label || 'Obrigação'}: ${row.title || 'sem título'}`,
      detail: [row.status_label, row.has_data ? 'dados registrados' : 'dados ausentes', contract ? `contrato ${contract.title || contract.provider_name || ''}`.trim() : null].filter(Boolean).join(' · '),
      owner: row.owner_id || null, provider: contract?.provider_name || null, providerIds: providerId ? [providerId] : [], entityId: row.legal_entity_id || contract?.legal_entity_id || null,
      href: `/finance/covenants.html?${new URLSearchParams(row.contract_id ? { contract_id: row.contract_id, contrato: row.contract_id } : {})}`, sourceId: row.id });
  }
  return items.sort((a, b) => (a.days ?? Infinity) - (b.days ?? Infinity) || String(a.title).localeCompare(String(b.title), 'pt-BR'));
}

/** Recortes do servidor atingidos: a caixa pode estar incompleta. */
export function truncatedSources({ contracts = [], rfqs = [], tasks = [] } = {}, approvals = []) {
  return [contracts.length >= OVERVIEW_CAPS.contracts && 'contratos', rfqs.length >= OVERVIEW_CAPS.rfqs && 'solicitações', tasks.length >= OVERVIEW_CAPS.tasks && 'tarefas',
    approvals.length >= OVERVIEW_CAPS.approvals && 'aprovações'].filter(Boolean);
}

export function deadlineRadar(ctx, { onlyMine: initialMine = false } = {}) {
  const data = ctx.data || {};
  const names = new Map((ctx.members || []).map((member) => [member.user_id, member.display_name]));
  const providers = new Map((data.providers || []).map((row) => [row.id, row.name]));
  const viewer = ctx.viewer?.id || null;
  let mine = initialMine && Boolean(viewer);
  // ?provider_id= (Relationship 360° → "Prazos desta instituição") pré-seleciona a instituição.
  let providerFilter = /^[0-9a-f-]{36}$/i.test(new URLSearchParams(location.search).get('provider_id') || '') ? new URLSearchParams(location.search).get('provider_id') : '';
  let entityFilter = '';
  let approvals = [];
  let approvalsState = ctx.audience === 'company' ? 'loading' : 'none';
  let entities = null;
  // Obrigações: só no produto com API (o build de demonstração não as empacota).
  let obligations = [];
  let obligationsState = ctx.audience === 'company' && !__ARANDU_DEMO__ ? 'loading' : 'none';
  let obligationsMore = false;
  let all = deadlineItems(data, { viewerId: viewer });

  const root = el('section', { class: 'cc-section deadline-radar', id: 'deadline-radar', 'aria-labelledby': 'deadline-radar-title' });
  const status = el('p', { class: 'muted small', role: 'status' });
  const notice = el('div');
  const body = el('div', { class: 'stack' });
  const filters = el('div', { class: 'toolbar deadline-filters' });
  const toggle = viewer ? el('div', { class: 'chips', role: 'group', 'aria-label': 'De quem são os prazos' }) : null;

  const select = (label, options, onChange) => {
    const control = el('select', { 'aria-label': label }, [el('option', { value: '', text: `${label}: todas` }), ...options.map(([value, text]) => el('option', { value, text }))]);
    control.value = label === 'Instituição' ? providerFilter : entityFilter;
    control.addEventListener('change', () => { onChange(control.value); draw(); });
    return el('label', { class: 'field field-inline' }, [el('span', { class: 'field-label', text: label }), control]);
  };
  const buildFilters = () => {
    const providerIds = [...new Set([...all.flatMap((item) => item.providerIds || []), providerFilter].filter(Boolean))].filter((id) => providers.has(id));
    if (providerFilter && !providers.has(providerFilter)) providerFilter = '';
    const entityIds = [...new Set(all.map((item) => item.entityId).filter(Boolean))];
    filters.replaceChildren(...[
      providerIds.length > 1 || providerFilter ? select('Instituição', providerIds.map((id) => [id, providers.get(id)]).sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')), (value) => { providerFilter = value; }) : null,
      entities && entityIds.length > 1 ? select('Entidade', entityIds.map((id) => [id, entityName(entities, id)]), (value) => { entityFilter = value; }) : null
    ].filter(Boolean));
    filters.hidden = !filters.childElementCount;
  };
  const visible = () => all.filter((item) => (!mine || item.owner === viewer)
    && (!providerFilter || (item.providerIds || []).includes(providerFilter))
    && (!entityFilter || item.entityId === entityFilter));
  const row = (item) => el('li', { class: 'milestone-row deadline-item', dataset: { kind: item.kind } }, [
    el('div', { class: 'milestone-main' }, [
      el('a', { href: ctx.href(item.href), text: item.title }),
      mutedText([KIND_LABEL[item.kind],
        item.date ? formatDate(item.date) : null,
        item.days === null ? null : item.days < 0 ? `há ${-item.days} ${-item.days === 1 ? 'dia' : 'dias'}` : item.days === 0 ? 'hoje' : `em ${item.days} ${item.days === 1 ? 'dia' : 'dias'}`,
        item.provider, item.owner ? `Responsável: ${names.get(item.owner) || 'membro da equipe'}${item.owner === viewer ? ' (você)' : ''}` : item.ownerLabel || 'Responsável não definido', item.detail].filter(Boolean).join(' · '), 'span')
    ])
  ]);
  const draw = () => {
    const items = visible();
    toggle?.querySelectorAll('button').forEach((node) => node.setAttribute('aria-pressed', String((node.dataset.scope === 'mine') === mine)));
    const dated = items.filter((item) => item.days !== null);
    const undated = items.filter((item) => item.days === null);
    const groups = BUCKETS.map((bucket) => ({ bucket, rows: dated.filter((item) => bucket.test(item.days)) })).filter((group) => group.rows.length);
    const sections = groups.map(({ bucket, rows }) => el('section', { class: 'deadline-group', dataset: { bucket: bucket.key } }, [
      el('h4', { class: 'deadline-group-title' }, [tag(bucket.label, bucket.tone), textSpan(` ${plural(rows.length, 'prazo', 'prazos')}`)]),
      el('ul', { class: 'milestone-list', role: 'list' }, rows.map(row))
    ]));
    if (undated.length) sections.push(el('details', { class: 'deadline-group', dataset: { bucket: 'undated' } }, [
      el('summary', {}, [tag('Sem prazo registrado', 'neutral'), textSpan(` ${plural(undated.length, 'item', 'itens')} · ausência de data não é atraso; registre o prazo na origem para acompanhar`)]),
      el('ul', { class: 'milestone-list', role: 'list' }, undated.map(row))
    ]));
    const filtered = mine || providerFilter || entityFilter;
    body.replaceChildren(...(sections.length ? sections : [el('p', { class: 'muted', text: filtered ? 'Nenhum item neste recorte nos próximos 90 dias.' : 'Nenhum prazo registrado nos próximos 90 dias. Contratos sem término e tarefas sem prazo aparecem em "Sem prazo registrado".' })]));
    const cut = truncatedSources(data, approvals);
    status.textContent = `${plural(dated.length, 'prazo', 'prazos')} até ${HORIZON_DAYS} dias${undated.length ? ` e ${plural(undated.length, 'item', 'itens')} sem prazo` : ''}${mine ? ' atribuídos a você' : ''}${filtered && !mine ? ' neste recorte' : ''}.${cut.length ? ` Recorte: a leitura de ${cut.join(', ')} atingiu o limite; pode haver itens fora desta lista.` : ''}`;
    notice.replaceChildren(...(approvalsState === 'loading' ? [mutedText('Carregando aprovações pendentes…')]
      : approvalsState === 'error' ? [el('p', { class: 'callout callout-warning compact', role: 'alert' }, [icon('alert', { size: 14 }),
        textSpan('As aprovações não carregaram: esta lista não mostra aprovações pendentes. Isso não significa que não haja nenhuma.'),
        button('Tentar de novo', { size: 'sm', onClick: () => { ctx.approvalsPromise = null; loadSources(); } })])] : []),
      ...(obligationsState === 'error' ? [el('p', { class: 'callout callout-warning compact', role: 'alert', 'data-source': 'obligations' }, [icon('alert', { size: 14 }),
        textSpan('As obrigações e covenants não carregaram: esta lista não mostra seus prazos. Isso não significa que não haja nenhum.'),
        button('Tentar de novo', { size: 'sm', onClick: () => loadSources() })])]
        : obligationsState === 'forbidden' ? [mutedText('Seu acesso não inclui o registro de covenants; prazos de obrigações não aparecem aqui.')]
          : obligationsState === 'unavailable' ? [mutedText('Registro de covenants indisponível neste ambiente; prazos de obrigações não aparecem aqui.')]
            : obligationsMore ? [mutedText('Obrigações: mostrando os primeiros períodos por prazo. Veja todos no registro de covenants.')] : []));
  };
  const loadSources = () => {
    approvalsState = ctx.audience === 'company' ? 'loading' : 'none';
    draw();
    const wantObligations = ctx.audience === 'company' && !__ARANDU_DEMO__;
    if (wantObligations) obligationsState = 'loading';
    const obligationRead = wantObligations ? ctx.api(`covenants?organization_id=${encodeURIComponent(ctx.organization.id)}`)
      .then((page) => { obligations = page.rows || []; obligationsMore = Boolean(page.next); obligationsState = 'ready'; })
      .catch((error) => { obligations = []; obligationsState = error.status === 503 || error.status === 404 ? 'unavailable' : error.status === 403 ? 'forbidden' : 'error'; }) : Promise.resolve();
    Promise.all([ctx.audience === 'company' ? ctx.loadApprovals() : Promise.resolve([]), loadEntities(ctx), obligationRead]).then(([rows, loaded]) => {
      approvals = ctx.approvalsError ? [] : rows || [];
      approvalsState = ctx.audience !== 'company' ? 'none' : ctx.approvalsError ? 'error' : 'ready';
      entities = loaded?.available ? loaded : null;
      all = deadlineItems(data, { viewerId: viewer, approvals, obligations });
      buildFilters();
      draw();
    });
  };
  if (toggle) for (const [scope, label] of [['all', 'Toda a equipe'], ['mine', 'Atribuídos a mim']]) {
    toggle.append(el('button', { type: 'button', class: 'chip', dataset: { scope }, 'aria-pressed': 'false', text: label, onclick: () => { mine = scope === 'mine'; draw(); } }));
  }
  root.append(el('div', { class: 'cc-head' }, [el('h3', { id: 'deadline-radar-title' }, [icon('calendar', { size: 16 }), textSpan(' Radar de prazos')]), toggle]),
    mutedText('Término e aviso prévio de contratos vigentes, prazos de covenants e obrigações em aberto, prazos de resposta de solicitações em coleta, tarefas abertas e aprovações pendentes. Cada item abre o registro de origem.'),
    filters, notice, status, body);
  buildFilters();
  loadSources();
  return root;
}
