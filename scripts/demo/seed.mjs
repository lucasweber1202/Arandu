#!/usr/bin/env node
// Seed e reset da demonstração canônica do Arandu (Vitta Foods S.A.).
//
//   npm run demo:seed    → semeia um banco DEMO vazio (ou já marcado e sem a Vitta)
//   npm run demo:reset   → apaga SÓ os dados da demonstração e semeia de novo
//   npm run demo:check   → só as checagens de sanidade, sem escrever
//
// Princípio: a demonstração é um cliente fictício bem preparado DENTRO do
// produto real. Tudo o que é dado de negócio passa pela API do Arandu
// (`/api/finance/*`), com a sessão de cada persona, o RLS do Postgres e as
// mesmas funções SQL que um cliente real usa — nada de INSERT que pule regra de
// domínio. A service role aparece só onde um operador agiria pelo painel do
// Supabase: criar as contas das personas, liberar os domínios fictícios na
// allowlist, gravar o marcador do banco, apagar no reset e, no fim, ajustar as
// datas de criação para a linha do tempo da história (os registros nascem
// "hoje" e são reposicionados no passado, preservando a ordem entre eles).
//
// Travas contra produção: lib/finance/demo-guard.mjs (resumo em docs/demo/RESET.md).
// Variáveis: ARANDU_ENV=demo, ARANDU_DEMO_CONFIRM, SUPABASE_URL, SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY, ARANDU_DEMO_APP_URL, ARANDU_DEMO_PASSWORD e,
// opcional, CRON_SECRET (marcos de renovação pelo cron real).
import crypto from 'node:crypto';
import {
  assertDemoTarget, assertDemoDatabase, assertDemoApplication, DemoGuardError,
  DEMO_EMAIL_DOMAINS, DEMO_MARKER_KEY, DEMO_MARKER_VALUE, isDemoEmail
} from '../../lib/finance/demo-guard.mjs';
import * as data from './dataset.mjs';
import { PASSPORT_TO_DEMAND } from '../../lib/finance/passport.mjs';
import { demoPdf } from './pdf.mjs';
import { schemaField } from '../../lib/finance/document-intelligence.mjs';

const args = new Set(process.argv.slice(2));
const MODE = args.has('--check') ? 'check' : args.has('--reset') ? 'reset' : 'seed';
const QUIET = args.has('--quiet');
const log = (...parts) => { if (!QUIET) console.log(...parts); };

let config;
try {
  config = assertDemoTarget(process.env);
} catch (error) {
  if (error instanceof DemoGuardError) {
    console.error('Seed da demonstração recusado. Nada foi escrito.');
    for (const reason of error.reasons) console.error(`  - ${reason}`);
    console.error('Veja docs/demo/RESET.md.');
    process.exit(2);
  }
  throw error;
}
const { supabaseUrl: SB, serviceKey: SERVICE, anonKey: ANON, appUrl: APP, password: PASSWORD } = config;
const CRON = String(process.env.CRON_SECRET || '').trim();
const DAY = 86_400_000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const must = (condition, message) => { if (!condition) throw new Error(message); };

