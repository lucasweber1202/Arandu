// Conjunto de dados da demonstração canônica do Arandu: Vitta Foods S.A.
//
// Empresa, pessoas, instituições e valores FICTÍCIOS. Nenhuma marca real; os
// e-mails usam domínios reservados para documentação (.example, RFC 2606) e
// nunca recebem mensagem. Os valores são plausíveis para uma indústria de
// alimentos com ~R$ 180 milhões de receita, sem pretender refletir condições
// praticadas por nenhuma instituição.
//
// Este arquivo é só dado. Quem o transforma em história é scripts/demo/seed.mjs,
// sempre pela API real do Arandu e com a sessão de cada persona. Datas são
// deslocamentos em dias a partir do dia da semeadura (0 = hoje).

export const COMPANY = {
  legal_name: 'Vitta Foods S.A.',
  trade_name: 'Vitta Foods',
  sector: 'Alimentos e bebidas',
  revenue_band: '30m_300m',
  // Financial Passport: campos do catálogo (lib/finance/passport.mjs) com valor
  // tipado e origem declarada; os dois últimos são campos livres.
  profile: [
    ['receita_anual', '158000000', 'documento_interno'],
    ['natureza_juridica', 'sa_fechada', 'documento_interno'],
    ['porte', 'grande', 'declarado_pela_empresa'],
    ['moeda_base', 'BRL', 'declarado_pela_empresa'],
    ['tempo_operacao_anos', '21', 'declarado_pela_empresa'],
    ['colaboradores', '612', 'declarado_pela_empresa'],
    ['bancos_relacionamento', 'Atlas Bank (folha e cobrança) e Meridian Financial (câmbio)', 'contrato_vigente'],
    ['linhas_credito_contratadas', 'Capital de giro Atlas Bank — R$ 8 milhões em 24 meses', 'contrato_vigente'],
    ['divida_liquida_ebitda', '1.6', 'documento_interno'],
    ['garantias_disponiveis', 'Recebíveis de cartão, duplicatas de varejo e equipamentos industriais', 'declarado_pela_empresa'],
    ['adquirente_atual', 'Credenciadora anterior (contrato no fim da vigência)', 'contrato_vigente'],
    ['volume_cartoes_mensal', '12400000', 'extrato'],
    ['canais_de_venda', 'Varejo alimentar (68%), food service (21%), loja on-line e lojas próprias (11%)', 'declarado_pela_empresa'],
    ['operacao', 'Brasil: fábricas em Chapecó (SC), Rio Verde (GO) e Feira de Santana (BA)', 'declarado_pela_empresa'],
    ['banco_principal', 'Atlas Bank (domicílio da folha e cobrança)', 'contrato_vigente']
  ],
  // Revisão do Passport pelo analista antes da nova linha de crédito (dia −23).
  // O volume em cartões fica de fora de propósito: aparece desatualizado.
  profileRefresh: [
    ['receita_anual', '182000000', 'documento_interno'],
    ['tempo_operacao_anos', '23', 'declarado_pela_empresa'],
    ['adquirente_atual', 'Lumina Pay (contrato de 24 meses)', 'contrato_vigente'],
    ['divida_liquida_ebitda', '1.6', 'documento_interno']
  ],
  // Confirmados como atuais na mesma revisão, sem mudança de valor.
  profileConfirm: ['garantias_disponiveis', 'bancos_relacionamento']
};

/** Pessoas da Vitta Foods. `role` é o papel real do RBAC do Arandu. */
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

/**
 * RFQ 0 — capital de giro contratado há quase dois anos. O contrato vence em ~85 dias:
 * é o caso de renovação da demonstração (marco D-90 atingido; aviso prévio de
 * 60 dias vence em ~25 dias).
 */
