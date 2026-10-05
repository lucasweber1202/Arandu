import { ledgerPage } from './ledger.js';

// Provider Qualification: lista, checklist e decisões compostas no servidor
// (lib/finance/qualification-presenter.mjs). Só no build financeiro.
export const qualifications = (ctx) => ledgerPage(ctx, {
  resource: 'qualifications', title: 'Qualificação de provedores',
  subtitle: 'Exigências da sua empresa, evidências com origem e validade, exceções e decisão humana. Qualificar não é escolher.',
  filters: [['provider_id', 'Provedor', 'providers'], ['legal_entity_id', 'Entidade', 'entities'], ['status', 'Estado'], ['category', 'Categoria']]
});