// ----------------------------------------------------------- service role
async function service(path, { method = 'GET', body, prefer, base = 'rest/v1' } = {}) {
  const headers = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(`${SB}/${base}/${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  if (!response.ok) throw new Error(`${method} ${path.split('?')[0]}: ${response.status} ${payload?.message || payload?.msg || payload?.error || ''}`.trim());
  return { payload, headers: response.headers };
}
const inList = (ids) => `in.(${ids.join(',')})`;
async function count(table, filter = '') {
  const { headers } = await service(`${table}?select=*${filter ? `&${filter}` : ''}`, { method: 'HEAD', prefer: 'count=exact' });
  return Number(String(headers.get('content-range') || '').split('/')[1]);
}

// ------------------------------------------------------- personas e sessão
const people = {};
for (const [key, person] of Object.entries(data.BUYERS)) people[key] = { ...person, key, side: 'buyer' };
for (const [key, provider] of Object.entries(data.PROVIDERS)) people[key] = { ...provider.person, key, side: 'provider', role: 'admin' };
for (const person of Object.values(people)) must(isDemoEmail(person.email), `e-mail fora dos domínios fictícios: ${person.email}`);

async function listDemoUsers() {
  const users = [];
  for (let page = 1; page <= 20; page += 1) {
    const { payload } = await service(`admin/users?page=${page}&per_page=500`, { base: 'auth/v1' });
    const batch = payload?.users || [];
    users.push(...batch);
    if (batch.length < 500) break;
  }
  return users.filter((user) => isDemoEmail(user.email));
}

async function signIn(person) {
  const response = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: person.email, password: PASSWORD })
  });
  const session = await response.json();
  must(response.ok && session.access_token, `login de ${person.name}: ${response.status}`);
  // Mesmo formato do cookie HttpOnly que /api/auth/login emite.
  person.cookie = `arandu_session=${encodeURIComponent(Buffer.from(JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token, expires_at: Math.floor(Date.now() / 1000) + 3000 })).toString('base64url'))}`;
  person.id = session.user.id;
}

/** Chamada à API real do Arandu com a sessão da pessoa. Respeita o rate limit (espera e repete). */
async function api(person, method, path, body) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await fetch(`${APP}/api/finance/${path}`, {
      method, headers: { Origin: APP, 'Content-Type': 'application/json', Cookie: person.cookie },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const text = await response.text();
    let payload = {};
    try { payload = JSON.parse(text); } catch { payload = { raw: text.slice(0, 200) }; }
    const refreshed = (response.headers.getSetCookie?.() || []).find((value) => value.startsWith('arandu_session='));
    if (refreshed) person.cookie = refreshed.split(';')[0];
    if (response.status === 429) {
      log(`  · limite de requisições da API atingido (${person.name}); aguardando 30 s e repetindo`);
      await sleep(30_000);
      continue;
    }
    if (response.status >= 300 || payload.ok === false) {
      throw new Error(`${method} ${path.split('?')[0]} como ${person.name}: ${response.status} ${payload.code || ''} ${payload.error || ''}`.trim());
    }
    return payload;
  }
  throw new Error(`${method} ${path} como ${person.name}: limite de requisições persistente`);
}
const post = (person, path, body) => api(person, 'POST', path, body);

// --------------------------------------------------------- linha do tempo
// Cada passo da história é marcado com (instante real, instante narrativo).
// Depois da semeadura, todo carimbo de tempo criado pelo seed é reposicionado
// por interpolação linear entre os marcos: a ordem real dos acontecimentos é
// preservada em todas as tabelas, e a história ganha datas plausíveis.
const today = new Date(); today.setUTCHours(0, 0, 0, 0);
const isoDate = (offset) => new Date(today.getTime() + offset * DAY).toISOString().slice(0, 10);
const marks = [];
// Cada passo tem dois marcos: o início (horário narrativo do passo) e o fim,
// quando o passo seguinte começa. As ações de um passo duram segundos de
// verdade e viram alguns minutos na história (1 s real = 30 s narrativos), e o
// intervalo entre passos (só espera, sem escrita) absorve os dias de diferença.
function closeStep() {
  const last = marks.at(-1);
  if (last) marks.push({ real: Date.now(), narrative: last.narrative + Math.min((Date.now() - last.real) * 30, 2 * 3600_000) });
}
async function at(dayOffset, hhmm = '10:00') {
  closeStep();
  await sleep(500);
  const [hours, minutes] = hhmm.split(':').map(Number);
  // Horário de Brasília (UTC−3), dentro do expediente.
  const narrative = today.getTime() + dayOffset * DAY + ((hours + 3) * 60 + minutes) * 60_000;
  const last = marks.at(-1);
  must(!last || narrative > last.narrative, `marco fora de ordem: dia ${dayOffset} ${hhmm}`);
  must(narrative < Date.now(), `marco no futuro: dia ${dayOffset} ${hhmm}`);
  marks.push({ real: Date.now(), narrative });
  await sleep(300);
}
function remap(value) {
  const real = Date.parse(value);
  if (!Number.isFinite(real) || marks.length < 2 || real < marks[0].real - 5_000) return null;
  let index = marks.findIndex((mark) => mark.real > real);
  if (index === -1) return null; // depois do último marco: fica onde está (agora)
  if (index === 0) index = 1;
  const a = marks[index - 1], b = marks[index];
  const ratio = Math.max(0, (real - a.real) / (b.real - a.real));
  return new Date(Math.round(a.narrative + ratio * (b.narrative - a.narrative))).toISOString();
}

// ------------------------------------------------------- escopo da demo
// Tudo que pertence às organizações criadas pelas personas fictícias. O reset
// apaga só isso (e as contas *.example); nada fora desse escopo é tocado.
async function demoScope() {
  const users = await listDemoUsers();
  const userIds = users.map((user) => user.id);
  if (!userIds.length) return { users, userIds, orgs: [], rfqs: [], proposals: [], requests: [], documents: [] };
  const orgs = (await service(`fin_organizations?select=id&created_by=${inList(userIds)}`)).payload.map((row) => row.id);
  if (!orgs.length) return { users, userIds, orgs, rfqs: [], proposals: [], requests: [], documents: [] };
  const ids = async (table, filter) => (await service(`${table}?select=id&${filter}`)).payload.map((row) => row.id);
  return {
    users, userIds, orgs,
    rfqs: await ids('fin_rfqs', `organization_id=${inList(orgs)}`),
    proposals: await ids('fin_proposals', `buyer_organization_id=${inList(orgs)}`),
    requests: await ids('fin_approval_requests', `organization_id=${inList(orgs)}`),
    serviceAccounts: await ids('fin_service_accounts', `organization_id=${inList(orgs)}`),
    documents: await ids('fin_private_documents', `organization_id=${inList(orgs)}`)
  };
}

/** Tabelas com carimbo de tempo, chave e filtro de escopo (ordem de remoção: filhas antes das mães). */
function scopedTables(scope) {
  const org = `organization_id=${inList(scope.orgs)}`;
  const list = (ids) => inList(ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
  return [
    // Pós-contrato: filhas antes das mães; registros imutáveis só saem num banco
    // marcado como demonstração (fin_immutable_row aceita o service role ali).
    ...['fin_extraction_reviews', 'fin_extraction_facts', 'fin_document_extractions',
      'fin_qualification_events', 'fin_qualification_exceptions', 'fin_qualification_evidence', 'fin_provider_qualifications', 'fin_qualification_requirements',
      'fin_spend_reconciliations', 'fin_spend_records',
      'fin_provider_performance_reviews', 'fin_provider_performance_observations', 'fin_provider_performance_targets', 'fin_provider_performance_periods', 'fin_provider_performance_dimensions',
      'fin_covenant_waivers', 'fin_obligation_reviews', 'fin_obligation_evidence', 'fin_covenant_measurements', 'fin_obligation_periods', 'fin_covenants', 'fin_obligations',
      'fin_implementation_acceptances', 'fin_implementation_issues', 'fin_implementation_dependencies', 'fin_implementation_milestones', 'fin_implementation_plans'
    ].map((table) => [table, null, org, []]),
    ['fin_guarantees', ['id'], org, ['created_at', 'updated_at']],
    ['fin_facility_repayments', null, org, []],
    ['fin_facility_balances', null, org, []],
    ['fin_facility_history', null, org, []],
    ['fin_facilities', ['id'], org, ['created_at', 'updated_at']],
    ['fin_provider_reviews', null, org, []],
    ['fin_scorecard_templates', null, org, []],
    ['fin_provider_issues', ['id'], org, ['created_at', 'updated_at']],
    ['fin_provider_relationships', null, org, []],
    ['fin_provider_contacts', ['id'], org, ['created_at']],
    ['fin_contract_milestone_runs', null, org, []],
    ['fin_contract_milestones', ['id'], org, ['created_at', 'updated_at']],
    ['fin_opportunity_events', null, org, []],
    ['fin_opportunities', null, org, []],
    ['fin_opportunity_rules', null, org, []],
    ['fin_opportunity_scans', null, org, []],
    ['fin_fee_reviews', null, org, []],
    ['fin_fee_variances', null, org, []],
    ['fin_fee_observations', null, org, []],
    ['fin_fee_schedule_versions', null, org, []],
    ['fin_fee_schedules', null, org, []],
    ['fin_value_observations', null, org, []],
    ['fin_value_records', null, org, []],
    ['fin_value_methodologies', null, org, []],
    ['fin_contract_versions', null, org, []],
    ['fin_contract_amendments', ['id'], org, []],
    ['fin_renewal_milestones', ['id'], org, ['triggered_at']],
    ['fin_notifications', ['id'], org, ['created_at', 'read_at']],
    ['fin_notification_preferences', null, org, []],
    ['fin_comments', ['id'], `${org}&parent_id=not.is.null`, ['created_at']],
    ['fin_comments', ['id'], org, ['created_at']],
    ['fin_tasks', ['id'], org, ['created_at']],
    ['fin_sso_events', ['id'], org, ['happened_at']],
    ['fin_sso_domains', ['domain'], org, ['created_at', 'verified_at']],
    ['fin_sso_connections', ['id'], org, ['created_at', 'updated_at', 'activated_at']],
    ['fin_webhook_deliveries', ['id'], org, ['created_at']],
    ['fin_webhook_events', ['id'], org, ['occurred_at']],
    ['fin_webhook_endpoints', ['id'], org, ['created_at', 'updated_at']],
    ['fin_api_idempotency', null, `service_account_id=${list(scope.serviceAccounts || [])}`, []],
    ['fin_api_credentials', ['id'], org, ['created_at']],
    ['fin_service_account_entities', null, org, []],
    ['fin_service_accounts', ['id'], org, ['created_at', 'updated_at']],
    ['fin_policy_exceptions', ['id'], org, ['created_at', 'decided_at']],
    ['fin_approval_steps', ['id'], `request_id=${list(scope.requests)}`, ['acted_at']],
    ['fin_approval_stages', ['id'], org, ['opened_at', 'due_at', 'escalated_at', 'completed_at']],
    ['fin_approval_requests', ['id'], org, ['requested_at', 'resolved_at', 'rfq_updated_at']],
    ['fin_approval_delegations', ['id'], org, ['created_at']],
    // Versões de policy são imutáveis depois de ativadas: sem remapeamento de data.
    ['fin_policy_versions', ['id'], org, []],
    ['fin_policies', ['id'], org, ['created_at']],
    ['fin_policy_flags', null, org, []],
    ['fin_document_versions', ['document_id', 'version'], `document_id=${list(scope.documents)}`, ['created_at', 'completed_at']],
    ['fin_private_documents', ['id'], org, ['created_at', 'removed_at']],
    ['fin_documents', ['id'], org, ['created_at']],
    // Filhos antes dos pais; sem colunas aqui para o remapeamento não duplicar datas.
    ['fin_contracts', ['id'], `${org}&parent_contract_id=not.is.null`, []],
    ['fin_contracts', ['id'], org, ['created_at', 'updated_at']],
    ['fin_decisions', ['id'], org, ['decided_at']],
    ['fin_proposal_drafts', ['proposal_id'], `proposal_id=${list(scope.proposals)}`, ['updated_at']],
    ['fin_proposal_versions', ['id'], `proposal_id=${list(scope.proposals)}`, ['submitted_at']],
    ['fin_proposals', ['id'], `buyer_organization_id=${inList(scope.orgs)}`, ['created_at', 'updated_at']],
    ['fin_invite_acceptance_denials', ['id'], `rfq_id=${list(scope.rfqs)}`, ['happened_at']],
    ['fin_rfq_invites', ['id'], `buyer_organization_id=${inList(scope.orgs)}`, ['created_at', 'accepted_at']],
    ['fin_rfq_revisions', ['rfq_id', 'revision'], org, ['published_at']],
    ['fin_rfq_editor_drafts', null, org, []],
    // Snapshot e histórico do Passport são imutáveis: sem remapeamento de data,
    // e só o banco marcado como demo aceita apagá-los (reset).
    ['fin_rfq_profile_snapshots', ['id'], org, []],
    ['fin_rfqs', ['id'], org, ['created_at', 'updated_at']],
    ['fin_providers', ['id'], org, ['created_at', 'updated_at']],
    ['fin_company_profile_history', ['id'], org, []],
    ['fin_company_profiles', ['id'], org, ['created_at', 'updated_at']],
    ['fin_terms_acceptances', ['id'], org, ['accepted_at']],
    ['fin_approval_policies', ['organization_id'], org, ['updated_at']],
    ['fin_member_invitations', ['id'], org, ['created_at', 'accepted_at']],
    ['fin_events', ['id'], org, ['happened_at']],
    ['fin_members', ['organization_id', 'user_id'], org, ['created_at']],
    ['fin_organizations', ['id'], `id=${inList(scope.orgs)}`, ['created_at']]
  ];
}

async function resetDemo() {
  const scope = await demoScope();
  log(`Reset: ${scope.orgs.length} organização(ões) e ${scope.users.length} conta(s) fictícias encontradas.`);
  if (scope.orgs.length) {
    // Objetos do Storage dos documentos fictícios.
    const paths = scope.documents.length
      ? (await service(`fin_document_versions?select=storage_path&document_id=${inList(scope.documents)}`)).payload.map((row) => row.storage_path).filter(Boolean)
      : [];
    for (let index = 0; index < paths.length; index += 100) {
      await service('object/fin-documents', { base: 'storage/v1', method: 'DELETE', body: { prefixes: paths.slice(index, index + 100) } }).catch(() => null);
    }
    for (const [table, , filter] of scopedTables(scope)) await service(`${table}?${filter}`, { method: 'DELETE' });
  }
  if (scope.userIds.length) {
    const emails = scope.users.map((user) => user.email);
    await service(`transactional_email_outbox?recipient_address=${inList(emails.map((email) => `"${email}"`))}`, { method: 'DELETE' }).catch(() => null);
    await service(`fin_pilot_allowlist?created_by=${inList(scope.userIds)}`, { method: 'DELETE' });
  }
  for (const user of scope.users) await service(`admin/users/${user.id}`, { base: 'auth/v1', method: 'DELETE' });
}

// ---------------------------------------------------------------- seed
const ctx = { providerOrg: {}, providerRow: {}, rfq: {}, proposal: {}, contract: {}, decision: {} };
const uuid = () => crypto.randomUUID();

async function createAccounts() {
  for (const person of Object.values(people)) {
    const { payload } = await service('admin/users', { base: 'auth/v1', method: 'POST', body: {
      email: person.email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: person.name, demo: true }
    } });
    person.id = payload.id;
  }
  const domains = DEMO_EMAIL_DOMAINS.map((domain) => ({ pattern: `@${domain}`, created_by: people.helena.id, note: 'Demonstração Vitta Foods (dados fictícios)' }));
  await service('fin_pilot_allowlist', { method: 'POST', body: domains, prefer: 'return=minimal' });
  for (const person of Object.values(people)) await signIn(person);
}

async function setupOrganizations() {
  const { helena, juliana, rafael, carlos } = people;
  await at(-730, '09:10');
  ctx.org = (await post(helena, 'organizations', { legal_name: data.COMPANY.legal_name, kind: 'BUYER', country: 'BR' })).id;
  // Trava 7: a aplicação alvo está configurada como demonstração.
  assertDemoApplication((await api(helena, 'GET', 'organizations')).environment);
  await api(helena, 'PATCH', 'organizations', { organization_id: ctx.org, trade_name: data.COMPANY.trade_name, sector: data.COMPANY.sector, revenue_band: data.COMPANY.revenue_band });
  await api(helena, 'PATCH', 'members/me', { organization_id: ctx.org, display_name: helena.name, title: helena.title });
  for (const [key, value, source] of data.COMPANY.profile) await post(helena, 'profile', { organization_id: ctx.org, field_key: key, field_value: value, source });
  await post(helena, 'approval-policy', { organization_id: ctx.org, required_for_decision: true });
  for (const person of [juliana, rafael, carlos]) {
    await at(-729, person === juliana ? '10:00' : person === rafael ? '11:00' : '14:00');
    const { invitationToken } = await post(helena, 'members/invite', { organization_id: ctx.org, email: person.email, role: person.role });
    await post(person, 'members/accept', { token: invitationToken });
    await api(person, 'PATCH', 'members/me', { organization_id: ctx.org, display_name: person.name, title: person.title });
  }
  await at(-728, '09:30');
  for (const [key, provider] of Object.entries(data.PROVIDERS)) {
    const person = people[key];
    ctx.providerOrg[key] = (await post(person, 'organizations', { legal_name: provider.org, kind: 'PROVIDER', country: 'BR' })).id;
    await api(person, 'PATCH', 'organizations', { organization_id: ctx.providerOrg[key], trade_name: provider.name, sector: 'Serviços financeiros' });
    await api(person, 'PATCH', 'members/me', { organization_id: ctx.providerOrg[key], display_name: person.name, title: person.title });
  }
  await at(-727, '15:00');
  for (const [key, provider] of Object.entries(data.PROVIDERS)) {
    const person = people[key];
    ctx.providerRow[key] = (await post(helena, 'providers', {
      organization_id: ctx.org, name: provider.name, kind: provider.kind, website: provider.website,
      contact_name: person.name, contact_email: person.email, region: provider.region, notes: provider.notes, products: provider.products
    })).row.id;
  }
}

function proposalTerms(terms, submitDay) {
  const result = { ...terms };
  result.valid_until = typeof terms.valid_until === 'number' ? isoDate(terms.valid_until) : isoDate(submitDay + 20);
  return result;
}

async function openRfq(spec, owner, hhmm = '09:20') {
  await at(spec.start, hhmm);
  const passport_fields = (spec.passport || []).map((key) => ({ demand_key: key, field_key: PASSPORT_TO_DEMAND[spec.product][key] }));
  const id = (await post(owner, 'rfqs', {
    organization_id: ctx.org, product: spec.product, title: spec.title, description: spec.description,
    demand: spec.demand, response_deadline: isoDate(spec.deadline), passport_fields
  })).id;
  ctx.rfq[spec.key] = id;
  return id;
}

async function inviteAll(spec, owner, day) {
  const rfq = ctx.rfq[spec.key];
  await at(day, '10:40');
  await post(owner, 'transition', { kind: 'rfq', id: rfq, from: 'draft', status: 'open' });
  const tokens = {};
  for (const key of spec.invited) tokens[key] = (await post(owner, 'invites/send', { rfq_id: rfq, provider_id: ctx.providerRow[key] })).invitationToken;
  let hour = 14;
  for (const key of spec.invited) {
    await at(day + (key === spec.invited[0] ? 0 : 1), `${hour}:${key.length % 6}5`);
    hour = hour >= 16 ? 9 : hour + 1;
    await post(people[key], 'invites/accept', { token: tokens[key], provider_organization_id: ctx.providerOrg[key] });
    const assignments = (await api(people[key], 'GET', `assignments?organization_id=${ctx.providerOrg[key]}`)).rows;
    ctx.proposal[`${spec.key}:${key}`] = assignments.find((row) => row.rfq_id === rfq)?.proposal_id;
    must(ctx.proposal[`${spec.key}:${key}`], `proposta de ${key} não encontrada`);
  }
  await post(owner, 'transition', { kind: 'rfq', id: rfq, from: 'open', status: 'collecting' });
}

async function submit(spec, key, version, day, hhmm) {
  await at(day, hhmm);
  const entry = spec.proposals[key][version];
  await post(people[key], 'proposals', { proposal_id: ctx.proposal[`${spec.key}:${key}`], terms: proposalTerms(entry.terms, day), note: entry.note });
}

async function comment(person, organization, objectType, objectId, visibility, body, mentions = []) {
  return (await post(person, 'comments', {
    organization_id: organization, object_type: objectType, object_id: objectId, visibility, body,
    mention_ids: mentions.map((key) => people[key].id), client_id: uuid()
  })).id;
}
const reply = async (person, organization, parent, body) => (await post(person, 'comments', { organization_id: organization, parent_id: parent, body, client_id: uuid() })).id;

async function approveAndDecide(spec, { requestDay, steps, decideDay, contract }) {
  const { juliana } = people;
  const rfq = ctx.rfq[spec.key];
  const proposal = ctx.proposal[`${spec.key}:${spec.winner}`];
  await at(requestDay, '11:15');
  const request = (await post(juliana, 'approvals/request', { rfq_id: rfq, proposal_id: proposal, approver_ids: [people.carlos.id, people.helena.id], rationale: spec.approvalRationale })).id;
  for (const [who, day, hhmm, text] of steps) {
    await at(day, hhmm);
    await post(people[who], 'approvals/act', { request_id: request, action: 'approved', comment: text });
  }
  if (!decideDay) return request;
  await at(decideDay, '10:05');
  ctx.decision[spec.key] = (await post(juliana, 'decisions', { rfq_id: rfq, proposal_id: proposal, criteria: { weights: spec.weights }, rationale: spec.decisionRationale })).id;
  await at(decideDay + 2, '16:30');
  ctx.contract[spec.key] = (await post(juliana, 'contracts', {
    decision_id: ctx.decision[spec.key], starts_on: isoDate(contract.starts), ends_on: isoDate(contract.ends),
    renewal_notice_days: contract.notice, cost_summary: contract.cost, main_conditions: contract.conditions
  })).id;
  return request;
}

async function compare(spec, person) {
  const rfq = ctx.rfq[spec.key];
  const result = await post(person, 'comparison', { rfq_id: rfq, weights: spec.weights });
  must(result.weighted?.applied, `comparação ponderada de ${spec.key} não aplicada`);
  await post(person, 'signals', { organization_id: ctx.org, event: 'comparison_viewed', entity_type: 'rfq', entity_id: rfq });
  await post(person, 'signals', { organization_id: ctx.org, event: 'weights_applied', entity_type: 'rfq', entity_id: rfq });
}

async function upload(personKey, entity, visibility, title, body = null) {
  const person = people[personKey];
  const providerSide = person.side === 'provider';
  const [entityKey, providerKey] = entity.split(':');
  const target = entityKey.endsWith('Contract')
    ? { type: 'contract', id: ctx.contract[entityKey.replace(/Contract$/, '')] }
    : providerKey ? { type: 'proposal', id: ctx.proposal[`${entityKey}:${providerKey}`] } : { type: 'rfq', id: ctx.rfq[entityKey] };
  const organization = providerSide ? ctx.providerOrg[personKey] : ctx.org;
  const bytes = demoPdf({ title, organization: providerSide ? data.PROVIDERS[personKey].org : data.COMPANY.legal_name,
    body: body || `${title}.\nDocumento de apoio da demonstração do Arandu, anexado ao processo da ${data.COMPANY.legal_name}. Conteúdo ilustrativo: nenhum valor, assinatura ou condição aqui representa operação real.` });
  const begin = await post(person, 'private-documents/upload', {
    organization_id: organization, entity_type: target.type, entity_id: target.id, title, visibility,
    mime_type: 'application/pdf', size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex')
  });
  const put = await fetch(begin.upload_url, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: bytes });
  must(put.ok, `envio de "${title}" ao Storage: ${put.status}`);
  await post(person, 'private-documents/complete', { document_id: begin.document_id, version: begin.version });
  ctx.documents ||= {};
  ctx.documents[title] = { id: begin.document_id, version: begin.version };
}

/** Corpo "Rótulo: valor" da cédula fictícia: o leitor determinístico extrai daqui, com origem por linha. */
function creditContractBody() {
  const c = data.RFQ_WORKING_CAPITAL_CURRENT.contract;
  const br = (offset) => isoDate(offset).split('-').reverse().join('/');
  return [
    'Cédula de crédito bancário — linha de capital de giro (documento fictício da demonstração).',
    `Início da vigência: ${br(c.starts)}`,
    `Fim da vigência: ${br(c.ends)}`,
    `Aviso prévio: ${c.notice} dias`,
    'Valor do contrato: R$ 8.000.000,00',
    'Moeda: BRL',
    'Indexador: CDI',
    'Spread: 3,20%',
    'Renovação: mediante nova análise de crédito do credor, sem renovação automática',
    'Rescisão: vencimento antecipado nas hipóteses da cláusula 14',
    'Conteúdo ilustrativo: nenhum valor, assinatura ou condição aqui representa operação real.'
  ].join('\n');
}

async function seedStory() {
  const { helena, juliana, rafael, carlos } = people;
  const C = data.COMMENTS;

  // --- RFQ 0: capital de giro vigente (contratado há ~22 meses) -------------
  const s0 = data.RFQ_WORKING_CAPITAL_CURRENT;
  await openRfq(s0, juliana);
  await inviteAll(s0, juliana, s0.start + 1);
  await submit(s0, 'orbe', 0, s0.start + 5, '17:40');
  await submit(s0, 'atlas', 0, s0.start + 8, '11:20');
  await submit(s0, 'meridian', 0, s0.start + 10, '15:05');
  await at(s0.deadline + 1, '09:00');
  await post(juliana, 'transition', { kind: 'rfq', id: ctx.rfq[s0.key], from: 'collecting', status: 'comparing' });
  await compare(s0, rafael);
  await approveAndDecide(s0, {
    requestDay: s0.deadline + 3,
    steps: [['carlos', s0.deadline + 4, '10:30', 'De acordo. Carência de 3 meses cobre a entressafra.'], ['helena', s0.deadline + 5, '18:10', 'Aprovado.']],
    decideDay: s0.deadline + 6, contract: s0.contract
  });

  // --- RFQ 1: adquirência, concluída há um mês --------------------------------
  const s1 = data.RFQ_ACQUIRING;
  await openRfq(s1, juliana);
  await inviteAll(s1, juliana, s1.start + 1);
  await submit(s1, 'nexo', 0, s1.start + 6, '16:20');
  await submit(s1, 'lumina', 0, s1.start + 7, '10:45');
  await submit(s1, 'atlas', 0, s1.start + 9, '14:10');
  const acquiring = ctx.rfq[s1.key];
  const luminaProposal = ctx.proposal[`${s1.key}:lumina`];
  await at(s1.start + 10, '09:40');
  await comment(rafael, ctx.org, 'rfq', acquiring, 'internal', C.acquiringInternal[0][1], C.acquiringInternal[0][2]);
  await at(s1.start + 10, '11:05');
  await comment(juliana, ctx.org, 'rfq', acquiring, 'internal', C.acquiringInternal[1][1]);
  await at(s1.start + 11, '10:20');
  const askLumina = await comment(juliana, ctx.org, 'proposal', luminaProposal, 'provider_visible', C.acquiringToLumina[1]);
  await at(s1.start + 13, '15:30');
  await reply(people.lumina, ctx.providerOrg.lumina, askLumina, C.acquiringFromLumina[1]);
  await submit(s1, 'lumina', 1, s1.start + 13, '15:45');
  await at(s1.start + 14, '09:15');
  await upload('lumina', 'acquiring:lumina', 'shared', data.DOCUMENTS[3].title);
  await at(s1.deadline + 1, '09:00');
  await post(juliana, 'transition', { kind: 'rfq', id: acquiring, from: 'collecting', status: 'comparing' });
  await compare(s1, rafael);
  await at(s1.deadline + 1, '14:00');
  await comment(people[C.acquiringInternal[2][0]], ctx.org, 'rfq', acquiring, 'internal', C.acquiringInternal[2][1], C.acquiringInternal[2][2]);
  await approveAndDecide(s1, {
    requestDay: s1.deadline + 2,
    steps: [['carlos', s1.deadline + 3, '10:10', 'De acordo: a economia de MDR compensa a multa rescisória maior.'], ['helena', s1.deadline + 4, '17:45', 'Aprovado. Formalizar com o jurídico e comunicar as lojas sobre a troca de maquininhas.']],
    decideDay: s1.deadline + 5, contract: s1.contract
  });
  await at(s1.deadline + 8, '10:00');
  await upload('juliana', 'acquiringContract', 'internal', data.DOCUMENTS[4].title);
  await upload('juliana', 'creditCurrentContract', 'internal', data.DOCUMENTS[5].title, creditContractBody());

  // --- Financial Passport revisado pelo analista antes da nova linha ---------
  await at(-23, '11:15');
  for (const [key, value, source] of data.COMPANY.profileRefresh) await post(people.rafael, 'profile', { organization_id: ctx.org, field_key: key, field_value: value, source });
  for (const key of data.COMPANY.profileConfirm) await post(people.rafael, 'profile/confirm', { organization_id: ctx.org, field_key: key });

  // --- RFQ 2: nova linha de crédito em negociação ----------------------------
  const s2 = data.RFQ_CREDIT;
  await openRfq(s2, juliana);
  await at(s2.start, '15:00');
  await upload('juliana', 'credit', 'shared', data.DOCUMENTS[0].title);
  await inviteAll(s2, juliana, s2.start + 1);
  const credit = ctx.rfq[s2.key];
  await submit(s2, 'atlas', 0, s2.start + 7, '11:30');
  await submit(s2, 'orbe', 0, s2.start + 9, '18:05');
  await at(s2.start + 10, '09:30');
  const meridian = ctx.proposal[`${s2.key}:meridian`];
  await api(people.meridian, 'PATCH', 'proposal-draft', { proposal_id: meridian, terms: s2.draftOnly.meridian, expected_revision: 0, base_version: 0 });
  await at(s2.start + 10, '14:20');
  await comment(rafael, ctx.org, 'rfq', credit, 'internal', C.creditInternal[0][1], C.creditInternal[0][2]);
  await at(s2.start + 11, '09:50');
  await comment(juliana, ctx.org, 'rfq', credit, 'internal', C.creditInternal[1][1], C.creditInternal[1][2]);
  await at(s2.start + 11, '10:10');
  const askAtlas = await comment(juliana, ctx.org, 'proposal', ctx.proposal[`${s2.key}:atlas`], 'provider_visible', C.creditToAtlas[1]);
  const askOrbe = await comment(rafael, ctx.org, 'proposal', ctx.proposal[`${s2.key}:orbe`], 'provider_visible', C.creditToOrbe[1]);
  await at(s2.start + 12, '16:40');
  await reply(people.orbe, ctx.providerOrg.orbe, askOrbe, C.creditFromOrbe[1]);
  await at(s2.start + 13, '11:15');
  await comment(helena, ctx.org, 'rfq', credit, 'internal', C.creditInternal[2][1]);
  await at(s2.start + 14, '17:20');
  await reply(people.atlas, ctx.providerOrg.atlas, askAtlas, C.creditFromAtlas[1]);
  await submit(s2, 'atlas', 1, s2.start + 14, '17:35');
  await at(s2.start + 15, '10:00');
  await upload('atlas', 'credit:atlas', 'shared', data.DOCUMENTS[2].title);
  await at(s2.deadline + 1, '09:10');
  await post(juliana, 'transition', { kind: 'rfq', id: credit, from: 'collecting', status: 'comparing' });
  await compare(s2, rafael);
  await at(s2.deadline + 1, '15:30');
  await upload('rafael', 'credit', 'internal', data.DOCUMENTS[1].title);
  await approveAndDecide(s2, {
    requestDay: s2.deadline + 2,
    steps: [['carlos', s2.deadline + 2, '16:50', 'De acordo com a Atlas v2. Pendente só a revisão jurídica do covenant antes da assinatura.']],
    decideDay: null
  });

  // --- RFQ 3: rascunho em preparação ----------------------------------------
  const s3 = data.RFQ_DRAFT;
  await openRfq(s3, juliana, '17:30');

  // --- tarefas e conversa no contrato em renovação ---------------------------
  // Ontem no fim do dia: o último marco narrativo sempre fica no passado.
  await at(-1, '18:00');
  const related = { credit: ['rfq', credit], acquiringContract: ['contract', ctx.contract.acquiring], draft: ['rfq', ctx.rfq.draft] };
  for (const task of data.TASKS) {
    const [type, id] = related[task.related];
    const row = (await post(helena, 'tasks', { organization_id: ctx.org, title: task.title, due_on: isoDate(task.due), related_type: type, related_id: id })).row;
    if (task.done) await api(helena, 'PATCH', 'tasks', { organization_id: ctx.org, task_id: row.id, status: 'done' });
  }
  await at(-1, '18:20');
  await comment(juliana, ctx.org, 'contract', ctx.contract.creditCurrent, 'internal', C.contractRenewal[1], C.contractRenewal[2]);
}


// ------------------------------------------------- pós-contrato (lifecycle)
// O que acontece depois da decisão: implantação, obrigações, performance,
// spend, qualificação e leitura de documento. Tudo pela API real, com as regras
// de segregação do produto (quem registra não revisa; waiver decidido por outra
// pessoa). Os registros ficam com o horário real do seed: esses objetos são
// imutáveis depois de criados e não são reposicionados na linha do tempo.
const L = () => data.LIFECYCLE;
const firstOfMonth = (monthsBack) => { const d = new Date(today); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - monthsBack); return d; };
const iso = (date) => date.toISOString().slice(0, 10);
const addDays = (date, days) => new Date(date.getTime() + days * DAY);
const detailOf = (person, resource, id) => api(person, 'GET', `${resource}/detail?${new URLSearchParams({ id, organization_id: ctx.org })}`);
const listOf = (person, resource, extra = '') => api(person, 'GET', `${resource}?organization_id=${ctx.org}${extra}`);
const actionOf = (detail, predicate, what) => { const found = (detail.actions || []).find(predicate); must(found, `ação indisponível: ${what}`); return found; };

async function seedImplementation() {
  const spec = L().implementation;
  const opener = people[spec.opener];
  ctx.implementation = (await post(opener, 'implementations/open', {
    contract_id: ctx.contract[spec.contract], title: spec.title, owner_id: people[spec.owner].id,
    starts_on: isoDate(spec.starts), target_go_live: isoDate(spec.goLive), source_reference: spec.source
  })).id;
  for (const [who, evidence] of spec.completed) {
    const detail = await detailOf(people[who], 'implementations', ctx.implementation);
    const step = actionOf(detail, (action) => action.post === 'implementations/milestone', 'marco pendente');
    await post(people[who], 'implementations/milestone', { ...step.fixed, status: 'completed', evidence_reference: evidence });
  }
  const detail = await detailOf(opener, 'implementations', ctx.implementation);
  const next = actionOf(detail, (action) => action.post === 'implementations/milestone', 'marco seguinte');
  await post(opener, 'implementations/milestone', { ...next.fixed, status: 'blocked', blocker: spec.blocker });
  await post(opener, 'implementations/issue', { plan_id: ctx.implementation, title: spec.issue.title, due_on: isoDate(spec.issue.due), owner_id: people[spec.owner].id });
}

async function covenantPeriod(person, title) {
  const page = await listOf(person, 'covenants');
  const row = page.rows.find((item) => item.cells[0].startsWith(`${title} · `));
  must(row, `período de "${title}" não encontrado`);
  return row.id;
}

async function seedCovenants() {
  const juliana = people.juliana;
  for (const spec of L().covenants) {
    let start, end, due;
    if (spec.frequency === 'quarterly') {
      const first = firstOfMonth(3 * spec.firstQuarterBack);
      start = iso(first);
      end = iso(addDays(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 3, 1)), -1));
      due = iso(addDays(new Date(`${end}T00:00:00Z`), spec.lagDays));
    } else {
      start = isoDate(spec.start); end = isoDate(spec.end); due = isoDate(spec.due);
    }
    await post(juliana, 'covenants/open', {
      contract_id: ctx.contract.creditCurrent, title: spec.title, kind: spec.kind, source_clause: spec.clause, source_reference: spec.reference,
      frequency: spec.frequency, first_period_start: start, first_period_end: end, first_due_on: due, grace_days: spec.grace ?? 0, due_soon_days: 30,
      ...(spec.metric ? { metric: spec.metric, operator: spec.operator, threshold: spec.threshold, unit: spec.unit } : {})
    });
    if (!spec.measured) continue;
    const period = await covenantPeriod(juliana, spec.title);
    await post(people[spec.measured.by], 'covenants/data', { period_id: period, measured_value: spec.measured.value, measured_on: isoDate(-2), source_reference: spec.measured.reference, provenance: spec.measured.provenance });
    const review = actionOf(await detailOf(people[spec.review.by], 'covenants', period), (action) => action.post === 'covenants/review', 'revisão do período');
    await post(people[spec.review.by], 'covenants/review', { ...review.fixed, status: spec.review.status, reason: spec.review.reason });
    if (!spec.waiver) continue;
    await post(people[spec.waiver.by], 'covenants/waiver', { period_id: period, valid_until: isoDate(spec.waiver.until), reason: spec.waiver.reason, controls: spec.waiver.controls });
    const decision = spec.waiver.decision;
    const decide = actionOf(await detailOf(people[decision.by], 'covenants', period), (action) => action.post === 'covenants/decide-waiver', 'decisão do waiver');
    await post(people[decision.by], 'covenants/decide-waiver', { ...decide.fixed, status: decision.status, decision_reason: decision.reason });
  }
}

async function seedPerformance() {
  const spec = L().performance;
  const opener = people[spec.opener];
  const dimensions = [];
  for (const dimension of spec.dimensions) {
    // Método e meta são política da empresa: só administração define.
    const id = await post(people.helena, 'performance/dimension', { organization_id: ctx.org, dimension_key: dimension.key, title: dimension.title, metric: dimension.metric, unit: dimension.unit, methodology: dimension.methodology });
    dimensions.push({ ...dimension, id: id.id });
  }
  const period = (await post(opener, 'performance/open', {
    contract_id: ctx.contract[spec.contract], title: spec.title, period_start: isoDate(spec.start), period_end: isoDate(spec.end), review_due_on: isoDate(spec.reviewDue),
    dimensions: dimensions.map((dimension) => ({ dimension_id: dimension.id, operator: dimension.operator, threshold: dimension.threshold, source_reference: dimension.source }))
  })).id;
  for (const dimension of dimensions) {
    const o = dimension.observation;
    const observation = (await post(people[spec.measurer], 'performance/measure', {
      period_id: period, dimension_id: dimension.id, availability: o.availability, ...(o.value ? { value: o.value } : {}), source_type: o.source_type,
      source_reference: o.reference, provenance: o.provenance, coverage_numerator: o.covered, coverage_denominator: o.expected, observed_on: isoDate(spec.end)
    })).id;
    if (dimension.reviewed) await post(people[spec.reviewer], 'performance/review', { observation_id: observation, status: 'confirmed', reason: 'Fonte e cálculo conferidos de forma independente pela tesouraria.' });
  }
}

async function seedSpend() {
  for (const spec of L().spend) {
    const record = (await post(people[spec.by], 'spend/record', {
      contract_id: ctx.contract[spec.contract], period_start: isoDate(spec.start), period_end: isoDate(spec.end), currency: spec.currency || 'BRL', value_kind: spec.kind,
      amount: spec.amount, source_type: spec.sourceType, source_reference: spec.reference, source_line: spec.line, provenance: spec.provenance
    })).id;
    if (spec.reconcile) await post(people[spec.reconcile.by], 'spend/reconcile', { record_id: record, status: 'confirmed', no_duplicate_confirmed: true, reason: spec.reconcile.reason });
  }
}

async function seedQualification() {
  const spec = L().qualification;
  const helena = people.helena;
  const requirements = {};
  for (const requirement of spec.requirements) {
    requirements[requirement.key] = (await post(helena, 'qualifications/requirement', {
      organization_id: ctx.org, area: requirement.area, title: requirement.title, category: requirement.category || 'all', validity_days: requirement.validity, critical: Boolean(requirement.critical)
    })).id;
  }
  const opener = people[spec.opener];
  const qualification = (await post(opener, 'qualifications/open', { organization_id: ctx.org, provider_id: ctx.providerRow[spec.provider], category: spec.category, owner_id: people[spec.owner].id, review_due_on: isoDate(spec.reviewDue) })).id;
  await post(opener, 'qualifications/transition', { qualification_id: qualification, expected_status: 'not_started', to_status: 'in_progress' });
  for (const evidence of spec.evidence) {
    const id = (await post(people[evidence.by], 'qualifications/evidence', {
      qualification_id: qualification, requirement_id: requirements[evidence.requirement], source: evidence.source, evidence_reference: evidence.reference, ...(evidence.service ? { external_service: evidence.service } : {})
    })).id;
    if (evidence.review) await post(people[evidence.review.by], 'qualifications/evidence-review', { evidence_id: id, status: evidence.review.status });
  }
  await post(opener, 'qualifications/transition', { qualification_id: qualification, expected_status: 'in_progress', to_status: 'pending_internal_review' });
}

async function seedExtraction() {
  const spec = L().extraction;
  const person = people[spec.by];
  const document = ctx.documents[data.DOCUMENTS[spec.document].title];
  must(document, 'documento da extração não encontrado');
  const started = await post(person, 'extractions/start', { organization_id: ctx.org, document_id: document.id, version: document.version, schema_key: spec.schema, provider: 'deterministic_v1' });
  must(started.facts > 0, 'extração sem fatos');
  for (const key of spec.confirm) {
    const form = actionOf(await detailOf(person, 'extractions', started.id), (action) => action.post === 'extractions/review', 'revisão de fato');
    const label = schemaField(spec.schema, key).label;
    const option = form.fields[0][2].find(([, text]) => text.replace(/^◆ /, '').startsWith(`${label}:`));
    must(option, `fato "${label}" não extraído`);
    await post(person, 'extractions/review', { fact: option[0], action: 'confirm' });
  }
}

async function seedOpportunityRules() {
  for (const [key, parameters] of L().opportunityRules) {
    await post(people.helena, 'opportunities/rules', { organization_id: ctx.org, rule: `${key}|0`, enabled: true, reason: 'Monitoramento definido pela CFO para a demonstração', ...parameters });
  }
}


async function seedPortfolioAndFees() {
  const f=L().facility;
  const {provider,contract,starts,maturity,balance,...input}=f;
  const facility=(await post(people.juliana,'facilities',{organization_id:ctx.org,...input,provider_id:ctx.providerRow[provider],contract_id:ctx.contract[contract],starts_on:isoDate(starts),maturity_on:isoDate(maturity)})).id;
  await post(people.rafael,'facility-balances',{facility_id:facility,as_of:isoDate(-1),...balance});
  const fee=L().fees;
  const {contract:feeContract,observation,...schedule}=fee;
  const start=isoDate(-28),end=isoDate(-1);
  await post(people.juliana,'fees/schedules',{organization_id:ctx.org,contract_id:ctx.contract[feeContract],...schedule,effective_from:isoDate(-30)});
  const observed=(await post(people.rafael,'fees/observe',{organization_id:ctx.org,contract_id:ctx.contract[feeContract],service:fee.service,charging_unit:fee.charging_unit,currency:fee.currency,period_start:start,period_end:end,...observation})).id;
  await post(people.juliana,'fees/verify',{observation_id:observed,status:'verified',reason:'Extrato sintético e quantidade de terminais conferidos independentemente; diferença exige revisão humana.'});
}

async function seedLifecycle() {
  log('Registrando o pós-contrato (implantação, obrigações, performance, spend, qualificação, documento)…');
  await seedImplementation();
  await seedCovenants();
  await seedPerformance();
  await seedSpend();
  await seedPortfolioAndFees();
  await seedQualification();
  await seedExtraction();
  await seedOpportunityRules();
}

async function finishStory() {
  // Daqui em diante (cron do dia e leitura de avisos) os registros ficam com o horário real.
  closeStep();
  marks.push({ real: Date.now() + 500, narrative: Date.now() + 500 });
  await sleep(1_000);
  await seedLifecycle();
  // Marcos de renovação, obrigações, performance e oportunidades pelo mesmo
  // cron que roda todo dia em produção.
  if (CRON) {
    const response = await fetch(`${APP}/api/jobs/renewals`, { headers: { Authorization: `Bearer ${CRON}` } });
    must(response.ok, `cron de renovação: ${response.status}`);
  } else {
    log('  · CRON_SECRET ausente: marcos de renovação ficam para a próxima execução diária do cron (/api/jobs/renewals).');
  }
  // Avisos do passado já foram lidos; o que chegou nos últimos dias continua novo.
  const cutoff = marks.find((mark) => mark.narrative >= today.getTime() - 4 * DAY)?.real ?? Date.now();
  for (const key of ['helena', 'juliana', 'rafael', 'carlos']) {
    const rows = (await api(people[key], 'GET', `notifications?organization_id=${ctx.org}`)).rows || [];
    const old = rows.filter((row) => Date.parse(row.created_at) < cutoff).map((row) => row.id);
    if (old.length) await api(people[key], 'PATCH', 'notifications', { organization_id: ctx.org, ids: old });
  }
  for (const key of Object.keys(data.PROVIDERS)) {
    const rows = (await api(people[key], 'GET', `notifications?organization_id=${ctx.providerOrg[key]}`)).rows || [];
    const old = rows.filter((row) => Date.parse(row.created_at) < cutoff).map((row) => row.id);
    if (old.length) await api(people[key], 'PATCH', 'notifications', { organization_id: ctx.providerOrg[key], ids: old });
  }
}

async function applyTimeline() {
  const scope = await demoScope();
  let updated = 0;
  for (const [table, key, filter, columns] of scopedTables(scope)) {
    if (!key || !columns.length) continue;
    const rows = (await service(`${table}?select=${[...new Set([...key, ...columns])].join(',')}&${filter}`)).payload;
    for (const row of rows) {
      const patch = {};
      for (const column of columns) {
        if (!row[column]) continue;
        const moved = remap(row[column]);
        if (moved) patch[column] = moved;
      }
      if (!Object.keys(patch).length) continue;
      await service(`${table}?${key.map((column) => `${column}=eq.${row[column]}`).join('&')}`, { method: 'PATCH', body: patch, prefer: 'return=minimal' });
      updated += 1;
    }
  }
  return updated;
}

// ------------------------------------------------------------ sanidade
async function sanity() {
  const checks = [];
  const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail });
  const juliana = people.juliana;
  const orgs = (await api(juliana, 'GET', 'organizations')).rows.filter((row) => row.kind === 'BUYER');
  const org = orgs.find((row) => row.legal_name === data.COMPANY.legal_name);
  check('Organização Vitta Foods visível para a tesouraria', org, org ? org.legal_name : 'ausente');
  if (!org) return checks;
  const overview = await api(juliana, 'GET', `overview?organization_id=${org.id}`);
  const byTitle = (title) => overview.rfqs.find((rfq) => rfq.title === title);
  const expectations = [
    [data.RFQ_WORKING_CAPITAL_CURRENT.title, 'contracted', 3],
    [data.RFQ_ACQUIRING.title, 'contracted', 3],
    [data.RFQ_CREDIT.title, 'comparing', 2],
    [data.RFQ_DRAFT.title, 'draft', 0]
  ];
  for (const [title, status, proposals] of expectations) {
    const rfq = byTitle(title);
    check(`RFQ "${title}"`, rfq?.status === status && (rfq?.proposals || []).length === proposals, rfq ? `${rfq.status}, ${(rfq.proposals || []).length} proposta(s)` : 'ausente');
  }
  const credit = byTitle(data.RFQ_CREDIT.title);
  const snapshot = credit ? (await api(juliana, 'GET', `rfq-passport?organization_id=${org.id}&rfq_id=${credit.id}`)).rows : [];
  check('RFQ de crédito com fotografia do Passport', snapshot.length === data.RFQ_CREDIT.passport.length && snapshot.every((row) => row.used_as_is), `${snapshot.length} campo(s) fotografado(s)`);
  const passport = (await api(juliana, 'GET', `profile?organization_id=${org.id}`)).passport;
  check('Passport com cobertura e campo a revisar', passport?.coverage?.filled > 10 && passport.attention.some((item) => item.key === 'volume_cartoes_mensal'),
    passport ? `${passport.coverage.filled}/${passport.coverage.relevant} campos, ${passport.attention.length} a revisar` : 'ausente');
  const contracts = overview.contracts || [];
  check('Contrato de adquirência vigente', contracts.some((row) => row.product === 'acquiring' && row.status === 'active'), `${contracts.length} contrato(s)`);
  const renewing = contracts.find((row) => row.product === 'credit');
  check('Contrato de crédito em janela de renovação', renewing && ['active', 'renewing'].includes(renewing.status) && renewing.days_to_end > 0 && renewing.days_to_end <= 90 && renewing.review_from > isoDate(0), renewing ? `${renewing.status}, ${renewing.days_to_end} dias para o fim, aviso prévio em ${renewing.review_from}` : 'ausente');
  if (CRON) {
    const milestones = await count('fin_renewal_milestones', `contract_id=eq.${renewing?.id}`);
    check('Marco de renovação D-90 registrado pelo cron', milestones >= 1, `${milestones} marco(s)`);
  }
  const approvals = (await api(juliana, 'GET', `approvals?organization_id=${org.id}`)).rows;
  const pending = approvals.find((row) => row.status === 'pending');
  check('Aprovação pendente na etapa da CFO', pending && pending.steps?.[0]?.status === 'approved' && pending.steps?.[1]?.status === 'pending' && pending.steps?.[1]?.approver_id === people.helena.id, pending ? pending.steps.map((step) => step.status).join(' → ') : 'nenhuma');
  check('Aprovações concluídas', approvals.filter((row) => row.status === 'approved').length === 2, `${approvals.length} pedido(s)`);
  const decisions = (await api(juliana, 'GET', `decisions?organization_id=${org.id}`)).rows;
  check('Decisões com justificativa', decisions.length === 2 && decisions.every((row) => row.rationale), `${decisions.length}`);
  const acquiring = byTitle(data.RFQ_ACQUIRING.title);
  const comparison = await post(juliana, 'comparison', { rfq_id: acquiring.id, weights: data.RFQ_ACQUIRING.weights });
  check('Comparação ponderada da adquirência', comparison.weighted?.applied && comparison.weighted.results?.length === 3, `${comparison.weighted?.results?.length || 0} propostas ponderadas`);
  const tasks = overview.tasks || [];
  check('Tarefas abertas', tasks.length >= 5, `${tasks.length} abertas`);
  const comments = (await api(juliana, 'GET', `comments?organization_id=${org.id}&object_type=rfq&object_id=${byTitle(data.RFQ_CREDIT.title).id}`)).rows;
  check('Comentários na negociação de crédito', comments.length >= 3, `${comments.length}`);
  const helenaInbox = (await api(people.helena, 'GET', `notifications?organization_id=${org.id}`)).rows;
  check('CFO com aprovação pendente nos avisos', helenaInbox.some((row) => row.event_type === 'approval_requested' && !row.read_at), `${helenaInbox.length} aviso(s)`);
  const julianaInbox = (await api(juliana, 'GET', `notifications?organization_id=${org.id}`)).rows;
  check('Tesouraria com avisos não lidos', julianaInbox.some((row) => !row.read_at), `${julianaInbox.filter((row) => !row.read_at).length} não lido(s)`);
  const luminaOrg = (await api(people.lumina, 'GET', 'organizations')).rows.find((row) => row.kind === 'PROVIDER');
  const assignments = (await api(people.lumina, 'GET', `assignments?organization_id=${luminaOrg.id}`)).rows;
  check('Portal do provedor (Lumina Pay) com histórico', assignments.length === 1 && assignments[0].history.length === 2, `${assignments.length} oportunidade(s), ${assignments[0]?.history?.length || 0} versões`);
  const atlasOrg = (await api(people.atlas, 'GET', 'organizations')).rows.find((row) => row.kind === 'PROVIDER');
  const atlasRows = (await api(people.atlas, 'GET', `assignments?organization_id=${atlasOrg.id}`)).rows;
  const leaked = JSON.stringify(atlasRows).includes('Orbe Capital') || JSON.stringify(atlasRows).includes('Lumina');
  check('Provedor não vê concorrentes', atlasRows.length === 3 && !leaked, `${atlasRows.length} oportunidades, concorrentes ${leaked ? 'VISÍVEIS' : 'ausentes'}`);
  // Pós-contrato: cada capability tem dado demonstrável e as regras do produto aparecem.
  const page = async (resource) => api(juliana, 'GET', `${resource}?organization_id=${org.id}`);
  const implementations = await page('implementations');
  check('Implantação pós-award em andamento com bloqueio', implementations.rows.length === 1 && /Bloquead/.test(implementations.rows[0].cells[1]), implementations.rows.map((row) => row.cells[1]).join(', ') || 'nenhuma');
  const covenants = await page('covenants');
  const covenantStates = covenants.rows.map((row) => row.cells[1]);
  check('Covenants: conforme, aguardando dados e waiver', covenants.rows.length >= 4 && covenantStates.includes('Conforme após revisão') && covenantStates.some((s) => ['Aguardando dados', 'Prazo próximo'].includes(s)) && covenantStates.includes('Waiver vigente'), covenantStates.join(' | '));
  const performance = await page('performance');
  check('Performance do provedor com período aberto', performance.rows.length === 1, `${performance.rows.length} período(s)`);
  const spend = await page('spend');
  check('Spend por moeda/tipo, com e sem reconciliação', spend.rows.length >= 5 && spend.cards[0].lines.some((line) => line.startsWith('BRL · Observado')), `${spend.rows.length} registro(s)`);
  check('Spend preserva USD estimado sem conversão', spend.rows.some(r=>r.cells[0]==='Estimado · USD' && r.cells[1].includes('1.234,50')), 'USD separado de BRL');
  const portfolio=await page('portfolio');
  check('Portfolio com limite, uso e saldo documentados', portfolio.facilities.some(f=>f.name===L().facility.name) && portfolio.balances.length>=1, `${portfolio.facilities.length} linha(s)`);
  const fees=await page('fees');
  check('Fee Intelligence com observação e referência contratada', fees.rows.length>=1, `${fees.rows.length} comparação(ões)`);
  const qualifications = await page('qualifications');
  check('Qualificação do Atlas aguardando decisão humana', qualifications.rows.length === 1, `${qualifications.rows.length} qualificação(ões)`);
  const extractions = await page('extractions');
  check('Documento lido com fatos e proveniência', extractions.rows.length === 1, `${extractions.rows.length} extração(ões)`);
  if (CRON) {
    const opportunities = await page('opportunities');
    check('Oportunidades detectadas pelas regras da empresa', (opportunities.rows || []).length >= 1, `${(opportunities.rows || []).length} oportunidade(s)`);
  }
  const environment = (await api(juliana, 'GET', 'organizations')).environment;
  check('Aplicação em ARANDU_ENV=demo', environment === 'demo', String(environment));
  const marker = (await service(`fin_settings?select=value&key=eq.${DEMO_MARKER_KEY}`)).payload?.[0]?.value;
  check('Banco marcado como demonstração', marker === DEMO_MARKER_VALUE, String(marker));
  return checks;
}

// ---------------------------------------------------------------- main
async function main() {
  const marker = (await service(`fin_settings?select=value&key=eq.${DEMO_MARKER_KEY}`)).payload?.[0]?.value || null;
  const organizations = await count('fin_organizations');
  const scope = await demoScope();
  // Trava 6. Num banco já marcado, as organizações existentes são as da própria demo.
  assertDemoDatabase({ marker, organizations: marker ? organizations : organizations - scope.orgs.length });
  log(`Alvo: ${config.target.kind === 'local' ? 'Supabase local' : `Supabase ${config.target.ref}`} · app ${APP} · banco ${marker ? 'marcado como demonstração' : 'vazio'}.`);

  if (MODE === 'check') {
    for (const person of Object.values(people)) await signIn(person);
  } else {
    if (scope.orgs.length || scope.users.length) {
      if (MODE !== 'reset') throw new Error('A demonstração já está semeada neste banco. Use npm run demo:reset para recriá-la do zero.');
      await resetDemo();
    }
    if (!marker) await service('fin_settings', { method: 'POST', body: { key: DEMO_MARKER_KEY, value: DEMO_MARKER_VALUE }, prefer: 'return=minimal' });
    const started = Date.now();
    log('Criando contas das personas e liberando os domínios fictícios…');
    await createAccounts();
    log('Semeando a história da Vitta Foods pela API do Arandu…');
    await setupOrganizations();
    await seedStory();
    await finishStory();
    const moved = await applyTimeline();
    log(`História semeada em ${Math.round((Date.now() - started) / 1000)} s; ${moved} registros reposicionados na linha do tempo.`);
  }

  const checks = await sanity();
  const width = Math.max(...checks.map((row) => row.name.length));
  console.log('\nChecagens de sanidade da demonstração');
  for (const row of checks) console.log(`  ${row.ok ? 'OK  ' : 'FAIL'} ${row.name.padEnd(width)}  ${row.detail}`);
  const failed = checks.filter((row) => !row.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} checagens OK.`);
  if (MODE !== 'check' && !failed) {
    console.log('\nPersonas (senha: a de ARANDU_DEMO_PASSWORD; nunca versionada):');
    for (const person of Object.values(people)) console.log(`  ${person.email.padEnd(44)} ${person.name} — ${person.title}${person.side === 'provider' ? ` (${data.PROVIDERS[person.key].name})` : ''}`);
    console.log(`\nEntre em ${APP}/login.html e siga o roteiro de docs/demo/RUNBOOK.md.`);
  }
  if (failed) process.exit(1);
}

main().catch((error) => {
  if (error instanceof DemoGuardError) {
    console.error('Seed da demonstração recusado. Nada foi escrito.');
    for (const reason of error.reasons) console.error(`  - ${reason}`);
    process.exit(2);
  }
  console.error(`\nFalha no seed da demonstração: ${error.message}${error.cause ? ` (${error.cause.code || error.cause.message})` : ""}`);
  console.error('Rode npm run demo:reset para recomeçar do zero (as travas são as mesmas).');
  process.exit(1);
});
