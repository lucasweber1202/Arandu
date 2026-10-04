#!/usr/bin/env node
// P0.11 Data Governance: o registro cobre toda tabela financeira das migrations,
// JS e SQL não divergem (classes, conjuntos de export, estados), a API recusa
// antes do banco o que é inválido ou sem papel, o download preserva o conteúdo
// exato das partes (checksum verificável) e o job registra cada etapa com
// lease/fencing em fin_job_runs sem esconder falha parcial.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  DATA_REGISTRY, SHARED_REGISTRY, CLASSIFICATIONS, RETENTION_CLASSES, DELETION_SEMANTICS, EXPORT_DATASETS, OFFBOARDING_STATES,
  OFFBOARDING_TRANSITIONS, SOURCE_OF_TRUTH, nextOffboardingState, validateRetentionPolicy, governanceCatalog, tenantRetentionClasses
} from '../lib/finance/data-governance.mjs';
import { handleFinance } from '../lib/api/domains/finance.mjs';
import { runGovernance, handleFinanceJobs } from '../lib/api/domains/finance-jobs.mjs';

const migration = readFileSync('docs/supabase-financial-data-governance.sql', 'utf8');

// 1. Cobertura: toda tabela/view fin_* criada por migration financeira está no registro.
const created = new Set();
for (const file of readdirSync('docs').filter((name) => /^supabase-financial-.*\.sql$/.test(name))) {
  const sql = readFileSync(`docs/${file}`, 'utf8');
  for (const match of sql.matchAll(/create\s+(?:table\s+(?:if\s+not\s+exists\s+)?|(?:or\s+replace\s+)?view\s+)public\.(fin_[a-z0-9_]+)/gi)) created.add(match[1]);
}
const missing = [...created].filter((name) => !DATA_REGISTRY[name]);
assert.deepEqual(missing, [], `tabelas sem classificação de governança: ${missing.join(', ')}`);
const stale = Object.keys(DATA_REGISTRY).filter((name) => !created.has(name));
assert.deepEqual(stale, [], `registro aponta para tabela inexistente: ${stale.join(', ')}`);

// 2. Cada entrada é válida e coerente com os invariantes.
for (const [name, entry] of Object.entries({ ...DATA_REGISTRY, ...SHARED_REGISTRY })) {
  assert.ok(CLASSIFICATIONS[entry.classification], `${name}: classificação`);
  assert.ok(RETENTION_CLASSES[entry.retention_class], `${name}: classe de retenção`);
  assert.ok(DELETION_SEMANTICS[entry.deletion_semantics], `${name}: semântica de exclusão`);
  for (const key of ['system_of_record', 'owner', 'domain']) assert.ok(typeof entry[key] === 'string' && entry[key].length > 1, `${name}: ${key}`);
  for (const key of ['contains_personal_data', 'contains_financial_data', 'contains_credentials', 'exportable', 'legal_hold_applicable']) assert.equal(typeof entry[key], 'boolean', `${name}: ${key}`);
  if (entry.classification === 'AUDIT_EVIDENCE') assert.ok(['immutable', 'revoke'].includes(entry.deletion_semantics), `${name}: evidência não pode ser apagável`);
  if (entry.deletion_semantics === 'retention_expiry') assert.ok(RETENTION_CLASSES[entry.retention_class].automatable, `${name}: expiração sem classe automatizável`);
  if (RETENTION_CLASSES[entry.retention_class].automatable === false) assert.notEqual(entry.deletion_semantics, 'retention_expiry', `${name}: registro de negócio não expira sozinho`);
}
for (const name of ['fin_decisions', 'fin_contract_versions', 'fin_approval_requests', 'fin_events', 'fin_policy_versions']) {
  assert.equal(DATA_REGISTRY[name].deletion_semantics, 'immutable', `${name} precisa ser imutável`);
}
for (const name of ['fin_api_credentials', 'fin_data_export_parts', 'fin_job_leases', 'fin_api_idempotency']) assert.equal(DATA_REGISTRY[name].exportable, false, `${name} não pode ser exportado`);
for (const name of ['fin_financial_graph', 'fin_graph_objects']) assert.equal(DATA_REGISTRY[name].system_of_record, 'derived', 'Graph não é system of record');
for (const key of ['financial_graph', 'search', 'dashboard']) assert.match(SOURCE_OF_TRUTH[key], /^derived/);