export const RFQ_WORKING_CAPITAL_CURRENT = {
  key: 'creditCurrent', product: 'credit', start: -700,
  title: 'Capital de giro — linha vigente (R$ 8 milhões / 24 meses)',
  description: 'Reforço de capital de giro para a safra e ampliação da linha de congelados. Contratada há quase dois anos; o contrato vence nos próximos três meses.',
  deadline: -688,
  demand: { amount: 8000000, purpose: 'capital_de_giro', term_months: 24, grace_months: 3, annual_revenue: 158000000, sector: 'Alimentos e bebidas', operating_years: 21, collateral: 'Recebíveis de cartão e duplicatas de varejo', urgency: 'media' },
  invited: ['atlas', 'meridian', 'orbe'],
  proposals: {
    atlas: [{ note: 'Condição de relacionamento: domicílio da folha mantido no Atlas.', terms: { institution: 'Atlas Bank', product_name: 'Capital de giro com cessão de recebíveis', offered_amount: 8000000, interest_rate_month: 1.32, index: 'cdi', index_spread: 3.2, cet_year: 19.4, term_months: 24, grace_months: 3, amortization: 'sac', collateral_required: 'Cessão fiduciária de 25% dos recebíveis de cartão', fees_amount: 64000, contracting_days: 12, conditions_precedent: 'Covenant: dívida líquida/EBITDA ≤ 2,5x, apuração semestral.' } }],
    meridian: [{ note: 'Proposta válida por 15 dias.', terms: { institution: 'Meridian Financial', product_name: 'Capital de giro corporate', offered_amount: 8000000, interest_rate_month: 1.41, index: 'cdi', index_spread: 3.8, cet_year: 20.9, term_months: 24, grace_months: 0, amortization: 'price', collateral_required: 'Alienação fiduciária de equipamentos industriais', fees_amount: 40000, contracting_days: 20 } }],
    orbe: [{ note: 'Limite aprovado em comitê: R$ 6 milhões.', terms: { institution: 'Orbe Capital', product_name: 'Crédito estruturado de giro', offered_amount: 6000000, interest_rate_month: 1.38, index: 'pre', cet_year: 18.7, term_months: 24, grace_months: 2, amortization: 'price', collateral_required: 'Aval dos acionistas e cessão de duplicatas', fees_amount: 30000, contracting_days: 7 } }]
  },
  weights: { interest_rate_month: 40, cet_year: 30, offered_amount: 20, grace_months: 10 },
  winner: 'atlas',
  approvalRationale: 'Atlas Bank: menor CET entre as propostas que cobrem os R$ 8 milhões, com 3 meses de carência e SAC.',
  decisionRationale: 'Atlas Bank escolhido: menor custo total entre as propostas com o valor integral, carência alinhada à safra e garantia já usada na operação.',
  contract: { starts: -660, ends: 85, notice: 60, cost: 'CDI + 3,20% a.a. (CET 19,4% a.a.) · TAC R$ 64 mil · 24 meses, SAC, 3 meses de carência', conditions: 'Cessão fiduciária de 25% dos recebíveis de cartão. Covenant de dívida líquida/EBITDA ≤ 2,5x, apuração semestral. Pré-pagamento sem multa após o 12º mês.' }
};

