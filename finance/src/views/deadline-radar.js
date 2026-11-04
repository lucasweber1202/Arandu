// Radar de prazos: vencimentos contratuais, prazo de aviso prévio, prazo de
// resposta de solicitações e tarefas, num só lugar, cada item levando ao seu
// registro de origem.
//
// Fonte: os dados que a visão geral (`overview`) já devolve. Nada é calculado no
// servidor por esta tela e nada é inventado: prazo ausente não vira item, aviso
// prévio usa os dias registrados no contrato (renewalStage, mesma regra da
// carteira) e o recorte do servidor é anunciado quando atingido.

import { el, icon, formatDate, daysUntil, renewalStage, plural, textSpan } from '../core.js';
import { tag, mutedText } from '../ui.js';

// Limites da leitura da visão geral (lib/api/domains/finance.mjs).
export const OVERVIEW_CAPS = Object.freeze({ contracts: 200, rfqs: 200, tasks: 100 });
export const HORIZON_DAYS = 90;
const OPEN_RFQ = new Set(['open', 'collecting']);

export const BUCKETS = Object.freeze([
  { key: 'overdue', label: 'Vencidos', tone: 'danger', test: (days) => days < 0 },
  { key: 'week', label: 'Próximos 7 dias', tone: 'warning', test: (days) => days >= 0 && days <= 7 },
  { key: 'month', label: '8 a 30 dias', tone: 'info', test: (days) => days > 7 && days <= 30 },
  { key: 'quarter', label: '31 a 90 dias', tone: 'neutral', test: (days) => days > 30 && days <= HORIZON_DAYS }
]);

const KIND_LABEL = { notice: 'Aviso prévio', contract_end: 'Término do contrato', rfq_deadline: 'Prazo de resposta', task: 'Tarefa' };

/**
 * Itens do radar a partir da visão geral. Pura: recebe dados, devolve itens.
 * Contrato: prazo de aviso prévio (quando os dias de aviso estão registrados e
 * o prazo ainda não passou do término) e término. Solicitação em coleta: prazo
 * de resposta. Tarefa aberta: prazo. Sem data, sem item.
 */
export function deadlineItems({ contracts = [], rfqs = [], tasks = [] } = {}, { horizon = HORIZON_DAYS } = {}) {
  const items = [];
  const push = (item) => {
    const days = daysUntil(item.date);
    if (days === null || days > horizon) return;
    items.push({ ...item, days });
  };
  for (const contract of contracts) {
    if (!['active', 'renewing'].includes(contract?.status) || !contract.ends_on) continue;
    const title = contract.title || 'Contrato';
    const href = `/finance/contracts.html?abrir=contrato#contract-${contract.id}`;
    const base = { owner: contract.owner_id || null, provider: contract.provider_name || null, href, sourceId: contract.id };
    const stage = renewalStage(contract);
    const noticeKnown = contract.renewal_notice_days !== null && contract.renewal_notice_days !== undefined && Number(contract.renewal_notice_days) > 0;
    if (noticeKnown && stage.deadline && stage.stage !== 'expired') {
      push({ ...base, kind: 'notice', date: stage.deadline, title: `Decidir renovação: ${title}`, detail: `${contract.renewal_notice_days} dias de aviso registrados no cadastro; confira no documento` });
    }
    push({ ...base, kind: 'contract_end', date: contract.ends_on, title: `Término: ${title}`, detail: noticeKnown ? 'Término contratual' : 'Término contratual · aviso prévio não registrado' });
  }
  for (const rfq of rfqs) {
    if (!OPEN_RFQ.has(rfq?.status) || !rfq.response_deadline) continue;
    const invites = (rfq.invites || []).length;
    push({ kind: 'rfq_deadline', date: rfq.response_deadline, title: `Respostas: ${rfq.title || 'Solicitação'}`, detail: invites ? plural(invites, 'instituição convidada', 'instituições convidadas') : 'Nenhuma instituição convidada', owner: rfq.owner_id || null, provider: null, href: `/finance/rfq.html?id=${rfq.id}`, sourceId: rfq.id });
  }
  for (const task of tasks) {
    if (task?.status !== 'open' || !task.due_on) continue;
    push({ kind: 'task', date: task.due_on, title: task.title || 'Tarefa', detail: 'Tarefa da equipe', owner: task.assignee_id || null, provider: null, href: `/finance/tasks.html#task-${task.id}`, sourceId: task.id, inPage: true });
  }
  return items.sort((a, b) => a.days - b.days || String(a.title).localeCompare(String(b.title), 'pt-BR'));
}

