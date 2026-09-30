// Assistência contextual do Arandu — arquitetura preparada, sem IA nesta rodada.
//
// POLÍTICA (vale para qualquer assistência futura, com ou sem modelo de linguagem)
//   Pode:  resumir, explicar, localizar, organizar, preencher rascunhos,
//          identificar dados ausentes e comparar fatos informados.
//   Não pode: escolher banco, recomendar instituição, escolher proposta,
//          tomar decisão financeira nem aprovar automaticamente.
//   Sempre: dizer de onde veio cada afirmação e deixar a decisão com a pessoa.
//
// Hoje as ações abaixo são DETERMINÍSTICAS: calculadas a partir dos dados da
// tela, rotuladas como tal ("Calculado a partir dos dados") e sem nenhum texto
// gerado. A central de comando e a comparação leem este registro; quando
// houver um provedor de IA, novas ações entram aqui com `kind: 'ai'` e o
// mesmo contrato de política — a interface não precisa mudar.

import { PRODUCTS } from '../../../lib/finance/products.mjs';

export const ASSIST_POLICY = Object.freeze({
  may: ['resumir', 'explicar', 'localizar', 'organizar', 'preencher rascunhos', 'identificar dados ausentes', 'comparar fatos'],
  mayNot: ['escolher banco', 'recomendar instituição', 'escolher proposta', 'tomar decisão financeira', 'aprovar automaticamente']
});

/** Campos comparáveis que cada proposta não informou (fato, não julgamento). */
export function missingFields(rfq, proposals = rfq.proposals || []) {
  const fields = (PRODUCTS[rfq.product]?.proposalFields || []).filter((field) => field.comparable);
  const empty = (value) => value === undefined || value === null || value === '';
  return proposals.map((proposal) => ({ proposal, fields: fields.filter((field) => empty(proposal.terms?.[field.key])).map((field) => field.label.replace(/\s*\(.*\)$/, '')) }));
}

/**
 * Ações contextuais disponíveis numa tela. Cada uma declara `kind`
 * ('fact' hoje; 'ai' no futuro) para que a interface identifique a origem.
 */
export function contextActions(ctx, { openCompare, showMissing, openHistory } = {}) {
  if (ctx.view !== 'rfq') return [];
  const rfq = (ctx.data.rfqs || []).find((item) => item.id === new URLSearchParams(location.search).get('id'));
  if (!rfq) return [];
  const list = [];
  if ((rfq.proposals || []).length > 1 && openCompare) list.push({ id: 'ctx-compare', kind: 'fact', title: 'Comparar propostas lado a lado', detail: `${rfq.proposals.length} propostas · ${rfq.title}`, icon: 'scale', run: openCompare });
  if ((rfq.proposals || []).length && showMissing) list.push({ id: 'ctx-missing', kind: 'fact', title: 'Mostrar campos não informados', detail: 'Calculado a partir dos dados das propostas', icon: 'search', run: showMissing });
  if ((rfq.revision || 1) > 1 && openHistory) list.push({ id: 'ctx-revisions', kind: 'fact', title: 'Ver mudanças entre revisões', detail: `Revisão ${rfq.revision} · histórico publicado`, icon: 'repeat', run: openHistory });
  return list;
}