/** RFQ 1 — revisão da adquirência, concluída: decisão aprovada em duas etapas e contrato vigente. */
export const RFQ_ACQUIRING = {
  key: 'acquiring', product: 'acquiring', start: -75,
  title: 'Adquirência — revisão de MDR e antecipação (R$ 12 milhões/mês)',
  description: 'Concorrência para reduzir o custo efetivo de recebimento em cartões e PIX nas lojas próprias e na loja on-line. O contrato anterior estava no fim da vigência.',
  deadline: -60,
  demand: { monthly_volume: 12000000, average_ticket: 186, share_debit: 22, share_credit_cash: 38, share_credit_installment: 18, average_installments: 3.4, share_pix: 22, channel_presencial: true, channel_ecommerce: true, channel_recurring: false, terminals: 140, settlement_days_target: 2, current_anticipation: 1.45, current_acquirer: 'Credenciadora anterior (contrato no fim da vigência)', notes: 'Prioridade: MDR de crédito à vista e parcelado, antecipação e liquidação em até D+2.' },
  invited: ['nexo', 'lumina', 'atlas'],
  proposals: {
    nexo: [{ note: 'Inclui conciliação automática com o ERP.', terms: { institution: 'Nexo Payments', product_name: 'Nexo Enterprise', mdr_debit: 0.89, mdr_credit_cash: 2.19, mdr_credit_installment: 2.79, pix_fee: 0.49, anticipation_rate: 1.39, terminal_rent: 69, gateway_cost: 450, settlement_days: 2, chargeback_terms: 'Contestação em até 10 dias úteis; tarifa de R$ 15 por chargeback.', contract_months: 24, early_exit_penalty: 60000, extra_services: 'Conciliação automática com o ERP e split de pagamentos.', contracting_days: 15 } }],
    lumina: [
      { note: 'Primeira rodada.', terms: { institution: 'Lumina Pay', product_name: 'Lumina Varejo Pro', mdr_debit: 0.95, mdr_credit_cash: 2.09, mdr_credit_installment: 2.65, pix_fee: 0.45, anticipation_rate: 1.29, terminal_rent: 59, gateway_cost: 0, settlement_days: 1, chargeback_terms: 'Contestação em até 15 dias úteis, sem tarifa nos 3 primeiros meses.', contract_months: 24, early_exit_penalty: 80000, extra_services: 'Link de pagamento e TEF integrado ao ERP.', contracting_days: 10 } },
      { note: 'Versão 2 após a rodada de negociação: MDR parcelado e antecipação revistos para contrato de 24 meses.', terms: { institution: 'Lumina Pay', product_name: 'Lumina Varejo Pro', mdr_debit: 0.89, mdr_credit_cash: 1.99, mdr_credit_installment: 2.39, pix_fee: 0.4, anticipation_rate: 1.19, terminal_rent: 49, gateway_cost: 0, settlement_days: 1, chargeback_terms: 'Contestação em até 15 dias úteis, sem tarifa nos 3 primeiros meses.', contract_months: 24, early_exit_penalty: 80000, extra_services: 'Link de pagamento, TEF integrado ao ERP e conciliação diária.', contracting_days: 10 } }
    ],
    atlas: [{ note: 'Condição vinculada ao domicílio bancário no Atlas.', terms: { institution: 'Atlas Bank', product_name: 'Atlas Recebíveis', mdr_debit: 0.99, mdr_credit_cash: 2.29, mdr_credit_installment: 2.89, pix_fee: 0, anticipation_rate: 1.09, terminal_rent: 79, gateway_cost: 300, settlement_days: 30, chargeback_terms: 'Contestação em até 7 dias úteis.', contract_months: 36, early_exit_penalty: 0, extra_services: 'PIX sem tarifa para correntistas; antecipação automática opcional.', contracting_days: 20 } }]
  },
  weights: { mdr_credit_cash: 30, mdr_credit_installment: 25, anticipation_rate: 20, settlement_days: 15, terminal_rent: 10 },
  winner: 'lumina',
  approvalRationale: 'Lumina Pay v2: menor MDR de crédito à vista e parcelado, liquidação D+1 e antecipação de 1,19% a.m. no mix atual de vendas.',
  decisionRationale: 'Lumina Pay (versão 2): menores MDRs de crédito à vista (1,99%) e parcelado (2,39%), liquidação em D+1 e antecipação a 1,19% a.m. A antecipação do Atlas é menor, mas a liquidação em D+30 não atende ao fluxo de caixa das lojas. Aprovado pelo Controller e pela CFO.',
  contract: { starts: -30, ends: 700, notice: 90, cost: 'MDR débito 0,89% · crédito à vista 1,99% · parcelado 2,39% · PIX 0,40% · antecipação 1,19% a.m. · aluguel R$ 49/terminal', conditions: 'Liquidação em D+1. Contrato de 24 meses; multa rescisória de R$ 80 mil até o 12º mês. Volume mínimo de referência: R$ 10 milhões/mês.' }
};

