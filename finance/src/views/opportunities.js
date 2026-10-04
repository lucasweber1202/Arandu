import { ledgerPage } from './ledger.js';

// Opportunity Engine: worklist composta no servidor (lib/finance/opportunity-presenter.mjs).
// Fato + regra da empresa + fonte + prazo + ação possível; sem ranking e sem decisão.
export const opportunities = (ctx) => ledgerPage(ctx, {
  resource: 'opportunities', title: 'Oportunidades',
  subtitle: 'Fatos que pedem atenção, a regra da sua empresa que disparou, a fonte e uma ação possível para uma pessoa avaliar. Sem ranking e sem decisão automática.',
  filters: [['legal_entity_id', 'Entidade', 'entities'], ['opportunity_type', 'Tipo'], ['provider_id', 'Provedor', 'providers'], ['status', 'Estado'], ['due_before', 'Prazo até', 'date'], ['source', 'Fonte']]
});
