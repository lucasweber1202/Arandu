// Processos e atividades vinculados a uma negociação ou contrato.
// Extraído de views/crm-workspace.js (v7.0).

import { el, formatDate, formatDateTime, todayIso } from '../../core.js';
import { loading, mutedText } from '../../ui.js';
import { ACTIVITY_KINDS, ACTIVITY_STATUS, STAGES, enc, memberLabel, crmList } from './model.js';

export function crmLinkedPanel(ctx, { relatedId, providerId = null, providerName = null, noun = 'este contrato' }) {
  const box = el('section', { class: 'cc-section crm-linked', 'aria-label': 'Relacionamento comercial vinculado' }, [el('h3', { text: 'Relacionamento comercial vinculado' }), loading('Carregando vínculos…')]);
  Promise.all([crmList(ctx, 'crm-processes', { related_id: relatedId }, { max: 50 }), crmList(ctx, 'crm-activities', { related_id: relatedId }, { max: 50 })]).then(([processes, activities]) => {
    const today = todayIso();
    const items = [
      ...processes.rows.map((p) => el('li', { class: 'crm-row', dataset: { crm: 'process' } }, [el('div', { class: 'crm-row-main' }, [mutedText(`Processo · ${STAGES[p.stage]}`, 'span'), el('strong', { text: p.title }), el('span', { class: 'small', text: `Próximo passo: ${p.next_action}${p.due_on ? ` · até ${formatDate(p.due_on)}` : ''} · ${memberLabel(ctx, p.owner_id)}` })])])),
      ...activities.rows.filter((a) => ['planned', 'recorded'].includes(a.status)).map((a) => el('li', { class: `crm-row${a.status === 'planned' && a.due_on && a.due_on < today ? ' crm-row-late' : ''}`, dataset: { crm: 'activity' } }, [el('div', { class: 'crm-row-main' }, [mutedText(`${ACTIVITY_KINDS[a.kind] || 'Atividade'} · ${ACTIVITY_STATUS[a.status]?.[0] || ''}`, 'span'), el('strong', { text: a.subject }), el('span', { class: 'small', text: a.status === 'recorded' ? `Aconteceu em ${formatDateTime(a.occurred_at)}` : a.due_on ? `Prazo ${formatDate(a.due_on)}` : 'Sem prazo' })])]))
    ];
    box.replaceChildren(el('h3', { text: 'Relacionamento comercial vinculado' }),
      items.length ? el('ul', { class: 'plain-list crm-list' }, items) : mutedText(`Nenhum processo ou atividade vinculado a ${noun}.`),
      ...(providerId ? [el('a', { class: 'btn btn-ghost btn-sm', href: ctx.href(`/finance/providers.html?provider_id=${enc(providerId)}`) }, el('span', { class: 'btn-label', text: `Abrir relacionamento${providerName ? ` com ${providerName}` : ''}` }))] : []));
  }).catch((error) => box.replaceChildren(el('h3', { text: 'Relacionamento comercial vinculado' }), mutedText(error.status === 503 ? 'Registro comercial indisponível neste ambiente.' : 'Vínculos comerciais indisponíveis agora.')));
  return box;
}