/** RFQ 2 — crédito em negociação: propostas em estados diferentes e aprovação na etapa da CFO. */
export const RFQ_CREDIT = {
  key: 'credit', product: 'credit', start: -21,
  // Criada a partir do Financial Passport: a RFQ guarda a fotografia destes campos.
  passport: ['annual_revenue', 'sector', 'operating_years', 'collateral'],
  title: 'Capital de giro — nova linha de R$ 12 milhões / 36 meses',
  description: 'Financiamento do capital de giro da nova linha de bebidas vegetais (Rio Verde) e alongamento do perfil da dívida. Substitui a linha vigente com o Atlas Bank, que vence nos próximos três meses.',
  deadline: -3,
  demand: { amount: 12000000, purpose: 'capital_de_giro', term_months: 36, grace_months: 6, annual_revenue: 182000000, sector: 'Alimentos e bebidas', operating_years: 23, collateral: 'Recebíveis de cartão, duplicatas de varejo e equipamentos industriais', urgency: 'media', notes: 'Preferência por carência de 6 meses e covenant semestral.' },
  invited: ['atlas', 'orbe', 'meridian'],
  proposals: {
    atlas: [
      { note: 'Proposta inicial.', terms: { institution: 'Atlas Bank', product_name: 'Capital de giro com cessão de recebíveis', offered_amount: 12000000, interest_rate_month: 1.29, index: 'cdi', index_spread: 3.4, cet_year: 20.8, term_months: 36, grace_months: 6, amortization: 'sac', collateral_required: 'Cessão fiduciária de 30% dos recebíveis de cartão', fees_amount: 96000, declared_total_cost: 17180000, contracting_days: 10, conditions_precedent: 'Covenant: dívida líquida/EBITDA ≤ 2,5x, apuração semestral.', valid_until: 25 } },
      { note: 'Versão 2: TAC reduzida de 0,8% para 0,5% e spread revisto, conforme pedido da tesouraria.', terms: { institution: 'Atlas Bank', product_name: 'Capital de giro com cessão de recebíveis', offered_amount: 12000000, interest_rate_month: 1.24, index: 'cdi', index_spread: 3.1, cet_year: 20.1, term_months: 36, grace_months: 6, amortization: 'sac', collateral_required: 'Cessão fiduciária de 30% dos recebíveis de cartão', fees_amount: 60000, declared_total_cost: 16840000, contracting_days: 10, conditions_precedent: 'Covenant: dívida líquida/EBITDA ≤ 2,5x, apuração semestral.', valid_until: 25 } }
    ],
    orbe: [{ note: 'Limite aprovado em comitê: R$ 10 milhões. CET será confirmado após a análise das garantias.', terms: { institution: 'Orbe Capital', product_name: 'Crédito estruturado de giro', offered_amount: 10000000, interest_rate_month: 1.35, index: 'cdi', index_spread: 3.9, term_months: 36, grace_months: 3, amortization: 'price', collateral_required: 'Aval dos acionistas e cessão de 20% das duplicatas de varejo', fees_amount: 45000, contracting_days: 7, conditions_precedent: 'Covenant: dívida líquida/EBITDA ≤ 2,0x, apuração trimestral.', valid_until: 12 } }]
  },
  // Meridian aceitou o convite e começou a proposta (rascunho salvo), mas não enviou no prazo.
  draftOnly: { meridian: { offered_amount: 12000000, interest_rate_month: 1.33, term_months: 36, institution: 'Meridian Financial' } },
  weights: { interest_rate_month: 35, cet_year: 25, offered_amount: 20, grace_months: 10, fees_amount: 10 },
  winner: 'atlas',
  approvalRationale: 'Atlas Bank v2: valor integral, 6 meses de carência e TAC reduzida para 0,5%. Orbe cobre só R$ 10 milhões e ainda não informou o CET.'
};

/** RFQ 3 — em preparação (rascunho): mostra o começo do fluxo. */
export const RFQ_DRAFT = {
  key: 'draft', product: 'acquiring', start: -1,
  title: 'Pagamentos da loja on-line — PIX e link de pagamento',
  description: 'Rascunho: avaliar gateway de e-commerce com PIX automático e link de pagamento para o canal B2B. Aguardando dados de volume do time digital.',
  deadline: 25,
  demand: { monthly_volume: 1600000, average_ticket: 240, share_credit_cash: 45, share_credit_installment: 20, share_pix: 35, share_debit: 0, average_installments: 2.6, channel_presencial: false, channel_ecommerce: true, channel_recurring: true, settlement_days_target: 2, current_acquirer: 'Lumina Pay (e-commerce incluído no contrato atual)' }
};