/** Recortes do servidor atingidos: o radar pode estar incompleto. */
export function truncatedSources({ contracts = [], rfqs = [], tasks = [] } = {}) {
  return [contracts.length >= OVERVIEW_CAPS.contracts && 'contratos', rfqs.length >= OVERVIEW_CAPS.rfqs && 'solicitações', tasks.length >= OVERVIEW_CAPS.tasks && 'tarefas'].filter(Boolean);
}

export function deadlineRadar(ctx, { onlyMine: initialMine = false } = {}) {
  const data = ctx.data || {};
  const all = deadlineItems(data);
  const names = new Map((ctx.members || []).map((member) => [member.user_id, member.display_name]));
  const viewer = ctx.viewer?.id || null;
  let mine = initialMine && Boolean(viewer);
  const root = el('section', { class: 'cc-section deadline-radar', id: 'deadline-radar', 'aria-labelledby': 'deadline-radar-title' });
  const status = el('p', { class: 'muted small', role: 'status' });
  const body = el('div', { class: 'stack' });
  const toggle = viewer ? el('div', { class: 'chips', role: 'group', 'aria-label': 'De quem são os prazos' }) : null;
  const draw = () => {
    const items = mine ? all.filter((item) => item.owner === viewer) : all;
    toggle?.querySelectorAll('button').forEach((node) => node.setAttribute('aria-pressed', String((node.dataset.scope === 'mine') === mine)));
    const groups = BUCKETS.map((bucket) => ({ bucket, rows: items.filter((item) => bucket.test(item.days)) })).filter((group) => group.rows.length);
    body.replaceChildren(...(groups.length ? groups.map(({ bucket, rows }) => el('section', { class: 'deadline-group', dataset: { bucket: bucket.key } }, [
      el('h4', { class: 'deadline-group-title' }, [tag(bucket.label, bucket.tone), textSpan(` ${plural(rows.length, 'prazo', 'prazos')}`)]),
      el('ul', { class: 'milestone-list', role: 'list' }, rows.map((item) => el('li', { class: 'milestone-row deadline-item', dataset: { kind: item.kind } }, [
        el('div', { class: 'milestone-main' }, [
          el('a', { href: ctx.href(item.href), text: item.title }),
          mutedText([KIND_LABEL[item.kind], formatDate(item.date), item.days < 0 ? `há ${-item.days} ${-item.days === 1 ? 'dia' : 'dias'}` : item.days === 0 ? 'hoje' : `em ${item.days} ${item.days === 1 ? 'dia' : 'dias'}`,
            item.provider, item.owner ? `Responsável: ${names.get(item.owner) || 'membro da equipe'}` : 'Responsável não definido', item.detail].filter(Boolean).join(' · '), 'span')
        ])
      ])))
    ])) : [el('p', { class: 'muted', text: mine ? 'Nenhum prazo atribuído a você nos próximos 90 dias.' : 'Nenhum prazo registrado nos próximos 90 dias. Contratos sem término, tarefas sem prazo e solicitações sem data de resposta não aparecem aqui.' })]));
    const cut = truncatedSources(data);
    status.textContent = `${plural(items.length, 'prazo', 'prazos')} até ${HORIZON_DAYS} dias${mine ? ' atribuídos a você' : ''}.${cut.length ? ` Recorte: a leitura de ${cut.join(', ')} atingiu o limite; pode haver prazos fora desta lista.` : ''}`;
  };
  if (toggle) for (const [scope, label] of [['all', 'Toda a equipe'], ['mine', 'Atribuídos a mim']]) {
    toggle.append(el('button', { type: 'button', class: 'chip', dataset: { scope }, 'aria-pressed': 'false', text: label, onclick: () => { mine = scope === 'mine'; draw(); } }));
  }
  root.append(el('div', { class: 'cc-head' }, [el('h3', { id: 'deadline-radar-title' }, [icon('calendar', { size: 16 }), textSpan(' Radar de prazos')]), toggle]),
    mutedText('Término e aviso prévio de contratos vigentes, prazos de resposta de solicitações em coleta e tarefas abertas. Cada item abre o registro de origem.'),
    status, body);
  draw();
  return root;
}
