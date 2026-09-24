#!/usr/bin/env node
// Smoke test de piloto do Arandu Finance.
//
// Percorre a jornada inteira — empresa, perfil, RFQ, provedor, convite,
// proposta, comparação, decisão, contrato — pela MESMA função que a API usa em
// produção, com o Supabase substituído por um roteiro. O que ele prova é que a
// fiação está inteira: cada passo emite a chamada certa, com a carga certa, na
// ordem certa.
//
// Ele não substitui `npm run test:database`, que exercita RLS e concorrência
// contra PostgreSQL real. Os dois respondem perguntas diferentes.
//
// Nenhum dado real é usado e nenhum ambiente de produção é tocado: o teste não
// lê SUPABASE_URL do ambiente, ele define o seu próprio valor inválido.

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { Readable } from 'node:stream';
import { handleFinance } from '../lib/api/domains/finance.mjs';
import { PRODUCT_IDS } from '../lib/finance/products.mjs';

process.env.SUPABASE_URL = 'https://supabase.pilot-smoke.invalid';
process.env.SUPABASE_ANON_KEY = 'pilot-smoke-anon-key';
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const id = (suffix) => `00000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const BUYER = id(1);
const PROVIDER_ORG = id(2);
const PROVIDER = id(3);
const RFQ = id(4);
const PROPOSAL = id(5);
const DECISION = id(6);
const CONTRACT = id(7);
const ACTOR = id(8);

const steps = [];
let sent = [];
let responder = () => [];

globalThis.fetch = async (url, options = {}) => {
  const entry = { url: String(url), method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null };
  sent.push(entry);
  return new Response(JSON.stringify(responder(entry)), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

function request(method, path, body) {
  return Object.assign(Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []), {
    method, url: `/api/finance/${path}`, headers: {}
  });
}
function response() {
  return { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(value) { this.payload = JSON.parse(value); } };
}
const deps = {
  requireUser: async () => ({ user: { id: ACTOR }, accessToken: 'pilot-smoke-jwt', headers: {} }),
  enforceRateLimit: async () => {}
};

async function step(name, { method, path, body, respond, check }) {
  sent = [];
  responder = respond || (() => []);
  const res = response();
  const route = path.split('?')[0];
  await handleFinance(request(method, path, body), res, route, deps);
  if (check) check(res.payload, sent);
  steps.push(name);
  console.log(`  ok  ${name}`);
}

const orgRow = (kind) => [{ id: kind === 'PROVIDER' ? PROVIDER_ORG : BUYER, legal_name: 'Piloto Smoke', kind, country: 'BR' }];
const isOrg = (entry) => entry.url.includes('fin_organizations');

console.log('Arandu Finance — Pilot Smoke Test');
console.log('');
console.log('Jornada da empresa compradora:');

await step('catálogo de produtos responde sem tocar o banco', {
  method: 'GET', path: 'products',
  check: (payload, calls) => {
    assert.deepEqual(payload.products.map((product) => product.id), PRODUCT_IDS);
    assert.equal(calls.length, 0);
  }
});

await step('organização compradora é criada', {
  method: 'POST', path: 'organizations', body: { legal_name: 'Empresa Piloto SMOKE', kind: 'BUYER' },
  respond: () => [BUYER],
  check: (payload, calls) => {
    assert.equal(payload.ok, true);
    assert.ok(calls.some((entry) => entry.url.includes('rpc/fin_create_organization')));
  }
});

await step('cadastro da empresa é completado com CNPJ conferido', {
  method: 'PATCH', path: 'organizations',
  body: { organization_id: BUYER, trade_name: 'Piloto', tax_identifier: '11.222.333/0001-81', sector: 'Indústria', revenue_band: '30m_300m' },
  respond: (entry) => (isOrg(entry) ? orgRow('BUYER') : []),
  check: (payload, calls) => {
    assert.deepEqual(payload.tax_identifier, { format_valid: true, externally_verified: false });
    const call = calls.find((entry) => entry.url.includes('rpc/fin_update_organization'));
    assert.equal(call.body.p_tax_identifier, '11222333000181');
  }
});

await step('perfil financeiro reutilizável recebe um campo', {
  method: 'POST', path: 'profile',
  body: { organization_id: BUYER, field_key: 'faturamento_anual', field_value: 'R$ 62.000.000', source: 'declarado_pela_empresa' },
  respond: (entry) => (isOrg(entry) ? orgRow('BUYER') : [{ id: id(20) }]),
  check: (payload, calls) => {
    const write = calls.find((entry) => entry.method === 'POST' && entry.url.includes('fin_company_profiles'));
    assert.equal(write.body.updated_by, ACTOR);
  }
});

await step('termos do piloto são aceitos com versão registrada', {
  method: 'POST', path: 'terms',
  body: { organization_id: BUYER, terms_version: '2026-09-23-pilot' },
  respond: (entry) => (isOrg(entry) ? orgRow('BUYER') : []),
  check: (payload, calls) => {
    const call = calls.find((entry) => entry.url.includes('rpc/fin_accept_terms'));
    assert.equal(call.body.p_version, '2026-09-23-pilot');
  }
});

await step('provedor é cadastrado pela empresa', {
  method: 'POST', path: 'providers',
  body: { organization_id: BUYER, name: 'Banco Piloto SMOKE', kind: 'bank' },
  respond: (entry) => (isOrg(entry) ? orgRow('BUYER') : [{ id: PROVIDER }]),
  check: (payload, calls) => {
    const write = calls.find((entry) => entry.method === 'POST' && entry.url.includes('fin_providers'));
    // Estado de verificação nunca vem do cliente.
    assert.ok(!('verification_state' in write.body));
  }
});

await step('RFQ de crédito é criada em rascunho', {
  method: 'POST', path: 'rfqs',
  body: {
    organization_id: BUYER, product: 'credit', title: 'Capital de giro SMOKE',
    demand: { amount: 500000, purpose: 'capital_de_giro', term_months: 24 }
  },
  respond: (entry) => (isOrg(entry) ? orgRow('BUYER') : [RFQ]),
  check: (payload, calls) => {
    const call = calls.find((entry) => entry.url.includes('rpc/fin_create_rfq'));
    assert.equal(call.body.p_demand.amount, 500000);
  }
});

await step('RFQ é aberta pela máquina de estados', {
  method: 'POST', path: 'transition', body: { kind: 'rfq', id: RFQ, from: 'draft', status: 'open' },
  check: (payload, calls) => {
    assert.ok(calls.some((entry) => entry.url.includes('rpc/fin_transition')));
  }
});

await step('provedor é convidado e o token só existe na resposta', {
  method: 'POST', path: 'invites/send', body: { rfq_id: RFQ, provider_id: PROVIDER },
  respond: (entry) => (entry.url.includes('fin_rfqs') ? [{ id: RFQ, organization_id: BUYER, product: 'credit', status: 'open' }] : 'a'.repeat(64)),
  check: (payload) => {
    assert.equal(String(payload.invitationToken).length, 64);
  }
});

console.log('');
console.log('Jornada do provedor:');

await step('organização provedora aceita o convite', {
  method: 'POST', path: 'invites/accept',
  body: { token: 'a'.repeat(64), provider_organization_id: PROVIDER_ORG },
  respond: (entry) => (isOrg(entry) ? orgRow('PROVIDER') : [id(9)]),
  check: (payload, calls) => {
    const call = calls.find((entry) => entry.url.includes('rpc/fin_accept_provider_invite'));
    // A organização provedora é confirmada por membresia antes de ir ao banco.
    assert.equal(call.body.p_provider_org, PROVIDER_ORG);
  }
});

await step('provedor enxerga a necessidade da RFQ atribuída', {
  method: 'GET', path: `assignments?organization_id=${PROVIDER_ORG}`,
  respond: (entry) => {
    if (isOrg(entry)) return orgRow('PROVIDER');
    if (entry.url.includes('fin_proposal_versions')) return [];
    if (entry.url.includes('fin_proposals')) return [{ id: PROPOSAL, rfq_id: RFQ, product: 'credit', status: 'draft', current_version: 0 }];
    if (entry.url.includes('fin_rfqs')) return [{ id: RFQ, title: 'Capital de giro SMOKE', product: 'credit', status: 'open', demand: { amount: 500000 } }];
    return [];
  },
  check: (payload) => {
    assert.equal(payload.rows[0].demand.amount, 500000);
    assert.ok(!/notes|comparison|weights/i.test(JSON.stringify(payload)));
  }
});

await step('proposta é enviada e vira versão 1', {
  method: 'POST', path: 'proposals',
  body: {
    proposal_id: PROPOSAL,
    terms: { institution: 'Banco Piloto SMOKE', product_name: 'Giro', offered_amount: 500000, interest_rate_month: 1.72, term_months: 24 }
  },
  respond: (entry) => (entry.url.includes('fin_proposals') && entry.method === 'GET'
    ? [{ id: PROPOSAL, product: 'credit', status: 'draft', provider_organization_id: PROVIDER_ORG }]
    : 1),
  check: (payload, calls) => {
    assert.equal(payload.version, 1);
    const call = calls.find((entry) => entry.url.includes('rpc/fin_submit_proposal'));
    assert.ok(!('mdr_debit' in call.body.p_terms));
  }
});

console.log('');
console.log('Comparação, decisão e contrato:');

const comparisonWorld = (entry) => {
  if (isOrg(entry)) return orgRow('BUYER');
  if (entry.url.includes('fin_rfqs')) return [{ id: RFQ, organization_id: BUYER, product: 'credit', status: 'comparing', demand: { amount: 500000 } }];
  if (entry.url.includes('fin_proposal_versions')) return [
    { proposal_id: PROPOSAL, version: 1, terms: { institution: 'Banco Piloto SMOKE', interest_rate_month: 1.72, term_months: 24 }, submitted_at: '2026-09-23T00:00:00Z' },
    { proposal_id: id(10), version: 1, terms: { institution: 'Fintech Piloto SMOKE', interest_rate_month: 2.1, term_months: 36 }, submitted_at: '2026-09-23T00:00:00Z' }
  ];
  if (entry.url.includes('fin_proposals')) return [
    { id: PROPOSAL, rfq_id: RFQ, provider_id: PROVIDER, provider_organization_id: PROVIDER_ORG, status: 'submitted', current_version: 1 },
    { id: id(10), rfq_id: RFQ, provider_id: id(11), provider_organization_id: id(12), status: 'submitted', current_version: 1 }
  ];
  if (entry.url.includes('fin_providers')) return [{ id: PROVIDER, name: 'Banco Piloto SMOKE', kind: 'bank' }, { id: id(11), name: 'Fintech Piloto SMOKE', kind: 'fintech' }];
  return [];
};

await step('comparação é factual e não ordena sozinha', {
  method: 'POST', path: 'comparison', body: { rfq_id: RFQ }, respond: comparisonWorld,
  check: (payload) => {
    assert.equal(payload.comparison.columns.length, 2);
    assert.equal(payload.weighted.applied, false);
    assert.ok(payload.comparison.notice.includes('não recomenda'));
    const rate = payload.comparison.rows.find((row) => row.key === 'interest_rate_month');
    assert.deepEqual(rate.highlights, [PROPOSAL]);
    assert.equal(rate.highlight_reason, 'menor valor informado');
  }
});

await step('pesos definidos pela empresa produzem resultado rotulado como dela', {
  method: 'POST', path: 'comparison', body: { rfq_id: RFQ, weights: { interest_rate_month: 60, term_months: 40 } }, respond: comparisonWorld,
  check: (payload) => {
    assert.equal(payload.weighted.applied, true);
    assert.equal(payload.weighted.notice, 'Resultado conforme os pesos definidos por você.');
    assert.equal(payload.weighted.ranking_meaningful, true);
    assert.ok(payload.weighted.results.every((row) => typeof row.coverage === 'number'));
  }
});

await step('decisão humana é registrada com critérios', {
  method: 'POST', path: 'decisions',
  body: { rfq_id: RFQ, proposal_id: PROPOSAL, rationale: 'Menor taxa informada.', criteria: { weights: { interest_rate_month: 60 } } },
  respond: (entry) => (entry.url.includes('fin_rfqs') ? [{ id: RFQ, organization_id: BUYER, product: 'credit', status: 'comparing' }] : DECISION),
  check: (payload, calls) => {
    const call = calls.find((entry) => entry.url.includes('rpc/fin_record_decision'));
    assert.equal(call.body.p_criteria.decided_by_human, true);
    assert.equal(call.body.p_criteria.weights.interest_rate_month, 60);
  }
});

await step('contrato é registrado a partir da decisão', {
  method: 'POST', path: 'contracts',
  body: { decision_id: DECISION, starts_on: '2026-10-01', ends_on: '2028-10-01', renewal_notice_days: 60 },
  respond: (entry) => (isOrg(entry) ? orgRow('BUYER') : CONTRACT),
  check: (payload, calls) => {
    const call = calls.find((entry) => entry.url.includes('rpc/fin_register_contract'));
    assert.equal(call.body.p_notice, 60);
  }
});

await step('contrato devolve a janela de renovação calculada', {
  method: 'GET', path: `contracts?organization_id=${BUYER}`,
  respond: (entry) => (isOrg(entry) ? orgRow('BUYER') : [{ id: CONTRACT, product: 'credit', status: 'active', ends_on: '2028-10-01', renewal_notice_days: 60 }]),
  check: (payload) => {
    assert.equal(payload.rows[0].review_from, '2028-08-02');
  }
});

await step('exportação do processo é factual e sem recomendação', {
  method: 'GET', path: `export?rfq_id=${RFQ}`,
  respond: (entry) => {
    if (entry.url.includes('fin_decisions')) return [{ id: DECISION, rfq_id: RFQ, proposal_id: PROPOSAL, decided_at: '2026-09-23T00:00:00Z', criteria: {}, rationale: 'Menor taxa informada.', snapshot: { decided_version: 1, proposals: [] } }];
    return comparisonWorld(entry);
  },
  check: (payload) => {
    assert.equal(payload.export.rfq.id, RFQ);
    assert.equal(payload.export.proposals.length, 2);
    assert.ok(payload.export.notice.includes('não recomenda'));
    assert.ok(!/recomenda(ção|do)_do_arandu|recommended|best_provider/i.test(JSON.stringify(payload.export)));
  }
});

// ------------------------------------------------- superfície publicada

console.log('');
console.log('Superfície publicada e migrations:');

const pages = [
  'dist/finance/index.html', 'dist/finance/dashboard.html', 'dist/finance/rfqs.html', 'dist/finance/rfq.html',
  'dist/finance/providers.html', 'dist/finance/proposals.html', 'dist/finance/contracts.html',
  'dist/finance/settings.html', 'dist/finance/boundaries.html',
  'dist/provider/index.html', 'dist/provider/invite.html', 'dist/provider/rfqs.html', 'dist/provider/proposal.html'
];
const missingPages = pages.filter((page) => !existsSync(page));
if (missingPages.length) {
  console.log(`  aviso  build ausente (rode npm run build): ${missingPages.length} página(s) não encontradas em dist/`);
} else {
  const invite = readFileSync('dist/provider/invite.html', 'utf8');
  assert.ok(!invite.includes('vercel-speed-insights'), 'a página de convite não pode carregar analytics');
  assert.ok(invite.includes('name="referrer" content="no-referrer"'), 'a página de convite precisa declarar no-referrer');
  console.log(`  ok  ${pages.length} páginas publicadas, convite sem analytics e com no-referrer`);
}

const manifest = JSON.parse(readFileSync('docs/supabase-migrations.json', 'utf8'));
for (const flow of Object.keys(manifest)) {
  for (const required of [
    'docs/supabase-financial-procurement.sql',
    'docs/supabase-financial-procurement-hardening.sql',
    'docs/supabase-financial-pilot.sql'
  ]) {
    assert.ok(manifest[flow].includes(required), `${required} ausente no fluxo ${flow}`);
  }
}
console.log('  ok  as três migrations financeiras estão nos dois fluxos canônicos');

console.log('');
console.log(`Pilot smoke test: ${steps.length} passos da jornada aprovados.`);
console.log('Este teste prova a fiação da jornada. RLS, isolamento e concorrência são cobertos por npm run test:database.');