/** Comentários contextualizados (texto simples, sem HTML). */
export const COMMENTS = {
  acquiringInternal: [
    ['rafael', 'Montei a comparação com o mix dos últimos 8 meses: crédito à vista e parcelado somam 56% do volume, então são os pesos maiores.', ['juliana']],
    ['juliana', 'Podemos pedir à Lumina redução do MDR parcelado e da antecipação antes da rodada final? Eles estão perto da Nexo.', []],
    ['rafael', 'O fornecedor confirmou liquidação D+1 por escrito no anexo da proposta. Isso resolve a questão de caixa das lojas.', ['carlos']]
  ],
  acquiringToLumina: ['juliana', 'Diego, conseguem chegar a 1,19% a.m. na antecipação e revisar o MDR parcelado para um contrato de 24 meses?'],
  acquiringFromLumina: ['lumina', 'Conseguimos: antecipação a 1,19% a.m. e parcelado a 2,39% com volume mínimo de referência de R$ 10 milhões/mês. Enviamos a versão 2.'],
  creditInternal: [
    ['rafael', 'Atlas e Orbe estão próximos na taxa, mas a Orbe cobre só R$ 10 milhões e não informou o CET. Sem o CET a comparação de custo fica incompleta.', ['juliana']],
    ['juliana', 'Podemos solicitar redução da TAC antes da rodada final? 0,8% sobre R$ 12 milhões pesa no custo do primeiro ano.', ['helena']],
    ['helena', 'Jurídico pediu revisão do covenant financeiro da Orbe: apuração trimestral a 2,0x é apertada para a sazonalidade da safra.', []]
  ],
  creditToAtlas: ['juliana', 'Eduardo, conseguem reduzir a TAC para 0,5% mantendo a carência de 6 meses?'],
  creditFromAtlas: ['atlas', 'Aprovado internamente: TAC de 0,5% e spread de CDI + 3,10% a.a. Versão 2 enviada com a carência mantida.'],
  creditToOrbe: ['rafael', 'Bruno, qual o CET estimado da proposta e o covenant pode ser apurado semestralmente?'],
  creditFromOrbe: ['orbe', 'O CET sai após a análise das garantias, previsto para esta semana. Covenant semestral exige garantia adicional; podemos conversar.'],
  contractRenewal: ['juliana', 'A linha do Atlas vence em menos de 90 dias. A nova concorrência de R$ 12 milhões já cobre a substituição; vamos decidir antes do aviso prévio.', ['helena']]
};

/** Tarefas abertas que um time de tesouraria teria de verdade. */
export const TASKS = [
  { title: 'Revisar covenant de dívida líquida/EBITDA da Orbe Capital com o jurídico', due: 2, related: 'credit' },
  { title: 'Confirmar TAC e tarifas da versão 2 do Atlas Bank antes da aprovação da CFO', due: 1, related: 'credit' },
  { title: 'Anexar minuta da cédula de crédito do Atlas Bank para revisão jurídica', due: 6, related: 'credit' },
  { title: 'Conferir conciliação do primeiro mês com a Lumina Pay (MDR e antecipação aplicados)', due: 4, related: 'acquiringContract' },
  { title: 'Confirmar taxa de antecipação aplicada na primeira liquidação da Lumina Pay', due: -12, related: 'acquiringContract', done: true },
  { title: 'Levantar volume mensal do canal B2B para o rascunho de pagamentos on-line', due: 9, related: 'draft' }
];

/** Documentos (PDFs gerados pelo seed, com aviso de documento fictício no corpo). */
export const DOCUMENTS = [
  { as: 'juliana', entity: 'credit', visibility: 'shared', title: 'Demonstrações financeiras do último exercício — Vitta Foods (auditadas)' },
  { as: 'rafael', entity: 'credit', visibility: 'internal', title: 'Parecer interno da tesouraria — nova linha de capital de giro' },
  { as: 'atlas', entity: 'credit:atlas', visibility: 'shared', title: 'Proposta Atlas Bank — capital de giro v2 (termos indicativos)' },
  { as: 'lumina', entity: 'acquiring:lumina', visibility: 'shared', title: 'Confirmação de liquidação D+1 — Lumina Pay' },
  { as: 'juliana', entity: 'acquiringContract', visibility: 'internal', title: 'Contrato de credenciamento assinado — Lumina Pay' },
  { as: 'juliana', entity: 'creditCurrentContract', visibility: 'internal', title: 'Cédula de crédito bancário — Atlas Bank (linha vigente)' }
];

