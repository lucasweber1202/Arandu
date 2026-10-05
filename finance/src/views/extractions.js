import { ledgerPage } from './ledger.js';

// P1.4 Document Intelligence: fila de documentos e revisão de fatos compostas
// no servidor (lib/finance/extraction-presenter.mjs). Só no build financeiro.
export const extractions = (ctx) => ledgerPage(ctx, {
  resource: 'extractions', title: 'Documentos e fatos extraídos',
  subtitle: 'Fatos lidos de propostas, contratos e tabelas, com origem por campo e confirmação humana. Extrair não é decidir.',
  filters: [['schema_key', 'Tipo de documento'], ['status', 'Estado da extração']]
});
