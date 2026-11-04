// Documentos carregados sob demanda.
// Extraído de views/shared.js (v7.0): dependências específicas, sem barrel.

import { el, icon, textSpan } from '../../core.js';
import { loading, errorState } from '../../ui.js';

// A lista (e a leitura de private-documents) só acontece ao abrir o painel, uma
// vez por painel. Se o módulo não carregar, o painel diz isso em vez de ficar
// vazio — e não marca como carregado o que não carregou.
export function lazyDocuments(ctx, entityType, entityId, label, options = {}) {
  const details = el('details', { class: 'lazy-documents' }, [el('summary', {}, [icon('file', { size: 14 }), textSpan(label)])]);
  let pending = null;
  details.addEventListener('toggle', () => {
    if (!details.open || details.dataset.loaded || pending) return;
    const slot = el('div', {}, loading('Carregando documentos…'));
    details.append(slot);
    pending = import('../documents.js')
      .then(({ documentsPanel }) => { details.dataset.loaded = '1'; slot.replaceWith(documentsPanel(ctx, { entityType, entityId, ...options })); })
      .catch((error) => slot.replaceChildren(errorState({ title: 'Documentos indisponíveis', error })))
      .finally(() => { pending = null; });
  });
  return details;
}

// Condições-chave da proposta (crédito ou adquirência), com unidade junto do valor.
