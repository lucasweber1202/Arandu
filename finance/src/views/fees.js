import { button } from '../ui.js';
import { ledgerPage } from './ledger.js';

// Bank Fee Intelligence: textos, rótulos e formulários compostos no servidor
// (lib/api/domains/finance-fees.mjs), com linguagem segura testada em Node.
export const fees = (ctx) => ledgerPage(ctx, {
  resource: 'fees', title: 'Tarifas bancárias',
  subtitle: 'Tarifa contratada × cobrança observada, com fonte, comparabilidade e revisão humana. Diferença não é acusação nem economia.',
  filters: [['start', 'Período inicial', 'start'], ['end', 'Período final', 'end'], ['legal_entity_id', 'Entidade', 'entities'], ['provider_id', 'Instituição', 'providers'],
    ['category', 'Serviço/categoria'], ['contract_id', 'Contrato', 'contracts'], ['currency', 'Moeda'], ['review_status', 'Estado da revisão']],
  // Importação CSV/XLSX (financial-fee-import-v1): prévia é aberta a quem vê o contrato; confirmar exige gestão.
  extraActions: ctx.mode === 'demo' ? null : () => [button('Importar arquivo', { iconName: 'download', attrs: { id: 'fee-import-trigger' }, onClick: () => import('./fee-import.js').then((m) => m.openFeeImport(ctx, { contracts: ctx.data.contracts || [], contractId: new URLSearchParams(location.search).get('contract_id') })) })]
});

