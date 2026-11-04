// Linha do tempo do relacionamento com uma instituição.
//
// Só exibe o que o servidor devolveu em `provider-relationship.timeline`
// (convites, contratos, questões, avaliações e registros do CRM): cada evento
// mostra a origem e, quando há tela canônica, leva até ela. Nenhum evento é
// inferido no navegador; o recorte (limite do servidor) é dito na tela.

import { el, formatDate, formatDateTime } from '../core.js';
import { mutedText } from '../ui.js';

export const TIMELINE_KINDS = Object.freeze({
  invite: { label: 'Convite', source: 'Convite para solicitação' },
  contract: { label: 'Contrato', source: 'Início de vigência do contrato' },
  issue: { label: 'Questão', source: 'Questão registrada pela empresa' },
  issue_closed: { label: 'Questão', source: 'Questão encerrada pela empresa' },
  review: { label: 'Avaliação', source: 'Avaliação definida pela empresa' },
  event: { label: 'Cadastro', source: 'Registro de contato ou relação' }
});
const FILTERS = Object.freeze([['all', 'Tudo'], ['invite', 'Convites'], ['contract', 'Contratos'], ['issue', 'Questões'], ['review', 'Avaliações'], ['event', 'Cadastro']]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Destino canônico do evento, ou null quando a origem não tem tela própria. */
export function timelineHref(row) {
  if (!UUID.test(String(row?.ref || ''))) return null;
  if (row.kind === 'invite') return `/finance/rfq.html?id=${row.ref}`;
  if (row.kind === 'contract') return `/finance/contracts.html?abrir=contrato#contract-${row.ref}`;
  return null;
}

/** Grupo do filtro: questão aberta e encerrada ficam juntas. */
export function timelineGroup(kind) { return kind === 'issue_closed' ? 'issue' : kind; }

const monthLabel = (value) => {
  const date = new Date(String(value).length === 10 ? `${value}T12:00:00` : value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : 'Sem data';
};

export function relationshipTimeline(ctx, rows = [], { limit = 60 } = {}) {
  const known = rows.filter((row) => row && row.at && TIMELINE_KINDS[row.kind]);
  const root = el('div', { class: 'stack rel-timeline' });
  if (!known.length) { root.append(el('p', { class: 'muted', text: 'Nenhum evento registrado com esta instituição no Arandu.' })); return root; }
  const present = new Set(known.map((row) => timelineGroup(row.kind)));
  const filters = FILTERS.filter(([key]) => key === 'all' || present.has(key));
  let active = 'all';
  const bar = el('div', { class: 'chips', role: 'group', 'aria-label': 'Filtrar histórico por origem' });
  const list = el('div', { class: 'stack' });
  const status = el('p', { class: 'muted small', role: 'status' });

  const draw = () => {
    const shown = known.filter((row) => active === 'all' || timelineGroup(row.kind) === active);
    bar.querySelectorAll('button').forEach((node) => node.setAttribute('aria-pressed', String(node.dataset.kind === active)));
    const months = new Map();
    for (const row of shown) {
      const key = monthLabel(row.at);
      if (!months.has(key)) months.set(key, []);
      months.get(key).push(row);
    }
    list.replaceChildren(...[...months].map(([month, items]) => el('section', { class: 'rel-timeline-month' }, [
      el('h4', { class: 'rel-timeline-month-title', text: month }),
      el('ol', { class: 'timeline-list rel-timeline-list' }, items.map((row) => {
        const meta = TIMELINE_KINDS[row.kind];
        const href = timelineHref(row);
        const when = String(row.at).length === 10 ? formatDate(row.at) : formatDateTime(row.at);
        return el('li', { class: 'rel-timeline-item', dataset: { kind: row.kind } }, [
          el('time', { datetime: String(row.at), class: 'rel-timeline-when', text: when }),
          el('div', { class: 'rel-timeline-body' }, [
            href ? el('a', { href: ctx.href(href), text: row.text }) : el('span', { text: row.text }),
            mutedText(`Origem: ${meta.source}`, 'span')
          ])
        ]);
      }))
    ])));
    status.textContent = `${shown.length} ${shown.length === 1 ? 'evento' : 'eventos'}${active === 'all' ? '' : ' neste filtro'}. ${known.length >= limit ? `Recorte: os ${limit} mais recentes registrados no Arandu.` : 'Todos os eventos registrados no Arandu com esta instituição.'}`;
  };
  for (const [key, label] of filters) {
    bar.append(el('button', { type: 'button', class: 'chip', dataset: { kind: key }, 'aria-pressed': 'false', text: label, onclick: () => { active = key; draw(); } }));
  }
  draw();
  if (filters.length > 2) root.append(bar);
  root.append(status, list);
  return root;
}