/**
 * Pós-contrato (lifecycle): implantação, obrigações, performance, spend,
 * qualificação e leitura de documento — tudo fictício e registrado pela API
 * real, com segregação de função (quem registra não revisa).
 * Datas: dias relativos a hoje. Valores sempre em BRL, sem conversão de moeda.
 */
export const LIFECYCLE = {
  implementation: {
    contract: 'acquiring', owner: 'rafael', opener: 'juliana', starts: -28, goLive: 20,
    title: 'Migração da adquirência para a Lumina Pay',
    source: 'Contrato de credenciamento Lumina Pay — cláusula 4 (migração das lojas)',
    completed: [
      ['rafael', 'Checklist de documentação cadastral enviado e aceito pela Lumina (protocolo LUM-ONB-0412, fictício)'],
      ['juliana', 'Parecer jurídico interno sobre o contrato de credenciamento (JUR-2026-118, fictício)']
    ],
    blocker: 'Remessa de 60 terminais para as lojas do Nordeste atrasada pela transportadora; sem os terminais a virada dessas lojas não acontece.',
    issue: { title: 'Atraso na remessa de terminais (lojas do Nordeste)', due: 6 }
  },
  covenants: [
    { key: 'leverage', title: 'Dívida líquida / EBITDA', kind: 'financial_covenant', frequency: 'quarterly', clause: 'Cédula de crédito bancário — cláusula 11.2: dívida líquida / EBITDA ≤ 2,5x, apuração trimestral', reference: 'CCB-ATLAS-11.2', metric: 'Dívida líquida / EBITDA', operator: 'le', threshold: 2.5, unit: 'ratio', grace: 10, firstQuarterBack: 2, lagDays: 3,
      measured: { value: 2.1, by: 'rafael', reference: 'Demonstrações trimestrais revisadas (fictícias)', provenance: 'Dívida líquida de R$ 41,3 mi sobre EBITDA de 12 meses de R$ 19,7 mi, apurados pela controladoria' },
      review: { by: 'juliana', status: 'compliant', reason: 'Cálculo e fontes conferidos pela tesouraria; limiar da cláusula 11.2 mantido.' } },
    { key: 'coverage', title: 'Cobertura de juros (EBITDA / despesa financeira)', kind: 'financial_covenant', frequency: 'once', clause: 'Cédula de crédito bancário — cláusula 11.3: EBITDA / despesa financeira líquida ≥ 2,0x', reference: 'CCB-ATLAS-11.3', metric: 'EBITDA / despesa financeira', operator: 'ge', threshold: 2, unit: 'ratio', start: -120, end: -91, due: -60,
      measured: { value: 1.8, by: 'rafael', reference: 'Fechamento do trimestre (fictício)', provenance: 'EBITDA de R$ 4,6 mi sobre despesa financeira líquida de R$ 2,55 mi no trimestre, apurados pela controladoria' },
      review: { by: 'juliana', status: 'non_compliant', reason: 'Resultado factual abaixo do limiar contratual; seguir com pedido de waiver ao credor.' },
      waiver: { by: 'juliana', until: 25, reason: 'Credor concedeu dispensa temporária por carta (fictícia) em razão da entressafra.', controls: 'Reporte mensal do índice ao credor e revisão semanal do caixa pela tesouraria.',
        decision: { by: 'helena', status: 'approved', reason: 'Carta do credor conferida; controles compensatórios adequados ao prazo.' } } },
    { key: 'reporting', title: 'Entrega das demonstrações financeiras auditadas', kind: 'reporting_covenant', frequency: 'once', clause: 'Cédula de crédito bancário — cláusula 12.1: entrega das demonstrações auditadas em até 120 dias do exercício', reference: 'CCB-ATLAS-12.1', start: -60, end: -30, due: 7 }
  ],
  performance: {
    contract: 'acquiring', opener: 'juliana', measurer: 'rafael', reviewer: 'juliana', start: -28, end: -1, reviewDue: 5,
    title: 'Primeiro mês da Lumina Pay',
    dimensions: [
      { key: 'settlement_sla', title: 'Liquidação em D+1', metric: 'sla_adherence', unit: 'percent', methodology: 'Lotes liquidados em D+1 sobre lotes previstos na agenda de recebíveis do período', operator: 'ge', threshold: '98', source: 'Contrato Lumina Pay — cláusula 7 (liquidação D+1)',
        observation: { availability: 'measured', value: '99.2', source_type: 'imported', reference: 'Agenda de recebíveis Lumina — conciliação do mês (fictícia)', provenance: 'Lotes liquidados em D+1 sobre lotes previstos, conciliados pela tesouraria', covered: 22, expected: 22 }, reviewed: true },
      { key: 'ticket_response', title: 'Resposta a chamados', metric: 'response_time', unit: 'days', methodology: 'Dias úteis entre abertura e primeira resposta do suporte da instituição', operator: 'le', threshold: '2', source: 'Contrato Lumina Pay — anexo III (atendimento)',
        observation: { availability: 'not_available', source_type: 'declared', reference: 'Relatório de chamados não entregue pela Lumina (fictício)', provenance: 'A instituição ainda não enviou o relatório mensal de chamados; ausência não é desempenho bom nem ruim', covered: 0, expected: 1 }, reviewed: false }
    ]
  },
  spend: [
    { contract: 'acquiring', by: 'rafael', start: -28, end: -1, kind: 'observed', amount: '212480.55', sourceType: 'imported', reference: 'Extrato de MDR Lumina Pay — mês corrente (fictício)', line: 'total-mdr', provenance: 'Soma das tarifas de MDR descontadas na agenda de recebíveis do período', reconcile: { by: 'juliana', reason: 'Conferido com a agenda de recebíveis e com a tabela de tarifas; sem lançamento duplicado.' } },
    { contract: 'acquiring', by: 'rafael', start: -28, end: -1, kind: 'contracted', amount: '6860.00', sourceType: 'declared', reference: 'Contrato Lumina Pay — aluguel de terminais', line: 'clausula-5', provenance: '140 terminais × R$ 49,00 por mês, conforme o contrato (valor contratado, não observado)' },
    { contract: 'creditCurrent', by: 'rafael', start: -31, end: -1, kind: 'observed', amount: '118904.10', sourceType: 'declared', reference: 'Extrato de encargos Atlas Bank — mês anterior (fictício)', line: 'encargos', provenance: 'Juros e encargos debitados em conta pelo Atlas Bank no período' }
  ],
  qualification: {
    provider: 'atlas', category: 'credit', opener: 'juliana', owner: 'rafael', reviewDue: 20,
    requirements: [
      { key: 'legal', area: 'legal', title: 'Contrato social, poderes e certidões', critical: true, validity: 365 },
      { key: 'kyb', area: 'compliance', title: 'Verificação KYB e listas de sanções', critical: true, validity: 180 },
      { key: 'security', area: 'security', title: 'Relatório de segurança da informação (SOC 2 ou equivalente)', category: 'credit', validity: 365 }
    ],
    evidence: [
      { requirement: 'legal', by: 'rafael', source: 'provider', reference: 'Contrato social e procurações enviados pelo Atlas Bank (fictícios)', review: { by: 'juliana', status: 'accepted' } },
      { requirement: 'kyb', by: 'rafael', source: 'external_service', service: 'Serviço de KYB contratado pela Vitta (fictício)', reference: 'Relatório KYB ATLAS-2026-09 (fictício)', review: { by: 'juliana', status: 'accepted' } },
      { requirement: 'security', by: 'rafael', source: 'provider', reference: 'Relatório SOC 2 Tipo II — Atlas Bank (fictício)' }
    ]
  },
  extraction: { document: 5, by: 'juliana', schema: 'contract_terms', confirm: ['notice_days', 'currency', 'indexer'] },
  opportunityRules: [
    ['covenant_due', { cooldown_days: 30, lead_days: 30 }],
    ['covenant_awaiting_data', { cooldown_days: 30, lead_days: 30 }],
    ['waiver_expiry', { cooldown_days: 30, lead_days: 30 }],
    ['implementation_blocked', { cooldown_days: 30 }],
    ['contract_renewal', { lead_days: 90, cooldown_days: 30 }],
    ['performance_review_due', { cooldown_days: 30 }]
  ]
};