// 3. Paridade SQL ↔ JS.
const datasetBlock = migration.slice(migration.indexOf('fin_governance_export_datasets()\nreturns'), migration.indexOf('revoke all on function public.fin_governance_export_datasets'));
const sqlDatasets = [...datasetBlock.matchAll(/\('([a-z_]+)', 'select/g)].map((match) => match[1]);
assert.deepEqual([...sqlDatasets].sort(), [...EXPORT_DATASETS].sort(), 'conjuntos de export divergentes entre SQL e registro');
const secretKeys = /v_secret_keys text\[\] := array\[([^\]]+)\]/.exec(migration)[1];
for (const key of ['token_hash', 'secret_ciphertext', 'verification_token_hash', 'lease_token', 'storage_path', 'subject_hash']) assert.ok(secretKeys.includes(`'${key}'`), `export não remove ${key}`);
const catalog = [...migration.matchAll(/\('([A-Z_]+)','(tenant|platform)',(\d+),(\d+),'(delete|anonymize)'\)/g)].map(([, key, scope, min, max, action]) => ({ key, scope, min: Number(min), max: Number(max), action }));
const automatable = Object.entries(RETENTION_CLASSES).filter(([, value]) => value.automatable && value.scope !== 'system');
assert.equal(catalog.length, automatable.length, 'catálogo SQL de retenção diverge do JS');
for (const row of catalog) {
  const js = RETENTION_CLASSES[row.key];
  assert.deepEqual([js.scope, js.min_days, js.max_days, js.action], [row.scope, row.min, row.max, row.action], `classe ${row.key} divergente`);
}
const sqlStates = /status in\s*\(\s*'requested','export_pending'[^)]*\)/.exec(migration)[0].match(/'([a-z_]+)'/g).map((value) => value.slice(1, -1));
assert.deepEqual(sqlStates, OFFBOARDING_STATES);
assert.equal(nextOffboardingState('requested', 'request_export'), 'export_pending');
assert.equal(nextOffboardingState('export_ready', 'confirm_revocation'), 'retention_window');
assert.equal(nextOffboardingState('retention_window', 'cancel'), null, 'tenant não cancela depois da revogação');
assert.equal(nextOffboardingState('closed', 'cancel'), null);
for (const state of OFFBOARDING_STATES) assert.ok(OFFBOARDING_TRANSITIONS[state], `estado sem transições: ${state}`);
assert.ok(!/delete\s+from\s+public\.fin_organizations/i.test(migration), 'offboarding não pode apagar a organização em cascata');
assert.ok(!/on delete cascade/i.test(migration), 'governança não cria cascata');
assert.deepEqual(tenantRetentionClasses().map((entry) => entry.key).sort(), ['CONTACT_PII', 'SECURITY_EVENT', 'TEMPORARY_OPERATIONAL', 'WEBHOOK_DELIVERY']);

// 4. Validação de política: sem prazo inventado, sem classe de negócio.
assert.equal(validateRetentionPolicy({ retention_class: 'FINANCIAL_RECORD', retention_days: 365, reason: 'Apagar contratos antigos' }).ok, false);
assert.equal(validateRetentionPolicy({ retention_class: 'PLATFORM_TELEMETRY', retention_days: 60, reason: 'Classe de plataforma' }).ok, false);
assert.equal(validateRetentionPolicy({ retention_class: 'SECURITY_EVENT', retention_days: 30, reason: 'Abaixo do piso técnico' }).ok, false);
assert.equal(validateRetentionPolicy({ retention_class: 'TEMPORARY_OPERATIONAL', retention_days: 60, reason: 'curto' }).ok, false);
assert.equal(validateRetentionPolicy({ retention_class: 'TEMPORARY_OPERATIONAL', retention_days: 60, reason: 'Avisos antigos perdem utilidade', decision_reference: 'com espaço' }).ok, false);
assert.equal(validateRetentionPolicy({ retention_class: 'TEMPORARY_OPERATIONAL', retention_days: 60, reason: 'Avisos antigos perdem utilidade', decision_reference: 'TICKET-1' }).ok, true);
const summary = governanceCatalog();
assert.equal(summary.tables, Object.keys(DATA_REGISTRY).length);
assert.ok(!JSON.stringify(summary).match(/[0-9]{2,} ?(dias|days) (de|of) (retenção|retention) (legal|obrigatória)/i));

// 5. API (JWT do usuário, nunca service role; recusa antes do banco).
process.env.SUPABASE_URL = 'https://example.invalid';
process.env.SUPABASE_ANON_KEY = 'anon';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
const ORG = '00000000-0000-4000-8000-000000000601', ACTOR = '00000000-0000-4000-8000-000000000602', EXPORT = '00000000-0000-4000-8000-000000000603';
let sent = [];
let role = 'admin';
let kind = 'BUYER';
let responder = () => [];
globalThis.fetch = async (url, options = {}) => {
  const entry = { url: String(url), method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null, authorization: options.headers?.Authorization };
  sent.push(entry);
  if (entry.url.includes('fin_organizations?select=id')) return Response.json([{ id: ORG, legal_name: 'Grupo', kind }]);
  if (entry.url.includes('fin_members?select=role')) return Response.json([{ role }]);
  return Response.json(responder(entry) ?? []);
};
const deps = { requireUser: async () => ({ user: { id: ACTOR }, accessToken: 'user-jwt', headers: {} }), enforceRateLimit: async () => {} };
async function call(method, path, body = null) {
  const req = Object.assign(Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []), { method, url: `/api/finance/${path}`, headers: {} });
  const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.raw = value; try { this.payload = JSON.parse(value); } catch { this.payload = null; } } };
  await handleFinance(req, res, path.split('?')[0], deps);
  return res;
}
async function rejects(method, path, body, status) {
  await assert.rejects(() => call(method, path, body), (error) => { assert.equal(error.status, status, `${path}: ${error.status} ${error.message}`); return true; });
}
const rpcs = () => sent.filter((entry) => entry.url.includes('/rpc/'));

