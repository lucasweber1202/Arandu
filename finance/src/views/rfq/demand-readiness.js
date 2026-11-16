// Prontidão da demanda calculada no servidor (GET demand-readiness, Arandu 10).
// O cálculo usa normalizeDemand canônico; a tela só exibe o que veio. Falha
// de leitura nunca vira "pronta": o estado fica "não confirmado".
// Sugestões do Financial Passport não são aplicadas aqui (o servidor declara
// suggestions_applied_automatically=false) e nenhum anexo vira prova.

import { el, icon, formatDateTime, textSpan, textStrong } from '../../core.js';
import { button, mutedText } from '../../ui.js';
import { PRODUCTS } from '../../../../lib/finance/products.mjs';
import { sequence, sectionError, queryString } from '../shared/operational.js';

/** Resumo factual da prontidão. Exportada para teste. */
export function readinessSummary(readiness, product) {
  if (!readiness) return { state: 'unknown', title: 'Prontidão não confirmada', items: [] };
  const fields = PRODUCTS[product]?.demandFields || [];
  const label = (key) => fields.find((f) => f.key === key)?.label || 'Campo da demanda';
  const items = [
    ...(readiness.missing_fields || []).map((key) => ({ key, kind: 'missing', text: `${label(key)}: não informado` })),
    ...(readiness.validation_errors || []).map((error) => {
      const key = typeof error === 'object' ? error.field || error.key || null : null;
      const message = typeof error === 'object' ? error.message || error.error || 'valor inválido' : String(error);
      return { key, kind: 'invalid', text: key ? `${label(key)}: ${message}` : message };
    })
  ];
  // missing_fields também aparece em validation_errors quando obrigatório: mostra uma vez por campo.
  const seen = new Set();
  const unique = items.filter((item) => { const id = `${item.key || item.text}`; if (item.key && seen.has(item.key)) return false; seen.add(item.key || id); return true; });
  if (readiness.ready) return { state: 'ready', title: 'Campos da demanda preenchidos', items: [] };
  return { state: 'incomplete', title: `Falta completar ${unique.length || 'alguns'} ${unique.length === 1 ? 'item' : 'itens'}`, items: unique };
}

export function demandReadinessPanel(ctx, rfq, { onEditField } = {}) {
  const reads = sequence();
  const node = el('section', { class: 'card readiness-panel', id: 'prontidao', 'aria-labelledby': 'prontidao-title', 'aria-live': 'polite' });
  const head = el('div', { class: 'card-head' }, [el('div', { class: 'card-head-text' }, [el('h2', { class: 'card-title', id: 'prontidao-title', text: 'Prontidão da demanda' }),
    el('p', { class: 'card-subtitle', text: 'Conferida pelo servidor a partir dos dados declarados nesta solicitação.' })])]);
  const body = el('div', { class: 'card-body stack' }, mutedText('Conferindo prontidão…'));
  node.append(head, body);

  async function load() {
    const token = reads.next();
    body.replaceChildren(el('p', { class: 'muted small', role: 'status', text: 'Conferindo prontidão…' }));
    try {
      const data = await ctx.api(`demand-readiness?${queryString({ rfq_id: rfq.id })}`);
      if (!reads.isCurrent(token)) return;
      draw(data.readiness);
    } catch (error) {
      if (!reads.isCurrent(token)) return;
      body.replaceChildren(el('p', { class: 'small', dataset: { state: 'unknown' }, text: 'Prontidão não confirmada: o servidor não respondeu. Isso não significa que a demanda esteja completa.' }), sectionError(error, load));
    }
  }

  function draw(readiness) {
    const summary = readinessSummary(readiness, rfq.product);
    const prov = readiness?.provenance;
    body.replaceChildren(...[
      el('p', { class: `callout compact ${summary.state === 'ready' ? 'callout-success' : 'callout-warning'}`, dataset: { state: summary.state } }, [icon(summary.state === 'ready' ? 'checkCircle' : 'alert', { size: 14 }), textStrong(summary.title)]),
      summary.items.length ? el('ul', { class: 'plain-list readiness-missing', 'aria-label': 'Itens pendentes' }, summary.items.map((item) => el('li', {}, [
        textSpan(item.text),
        item.key && onEditField ? button('Preencher', { size: 'sm', variant: 'ghost', attrs: { 'aria-label': `Preencher ${item.text.split(':')[0]}` }, onClick: () => onEditField(item.key) }) : null
      ].filter(Boolean)))) : null,
      readiness?.coverage ? mutedText(`${readiness.coverage.required - readiness.coverage.missing} de ${readiness.coverage.required} campos obrigatórios informados.`) : null,
      prov ? mutedText(`Origem: dados declarados pela empresa na revisão ${prov.revision ?? '—'}${prov.updated_at ? `, atualizada em ${formatDateTime(prov.updated_at)}` : ''}. Sugestões do Passport nunca são aplicadas sem sua ação; documento anexado não comprova autenticidade.`) : null,
      readiness?.notice ? mutedText(readiness.notice) : null,
      button('Conferir de novo', { size: 'sm', variant: 'ghost', iconName: 'refresh', onClick: load })
    ].filter(Boolean));
  }

  load();
  return node;
}
