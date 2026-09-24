#!/usr/bin/env node
// Semeadura de dados DEMONSTRATIVOS do Arandu Finance.
//
// Gera o SQL de um cenário fictício completo — 1 empresa compradora, 3
// provedores, 1 RFQ de crédito, 1 RFQ de adquirência, propostas, decisão,
// contrato e tarefa — para um ambiente de demonstração ou de ensaio.
//
// Três travas, nesta ordem:
//   1. recusa rodar quando o ambiente é produção (ARANDU_ENV ou VERCEL_ENV);
//   2. por padrão apenas IMPRIME o SQL; aplicar exige --apply e uma URL de
//      banco passada explicitamente em ARANDU_SEED_DATABASE_URL;
//   3. recusa uma URL que pareça de produção.
//
// Tudo que ele cria é nomeado com "DEMO" e pode ser removido com --revert.
// Nenhum dado de empresa real entra neste arquivo.

import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const revert = args.has('--revert');

const environment = String(process.env.ARANDU_ENV || '').trim().toLowerCase();
const vercelEnv = String(process.env.VERCEL_ENV || '').trim().toLowerCase();
if (environment === 'production' || vercelEnv === 'production') {
  console.error('Recusado: dados de demonstração nunca são semeados em produção.');
  process.exit(1);
}
if (environment === 'pilot') {
  console.error('Recusado: o piloto opera com dados reais de uma empresa. Misturar dado DEMO ali destruiria a confiança em tudo que for medido.');
  process.exit(1);
}

const databaseUrl = String(process.env.ARANDU_SEED_DATABASE_URL || '').trim();
if (apply || revert) {
  if (!databaseUrl) {
    console.error('Recusado: defina ARANDU_SEED_DATABASE_URL explicitamente. Este script nunca descobre um banco sozinho.');
    process.exit(1);
  }
  if (/prod|production/i.test(databaseUrl)) {
    console.error('Recusado: a URL informada parece apontar para produção.');
    process.exit(1);
  }
}

// Identificadores estáveis: reaplicar não duplica, e --revert sabe o que tirar.
const NS = '00000000-0000-4000-9000-0000000000';
const ids = {
  buyerUser: `${NS}01`, providerUser1: `${NS}02`, providerUser2: `${NS}03`, providerUser3: `${NS}04`,
  buyerOrg: `${NS}11`, providerOrg1: `${NS}12`, providerOrg2: `${NS}13`, providerOrg3: `${NS}14`,
  provider1: `${NS}21`, provider2: `${NS}22`, provider3: `${NS}23`,
  rfqCredit: `${NS}31`, rfqAcquiring: `${NS}32`,
  inviteA: `${NS}41`, inviteB: `${NS}42`, inviteC: `${NS}43`,
  proposalA: `${NS}51`, proposalB: `${NS}52`, proposalC: `${NS}53`,
  decision: `${NS}61`, contract: `${NS}71`, task: `${NS}81`
};

const DEMO_MARK = 'DEMO';
const q = (value) => (value === null || value === undefined ? 'null' : `'${String(value).replace(/'/g, "''")}'`);
const j = (value) => `${q(JSON.stringify(value))}::jsonb`;

function revertSql() {
  const all = Object.values(ids).map(q).join(', ');
  return `-- Remoção do cenário DEMO do Arandu Finance.
-- Apaga exclusivamente as linhas com os identificadores fixos do seed.
begin;
delete from public.fin_tasks where id in (${all});
delete from public.fin_contracts where id in (${all});
delete from public.fin_decisions where id in (${all});
delete from public.fin_proposal_versions where proposal_id in (${all});
delete from public.fin_proposals where id in (${all});
delete from public.fin_rfq_invites where id in (${all});
delete from public.fin_rfqs where id in (${all});
delete from public.fin_providers where id in (${all});
delete from public.fin_company_profiles where organization_id in (${all});
delete from public.fin_terms_acceptances where organization_id in (${all});
delete from public.fin_events where organization_id in (${all});
delete from public.fin_members where organization_id in (${all});
delete from public.fin_organizations where id in (${all});
delete from auth.users where id in (${all});
commit;
`;
}

