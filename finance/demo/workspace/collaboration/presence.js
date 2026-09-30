// Presença discreta: quem mais está com o mesmo objeto aberto.
//
// Duas fontes, sempre rotuladas:
//   * outras abas desta demonstração (BroadcastChannel) — presença real entre
//     abas: abra a aprovação como Ricardo numa aba e a Marina vê na outra;
//   * pessoas do processo, derivadas dos dados (quem precisa agir, quem
//     enviou a última proposta) — determinístico, marcado como simulado.
// Sem avatares pulando pela tela: uma linha de texto com iniciais.

import { el, initials } from '../../../src/core.js';
import { flag } from '../platform/telemetry.js';

const TAB = `tab-${Math.random().toString(36).slice(2, 8)}`;
const peers = new Map();
const listeners = new Set();
let channel = null;
let current = null;
try { channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('arandu-demo-presence') : null; } catch { channel = null; }

channel?.addEventListener('message', ({ data }) => {
  if (!data || data.tab === TAB) return;
  if (data.leave) peers.delete(data.tab); else peers.set(data.tab, { ...data, seen: Date.now() });
  for (const listener of listeners) listener();
});
function beat() { if (current) channel?.postMessage({ ...current, tab: TAB }); }
setInterval(() => {
  beat();
  for (const [tab, peer] of peers) if (Date.now() - peer.seen > 25000) peers.delete(tab);
}, 8000);
globalThis.addEventListener?.('pagehide', () => channel?.postMessage({ tab: TAB, leave: true }));

/** Anuncia o que esta aba está vendo (objeto + atividade). */
export function announcePresence({ object, name, activity }) {
  current = { object, name, activity };
  beat();
}

/**
 * Linha de presença para um objeto. `related` = pessoas do processo:
 * [{ name, text, live }] (derivadas dos dados pela tela que chama).
 */
export function presenceLine(object, related = [], { viewerName = null } = {}) {
  const node = el('p', { class: 'presence', 'aria-live': 'polite', dataset: { object } });
  let mounted = false;
  const draw = () => {
    // Linha que saiu da tela deixa de ouvir (sem ouvintes acumulando a cada render).
    if (mounted && !node.isConnected) { listeners.delete(draw); return; }
    if (node.isConnected) mounted = true;
    if (!flag('presence')) { node.hidden = true; return; }
    const tabs = [...peers.values()].filter((peer) => peer.object === object && peer.name !== viewerName)
      .map((peer) => ({ name: peer.name, text: `${peer.activity} (outra aba)`, live: true, real: true }));
    const people = [...tabs, ...related.filter((person) => person.name && person.name !== viewerName && !tabs.some((tab) => tab.name === person.name))].slice(0, 3);
    node.hidden = !people.length;
    node.replaceChildren(...people.flatMap((person, index) => [
      index ? el('span', { class: 'presence-sep', 'aria-hidden': 'true', text: '·' }) : null,
      el('span', { class: `presence-item${person.live ? ' is-live' : ''}`, title: person.real ? 'Presença entre abas desta demonstração' : 'Presença simulada a partir dos dados do processo' }, [
        el('span', { class: 'presence-avatar', 'aria-hidden': 'true', text: initials(person.name) }),
        el('span', { text: `${person.name.split(' ')[0]} ${person.text}` })
      ])
    ]).filter(Boolean));
  };
  listeners.add(draw);
  draw();
  return node;
}

// Quem responde por cada instituição fictícia (mesmas pessoas do conjunto inicial).
const PROVIDER_PEOPLE = { 'Atlas Bank': 'Camila Rocha', 'Banco Horizonte Sul': 'Rafael Nunes', 'Nexa Crédito': 'Bianca Teles', 'Orbe Pagamentos': 'Tiago Moura', 'Cadência Adquirência': 'Luana Freitas' };
export const providerPerson = (providerName) => PROVIDER_PEOPLE[String(providerName || '').replace(/ — DEMO$/, '')] || null;

/** Pessoas do processo de uma solicitação, a partir dos dados (determinístico). */
export function rfqPresence(ctx, rfq, { timeAgo }) {
  const people = [];
  const request = (ctx.demoApprovals || []).find((row) => row.rfq_id === rfq.id && row.status === 'pending');
  const step = request && [...(request.steps || [])].filter((item) => item.status === 'pending').sort((a, b) => a.position - b.position)[0];
  const approver = step && (ctx.members || []).find((member) => member.user_id === step.approver_id)?.display_name;
  if (approver) people.push({ name: approver, text: 'está com a decisão na fila', live: true });
  const latest = [...(rfq.proposals || [])].filter((proposal) => proposal.submitted_at).sort((a, b) => String(b.submitted_at).localeCompare(String(a.submitted_at)))[0];
  const provider = latest && providerPerson(latest.provider_name);
  if (provider) people.push({ name: provider, text: `enviou a proposta v${latest.version} ${timeAgo(latest.submitted_at)}` });
  if (rfq.owner_name) people.push({ name: rfq.owner_name, text: 'é responsável pelo processo' });
  return people;
}
