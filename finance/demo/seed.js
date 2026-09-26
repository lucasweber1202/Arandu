// Conjunto de dados da demonstração interativa.
//
// Tudo aqui é FICTÍCIO: empresas, instituições, pessoas, CNPJ, taxas e prazos.
// Nenhum nome corresponde a uma instituição real, todo nome de organização
// carrega o sufixo "— DEMO" e os e-mails usam o domínio reservado
// `.invalid` (RFC 2606), que nunca entrega mensagem.
//
// As datas são relativas ao momento em que a demonstração é iniciada, para que
// "encerra esta semana" e "entra em renovação" continuem verdadeiros em
// qualquer dia em que alguém abrir o produto.

export const DEMO_SEED_ID = 'acme-2026-09-v2';

const DAY = 86400000;

export function demoId(group, n) {
  return `de000000-0000-4000-8000-${String(group).padStart(4, '0')}${String(n).padStart(8, '0')}`;
}

export const U = Object.freeze({
  marina: demoId(1, 1), ricardo: demoId(1, 2), helena: demoId(1, 3), joao: demoId(1, 4),
  camila: demoId(1, 11), rafael: demoId(1, 12), bianca: demoId(1, 13), tiago: demoId(1, 14), luana: demoId(1, 15)
});
export const O = Object.freeze({
  acme: demoId(2, 1), atlas: demoId(2, 11), horizonte: demoId(2, 12), nexa: demoId(2, 13), orbe: demoId(2, 14), cadencia: demoId(2, 15)
});
export const P = Object.freeze({
  atlas: demoId(3, 1), horizonte: demoId(3, 2), nexa: demoId(3, 3), orbe: demoId(3, 4), cadencia: demoId(3, 5), trevo: demoId(3, 6)
});
export const R = Object.freeze({
  capital: demoId(4, 1), acquiring: demoId(4, 2), anticipation: demoId(4, 3), expansion: demoId(4, 4),
  refinancing: demoId(4, 5), ecommerce: demoId(4, 6), capital2025: demoId(4, 7), overdraft: demoId(4, 8)
});
export const C = Object.freeze({ ecommerce: demoId(9, 1), capital2025: demoId(9, 2), legacy: demoId(9, 3) });

/** Personas selecionáveis. Trocar de persona é simulação de produto, nunca autorização real. */
export const PERSONAS = Object.freeze({
  buyer: { key: 'buyer', label: 'Comprador', user: U.marina, organization: O.acme, audience: 'company' },
  approver: { key: 'approver', label: 'Aprovador', user: U.ricardo, organization: O.acme, audience: 'company' },
  provider: { key: 'provider', label: 'Provedor', user: U.camila, organization: O.atlas, audience: 'provider' },
  admin: { key: 'admin', label: 'Administração', user: U.helena, organization: O.acme, audience: 'company' }
});