for (const denied of ['finance_manager', 'analyst', 'viewer', 'provider_user', undefined]) {
  role = denied;
  sent = [];
  await rejects('GET', `governance?organization_id=${ORG}`, null, 403);
  await rejects('POST', 'governance/exports', { organization_id: ORG }, 403);
  await rejects('POST', 'governance/offboarding', { organization_id: ORG, reason: 'Encerramento do contrato' }, 403);
  await rejects('POST', 'governance/legal-holds', { organization_id: ORG, scope_type: 'organization', reason: 'Auditoria externa em curso' }, 403);
  await rejects('POST', 'governance/retention-policies', { organization_id: ORG, retention_class: 'TEMPORARY_OPERATIONAL', retention_days: 60, reason: 'Avisos antigos' }, 403);
  assert.equal(rpcs().length, 0, `papel ${denied} chegou a RPC de governança`);
}
role = 'admin';
kind = 'PROVIDER';
sent = [];
await rejects('POST', 'governance/exports', { organization_id: ORG }, 400);
assert.equal(rpcs().length, 0, 'organização provedora chegou ao export');
kind = 'BUYER';

sent = [];
await rejects('POST', 'governance/retention-policies', { organization_id: ORG, retention_class: 'FINANCIAL_RECORD', retention_days: 60, reason: 'Apagar contratos antigos' }, 400);
await rejects('POST', 'governance/retention-policies', { organization_id: ORG, retention_class: 'SECURITY_EVENT', retention_days: 30, reason: 'Abaixo do piso técnico' }, 400);
await rejects('POST', 'governance/legal-holds', { organization_id: ORG, scope_type: 'everything', reason: 'Auditoria externa em curso' }, 400);
await rejects('POST', 'governance/legal-holds', { organization_id: ORG, scope_type: 'rfq', scope_id: 'not-a-uuid', reason: 'Auditoria externa em curso' }, 400);
await rejects('POST', 'governance/legal-holds', { organization_id: ORG, scope_type: 'retention_class', scope_class: 'FINANCIAL_RECORD', reason: 'Auditoria externa em curso' }, 400);
await rejects('POST', 'governance/legal-holds', { organization_id: ORG, scope_type: 'organization', reason: 'curto' }, 400);
await rejects('POST', 'governance/offboarding-action', { request_id: EXPORT, action: 'close' }, 400);
await rejects('POST', 'governance/offboarding-action', { request_id: EXPORT, action: 'confirm_revocation', retention_days: 30, decision_reference: 'DEC-1' }, 400);
await rejects('POST', 'governance/offboarding-action', { request_id: EXPORT, action: 'confirm_revocation', retention_days: 30, confirm: true }, 400);
await rejects('POST', 'governance/offboarding-action', { request_id: EXPORT, action: 'confirm_revocation', retention_days: -1, decision_reference: 'DEC-1', confirm: true }, 400);
await rejects('GET', `governance/export-download?export_id=${EXPORT}&dataset=../etc`, null, 400);
assert.equal(rpcs().length, 0, 'entrada inválida chegou ao banco');

