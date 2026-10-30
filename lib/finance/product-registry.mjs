// Financial Product Registry v1: taxonomia extensível de modalidades
// financeiras ligada às capacidades REAIS do Arandu. O estado de suporte de
// cada modalidade é derivado do código existente (categoria de contrato com
// termos tipados, produto de RFQ com schema e estimador econômico), nunca
// declarado à mão. Códigos estáveis: novos itens só por adição.
import { PRODUCTS } from './products.mjs';
import { CONTRACT_CATEGORIES, SOURCING_CATEGORIES, contractTermFields } from './contract-terms.mjs';

export const REGISTRY_VERSION = 'financial-product-registry-1';
export const SUPPORT_STATES = Object.freeze(['CATALOG_ONLY', 'STRUCTURED', 'RFQ_ENABLED', 'ECONOMICS_ENABLED', 'INTEGRATION_SUPPORTED']);
// Metodologias econômicas existentes por produto de RFQ (sem preço de mercado).
export const ECONOMICS_METHODS = Object.freeze({
  credit: { method: 'credit-declared-total-cost', note: 'Custo total estimado a partir de taxa, prazo e encargos declarados nas propostas; CET informado pela instituição prevalece.' },
  acquiring: { method: 'acquiring-processing-cost-v2', note: 'Componentes de processamento (MDR, PIX, fixos) para um mês declarado; antecipação, tributos e transição fora.' }
});

export const FAMILIES = Object.freeze([
  { code: 'credit', name: 'Crédito', description: 'Recursos para capital de giro e operações de curto e médio prazo.' },
  { code: 'financing', name: 'Financiamento', description: 'Financiamento de investimentos, ativos e comércio exterior.' },
  { code: 'guarantees', name: 'Garantias', description: 'Instrumentos que garantem obrigações da empresa perante terceiros.' },
  { code: 'payments', name: 'Pagamentos', description: 'Saída de recursos: folha, fornecedores e pagamentos corporativos.' },
  { code: 'receivables', name: 'Recebimentos', description: 'Entrada de recursos: boletos, cobrança e PIX de recebimento.' },
  { code: 'acquiring', name: 'Adquirência', description: 'Captura de cartões e meios eletrônicos e antecipação desses recebíveis.' },
  { code: 'cash_management', name: 'Cash management', description: 'Serviços de conta, liquidez e concentração de caixa.' },
  { code: 'fx', name: 'Câmbio', description: 'Compra e venda de moeda estrangeira.' },
  { code: 'hedge', name: 'Derivativos e hedge', description: 'Proteção contra variação de moeda, juros e índices.' },
  { code: 'investments', name: 'Investimentos corporativos', description: 'Aplicação do caixa da empresa.' }
]);

// [código estável, nome, família, categoria de contrato canônica, produto de RFQ ou null]
const MODALITIES = [
  ['working_capital', 'Capital de giro', 'credit', 'credit', 'credit'],
  ['revolving_credit', 'Crédito rotativo', 'credit', 'credit', 'credit'],
  ['overdraft_secured', 'Conta garantida', 'credit', 'credit', 'credit'],
  ['receivables_discount', 'Desconto de duplicatas', 'credit', 'credit', 'credit'],
  ['investment_financing', 'Financiamento de investimento', 'financing', 'credit', 'credit'],
  ['leasing', 'Leasing', 'financing', 'credit', null],
  ['acc', 'ACC (adiantamento sobre contrato de câmbio)', 'financing', 'credit', null],
  ['ace', 'ACE (adiantamento sobre cambiais entregues)', 'financing', 'credit', null],
  ['finimp', 'FINIMP', 'financing', 'credit', null],
  ['bank_guarantee', 'Fiança bancária', 'guarantees', 'guarantee', null],
  ['surety_insurance', 'Seguro garantia', 'guarantees', 'guarantee', null],
  ['letter_of_credit', 'Carta de crédito', 'guarantees', 'guarantee', null],
  ['standby_lc', 'Standby letter of credit', 'guarantees', 'guarantee', null],
  ['corporate_payments', 'Pagamentos corporativos (fornecedores)', 'payments', 'cash_management', null],
  ['payroll', 'Folha de pagamento', 'payments', 'cash_management', null],
  ['boleto', 'Boletos', 'receivables', 'cash_management', null],
  ['collection', 'Cobrança bancária', 'receivables', 'cash_management', null],
  ['pix_receiving', 'PIX para recebimento', 'receivables', 'acquiring', 'acquiring'],
  ['card_acquiring', 'Adquirência de cartões', 'acquiring', 'acquiring', 'acquiring'],
  ['payment_gateway', 'Gateway de pagamento', 'acquiring', 'acquiring', 'acquiring'],
  ['card_receivables_prepayment', 'Antecipação de recebíveis de cartão', 'acquiring', 'acquiring', null],
  ['account_services', 'Serviços de conta e pacote de tarifas', 'cash_management', 'cash_management', null],
  ['cash_pooling', 'Cash pooling / concentração de caixa', 'cash_management', 'cash_management', null],
  ['fx_spot', 'Câmbio spot', 'fx', 'fx', null],
  ['fx_forward', 'Termo de moeda (forward)', 'hedge', 'fx', null],
  ['ndf', 'NDF', 'hedge', 'fx', null],
  ['swap', 'Swap', 'hedge', 'fx', null],
  ['cdb', 'CDB', 'investments', 'other', null],
  ['repo', 'Operação compromissada', 'investments', 'other', null],
  ['corporate_funds', 'Fundos de investimento corporativos', 'investments', 'other', null]
];

/** Estados comprovados pelo código; nunca inclui o que não está implementado. */
export function supportStates(contractCategory, rfqProduct) {
  const states = ['CATALOG_ONLY'];
  if (CONTRACT_CATEGORIES[contractCategory] && contractTermFields(contractCategory).length) states.push('STRUCTURED');
  if (rfqProduct && SOURCING_CATEGORIES.includes(rfqProduct) && PRODUCTS[rfqProduct]) states.push('RFQ_ENABLED');
  if (rfqProduct && ECONOMICS_METHODS[rfqProduct] && states.includes('RFQ_ENABLED')) states.push('ECONOMICS_ENABLED');
  // INTEGRATION_SUPPORTED: nenhum conector específico existe nesta versão.
  return states;
}

export function productRegistry() {
  const modalities = MODALITIES.map(([code, name, family, contract_category, rfq_product]) => {
    const states = supportStates(contract_category, rfq_product);
    return { code, name, family, contract_category, rfq_product: states.includes('RFQ_ENABLED') ? rfq_product : null, support: states,
      term_fields: states.includes('STRUCTURED') ? contractTermFields(contract_category).map((f) => f.key) : [],
      economics: states.includes('ECONOMICS_ENABLED') ? ECONOMICS_METHODS[rfq_product] : null };
  });
  return { version: REGISTRY_VERSION, families: FAMILIES.map((f) => ({ ...f, modalities: modalities.filter((m) => m.family === f.code).map((m) => m.code) })), modalities,
    notice: 'Estar no catálogo não significa negociação nem cálculo econômico. Cada modalidade declara só o suporte implementado; não há ranking nem recomendação de instituição.' };
}

export function getModality(code) {
  return productRegistry().modalities.find((m) => m.code === code) || null;
}
