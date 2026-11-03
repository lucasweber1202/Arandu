// Quadro de respostas e "Antes de comparar" da negociação (lib/finance/
// negotiation-board.mjs). Lê o que a tela já carregou (convites e propostas do
// portal) e a lista canônica de propostas externas; não grava nada.
import { el, icon, todayIso } from '../core.js';
import { card, pill, tag, loading } from '../ui.js';
import { PRODUCTS } from '../../../lib/finance/products.mjs';
import { negotiationBoard } from '../../../lib/finance/negotiation-board.mjs';

const BALL_TONE = { institution: ['info', 'send'], company: ['warning', 'clock'], none: ['neutral', 'check'] };

/** Abre a aba e rola até o cartão (a aba renderiza sob demanda; propostas externas chegam depois). */
export function openInTab(tab, targetId) {
  location.hash = `#${tab}`;
  const started = Date.now();
  const seek = () => {
    const node = document.getElementById(targetId);
    if (node) { node.scrollIntoView({ behavior: 'smooth', block: 'start' }); node.setAttribute('tabindex', '-1'); node.focus({ preventScroll: true }); return; }
    if (Date.now() - started < 4000) setTimeout(seek, 120);
  };
  setTimeout(seek, 0);
}

/**
 * Propostas externas da negociação (mesmo contrato da seção de propostas).
 * 503 = indisponível neste ambiente; outro erro = não carregou (nunca "nenhuma").
 */
// Uma consulta por renderização da solicitação: o quadro e "Antes de comparar"
// compartilham o resultado. A chave é o próprio objeto da RFQ — recarregar a
// tela cria outro objeto, então nada fica velho após gravar ou recarregar.
const shared = new WeakMap();
export function loadExternals(ctx, rfq) {
  // A tela da solicitação já leu a lista completa (todas as páginas) ao abrir.
  if (Array.isArray(rfq.external_rows)) return Promise.resolve({ rows: rfq.external_rows, more: false, problem: null });
  if (!shared.has(rfq)) shared.set(rfq, fetchExternals(ctx, rfq));
  return shared.get(rfq);
}
async function fetchExternals(ctx, rfq) {
  try {
    const result = await ctx.api(`external-proposals?organization_id=${encodeURIComponent(ctx.organization.id)}&rfq_id=${encodeURIComponent(rfq.id)}&limit=50`);
    return { rows: result.rows || [], more: Boolean(result.page?.has_more), problem: null };
  } catch (error) {
    return { rows: [], more: false, problem: error.status === 503 ? 'unavailable' : 'failed' };
  }
}

function externalNote(ext) {
  if (ext.problem === 'unavailable') return el('p', { class: 'muted small', text: 'Propostas externas: registro ainda não disponível neste ambiente; o quadro mostra só o portal.' });
  if (ext.problem === 'failed') return el('p', { class: 'callout callout-warning compact', role: 'alert' }, [icon('alert', { size: 14 }), el('span', { text: 'As propostas externas não carregaram. Isso não significa que não existam: o quadro mostra só o portal.' })]);
  if (ext.more) return el('p', { class: 'muted small', text: 'Há mais de 50 propostas externas; o quadro mostra as primeiras.' });
  return null;
}

function channelLine(row, channel) {
  const parts = [channel.version ? `v${channel.version}` : null, channel.review || null, channel.validity?.text || null,
    channel.missing.length ? `${channel.missing.length} ${channel.missing.length === 1 ? 'condição comparável em branco' : 'condições comparáveis em branco'}` : 'condições comparáveis completas',
    channel.inComparison ? 'na comparação' : 'fora da comparação'].filter(Boolean);
  const target = channel.href.slice(1);
  return el('li', { class: 'board-channel' }, [
    tag(channel.kind === 'portal' ? 'Portal' : 'Fonte externa', channel.kind === 'portal' ? 'neutral' : 'accent'),
    el('span', { class: 'small', text: ` ${channel.label} · ${parts.join(' · ')} ` }),
    el('a', { href: '#propostas', class: 'small', 'aria-label': `Ver proposta de ${row.name} (${channel.kind === 'portal' ? 'portal' : 'fonte externa'})`, onclick: (event) => { event.preventDefault(); openInTab('propostas', target); } }, 'Ver proposta')
  ]);
}

