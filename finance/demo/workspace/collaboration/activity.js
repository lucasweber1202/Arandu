// Linha do tempo universal de um objeto.
//
//   Marina criou a solicitação · Atlas Bank aceitou o convite · Camila enviou a
//   proposta v2 · Marina pediu aprovação · Ricardo abriu a decisão · Ricardo aprovou
//
// Junta três fontes, sem duplicar nenhuma: o histórico do motor (o que o
// produto registra), os eventos da camada (barramento: abrir decisão,
// integrações, comentários de aprovação…) e os comentários locais. Cada item:
// pessoa · ação · momento · objeto · detalhe · origem.

import { el, timeAgo, formatDateTime } from '../../../src/core.js';
import { eventPhrase } from '../../../src/views/shared.js';
import { auditLog, ORIGINS, on } from '../platform/bus.js';

const FILTERS = [['all', 'Tudo'], ['changes', 'Alterações'], ['proposals', 'Propostas'], ['approvals', 'Aprovações'], ['comments', 'Comentários']];
function categoryOf(type) {
  if (/comment|mention/.test(type)) return 'comments';
  if (/proposal|invite|provider_invited/.test(type)) return 'proposals';
  if (/approval|decision|contract/.test(type)) return 'approvals';
  return 'changes';
}
const BUS_PHRASES = {
  'approval.opened': 'abriu a decisão', 'approval.approved': 'aprovou', 'approval.rejected': 'rejeitou', 'approval.changes_requested': 'pediu alterações',
  'comment.created': 'comentou', 'comment.resolved': 'atualizou um comentário', 'mention.created': 'mencionou alguém', 'rfq.updated': 'editou a solicitação',
  'sync.conflict_resolved': 'resolveu um conflito de edição', 'contract.created': 'registrou o contrato', 'integration.connected': 'conectou uma integração',
  'erp.imported': 'importou dados do ERP', 'financial_profile.updated': 'atualizou o perfil financeiro'
};

/** Itens normalizados (testáveis): { at, who, action, category, origin, detail, source }. */
export function mergeActivity({ engineRows = [], busRows = [] }) {
  const items = [
    ...engineRows.map((row) => ({ kind: String(row.event_type || '').replace('_', '.'), at: row.happened_at, who: row.actor_name || 'Arandu (automático)', action: eventPhrase(row.event_type), category: categoryOf(row.event_type), origin: 'web',
      detail: [row.metadata?.provider, row.metadata?.version ? `v${row.metadata.version}` : null, row.metadata?.revision ? `revisão ${row.metadata.revision}` : null].filter(Boolean).join(' · '), source: 'motor' })),
    ...busRows.filter((event) => BUS_PHRASES[event.type]).map((event) => ({ kind: event.type, at: event.at, who: event.actor?.name || 'Arandu (automático)', action: BUS_PHRASES[event.type], category: categoryOf(event.type),
      origin: event.origin || 'web', detail: event.detail?.excerpt || event.detail?.comment || '', source: 'camada' }))
  ];
  // O motor já registra aprovar/rejeitar: o evento da camada com o mesmo verbo no mesmo minuto não se repete.
  const seen = new Set();
  return items.sort((a, b) => String(b.at).localeCompare(String(a.at))).filter((item) => {
    const key = `${item.who}|${item.kind}|${String(item.at).slice(0, 16)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function activityStream(ctx, { rfq, extraIds = [] }) {
  const root = el('section', { class: 'astream', 'aria-label': `Atividade: ${rfq.title}` });
  const bar = el('div', { class: 'seg astream-filter', role: 'group', 'aria-label': 'Filtrar atividade' });
  const list = el('ol', { class: 'astream-list' });
  let filter = 'all';
  let engineRows = [];
  const ids = new Set([rfq.id, ...extraIds, ...(rfq.proposals || []).map((proposal) => proposal.id)]);
  const draw = () => {
    const busRows = auditLog({ limit: 300 }).filter((event) => ids.has(event.object?.id) || ids.has(event.object?.rfq_id));
    const items = mergeActivity({ engineRows, busRows }).filter((item) => filter === 'all' || item.category === filter);
    list.replaceChildren(...(items.length ? items.slice(0, 40).map((item) => el('li', { class: `astream-item cat-${item.category}` }, [
      el('span', { class: 'astream-dot', 'aria-hidden': 'true' }),
      el('p', { class: 'astream-text' }, [el('strong', { text: item.who }), ` ${item.action}`, item.detail ? el('span', { class: 'astream-detail', text: ` · ${item.detail}` }) : null]),
      el('p', { class: 'astream-meta' }, [el('time', { datetime: item.at, title: formatDateTime(item.at), text: timeAgo(item.at) }), item.origin !== 'web' ? el('span', { class: 'astream-origin', text: ` · via ${ORIGINS[item.origin] || item.origin}` }) : null])
    ])) : [el('li', { class: 'astream-empty', text: 'Nada neste filtro ainda.' })]));
  };
  bar.append(...FILTERS.map(([value, label]) => {
    const node = el('button', { type: 'button', class: 'seg-item', 'aria-pressed': String(value === filter), dataset: { filter: value }, text: label });
    node.addEventListener('click', () => { filter = value; for (const item of bar.children) item.setAttribute('aria-pressed', String(item.dataset.filter === value)); draw(); });
    return node;
  }));
  root.append(bar, list);
  ctx.api(`events?organization_id=${encodeURIComponent(ctx.organization.id)}&entity_type=rfq&entity_id=${encodeURIComponent(rfq.id)}`)
    .then((result) => { engineRows = result.rows || []; draw(); }).catch(() => draw());
  // Eventos novos aparecem sem recarregar a tela.
  on('*', (event) => { if (root.isConnected && (ids.has(event.object?.id) || ids.has(event.object?.rfq_id))) draw(); }, { owner: root });
  draw();
  return root;
}
