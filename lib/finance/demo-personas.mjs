// Single source of synthetic demo identities; reserved .example domains.
export const BUYERS = {
  helena: { email: 'helena.duarte@vittafoods.example', name: 'Helena Duarte', title: 'CFO', role: 'admin' },
  juliana: { email: 'juliana.ramos@vittafoods.example', name: 'Juliana Ramos', title: 'Gerente de Tesouraria', role: 'finance_manager' },
  rafael: { email: 'rafael.menezes@vittafoods.example', name: 'Rafael Menezes', title: 'Analista Financeiro Sênior', role: 'analyst' },
  carlos: { email: 'carlos.tavares@vittafoods.example', name: 'Carlos Tavares', title: 'Controller', role: 'viewer' }
};

/** Instituições fictícias: organização provedora, pessoa de contato e cadastro na Vitta. */
export const PROVIDERS = {
  atlas: {
    org: 'Atlas Bank S.A.', name: 'Atlas Bank', kind: 'bank', region: 'Nacional — São Paulo (SP)',
    person: { email: 'eduardo.lima@atlasbank.example', name: 'Eduardo Lima', title: 'Gerente de Relacionamento Corporate' },
    products: ['credit', 'acquiring'], website: 'https://atlasbank.example',
    notes: 'Banco principal da Vitta: folha, cobrança e a linha de capital de giro vigente.'
  },
  nexo: {
    org: 'Nexo Payments Instituição de Pagamento Ltda.', name: 'Nexo Payments', kind: 'acquirer', region: 'Nacional — Curitiba (PR)',
    person: { email: 'camila.torres@nexopay.example', name: 'Camila Torres', title: 'Executiva de Contas Enterprise' },
    products: ['acquiring'], website: 'https://nexopay.example',
    notes: 'Adquirente com foco em varejo e e-commerce; integração nativa com o ERP da Vitta.'
  },
  orbe: {
    org: 'Orbe Capital Sociedade de Crédito Direto S.A.', name: 'Orbe Capital', kind: 'credit_provider', region: 'Nacional — Belo Horizonte (MG)',
    person: { email: 'bruno.sato@orbecapital.example', name: 'Bruno Sato', title: 'Diretor de Crédito Corporativo' },
    products: ['credit'], website: 'https://orbecapital.example',
    notes: 'Crédito estruturado para médias empresas; decisão de comitê em até 7 dias.'
  },
  meridian: {
    org: 'Meridian Financial Banco Múltiplo S.A.', name: 'Meridian Financial', kind: 'bank', region: 'Nacional — Rio de Janeiro (RJ)',
    person: { email: 'patricia.alves@meridianfinancial.example', name: 'Patrícia Alves', title: 'Gerente Corporate Banking' },
    products: ['credit'], website: 'https://meridianfinancial.example',
    notes: 'Banco médio com mesa de agronegócio e alimentos; participou da concorrência da linha vigente.'
  },
  lumina: {
    org: 'Lumina Pay Instituição de Pagamento S.A.', name: 'Lumina Pay', kind: 'acquirer', region: 'Nacional — São Paulo (SP)',
    person: { email: 'diego.freitas@luminapay.example', name: 'Diego Freitas', title: 'Head Comercial Grandes Contas' },
    products: ['acquiring'], website: 'https://luminapay.example',
    notes: 'Credenciadora atual da Vitta (contrato de 24 meses, escolhida na última concorrência de adquirência).'
  }
};

