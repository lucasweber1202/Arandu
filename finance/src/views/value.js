import { ledgerPage } from './ledger.js';

// Valor de procurement: textos, totais por tipo e moeda, formulários e
// evidência compostos no servidor (lib/finance/value-presenter.mjs).
export const value = (ctx) => ledgerPage(ctx, {
  resource: 'value', title: 'Valor de procurement', scope: 'Escopo da apuração',
  subtitle: 'Custos declarados com evidência, por tipo e moeda. Decisão humana.',
  filters: [['start', 'Período inicial', 'start'], ['end', 'Período final', 'end'], ['product', 'Categoria'], ['kind', 'Tipo de valor'], ['currency', 'Moeda'],
    ['legal_entity_id', 'Entidade', 'entities'], ['provider_id', 'Provedor', 'providers']]
});