/** Cartão "Quadro de respostas" para a visão geral. */
export function responseBoardCard(ctx, rfq) {
  const body = el('div', {}, loading('Montando o quadro de respostas…'));
  // Copilot no contexto desta negociação (mesmo contrato e fontes da tela; ação material só com confirmação).
  const ask = ctx.mode === 'demo' ? null : el('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => import('./copilot.js').then((m) => m.openCopilot(ctx, {
    context: { type: 'rfq', id: rfq.id, label: rfq.title },
    question: 'Resuma as respostas desta negociação: quem respondeu, por qual canal, o que ainda aguarda a instituição ou a conferência da empresa e quais condições faltam, com as fontes.' })) }, el('span', { class: 'btn-label', text: 'Resumir respostas' }));
  const node = card({ title: 'Quadro de respostas', id: 'quadro-respostas', subtitle: 'Por instituição: convite, proposta pelo portal e propostas registradas pela empresa, com de quem é a vez. Sem ordenação comercial.', body, actions: ask ? [ask] : null });
  loadExternals(ctx, rfq).then((ext) => {
    const board = negotiationBoard({ rfq, invites: rfq.invites || [], proposals: rfq.proposals || [], externals: ext.rows, fields: PRODUCTS[rfq.product]?.proposalFields || [], today: todayIso() });
    const s = board.summary;
    const head = el('p', { class: 'small board-summary', text: `${s.institutions} ${s.institutions === 1 ? 'instituição' : 'instituições'} · ${s.waitingInstitution} aguardando a instituição · ${s.waitingCompany} aguardando a empresa · ${s.inComparison} na comparação · ${s.deadline}` });
    const list = el('ul', { class: 'milestone-list board-list', role: 'list' }, board.rows.map((row) => {
      const [tone, ic] = BALL_TONE[row.ball];
      return el('li', { class: 'milestone-row board-row', dataset: { provider: row.providerId, ball: row.ball } }, [
        pill({ label: row.ballLabel, tone, icon: ic }, { size: 'sm' }),
        el('div', { class: 'milestone-main' }, [
          el('strong', { text: row.name }), el('span', { class: 'muted small', text: row.status }),
          row.channels.length ? el('ul', { class: 'plain-list' }, row.channels.map((c) => channelLine(row, c))) : null,
          ...row.notes.map((text) => el('span', { class: 'small warn-text', text }))
        ]),
        ctx.mode === 'demo' ? null : el('a', { class: 'btn btn-sm btn-ghost', href: ctx.href(row.relationshipHref), text: 'Relacionamento' })
      ]);
    }));
    body.replaceChildren(...[externalNote(ext), head, board.rows.length ? list : el('p', { class: 'muted', text: 'Nenhuma instituição convidada e nenhuma proposta registrada ainda.' })].filter(Boolean));
  });
  return node;
}

/** Bloco "Antes de comparar" para a aba de comparação. */
export function readinessSection(ctx, rfq) {
  const box = el('section', { class: 'callout callout-info compact board-readiness', id: 'antes-de-comparar', 'aria-labelledby': 'readiness-title' }, [loading('Conferindo as respostas…')]);
  loadExternals(ctx, rfq).then((ext) => {
    const { readiness, summary } = negotiationBoard({ rfq, invites: rfq.invites || [], proposals: rfq.proposals || [], externals: ext.rows, fields: PRODUCTS[rfq.product]?.proposalFields || [], today: todayIso() });
    const title = el('strong', { id: 'readiness-title', text: 'Antes de comparar' });
    if (!readiness.length && !ext.problem) { box.replaceChildren(icon('info', { size: 14 }), el('span', {}, [title, ` · ${summary.inComparison} ${summary.inComparison === 1 ? 'resposta entra' : 'respostas entram'} na comparação, sem pendência de conferência, revisão ou condição comparável.`])); return; }
    box.replaceChildren(el('div', {}, [title, el('p', { class: 'small', text: 'O que fica fora da comparação e o que falta nas respostas que entram. A comparação é factual; a decisão é da empresa.' }),
      externalNote(ext),
      el('ul', { class: 'plain-list small' }, readiness.map((item) => el('li', {}, [item.text, ' ', el('a', { href: '#propostas', onclick: (event) => { event.preventDefault(); openInTab('propostas', item.href.slice(1)); } }, 'Ver')])))].filter(Boolean)));
  });
  return box;
}