function seedSql() {
  const creditTerms = [
    { id: ids.proposalA, provider: ids.provider1, org: ids.providerOrg1, invite: ids.inviteA, user: ids.providerUser1, terms: {
      institution: `Banco Alfa ${DEMO_MARK}`, product_name: 'Capital de giro garantido', offered_amount: 500000,
      interest_rate_month: 1.72, index: 'pre', cet_year: 24.9, term_months: 24, amortization: 'price',
      collateral_required: 'Recebíveis de cartão', fees_amount: 1800, valid_until: '2026-12-05', contracting_days: 12 } },
    { id: ids.proposalB, provider: ids.provider2, org: ids.providerOrg2, invite: ids.inviteB, user: ids.providerUser2, terms: {
      institution: `Fintech Beta ${DEMO_MARK}`, product_name: 'Giro digital', offered_amount: 450000,
      interest_rate_month: 2.10, index: 'pre', term_months: 36, amortization: 'price',
      collateral_required: 'Aval dos sócios', fees_amount: 900, valid_until: '2026-12-20', contracting_days: 5 } },
    { id: ids.proposalC, provider: ids.provider3, org: ids.providerOrg3, invite: ids.inviteC, user: ids.providerUser3, terms: {
      institution: `Crédito Gama ${DEMO_MARK}`, product_name: 'Capital de giro indexado', offered_amount: 500000,
      interest_rate_month: 1.95, index: 'cdi', index_spread: 6.5, term_months: 30, amortization: 'sac',
      collateral_required: 'Imóvel em garantia', fees_amount: 3200, valid_until: '2026-11-30', contracting_days: 25 } }
  ];

  const lines = [`-- Cenário DEMONSTRATIVO do Arandu Finance — gerado por scripts/seed-finance-demo.mjs.
-- Empresas, provedores, propostas e contratos FICTÍCIOS. Nenhuma instituição
-- real é representada e nenhum valor corresponde a condição praticada.
-- Remover com: node scripts/seed-finance-demo.mjs --revert --apply
begin;`];

  lines.push(`insert into auth.users (id, email) values
  (${q(ids.buyerUser)}, 'cfo.demo@exemplo.invalid'),
  (${q(ids.providerUser1)}, 'alfa.demo@exemplo.invalid'),
  (${q(ids.providerUser2)}, 'beta.demo@exemplo.invalid'),
  (${q(ids.providerUser3)}, 'gama.demo@exemplo.invalid')
on conflict (id) do nothing;`);

  lines.push(`insert into public.fin_organizations (id, legal_name, trade_name, kind, country, tax_identifier, sector, revenue_band, created_by) values
  (${q(ids.buyerOrg)}, 'Acme Indústria Ltda. (${DEMO_MARK})', 'Acme ${DEMO_MARK}', 'BUYER', 'BR', '11222333000181', 'Indústria de transformação', '30m_300m', ${q(ids.buyerUser)}),
  (${q(ids.providerOrg1)}, 'Banco Alfa ${DEMO_MARK} S.A.', 'Banco Alfa ${DEMO_MARK}', 'PROVIDER', 'BR', null, null, null, ${q(ids.providerUser1)}),
  (${q(ids.providerOrg2)}, 'Fintech Beta ${DEMO_MARK} Ltda.', 'Fintech Beta ${DEMO_MARK}', 'PROVIDER', 'BR', null, null, null, ${q(ids.providerUser2)}),
  (${q(ids.providerOrg3)}, 'Crédito Gama ${DEMO_MARK} S.A.', 'Crédito Gama ${DEMO_MARK}', 'PROVIDER', 'BR', null, null, null, ${q(ids.providerUser3)})
on conflict (id) do nothing;`);

  lines.push(`insert into public.fin_members (organization_id, user_id, role) values
  (${q(ids.buyerOrg)}, ${q(ids.buyerUser)}, 'admin'),
  (${q(ids.providerOrg1)}, ${q(ids.providerUser1)}, 'admin'),
  (${q(ids.providerOrg2)}, ${q(ids.providerUser2)}, 'admin'),
  (${q(ids.providerOrg3)}, ${q(ids.providerUser3)}, 'admin')
on conflict do nothing;`);

  for (const [key, value, source] of [
    ['faturamento_anual', `R$ 62.000.000 (${DEMO_MARK})`, 'declarado_pela_empresa'],
    ['faturamento_mensal_cartoes', `R$ 1.200.000 (${DEMO_MARK})`, 'extrato'],
    ['setor', `Indústria de transformação (${DEMO_MARK})`, 'declarado_pela_empresa'],
    ['garantias_disponiveis', `Recebíveis de cartão e imóvel próprio (${DEMO_MARK})`, 'declarado_pela_empresa']
  ]) {
    lines.push(`insert into public.fin_company_profiles (organization_id, field_key, field_value, source, updated_by) values (${q(ids.buyerOrg)}, ${q(key)}, ${q(value)}, ${q(source)}, ${q(ids.buyerUser)}) on conflict (organization_id, field_key) do nothing;`);
  }

  lines.push(`insert into public.fin_providers (id, organization_id, provider_organization_id, name, kind, created_by) values
  (${q(ids.provider1)}, ${q(ids.buyerOrg)}, ${q(ids.providerOrg1)}, 'Banco Alfa ${DEMO_MARK}', 'bank', ${q(ids.buyerUser)}),
  (${q(ids.provider2)}, ${q(ids.buyerOrg)}, ${q(ids.providerOrg2)}, 'Fintech Beta ${DEMO_MARK}', 'fintech', ${q(ids.buyerUser)}),
  (${q(ids.provider3)}, ${q(ids.buyerOrg)}, ${q(ids.providerOrg3)}, 'Crédito Gama ${DEMO_MARK}', 'credit_provider', ${q(ids.buyerUser)})
on conflict (id) do nothing;`);

  lines.push(`insert into public.fin_rfqs (id, organization_id, product, title, description, status, owner_id, response_deadline, demand) values
  (${q(ids.rfqCredit)}, ${q(ids.buyerOrg)}, 'credit', 'Capital de giro — R$ 500 mil (${DEMO_MARK})', 'Cenário de demonstração.', 'comparing', ${q(ids.buyerUser)}, current_date + 15, ${j({ amount: 500000, purpose: 'capital_de_giro', term_months: 24, grace_months: 0, annual_revenue: 62000000, sector: 'Indústria de transformação', operating_years: 17, collateral: `Recebíveis de cartão (${DEMO_MARK})`, urgency: 'media' })}),
  (${q(ids.rfqAcquiring)}, ${q(ids.buyerOrg)}, 'acquiring', 'Adquirência — R$ 1,2 milhão/mês (${DEMO_MARK})', 'Cenário de demonstração.', 'collecting', ${q(ids.buyerUser)}, current_date + 10, ${j({ monthly_volume: 1200000, average_ticket: 240, share_debit: 25, share_credit_cash: 40, share_credit_installment: 10, share_pix: 25, average_installments: 4, channel_presencial: true, channel_ecommerce: true, terminals: 12, settlement_days_target: 1 })})
on conflict (id) do nothing;`);

  for (const proposal of creditTerms) {
    lines.push(`insert into public.fin_rfq_invites (id, buyer_organization_id, rfq_id, provider_id, provider_organization_id, token_hash, status, accepted_at, created_by) values (${q(proposal.invite)}, ${q(ids.buyerOrg)}, ${q(ids.rfqCredit)}, ${q(proposal.provider)}, ${q(proposal.org)}, encode(sha256(convert_to(${q(`seed-${proposal.invite}`)}, 'UTF8')), 'hex'), 'accepted', now(), ${q(ids.buyerUser)}) on conflict (id) do nothing;`);
    lines.push(`insert into public.fin_proposals (id, invite_id, rfq_id, buyer_organization_id, provider_id, provider_organization_id, product, status, current_version) values (${q(proposal.id)}, ${q(proposal.invite)}, ${q(ids.rfqCredit)}, ${q(ids.buyerOrg)}, ${q(proposal.provider)}, ${q(proposal.org)}, 'credit', 'submitted', 1) on conflict (id) do nothing;`);
    lines.push(`insert into public.fin_proposal_versions (proposal_id, version, terms, submitted_by) values (${q(proposal.id)}, 1, ${j(proposal.terms)}, ${q(proposal.user)}) on conflict (proposal_id, version) do nothing;`);
  }

  lines.push(`insert into public.fin_decisions (id, organization_id, rfq_id, proposal_id, decided_by, criteria, rationale, snapshot) values (${q(ids.decision)}, ${q(ids.buyerOrg)}, ${q(ids.rfqCredit)}, ${q(ids.proposalA)}, ${q(ids.buyerUser)}, ${j({ weights: { interest_rate_month: 60, term_months: 40 }, decided_by_human: true, source: 'user_weights' })}, 'Decisão de demonstração: menor taxa informada com prazo suficiente.', ${j({ decided_proposal_id: ids.proposalA, decided_version: 1, proposals: creditTerms.map((item) => ({ proposal_id: item.id, version: 1, terms: item.terms })) })}) on conflict (id) do nothing;`);

  lines.push(`insert into public.fin_contracts (id, organization_id, decision_id, proposal_id, provider_id, product, starts_on, ends_on, renewal_notice_days, cost_summary, main_conditions, owner_id) values (${q(ids.contract)}, ${q(ids.buyerOrg)}, ${q(ids.decision)}, ${q(ids.proposalA)}, ${q(ids.provider1)}, 'credit', current_date, current_date + 730, 60, 'Taxa 1,72% a.m. (${DEMO_MARK})', 'Garantia de recebíveis. Dados de demonstração.', ${q(ids.buyerUser)}) on conflict (id) do nothing;`);

  lines.push(`insert into public.fin_tasks (id, organization_id, title, due_on, related_type, related_id, created_by) values (${q(ids.task)}, ${q(ids.buyerOrg)}, 'Revisar renovação do contrato antes do aviso prévio (${DEMO_MARK})', current_date + 670, 'contract', ${q(ids.contract)}, ${q(ids.buyerUser)}) on conflict (id) do nothing;`);

  lines.push('commit;');
  return lines.join('\n\n') + '\n';
}

const sql = revert ? revertSql() : seedSql();

if (!apply) {
  console.log(sql);
  console.error('');
  console.error(revert
    ? 'SQL de remoção impresso. Para aplicar: ARANDU_SEED_DATABASE_URL=… node scripts/seed-finance-demo.mjs --revert --apply'
    : 'SQL de demonstração impresso. Para aplicar: ARANDU_SEED_DATABASE_URL=… node scripts/seed-finance-demo.mjs --apply');
  process.exit(0);
}

const result = spawnSync('psql', [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-q', '-f', '-'], {
  input: sql, encoding: 'utf8'
});
if (result.error) {
  console.error(`Falha ao executar psql: ${result.error.message}`);
  process.exit(1);
}
if (result.stdout) process.stdout.write(result.stdout);
if (result.status !== 0) {
  console.error(result.stderr || 'psql terminou com erro.');
  process.exit(result.status ?? 1);
}
console.log(revert
  ? 'Cenário de demonstração removido.'
  : `Cenário de demonstração aplicado: 1 empresa, 3 provedores, 2 RFQs, 3 propostas, 1 decisão, 1 contrato e 1 tarefa — todos marcados ${DEMO_MARK}.`);