export function createSeed(now = new Date()) {
  const base = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12);
  const day = (offset) => new Date(base + offset * DAY).toISOString().slice(0, 10);
  const at = (offset, hour = 10, minute = 0) => new Date(base + offset * DAY + (hour - 12) * 3600000 + minute * 60000).toISOString();
  let seq = 0;
  const nextId = (group) => demoId(group, 900 + (++seq));

  const users = [
    { id: U.marina, name: 'Marina Costa', title: 'Gerente Financeira', email: 'marina.costa@acme-demo.invalid' },
    { id: U.ricardo, name: 'Ricardo Alves', title: 'CFO', email: 'ricardo.alves@acme-demo.invalid' },
    { id: U.helena, name: 'Helena Prado', title: 'Controller', email: 'helena.prado@acme-demo.invalid' },
    { id: U.joao, name: 'João Mendes', title: 'Analista de Tesouraria', email: 'joao.mendes@acme-demo.invalid' },
    { id: U.camila, name: 'Camila Rocha', title: 'Gerente de Relacionamento PJ', email: 'camila.rocha@atlas-demo.invalid' },
    { id: U.rafael, name: 'Rafael Nunes', title: 'Gerente de Contas', email: 'rafael.nunes@horizonte-demo.invalid' },
    { id: U.bianca, name: 'Bianca Teles', title: 'Executiva Comercial', email: 'bianca.teles@nexa-demo.invalid' },
    { id: U.tiago, name: 'Tiago Moura', title: 'Especialista em Adquirência', email: 'tiago.moura@orbe-demo.invalid' },
    { id: U.luana, name: 'Luana Freitas', title: 'Gerente Comercial', email: 'luana.freitas@cadencia-demo.invalid' }
  ];

  const organizations = [
    { id: O.acme, legal_name: 'Acme Indústria Ltda. — DEMO', trade_name: 'Acme Embalagens — DEMO', kind: 'BUYER', country: 'BR',
      sector: 'Indústria de embalagens', revenue_band: '30m_300m', tax_identifier: '00000000000100', employees: 420, created_at: at(-420) },
    { id: O.atlas, legal_name: 'Atlas Bank — DEMO', trade_name: 'Atlas Bank — DEMO', kind: 'PROVIDER', country: 'BR', created_at: at(-400) },
    { id: O.horizonte, legal_name: 'Banco Horizonte Sul — DEMO', trade_name: 'Horizonte Sul — DEMO', kind: 'PROVIDER', country: 'BR', created_at: at(-400) },
    { id: O.nexa, legal_name: 'Nexa Crédito — DEMO', trade_name: 'Nexa Crédito — DEMO', kind: 'PROVIDER', country: 'BR', created_at: at(-380) },
    { id: O.orbe, legal_name: 'Orbe Pagamentos — DEMO', trade_name: 'Orbe Pagamentos — DEMO', kind: 'PROVIDER', country: 'BR', created_at: at(-360) },
    { id: O.cadencia, legal_name: 'Cadência Adquirência — DEMO', trade_name: 'Cadência — DEMO', kind: 'PROVIDER', country: 'BR', created_at: at(-360) }
  ];

  const members = [
    { organization_id: O.acme, user_id: U.marina, role: 'finance_manager', created_at: at(-420) },
    { organization_id: O.acme, user_id: U.helena, role: 'admin', created_at: at(-420) },
    { organization_id: O.acme, user_id: U.ricardo, role: 'viewer', created_at: at(-410) },
    { organization_id: O.acme, user_id: U.joao, role: 'finance_manager', created_at: at(-200) },
    { organization_id: O.atlas, user_id: U.camila, role: 'provider_user', created_at: at(-400) },
    { organization_id: O.horizonte, user_id: U.rafael, role: 'provider_user', created_at: at(-400) },
    { organization_id: O.nexa, user_id: U.bianca, role: 'provider_user', created_at: at(-380) },
    { organization_id: O.orbe, user_id: U.tiago, role: 'provider_user', created_at: at(-360) },
    { organization_id: O.cadencia, user_id: U.luana, role: 'provider_user', created_at: at(-360) }
  ];

  const provider = (id, org, name, kind, region, products) => ({
    id, organization_id: O.acme, provider_organization_id: org, name, kind, status: 'active',
    verification_state: 'NAO_VERIFICADO', region, website: null, products,
    notes: 'Instituição fictícia criada para a demonstração.', created_at: at(-300)
  });
  const providers = [
    provider(P.atlas, O.atlas, 'Atlas Bank — DEMO', 'bank', 'Nacional', ['credit', 'acquiring']),
    provider(P.horizonte, O.horizonte, 'Banco Horizonte Sul — DEMO', 'bank', 'Sul e Sudeste', ['credit']),
    provider(P.nexa, O.nexa, 'Nexa Crédito — DEMO', 'credit_provider', 'Nacional', ['credit']),
    provider(P.orbe, O.orbe, 'Orbe Pagamentos — DEMO', 'acquirer', 'Nacional', ['acquiring']),
    provider(P.cadencia, O.cadencia, 'Cadência Adquirência — DEMO', 'acquirer', 'Nacional', ['acquiring']),
    provider(P.trevo, null, 'Trevo Capital — DEMO', 'fintech', 'Sudeste', ['credit'])
  ];

  const capitalRev = [
    { title: 'Capital de giro — R$ 2,5 milhões', description: 'Recomposição do capital de giro para o ciclo de compra de resina do 4º trimestre.',
      demand: { amount: 2500000, purpose: 'capital_de_giro', term_months: 24, grace_months: 0, annual_revenue: 186000000, sector: 'Indústria de embalagens', operating_years: 27, collateral: 'Recebíveis de cartão e duplicatas', urgency: 'media' },
      response_deadline: day(4) },
    { title: 'Capital de giro — R$ 3 milhões', description: 'Recomposição do capital de giro para o ciclo de compra de resina do 4º trimestre. Valor ampliado após revisão do orçamento de compras.',
      demand: { amount: 3000000, purpose: 'capital_de_giro', term_months: 24, grace_months: 0, annual_revenue: 186000000, sector: 'Indústria de embalagens', operating_years: 27, collateral: 'Recebíveis de cartão e duplicatas', urgency: 'media' },
      response_deadline: day(4) },
    { title: 'Capital de giro — R$ 3 milhões', description: 'Recomposição do capital de giro para o ciclo de compra de resina do 4º trimestre. Valor ampliado após revisão do orçamento de compras. Carência de 3 meses para alinhar com a sazonalidade.',
      demand: { amount: 3000000, purpose: 'capital_de_giro', term_months: 24, grace_months: 3, annual_revenue: 186000000, sector: 'Indústria de embalagens', operating_years: 27, collateral: 'Recebíveis de cartão e duplicatas', urgency: 'alta' },
      response_deadline: day(9) }
  ];
  const acquiringDemand = {
    monthly_volume: 8000000, average_ticket: 420, share_debit: 22, share_credit_cash: 38, share_credit_installment: 30,
    average_installments: 4.2, share_pix: 10, channel_presencial: true, channel_ecommerce: true, channel_recurring: false,
    terminals: 64, settlement_days_target: 2, current_anticipation: 1.79, current_acquirer: 'Adquirente atual — DEMO'
  };

  const rfq = (id, fields) => ({ id, organization_id: O.acme, owner_id: U.marina, revision: 1, description: null, ...fields });
  const rfqs = [
    rfq(R.capital, { product: 'credit', ...capitalRev[2], status: 'comparing', revision: 3, created_at: at(-12, 9), updated_at: at(-5, 16) }),
    rfq(R.acquiring, { product: 'acquiring', title: 'Revisão de adquirência — R$ 8 milhões/mês', status: 'collecting',
      description: 'Revisão das condições de MDR, PIX, antecipação e prazo de liquidação para lojas físicas e e-commerce.',
      demand: acquiringDemand, response_deadline: day(3), created_at: at(-8, 11), updated_at: at(-8, 11) }),
    rfq(R.anticipation, { product: 'credit', title: 'Antecipação de recebíveis — R$ 1,2 milhão', status: 'open',
      description: 'Antecipação pontual de recebíveis de cartão para cobrir o 13º salário.',
      demand: { amount: 1200000, purpose: 'antecipacao_recebiveis', term_months: 6, annual_revenue: 186000000, urgency: 'alta', collateral: 'Agenda de recebíveis de cartão' },
      response_deadline: day(6), created_at: at(-3, 14), updated_at: at(-3, 14) }),
    rfq(R.expansion, { product: 'credit', title: 'Financiamento da expansão da fábrica 2', status: 'draft', owner_id: U.joao,
      description: 'Financiamento de máquinas para a nova linha de extrusão. Aguardando orçamento final dos fornecedores.',
      demand: { amount: 5000000, purpose: 'expansao', term_months: 60, grace_months: 6 },
      response_deadline: day(21), created_at: at(-1, 17), updated_at: at(-1, 17) }),
    rfq(R.refinancing, { product: 'credit', title: 'Refinanciamento de CCB — R$ 1,8 milhão', status: 'decided',
      description: 'Refinanciamento da CCB contratada em 2024 para alongar o prazo.',
      demand: { amount: 1800000, purpose: 'refinanciamento', term_months: 36, urgency: 'baixa' },
      response_deadline: day(-9), created_at: at(-34), updated_at: at(-2, 15) }),
    rfq(R.ecommerce, { product: 'acquiring', title: 'Adquirência do e-commerce — 2025', status: 'contracted',
      description: 'Contratação de adquirente para a loja virtual.',
      demand: { monthly_volume: 1500000, average_ticket: 380, share_debit: 5, share_credit_cash: 45, share_credit_installment: 40, share_pix: 10, channel_ecommerce: true, terminals: 0 },
      response_deadline: day(-330), created_at: at(-360), updated_at: at(-310) }),
    // Segundo caso para o aprovador: duas propostas, empate na taxa e campos faltando.
    rfq(R.overdraft, { product: 'credit', title: 'Conta garantida — R$ 800 mil', status: 'comparing', owner_id: U.joao,
      description: 'Limite rotativo de segurança para o caixa das filiais durante a troca do sistema de cobrança.',
      demand: { amount: 800000, purpose: 'capital_de_giro', term_months: 12, annual_revenue: 186000000, urgency: 'media', collateral: 'Aval dos sócios' },
      response_deadline: day(-2), created_at: at(-15, 10), updated_at: at(-2, 18) }),
    rfq(R.capital2025, { product: 'credit', title: 'Capital de giro — 2º semestre de 2025', status: 'contracted',
      demand: { amount: 2000000, purpose: 'capital_de_giro', term_months: 24 },
      response_deadline: day(-135), created_at: at(-150), updated_at: at(-120) })
  ];

  const rfqRevisions = [
    ...capitalRev.map((snapshot, index) => ({
      rfq_id: R.capital, revision: index + 1, snapshot: { title: snapshot.title, description: snapshot.description, demand: snapshot.demand, response_deadline: snapshot.response_deadline },
      changed_by: U.marina, published_at: at([-12, -10, -5][index], [9, 15, 16][index])
    })),
    ...rfqs.filter((row) => row.id !== R.capital).map((row) => ({
      rfq_id: row.id, revision: 1, snapshot: { title: row.title, description: row.description, demand: row.demand, response_deadline: row.response_deadline },
      changed_by: row.owner_id, published_at: row.created_at
    }))
  ];

  const invite = (id, rfqId, providerId, providerOrg, status, created) => ({
    id, rfq_id: rfqId, buyer_organization_id: O.acme, provider_id: providerId, provider_organization_id: status === 'invited' ? null : providerOrg,
    status, token: `${'d'.repeat(32)}${String(id).replaceAll('-', '')}`, created_at: at(created), accepted_at: status === 'accepted' ? at(created + 0.2) : null,
    expires_at: at(created + 30)
  });
  const invites = [
    invite(demoId(5, 1), R.capital, P.atlas, O.atlas, 'accepted', -12),
    invite(demoId(5, 2), R.capital, P.horizonte, O.horizonte, 'accepted', -12),
    invite(demoId(5, 3), R.capital, P.nexa, O.nexa, 'accepted', -12),
    invite(demoId(5, 4), R.acquiring, P.orbe, O.orbe, 'accepted', -8),
    invite(demoId(5, 5), R.acquiring, P.cadencia, O.cadencia, 'accepted', -8),
    invite(demoId(5, 6), R.acquiring, P.atlas, O.atlas, 'accepted', -8),
    invite(demoId(5, 7), R.anticipation, P.nexa, O.nexa, 'invited', -3),
    invite(demoId(5, 8), R.anticipation, P.horizonte, O.horizonte, 'invited', -3),
    invite(demoId(5, 9), R.anticipation, P.atlas, O.atlas, 'invited', -2),
    invite(demoId(5, 10), R.refinancing, P.nexa, O.nexa, 'accepted', -34),
    invite(demoId(5, 11), R.refinancing, P.horizonte, O.horizonte, 'accepted', -34),
    invite(demoId(5, 12), R.ecommerce, P.cadencia, O.cadencia, 'accepted', -358),
    invite(demoId(5, 13), R.capital2025, P.horizonte, O.horizonte, 'accepted', -150),
    invite(demoId(5, 14), R.overdraft, P.horizonte, O.horizonte, 'accepted', -15),
    invite(demoId(5, 15), R.overdraft, P.nexa, O.nexa, 'accepted', -15)
  ];

  const proposal = (id, inviteRow, product, status, version, created) => ({
    id, invite_id: inviteRow.id, rfq_id: inviteRow.rfq_id, buyer_organization_id: O.acme, provider_id: inviteRow.provider_id,
    provider_organization_id: inviteRow.provider_organization_id, product, status, current_version: version,
    created_at: at(created), updated_at: at(created)
  });
  const [iCapAtlas, iCapHor, iCapNexa, iAcqOrbe, iAcqCad, iAcqAtlas, , , , iRefNexa, iRefHor, iEcoCad, iCap25Hor, iOdHor, iOdNexa] = invites;
  const proposals = [
    proposal(demoId(6, 1), iCapAtlas, 'credit', 'revised', 2, -9),
    proposal(demoId(6, 2), iCapHor, 'credit', 'submitted', 1, -5),
    proposal(demoId(6, 3), iCapNexa, 'credit', 'submitted', 1, -9),
    proposal(demoId(6, 4), iAcqOrbe, 'acquiring', 'submitted', 1, -6),
    proposal(demoId(6, 5), iAcqCad, 'acquiring', 'submitted', 1, -2),
    proposal(demoId(6, 6), iAcqAtlas, 'acquiring', 'draft', 0, -7),
    proposal(demoId(6, 7), iRefNexa, 'credit', 'submitted', 1, -20),
    proposal(demoId(6, 8), iRefHor, 'credit', 'submitted', 1, -18),
    proposal(demoId(6, 9), iEcoCad, 'acquiring', 'submitted', 1, -340),
    proposal(demoId(6, 10), iCap25Hor, 'credit', 'submitted', 1, -140),
    proposal(demoId(6, 11), iOdHor, 'credit', 'submitted', 1, -6),
    proposal(demoId(6, 12), iOdNexa, 'credit', 'submitted', 1, -4)
  ];

  const common = (institution, productName, validDays, contracting) => ({
    institution, product_name: productName, valid_until: day(validDays), contracting_days: contracting
  });
  const version = (proposalId, number, terms, rfqRevision, submittedBy, submittedAt, note = null) => ({
    proposal_id: proposalId, version: number, terms, note, submitted_by: submittedBy, submitted_at: submittedAt, rfq_revision: rfqRevision
  });
  const proposalVersions = [
    version(demoId(6, 1), 1, { offered_amount: 3000000, interest_rate_month: 1.45, index: 'pre', cet_year: 20.6, term_months: 24, grace_months: 0,
      amortization: 'price', collateral_required: 'Cessão fiduciária de 30% dos recebíveis de cartão', fees_amount: 18000,
      ...common('Atlas Bank — DEMO', 'Capital de Giro PJ Atlas — DEMO', 20, 7) }, 2, U.camila, at(-9, 11)),
    version(demoId(6, 1), 2, { offered_amount: 3000000, interest_rate_month: 1.39, index: 'pre', cet_year: 19.8, term_months: 24, grace_months: 3,
      amortization: 'price', collateral_required: 'Cessão fiduciária de 30% dos recebíveis de cartão', fees_amount: 18000,
      conditions_precedent: 'Aprovação do comitê de crédito e registro da cessão em até 5 dias úteis.',
      ...common('Atlas Bank — DEMO', 'Capital de Giro PJ Atlas — DEMO', 21, 7) }, 3, U.camila, at(-4, 10), 'Atualizada para a carência de 3 meses da revisão 3.'),
    version(demoId(6, 2), 1, { offered_amount: 2500000, interest_rate_month: 1.29, index: 'pre', cet_year: 18.4, term_months: 24, grace_months: 0,
      amortization: 'sac', collateral_required: 'Aval dos sócios e aplicação financeira de 10%', fees_amount: 12500,
      notes: 'Valor limitado a R$ 2,5 milhões pela política de exposição do banco.',
      ...common('Banco Horizonte Sul — DEMO', 'Giro Fácil Empresas — DEMO', 15, 12) }, 3, U.rafael, at(-5, 9)),
    version(demoId(6, 3), 1, { offered_amount: 3000000, interest_rate_month: 1.55, index: 'cdi', index_spread: 6.9, term_months: 30, grace_months: 6,
      amortization: 'price', collateral_required: 'Recebíveis de cartão', fees_amount: 9000,
      ...common('Nexa Crédito — DEMO', 'Nexa Giro Flex — DEMO', 10, 3) }, 2, U.bianca, at(-9, 15)),
    version(demoId(6, 4), 1, { mdr_debit: 0.89, mdr_credit_cash: 2.19, mdr_credit_installment: 2.79, pix_fee: 0.49, anticipation_rate: 1.49,
      terminal_rent: 39.9, gateway_cost: 0, settlement_days: 2, chargeback_terms: 'Contestação em até 10 dias úteis, com portal próprio.',
      contract_months: 24, early_exit_penalty: 25000, extra_services: 'Conciliação e split de pagamento incluídos.',
      ...common('Orbe Pagamentos — DEMO', 'Orbe Varejo Omnicanal — DEMO', 25, 15) }, 1, U.tiago, at(-6, 14)),
    version(demoId(6, 5), 1, { mdr_debit: 0.95, mdr_credit_cash: 2.05, mdr_credit_installment: 2.99, pix_fee: 0.39, anticipation_rate: 1.59,
      terminal_rent: 0, gateway_cost: 490, settlement_days: 1, chargeback_terms: 'Contestação em até 7 dias úteis.',
      contract_months: 36, early_exit_penalty: 60000,
      ...common('Cadência Adquirência — DEMO', 'Cadência Pro — DEMO', 30, 10) }, 1, U.luana, at(-2, 10)),
    version(demoId(6, 7), 1, { offered_amount: 1800000, interest_rate_month: 1.62, index: 'pre', cet_year: 22.1, term_months: 36, amortization: 'price', fees_amount: 7000,
      ...common('Nexa Crédito — DEMO', 'Nexa Refin — DEMO', -2, 5) }, 1, U.bianca, at(-20)),
    version(demoId(6, 8), 1, { offered_amount: 1800000, interest_rate_month: 1.48, index: 'pre', cet_year: 20.3, term_months: 36, amortization: 'sac', fees_amount: 11000,
      ...common('Banco Horizonte Sul — DEMO', 'Refin PJ — DEMO', 3, 10) }, 1, U.rafael, at(-18)),
    version(demoId(6, 9), 1, { mdr_debit: 0.99, mdr_credit_cash: 2.15, mdr_credit_installment: 2.89, pix_fee: 0.45, anticipation_rate: 1.69, gateway_cost: 390, settlement_days: 2,
      contract_months: 12, ...common('Cadência Adquirência — DEMO', 'Cadência Online — DEMO', -320, 10) }, 1, U.luana, at(-340)),
    version(demoId(6, 10), 1, { offered_amount: 2000000, interest_rate_month: 1.42, index: 'pre', cet_year: 19.9, term_months: 24, amortization: 'price', fees_amount: 10000,
      ...common('Banco Horizonte Sul — DEMO', 'Giro Fácil Empresas — DEMO', -120, 8) }, 1, U.rafael, at(-140)),
    version(demoId(6, 11), 1, { offered_amount: 800000, interest_rate_month: 2.49, index: 'pre', cet_year: 36.2, term_months: 12, amortization: 'bullet', fees_amount: 4000,
      collateral_required: 'Aval dos sócios', ...common('Banco Horizonte Sul — DEMO', 'Conta Garantida PJ — DEMO', 12, 5) }, 1, U.rafael, at(-6, 11)),
    version(demoId(6, 12), 1, { offered_amount: 600000, interest_rate_month: 2.49, index: 'pre', term_months: 12, fees_amount: 0,
      ...common('Nexa Crédito — DEMO', 'Nexa Limite Rotativo — DEMO', 10, 2) }, 1, U.bianca, at(-4, 16), 'Limite inicial de R$ 600 mil, revisável após 90 dias.')
  ];
  const proposalDrafts = [
    { proposal_id: demoId(6, 6), base_version: 0, revision: 1, updated_at: at(-1, 18),
      terms: { institution: 'Atlas Bank — DEMO', product_name: 'Atlas Adquirência Integrada — DEMO', mdr_debit: 0.92, mdr_credit_cash: 2.1 } }
  ];

  const approvals = [
    { id: demoId(7, 1), organization_id: O.acme, rfq_id: R.capital, proposal_id: demoId(6, 1), proposal_version: 2,
      requested_by: U.marina, requested_at: at(-1, 9, 30), status: 'pending', resolved_at: null, rfq_updated_at: at(-5, 16),
      rationale: 'Atlas oferece o valor integral com carência de 3 meses e a menor tarifa relativa ao prazo. Horizonte tem taxa menor, mas limita o valor a R$ 2,5 milhões.',
      steps: [
        { id: demoId(7, 101), position: 1, approver_id: U.helena, status: 'approved', comment: 'Garantias conferidas com o jurídico.', acted_at: at(-1, 14) },
        { id: demoId(7, 102), position: 2, approver_id: U.ricardo, status: 'pending', comment: null, acted_at: null }
      ] },
    { id: demoId(7, 2), organization_id: O.acme, rfq_id: R.refinancing, proposal_id: demoId(6, 8), proposal_version: 1,
      requested_by: U.marina, requested_at: at(-4, 10), status: 'approved', resolved_at: at(-3, 11), rfq_updated_at: at(-34),
      rationale: 'Horizonte com menor taxa e SAC, reduzindo o custo total.',
      steps: [{ id: demoId(7, 201), position: 1, approver_id: U.ricardo, status: 'approved', comment: 'De acordo.', acted_at: at(-3, 11) }] },
    { id: demoId(7, 3), organization_id: O.acme, rfq_id: R.overdraft, proposal_id: demoId(6, 11), proposal_version: 1,
      requested_by: U.joao, requested_at: at(-1, 16), status: 'pending', resolved_at: null, rfq_updated_at: at(-2, 18),
      rationale: 'Mesma taxa nas duas propostas. Horizonte cobre o valor integral de R$ 800 mil; Nexa limita a R$ 600 mil e não informou o CET.',
      steps: [{ id: demoId(7, 301), position: 1, approver_id: U.ricardo, status: 'pending', comment: null, acted_at: null }] }
  ];

  const decisions = [
    { id: demoId(8, 1), organization_id: O.acme, rfq_id: R.refinancing, proposal_id: demoId(6, 8), proposal_version: 1, decided_by: U.marina,
      decided_at: at(-2, 15), criteria: { weights: { interest_rate_month: 60, fees_amount: 20, contracting_days: 20 }, source: 'user_weights', decided_by_human: true },
      rationale: 'Menor taxa informada e amortização SAC. Aprovado pelo CFO.', snapshot: { proposals: [demoId(6, 7), demoId(6, 8)] } },
    { id: demoId(8, 2), organization_id: O.acme, rfq_id: R.ecommerce, proposal_id: demoId(6, 9), proposal_version: 1, decided_by: U.marina,
      decided_at: at(-315), criteria: { weights: {}, source: 'manual', decided_by_human: true }, rationale: 'Única proposta com gateway integrado.', snapshot: {} },
    { id: demoId(8, 3), organization_id: O.acme, rfq_id: R.capital2025, proposal_id: demoId(6, 10), proposal_version: 1, decided_by: U.marina,
      decided_at: at(-125), criteria: { weights: {}, source: 'manual', decided_by_human: true }, rationale: 'Condição renovada com o banco de relacionamento.', snapshot: {} }
  ];

  const contracts = [
    { id: C.ecommerce, organization_id: O.acme, decision_id: demoId(8, 2), rfq_id: R.ecommerce, proposal_id: demoId(6, 9), provider_id: P.cadencia,
      provider_name: 'Cadência Adquirência — DEMO', product: 'acquiring', status: 'active', owner_id: U.marina,
      starts_on: day(-285), ends_on: day(80), renewal_notice_days: 60,
      cost_summary: 'MDR crédito à vista 2,15% · débito 0,99% · PIX 0,45% · gateway R$ 390/mês',
      main_conditions: 'Liquidação em D+2. Multa rescisória de R$ 15 mil antes de 12 meses.', document_reference: null, created_at: at(-310) },
    { id: C.capital2025, organization_id: O.acme, decision_id: demoId(8, 3), rfq_id: R.capital2025, proposal_id: demoId(6, 10), provider_id: P.horizonte,
      provider_name: 'Banco Horizonte Sul — DEMO', product: 'credit', status: 'active', owner_id: U.marina,
      starts_on: day(-120), ends_on: day(610), renewal_notice_days: 90,
      cost_summary: '1,42% a.m. pré · CET 19,9% a.a. · 24 parcelas', main_conditions: 'Amortização PRICE, sem carência.', document_reference: null, created_at: at(-120) },
    { id: C.legacy, organization_id: O.acme, decision_id: null, rfq_id: null, proposal_id: null, provider_id: P.orbe,
      provider_name: 'Orbe Pagamentos — DEMO', product: 'acquiring', status: 'expired', owner_id: U.marina,
      starts_on: day(-1100), ends_on: day(-370), renewal_notice_days: 30,
      cost_summary: 'Contrato anterior de adquirência das lojas físicas.', main_conditions: null, document_reference: null, created_at: at(-1100) }
  ];
  const renewalMilestones = [
    { contract_id: C.ecommerce, milestone: 'd90', due_on: day(-10), processed_at: at(-10, 7), task_id: demoId(10, 1) }
  ];

  const task = (n, title, due, related, relatedId, assignee = U.marina, status = 'open') => ({
    id: demoId(10, n), organization_id: O.acme, title, due_on: due, status, related_type: related, related_id: relatedId,
    assignee_id: assignee, created_at: at(-6)
  });
  const tasks = [
    task(1, 'Decidir renovação — adquirência do e-commerce', day(15), 'contract', C.ecommerce),
    task(2, 'Conferir garantias exigidas pela Atlas', day(1), 'rfq', R.capital, U.joao),
    task(3, 'Atualizar faturamento anual no perfil financeiro', day(-2), null, null),
    task(4, 'Registrar contrato do refinanciamento', day(5), 'rfq', R.refinancing),
    task(5, 'Enviar política de crédito atualizada ao comitê', day(-10), null, null, U.helena, 'done')
  ];

  const comment = (n, objectId, author, visibility, body, offset, extra = {}) => ({
    id: demoId(11, n), organization_id: O.acme, object_type: 'rfq', object_id: objectId, author_id: author, visibility, body,
    created_at: at(offset[0], offset[1], offset[2] || 0), parent_id: null, mention_ids: [], ...extra
  });
  const comments = [
    comment(1, R.capital, U.marina, 'internal', 'Horizonte limitou a R$ 2,5 milhões. Precisaríamos complementar com outra linha se escolhermos a menor taxa. @Ricardo Alves consegue olhar antes da reunião de quinta?', [-4, 11], { mention_ids: [U.ricardo] }),
    comment(2, R.capital, U.ricardo, 'internal', 'Prefiro não dividir em duas operações agora. Vamos seguir com o valor integral se a garantia da Atlas passar no jurídico.', [-4, 15], { parent_id: demoId(11, 1) }),
    comment(3, R.capital, U.bianca, 'provider_visible', 'Vocês aceitam garantia 100% em recebíveis de cartão, sem duplicatas?', [-8, 10], { organization_id: O.acme }),
    comment(4, R.capital, U.marina, 'provider_visible', 'Aceitamos, desde que a trava não passe de 30% da agenda mensal.', [-8, 16], { parent_id: demoId(11, 3) }),
    comment(5, R.acquiring, U.joao, 'internal', 'O PIX representa 10% hoje, mas deve crescer. Vale pedir condição escalonada.', [-6, 9])
  ];

  const notification = (n, user, org, eventType, objectType, objectId, title, body, offset, read = false) => ({
    id: demoId(12, n), organization_id: org, user_id: user, event_type: eventType, object_type: objectType, object_id: objectId,
    title, body, created_at: at(offset[0], offset[1], offset[2] || 0), read_at: read ? at(offset[0], offset[1] + 1) : null
  });
  const notifications = [
    notification(1, U.ricardo, O.acme, 'approval_requested', 'rfq', R.capital, 'Aprovação aguardando você', 'Capital de giro — R$ 3 milhões · etapa 2 de 2', [-1, 14, 5]),
    notification(2, U.ricardo, O.acme, 'mention', 'rfq', R.capital, 'Marina Costa mencionou você', 'Capital de giro — R$ 3 milhões', [-4, 11]),
    notification(4, U.ricardo, O.acme, 'approval_requested', 'rfq', R.overdraft, 'Aprovação aguardando você', 'Conta garantida — R$ 800 mil · etapa 1 de 1', [-1, 16, 2]),
    notification(3, U.ricardo, O.acme, 'approval_approved', 'rfq', R.refinancing, 'Aprovação concluída', 'Refinanciamento de CCB — R$ 1,8 milhão', [-3, 11], true),
    notification(10, U.marina, O.acme, 'proposal_received', 'rfq', R.acquiring, 'Nova proposta recebida', 'Cadência Adquirência — DEMO respondeu a Revisão de adquirência', [-2, 10, 5]),
    notification(11, U.marina, O.acme, 'renewal_due', 'contract', C.ecommerce, 'Contrato entrou na janela de renovação', 'Adquirência do e-commerce · aviso prévio em 20 dias', [-10, 7]),
    notification(12, U.marina, O.acme, 'proposal_revised', 'rfq', R.capital, 'Proposta revisada', 'Atlas Bank — DEMO enviou a versão 2 para a revisão 3', [-4, 10, 2], true),
    notification(13, U.marina, O.acme, 'comment', 'rfq', R.capital, 'Novo comentário de provedor', 'Nexa Crédito — DEMO perguntou sobre garantias', [-8, 10], true),
    notification(14, U.marina, O.acme, 'approval_approved', 'rfq', R.refinancing, 'Aprovação concluída', 'Refinanciamento de CCB — R$ 1,8 milhão · registre a decisão', [-3, 11], true),
    notification(15, U.joao, O.acme, 'task_assigned', 'rfq', R.capital, 'Tarefa atribuída a você', 'Conferir garantias exigidas pela Atlas', [-6, 9]),
    notification(20, U.camila, O.atlas, 'invite_received', 'invite', demoId(5, 9), 'Novo convite para cotar', 'Acme Indústria Ltda. — DEMO · Antecipação de recebíveis', [-2, 9]),
    notification(21, U.camila, O.atlas, 'deadline', 'rfq', R.acquiring, 'Prazo se aproximando', 'Revisão de adquirência encerra em 3 dias e sua proposta ainda é rascunho', [0, 8]),
    notification(22, U.camila, O.atlas, 'rfq_revised', 'rfq', R.capital, 'Solicitação revisada', 'Capital de giro está na revisão 3', [-5, 16, 10], true)
  ];

  const preferences = [];

  const event = (entityType, entityId, eventType, actor, offset, metadata = {}) => ({
    id: nextId(13), organization_id: O.acme, entity_type: entityType, entity_id: entityId, event_type: eventType,
    actor_id: actor, happened_at: at(offset[0], offset[1], offset[2] || 0), metadata
  });
  const events = [
    event('rfq', R.capital, 'rfq_created', U.marina, [-12, 9]),
    event('rfq', R.capital, 'rfq_open', U.marina, [-12, 9, 20]),
    event('rfq', R.capital, 'provider_invited', U.marina, [-12, 9, 25], { provider: 'Atlas Bank — DEMO' }),
    event('rfq', R.capital, 'provider_invited', U.marina, [-12, 9, 26], { provider: 'Banco Horizonte Sul — DEMO' }),
    event('rfq', R.capital, 'provider_invited', U.marina, [-12, 9, 27], { provider: 'Nexa Crédito — DEMO' }),
    event('rfq', R.capital, 'rfq_revised', U.marina, [-10, 15], { revision: 2, previous_revision: 1 }),
    event('rfq', R.capital, 'proposal_submitted', U.camila, [-9, 11], { provider: 'Atlas Bank — DEMO', version: 1, rfq_revision: 2 }),
    event('rfq', R.capital, 'proposal_submitted', U.bianca, [-9, 15], { provider: 'Nexa Crédito — DEMO', version: 1, rfq_revision: 2 }),
    event('rfq', R.capital, 'rfq_revised', U.marina, [-5, 16], { revision: 3, previous_revision: 2 }),
    event('rfq', R.capital, 'proposal_submitted', U.rafael, [-5, 9], { provider: 'Banco Horizonte Sul — DEMO', version: 1, rfq_revision: 3 }),
    event('rfq', R.capital, 'proposal_revised', U.camila, [-4, 10], { provider: 'Atlas Bank — DEMO', version: 2, rfq_revision: 3 }),
    event('rfq', R.capital, 'rfq_comparing', U.marina, [-3, 9]),
    event('rfq', R.capital, 'approval_requested', U.marina, [-1, 9, 30], { proposal: 'Atlas Bank — DEMO' }),
    event('rfq', R.capital, 'approval_step_approved', U.helena, [-1, 14], { position: 1 }),
    event('rfq', R.acquiring, 'rfq_created', U.marina, [-8, 11]),
    event('rfq', R.acquiring, 'rfq_open', U.marina, [-8, 11, 10]),
    event('rfq', R.acquiring, 'provider_invited', U.marina, [-8, 11, 15], { provider: 'Orbe Pagamentos — DEMO' }),
    event('rfq', R.acquiring, 'provider_invited', U.marina, [-8, 11, 16], { provider: 'Cadência Adquirência — DEMO' }),
    event('rfq', R.acquiring, 'provider_invited', U.marina, [-8, 11, 17], { provider: 'Atlas Bank — DEMO' }),
    event('rfq', R.acquiring, 'proposal_submitted', U.tiago, [-6, 14], { provider: 'Orbe Pagamentos — DEMO', version: 1, rfq_revision: 1 }),
    event('rfq', R.acquiring, 'proposal_submitted', U.luana, [-2, 10], { provider: 'Cadência Adquirência — DEMO', version: 1, rfq_revision: 1 }),
    event('rfq', R.anticipation, 'rfq_created', U.marina, [-3, 14]),
    event('rfq', R.anticipation, 'rfq_open', U.marina, [-3, 14, 5]),
    event('rfq', R.expansion, 'rfq_created', U.joao, [-1, 17]),
    event('rfq', R.overdraft, 'rfq_created', U.joao, [-15, 10]),
    event('rfq', R.overdraft, 'rfq_open', U.joao, [-15, 10, 5]),
    event('rfq', R.overdraft, 'proposal_submitted', U.rafael, [-6, 11], { provider: 'Banco Horizonte Sul — DEMO', version: 1, rfq_revision: 1 }),
    event('rfq', R.overdraft, 'proposal_submitted', U.bianca, [-4, 16], { provider: 'Nexa Crédito — DEMO', version: 1, rfq_revision: 1 }),
    event('rfq', R.overdraft, 'rfq_comparing', U.joao, [-2, 18]),
    event('rfq', R.overdraft, 'approval_requested', U.joao, [-1, 16], { steps: 1 }),
    event('rfq', R.refinancing, 'decision_recorded', U.marina, [-2, 15], { provider: 'Banco Horizonte Sul — DEMO' }),
    event('contract', C.ecommerce, 'renewal_task_created', null, [-10, 7], { milestone: 'd90' })
  ];

  const profile = [
    ['faturamento_anual', 'R$ 186 milhões', 'documento_interno', -210, null],
    ['faturamento_mensal_cartoes', 'R$ 8 milhões', 'extrato', -20, null],
    ['setor', 'Indústria de embalagens', 'declarado_pela_empresa', -60, null],
    ['funcionarios', '420', 'declarado_pela_empresa', -60, null],
    ['fundacao', '1998', 'documento_interno', -300, null],
    ['bancos_atuais', 'Banco Horizonte Sul — DEMO, Atlas Bank — DEMO', 'declarado_pela_empresa', -45, null],
    ['adquirente_atual', 'Cadência Adquirência — DEMO', 'contrato_vigente', -30, null],
    ['garantias_disponiveis', 'Recebíveis de cartão, duplicatas e imóvel da fábrica 1', 'declarado_pela_empresa', -160, null]
  ].map(([field_key, field_value, source, offset, valid], index) => ({
    id: demoId(14, index + 1), organization_id: O.acme, field_key, field_value, source, status: 'informado', valid_until: valid, updated_at: at(offset)
  }));

  // Documentos: só metadados fictícios. Nenhum arquivo existe na demonstração.
  const doc = (n, fields, versions) => ({
    document: { id: demoId(15, n), current_version: versions.length, created_at: versions[0].at, removed_at: null, ...fields },
    versions: versions.map((row, index) => ({ document_id: demoId(15, n), version: index + 1, mime_type: row.mime, size_bytes: row.size,
      status: 'available', uploaded_by: row.by, completed_at: row.at }))
  });
  const docs = [
    doc(1, { organization_id: O.acme, buyer_organization_id: O.acme, entity_type: 'rfq', entity_id: R.capital, rfq_id: R.capital, title: 'Balanço patrimonial 2025', visibility: 'internal', created_by: U.marina },
      [{ mime: 'application/pdf', size: 1842211, by: U.marina, at: at(-12, 9, 30) }, { mime: 'application/pdf', size: 1907330, by: U.joao, at: at(-6, 11) }]),
    doc(2, { organization_id: O.acme, buyer_organization_id: O.acme, entity_type: 'rfq', entity_id: R.capital, rfq_id: R.capital, title: 'Minuta de garantias aceitas', visibility: 'shared', created_by: U.marina },
      [{ mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 84512, by: U.marina, at: at(-8, 17) }]),
    doc(3, { organization_id: O.atlas, buyer_organization_id: O.acme, entity_type: 'proposal', entity_id: demoId(6, 1), rfq_id: R.capital, title: 'Term sheet Atlas — capital de giro', visibility: 'shared', created_by: U.camila },
      [{ mime: 'application/pdf', size: 402118, by: U.camila, at: at(-4, 10, 5) }]),
    doc(4, { organization_id: O.acme, buyer_organization_id: O.acme, entity_type: 'contract', entity_id: C.ecommerce, rfq_id: R.ecommerce, title: 'Contrato assinado — Cadência', visibility: 'internal', created_by: U.helena },
      [{ mime: 'application/pdf', size: 2511040, by: U.helena, at: at(-300) }])
  ];

  return {
    documents: docs.map((row) => row.document), document_versions: docs.flatMap((row) => row.versions),
    users, organizations, members, providers, rfqs, rfq_revisions: rfqRevisions, invites, proposals,
    proposal_versions: proposalVersions, proposal_drafts: proposalDrafts, editor_drafts: [],
    approvals, policies: [{ organization_id: O.acme, required_for_decision: true, updated_at: at(-90), updated_by: U.helena }],
    decisions, contracts, renewal_milestones: renewalMilestones, tasks, comments, notifications, preferences, events, profile,
    terms: [{ organization_id: O.acme, terms_version: '2026-08-01-demo', context: 'test', accepted_at: at(-50), user_id: U.helena }],
    simulated_emails: []
  };
}
