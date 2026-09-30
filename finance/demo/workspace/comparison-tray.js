// Comparison Tray: selecionar propostas enquanto navega e compará-las quando quiser.
//
// ┌──────────────────────────────────────────────┐
// │ Atlas + Banco B        2 propostas  Comparar │
// └──────────────────────────────────────────────┘
//
// A seleção vale para uma solicitação por vez — propostas de pedidos
// diferentes não são comparáveis — e vive no sessionStorage desta aba. Ela
// só escolhe o que aparece lado a lado: nada é ordenado, pontuado ou
// recomendado, e nenhuma regra financeira muda.

import { el, icon } from '../../src/core.js';
import { button, toast } from '../../src/ui.js';

const KEY = 'arandu-demo-tray';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const listeners = new Set();

export function readTray() {
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (value && UUID.test(value.rfqId) && Array.isArray(value.ids)) return { rfqId: value.rfqId, ids: value.ids.filter((id) => UUID.test(id)).slice(0, 8) };
  } catch { /* sessão indisponível */ }
  return { rfqId: null, ids: [] };
}
function writeTray(tray) {
  try {
    if (tray.ids.length) sessionStorage.setItem(KEY, JSON.stringify(tray));
    else sessionStorage.removeItem(KEY);
  } catch { /* segue sem memória */ }
  for (const listener of listeners) listener(tray);
}
export function subscribeTray(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export function isSelected(proposalId) { return readTray().ids.includes(proposalId); }

export function toggleProposal(rfqId, proposalId, on = !isSelected(proposalId)) {
  let tray = readTray();
  if (on && tray.rfqId && tray.rfqId !== rfqId && tray.ids.length) {
    toast('A seleção anterior era de outra solicitação. Propostas só são comparáveis dentro do mesmo pedido, então a bandeja recomeçou.', 'info');
    tray = { rfqId, ids: [] };
  }
  const ids = on ? [...new Set([...tray.ids, proposalId])] : tray.ids.filter((id) => id !== proposalId);
  writeTray({ rfqId: ids.length ? rfqId : null, ids });
  return on;
}
export function clearTray() { writeTray({ rfqId: null, ids: [] }); }
export function compareHref(ctx, rfqId, ids) { return ctx.href(`/finance/rfq.html?id=${encodeURIComponent(rfqId)}&comparar=${ids.join(',')}#comparacao`); }

/** Caixa "Comparar" para uma proposta. */
export function trayCheckbox(rfq, proposal, { label = 'Comparar' } = {}) {
  const input = el('input', { type: 'checkbox', class: 'tray-check-input', checked: isSelected(proposal.id), 'aria-label': `Selecionar ${proposal.provider_name} para comparar` });
  input.addEventListener('change', () => toggleProposal(rfq.id, proposal.id, input.checked));
  input.addEventListener('click', (event) => event.stopPropagation());
  const sync = () => { if (!input.isConnected) { listeners.delete(sync); return; } input.checked = isSelected(proposal.id); };
  listeners.add(sync);
  return el('label', { class: 'tray-check', title: 'Adicionar à bandeja de comparação' }, [input, el('span', { class: 'tray-check-text', text: label })]);
}

let node = null;
/** Bandeja flutuante; some quando vazia ou quando a comparação daquele pedido já está aberta. */
export function installTray(ctx) {
  node?.remove();
  if (ctx.audience !== 'company') return;
  node = el('section', { class: 'tray', 'aria-label': 'Bandeja de comparação', hidden: true });
  const draw = () => {
    const tray = readTray();
    const rfq = (ctx.data.rfqs || []).find((item) => item.id === tray.rfqId);
    const proposals = rfq ? tray.ids.map((id) => (rfq.proposals || []).find((item) => item.id === id)).filter(Boolean) : [];
    const comparingHere = ctx.view === 'rfq' && document.documentElement.dataset.compare === 'on' && new URLSearchParams(location.search).get('id') === tray.rfqId;
    node.hidden = !proposals.length || comparingHere;
    if (node.hidden) return;
    const chips = el('ul', { class: 'tray-items', role: 'list' }, proposals.map((proposal) => el('li', { class: 'tray-item' }, [
      el('span', { class: 'tray-item-name', text: proposal.provider_name.replace(/ — DEMO$/, '') }),
      el('button', { type: 'button', class: 'tray-remove', 'aria-label': `Remover ${proposal.provider_name} da comparação`, onclick: () => toggleProposal(rfq.id, proposal.id, false) }, icon('x', { size: 12 }))
    ])));
    const enough = proposals.length >= 2;
    node.replaceChildren(
      el('div', { class: 'tray-main' }, [el('p', { class: 'tray-title' }, [el('span', { class: 'tray-count num', text: String(proposals.length) }), el('span', { text: ` ${proposals.length === 1 ? 'proposta' : 'propostas'} · ${rfq.title}` })]), chips]),
      el('div', { class: 'tray-actions' }, [
        button('Limpar', { variant: 'ghost', size: 'sm', onClick: () => { clearTray(); toast('Bandeja de comparação vazia.', 'info'); } }),
        enough ? el('a', { class: 'btn btn-primary btn-sm', href: compareHref(ctx, rfq.id, proposals.map((proposal) => proposal.id)), id: 'tray-compare' }, [icon('scale'), el('span', { class: 'btn-label', text: 'Comparar' })])
          : el('span', { class: 'tray-hint', text: 'Selecione mais uma' })
      ])
    );
  };
  listeners.add(draw);
  document.body.append(node);
  draw();
  return draw;
}
