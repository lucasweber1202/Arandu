// Contratos como superfície de ciclo de vida.
//
// Cada contrato ganha a Arandu Timeline dos marcos (início, D-90, D-60, D-30,
// aviso prévio, vencimento), favorito e menu •••; a lista ganha visões
// (Renovação próxima, Vigentes, Encerrados). Datas e estágios vêm de
// renewalStage — a mesma regra de renovação do produto.

import { el, icon, renewalStage } from '../../src/core.js';
import { contextMenu } from './popover.js';
import { openQuickView, copyLink } from './quick-view.js';
import { contractStages, timeline } from './timeline.js';
import { starButton } from './star.js';
import { installViewsBar, activeView } from './saved-views.js';

const EXTRA = {
  renewal: (contract) => ['active', 'renewing'].includes(contract.status) && (['window', 'past_notice'].includes(renewalStage(contract).stage) || (renewalStage(contract).daysToDeadline ?? 9999) <= 120),
  active: (contract) => ['active', 'renewing'].includes(contract.status),
  ended: (contract) => ['expired', 'terminated'].includes(contract.status)
};

export function enhanceContracts(ctx, { initialViewId = null } = {}) {
  const cards = [...document.querySelectorAll('#view article[data-entity="contract"]')];
  for (const card of cards) {
    const contract = (ctx.data.contracts || []).find((item) => item.id === card.dataset.id);
    const status = card.querySelector('.contract-status');
    if (!contract || !status || status.querySelector('.row-star')) continue;
    const href = ctx.href(`/finance/contracts.html#contract-${contract.id}`);
    const source = (ctx.data.rfqs || []).find((rfq) => rfq.id === contract.rfq_id);
    status.append(starButton('contract', contract.id, contract.provider_name || 'Contrato'), contextMenu(`Mais ações: ${contract.provider_name}`, [
      { label: 'Ver resumo', icon: 'eye', onClick: () => openQuickView(ctx, 'contract', contract.id) },
      { label: 'Copiar link', icon: 'copy', onClick: () => copyLink(href) },
      { label: 'Preparar registro no ERP', icon: 'database', onClick: () => import('./integrations/center.js').then(({ openErpPreview }) => openErpPreview(ctx, contract)) },
      { label: 'Comentários internos', icon: 'message', onClick: () => openContractComments(ctx, contract) },
      source ? { label: 'Abrir processo de origem', icon: 'file', href: ctx.href(`/finance/rfq.html?id=${source.id}#decisao`) } : null,
      { label: 'Abrir em nova aba', icon: 'external', href, newTab: true }
    ], { el, icon }));
    if (['active', 'renewing'].includes(contract.status)) {
      const line = timeline(contractStages(contract), { label: `Ciclo de vida do contrato com ${contract.provider_name}`, hereText: '' });
      line.classList.add('contract-timeline');
      const bar = card.querySelector('.lifecycle-bar');
      if (bar) bar.replaceWith(line); else card.querySelector('.contract-head')?.after(line);
    }
  }
  const list = document.querySelector('#view > .stack');
  if (!list || !cards.length) return;
  const apply = () => {
    const extra = activeView(ctx, 'contracts')?.extra || '';
    let shown = 0;
    for (const card of cards) {
      const contract = (ctx.data.contracts || []).find((item) => item.id === card.dataset.id);
      const pass = !extra || EXTRA[extra]?.(contract);
      card.hidden = !pass;
      if (pass) shown += 1;
    }
    let empty = list.querySelector('.views-empty');
    if (!shown) {
      if (!empty) { empty = el('div', { class: 'empty empty-compact views-empty' }, [el('span', { class: 'empty-icon' }, icon('calendar', { size: 20 })), el('p', { class: 'empty-title', text: 'Nenhum contrato nesta visão' }), el('p', { class: 'empty-text', text: 'Nenhuma renovação exige decisão nos próximos meses. Mude de visão para ver os demais contratos.' })]); list.append(empty); }
    } else empty?.remove();
  };
  activeView(ctx, 'contracts', initialViewId);
  installViewsBar(ctx, { page: 'contracts', anchor: list.firstElementChild, onApply: () => { history.replaceState(null, '', location.pathname); apply(); } });
  apply();
}

/** Conversa interna do contrato (nunca visível a provedores). */
export async function openContractComments(ctx, contract) {
  const [{ commentThread }, { drawer }] = await Promise.all([import('./collaboration/comments.js'), import('../../src/ui.js')]);
  const people = (ctx.members || []).filter((member) => member.user_id !== ctx.viewer?.id).map((member) => ({ id: member.user_id, name: member.display_name, title: member.title }));
  drawer({ title: 'Comentários internos', subtitle: contract.provider_name, className: 'comments-drawer',
    body: commentThread(ctx, { objectType: 'contract', objectId: contract.id, title: `Contrato ${contract.provider_name}`, href: `/finance/contracts.html#contract-${contract.id}`, people }) });
}