responder = (entry) => (entry.url.includes('rpc/fin_governance_save_retention_policy') ? 'policy-1' : []);
sent = [];
const saved = await call('POST', 'governance/retention-policies', { organization_id: ORG, retention_class: 'TEMPORARY_OPERATIONAL', retention_days: 90, reason: 'Avisos antigos perdem utilidade', decision_reference: 'TICKET-9' });
assert.equal(saved.statusCode, 201);
assert.deepEqual(rpcs()[0].body, { p_org: ORG, p_class: 'TEMPORARY_OPERATIONAL', p_days: 90, p_reason: 'Avisos antigos perdem utilidade', p_decision_reference: 'TICKET-9' });
assert.equal(rpcs()[0].authorization, 'Bearer user-jwt');

sent = [];
await call('POST', 'governance/offboarding-action', { request_id: EXPORT, action: 'confirm_revocation', retention_days: 0, decision_reference: 'DEC-2026', confirm: true });
assert.deepEqual(rpcs()[0].body, { p_request: EXPORT, p_action: 'confirm_revocation', p_payload: { retention_days: 0, decision_reference: 'DEC-2026', export_waived: false } });

// Download: pacote único com as partes intactas; parte individual com o
// conteúdo exato (checksum do manifesto confere); pacote grande recusado.
const partContent = '[{"id": "x", "title": "RFQ ç"}]';
const checksum = createHash('sha256').update(partContent, 'utf8').digest('hex');
responder = (entry) => {
  if (entry.url.includes('rpc/fin_governance_export_manifest')) return { format: 'arandu-export', datasets: [{ dataset: 'rfqs', bytes: Buffer.byteLength(partContent), sha256: checksum }] };
  if (entry.url.includes('rpc/fin_governance_export_parts')) return [{ dataset: 'rfqs', sha256: checksum, content: partContent }];
  if (entry.url.includes('rpc/fin_governance_export_part')) return partContent;
  return [];
};
const bundle = await call('GET', `governance/export-download?export_id=${EXPORT}`);
assert.equal(bundle.statusCode, 200);
assert.match(bundle.headers['Content-Disposition'], /^attachment; filename="arandu-export-/);
assert.equal(bundle.headers['Cache-Control'], 'no-store');
assert.ok(bundle.raw.includes(`"rfqs":${partContent}`), 'parte alterada no pacote');
assert.equal(bundle.payload.manifest.datasets[0].sha256, checksum);
const part = await call('GET', `governance/export-download?export_id=${EXPORT}&dataset=rfqs`);
assert.equal(createHash('sha256').update(part.raw, 'utf8').digest('hex'), checksum, 'conteúdo da parte não confere com o checksum');
responder = (entry) => (entry.url.includes('rpc/fin_governance_export_manifest') ? { datasets: [{ dataset: 'events', bytes: 5_000_000 }] } : []);
await rejects('GET', `governance/export-download?export_id=${EXPORT}`, null, 413);
// Mensagens do banco viram mensagens fixas, sem detalhe interno.
globalThis.fetch = async (url, options = {}) => {
  if (String(url).includes('fin_organizations?select=id')) return Response.json([{ id: ORG, kind: 'BUYER' }]);
  if (String(url).includes('fin_members?select=role')) return Response.json([{ role: 'admin' }]);
  return Response.json({ message: 'export not available' }, { status: 400 });
};
await rejects('GET', `governance/export-download?export_id=${EXPORT}&dataset=rfqs`, null, 410);

// 6. Job: três etapas com lease próprio; falha parcial de export é falha
// visível e não impede as outras; resposta inválida não vira sucesso.
const jobCalls = [];
let buildResults = [{ processed: 1, status: 'ready' }, { processed: 1, status: 'failed', error_code: 'export_too_large' }, { processed: 0 }];
const fakeRpc = async (name, args) => {
  jobCalls.push(name);
  if (name === 'fin_job_begin') return { run_id: `run-${args.p_job}`, lease_token: 'lease' };
  if (name === 'fin_job_finish') return true;
  if (name === 'fin_governance_retention_run') return { dry_run: false, items: [], processed: 3, held: 1, exports_expired: 1 };
  if (name === 'fin_governance_build_export') return buildResults.shift();
  if (name === 'fin_governance_offboarding_advance') return { export_ready: 1, scheduled_for_deletion: 0, held: 0 };
  throw new Error(`unexpected ${name}`);
};
let clock = 0;
const jobs = await runGovernance({ deps: { rpc: fakeRpc, requestId: 'req-1', now: () => clock, timeoutMs: 1000 }, now: () => clock });
assert.deepEqual([jobs.retention.status, jobs.retention.processed], ['succeeded', 4]);
assert.deepEqual([jobs.data_exports.status, jobs.data_exports.processed, jobs.data_exports.failed, jobs.data_exports.error_code], ['failed', 1, 1, 'export_partial_failure']);
assert.deepEqual([jobs.offboarding.status, jobs.offboarding.processed], ['succeeded', 1]);
assert.equal(jobCalls.filter((name) => name === 'fin_job_begin').length, 3);
assert.equal(jobCalls.filter((name) => name === 'fin_job_finish').length, 3);
const invalid = await runGovernance({ deps: { rpc: async (name, args) => name === 'fin_job_begin' ? { run_id: `r-${args.p_job}`, lease_token: 'l' } : name === 'fin_job_finish' ? true : { processed: '5' }, requestId: 'req-2', now: () => 0, timeoutMs: 1000 }, now: () => 0 });
assert.equal(invalid.retention.status, 'failed');
assert.equal(invalid.offboarding.status, 'failed');
const busy = await runGovernance({ deps: { rpc: async () => null, requestId: 'req-3', now: () => 0, timeoutMs: 1000 }, now: () => 0 });
assert.ok(Object.values(busy).every((result) => result.status === 'busy'));

// Rota do cron: segredo obrigatório e 502 quando uma etapa falha.
const secret = 's'.repeat(40);
const cronReq = (authorization) => ({ method: 'GET', headers: { authorization } });
const cronRes = () => ({ headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.payload = JSON.parse(value); } });
const unauthorized = cronRes();
await handleFinanceJobs(cronReq('Bearer wrong'), unauthorized, 'governance', { env: { CRON_SECRET: secret }, rpc: fakeRpc, databaseReady: () => true });
assert.equal(unauthorized.statusCode, 401);
buildResults = [{ processed: 1, status: 'failed', error_code: 'export_build_failed' }, { processed: 0 }];
const failedRun = cronRes();
await handleFinanceJobs(cronReq(`Bearer ${secret}`), failedRun, 'governance', { env: { CRON_SECRET: secret }, rpc: fakeRpc, databaseReady: () => true, now: () => new Date() });
assert.equal(failedRun.statusCode, 502);
assert.equal(failedRun.payload.code, 'governance_job_failed');
assert.ok(!JSON.stringify(failedRun.payload).match(/password|secret|token/i));
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
assert.ok(vercel.crons.some((cron) => cron.path === '/api/jobs/governance'), 'cron de governança ausente');

console.log('Data governance: registro cobre todas as tabelas financeiras, paridade SQL/JS, validação antes do banco, papéis, download íntegro e job com fencing aprovados.');
