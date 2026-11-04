// Documentos carregados sob demanda.
// Extraído de views/shared.js (v7.0): dependências específicas, sem barrel.

import { el, icon } from '../../core.js';

export function lazyDocuments(ctx, entityType, entityId, label, options = {}) {
  const details = el('details', { class: 'lazy-documents' }, [el('summary', {}, [icon('file', { size: 14 }), el('span', { text: label })])]);
  details.addEventListener('toggle', () => {
    if (!details.open || details.dataset.loaded) return;
    details.dataset.loaded = '1';
    import('../documents.js').then(({ documentsPanel }) => details.append(documentsPanel(ctx, { entityType, entityId, ...options })));
  });
  return details;
}

// Condições-chave da proposta (crédito ou adquirência), com unidade junto do valor.
