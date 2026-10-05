#!/usr/bin/env node
// Provider Qualification & Due Diligence: estados e transições (paridade
// SQL/JS), prontidão factual, validações antes do banco, API só com o JWT de
// quem chama, consulta informativa e linguagem sem alegação de KYC.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { AREAS, CATEGORIES, STATUS, TRANSITIONS, validateRequirement, validateEvidence, validateTransition, readiness, effectiveStatus, consultStatus } from '../lib/finance/qualification.mjs';
import { presentQualificationPage, presentQualificationDetail } from '../lib/finance/qualification-presenter.mjs';
import { DATA_REGISTRY } from '../lib/finance/data-governance.mjs';
import { handleFinance } from '../lib/api/domains/finance.mjs';

const T = '2026-10-05';
// 1. Validações.
assert.equal(validateRequirement({ area: 'legal', title: 'Contrato social' }), null);
for (const bad of [{ area: 'astrology', title: 'Mapa astral' }, { area: 'legal', title: 'x' }, { area: 'legal', title: '<b>x</b>' }, { area: 'legal', title: 'Ok title', category: 'crypto' }, { area: 'legal', title: 'Ok title', validity_days: 0 }]) assert.ok(validateRequirement(bad), JSON.stringify(bad));
assert.equal(validateEvidence({ source: 'external_service', external_service: 'KYB fixture', evidence_reference: 'REF-1' }, T), null);
assert.ok(validateEvidence({ source: 'external_service', evidence_reference: 'REF-1' }, T), 'serviço externo precisa de nome');
assert.ok(validateEvidence({ source: 'arandu_verified', evidence_reference: 'REF-1' }, T), 'não existe "verificado pelo Arandu"');
assert.ok(validateEvidence({ source: 'internal', evidence_reference: 'REF-1', valid_until: '2020-01-01' }, T));
assert.equal(validateTransition('not_started', { to_status: 'in_progress' }), null);
assert.ok(validateTransition('not_started', { to_status: 'qualified', reason: 'pular etapas sempre' }));
assert.ok(validateTransition('pending_internal_review', { to_status: 'qualified', reason: 'curto' }));
assert.ok(validateTransition('pending_internal_review', { to_status: 'qualified_with_conditions', reason: 'Exigências atendidas' }), 'condições obrigatórias');
assert.ok(validateTransition('rejected', { to_status: 'in_progress' }), 'reabrir decisão exige justificativa');

// 2. Paridade da máquina de estados SQL × JS.
const sql = readFileSync('docs/supabase-financial-provider-qualification.sql', 'utf8');
const fn = sql.slice(sql.indexOf('fin_transition_provider_qualification(p_qualification uuid'), sql.indexOf('revoke all on function public.fin_transition_provider_qualification'));
const caseBlock = fn.slice(fn.indexOf('case q.status'), fn.indexOf('else array[]::text[] end'));
const sqlTransitions = Object.fromEntries([...caseBlock.matchAll(/when '([a-z_]+)' then array\[([^\]]*)\]/g)].map(([, from, list]) => [from, list.match(/'([a-z_]+)'/g).map((x) => x.slice(1, -1))]));
assert.deepEqual(sqlTransitions, TRANSITIONS, 'transições divergem entre SQL e JS');
for (const s of Object.keys(STATUS)) assert.ok(sql.includes(`'${s}'`), s);
for (const a of Object.keys(AREAS)) assert.ok(sql.includes(`'${a}'`), a);
for (const c of Object.keys(CATEGORIES)) assert.ok(sql.includes(`'${c}'`), c);
assert.match(sql, /check \(decided_by is null or decided_by <> requested_by\)/, 'SoD da exceção no schema');
assert.match(sql, /e\.created_by = auth\.uid\(\) then raise exception 'segregation of duties'/, 'SoD da evidência');
for (const table of ['fin_qualification_requirements', 'fin_provider_qualifications', 'fin_qualification_evidence', 'fin_qualification_exceptions', 'fin_qualification_events']) {
  assert.ok(DATA_REGISTRY[table]?.export_dataset, table);
  assert.ok(sql.includes(`alter table public.${table} force row level security`), table);
}
assert.ok(!/grant (insert|update|delete)[^;]*to authenticated/i.test(sql));

// 3. Prontidão: decide só o que é permitido, nunca o resultado.
const reqs = [{ id: 'r1', title: 'Contrato social', area: 'legal', critical: true }, { id: 'r2', title: 'SOC 2', area: 'security' }];
let r = readiness(reqs, [], [], T);
assert.equal(r.missing, 2); assert.deepEqual(r.allowed, []);
r = readiness(reqs, [{ requirement_id: 'r1', status: 'accepted', valid_until: '2027-01-01' }, { requirement_id: 'r2', status: 'submitted' }], [], T);
assert.equal(r.items[1].state, 'under_review'); assert.deepEqual(r.allowed, []);
r = readiness(reqs, [{ requirement_id: 'r1', status: 'accepted', valid_until: '2027-01-01' }], [{ requirement_id: 'r2', status: 'approved', expires_on: '2026-12-01' }], T);
assert.deepEqual(r.allowed, ['qualified_with_conditions', 'rejected']); assert.equal(r.valid_until, '2026-12-01');
r = readiness(reqs, [{ requirement_id: 'r1', status: 'accepted', valid_until: '2026-01-01' }, { requirement_id: 'r2', status: 'accepted' }], [], T);
assert.equal(r.items[0].state, 'missing', 'evidência vencida não conta');
assert.equal(effectiveStatus({ status: 'qualified', valid_until: '2026-10-04' }, T), 'expired');
assert.equal(consultStatus(null, T), 'unknown'); assert.equal(consultStatus({ status: 'qualified_with_conditions', valid_until: '2027-01-01' }, T), 'conditional');
assert.equal(consultStatus({ status: 'pending_provider' }, T), 'in_progress');

// 4. API.
const ORG = '00000000-0000-4000-8000-0000000a0001', P = '00000000-0000-4000-8000-0000000a0002', Q = '00000000-0000-4000-8000-0000000a0003', R = '00000000-0000-4000-8000-0000000a0004';
process.env.SUPABASE_URL = 'https://fixture.example.invalid'; process.env.SUPABASE_ANON_KEY = 'fixture-public'; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
let sent = [];
globalThis.fetch = async (url, options = {}) => {
  const u = new URL(url);
  sent.push({ url: u.pathname, search: decodeURIComponent(u.search), headers: options.headers, payload: options.body ? JSON.parse(options.body) : null });
  if (u.pathname.endsWith('/fin_organizations')) return new Response(JSON.stringify([{ id: ORG, kind: 'BUYER' }]));
  if (u.pathname.endsWith('/fin_provider_qualifications')) return new Response(JSON.stringify([{ id: Q, organization_id: ORG, provider_id: P, legal_entity_id: null, category: 'acquiring', status: 'pending_internal_review', owner_id: ORG, updated_at: '2026-10-05T10:00:00Z' }]));
  if (u.pathname.endsWith('/fin_qualification_requirements')) return new Response(JSON.stringify([{ id: R, area: 'legal', title: 'Contrato social', category: 'all', version: 1, critical: true }]));
  if (u.pathname.endsWith('/fin_providers')) return new Response(JSON.stringify([{ id: P, name: 'Banco fixture' }]));
  if (u.pathname.endsWith('/fin_provider_qualification_status')) return new Response(JSON.stringify('conditional'));
  if (u.pathname.includes('/rpc/fin_')) return new Response(JSON.stringify(Q));
  return new Response('[]');
};
const deps = { requireUser: async () => ({ user: { id: ORG }, accessToken: 'caller-jwt', headers: {} }), enforceRateLimit: async () => {} };
async function call(method, path, body = null) {
  const req = Object.assign(Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []), { method, url: `/api/finance/${path}`, headers: {} });
  const res = { setHeader() {}, end(raw) { this.payload = JSON.parse(raw); } };
  await handleFinance(req, res, path.split('?')[0], deps);
  return res.payload;
}
let data = await call('GET', `qualifications?organization_id=${ORG}&status=pending_internal_review`);
assert.equal(data.rows.length, 1); assert.ok(data.forms.some((f) => f.post === 'qualifications/open'));
await assert.rejects(() => call('GET', `qualifications?organization_id=${ORG}&status=approved_by_ai`), (e) => e.status === 400);
data = await call('GET', `qualifications/detail?id=${Q}`);
assert.match(data.lines.join(' '), /Qualificar indisponível até atender as pendências/);
assert.ok(data.actions.find((a) => a.post === 'qualifications/transition').fields[0][2].every(([to]) => !['qualified', 'qualified_with_conditions'].includes(to)), 'decisão de qualificar escondida sem prontidão');
data = await call('GET', `qualifications/status?organization_id=${ORG}&provider_id=${P}&category=acquiring`);
assert.equal(data.status, 'conditional'); assert.match(data.notice, /não escolhe provedor/);
sent = [];
await assert.rejects(() => call('POST', 'qualifications/transition', { qualification_id: Q, expected_status: 'not_started', to_status: 'qualified', reason: 'pular etapas' }), (e) => e.status === 400);
await assert.rejects(() => call('POST', 'qualifications/evidence', { qualification_id: Q, requirement_id: R, source: 'arandu_verified', evidence_reference: 'X-1' }), (e) => e.status === 400);
await assert.rejects(() => call('POST', 'qualifications/exception', { qualification_id: Q, requirement_id: R, reason: 'curto', expires_on: '2026-12-01' }), (e) => e.status === 400);
await assert.rejects(() => call('POST', 'qualifications/requirement', { organization_id: ORG, area: 'astrology', title: 'Mapa' }), (e) => e.status === 400);
assert.ok(!sent.some((s) => s.url.includes('/rpc/')), 'entrada inválida chegou a uma RPC de escrita');
data = await call('POST', 'qualifications/transition', { qualification_id: Q, expected_status: 'pending_internal_review', to_status: 'qualified_with_conditions', reason: 'Exigências atendidas e revisadas', conditions: 'Entregar SOC 2 em 90 dias' });
assert.equal(data.id, Q);
const t = sent.find((s) => s.url.endsWith('fin_transition_provider_qualification')).payload;
assert.equal(t.p_expected, 'pending_internal_review'); assert.ok(!('qualification_id' in t.p_input) && !('expected_status' in t.p_input));
await call('POST', 'qualifications/requirement', { organization_id: ORG, area: 'legal', title: 'Contrato social', critical: 'true', validity_days: '365' });
const reqPayload = sent.find((s) => s.url.endsWith('fin_set_qualification_requirement')).payload.p_input;
assert.equal(reqPayload.critical, true); assert.equal(reqPayload.validity_days, 365);
for (const s of sent) assert.equal(s.headers.Authorization, 'Bearer caller-jwt', 'sem fallback para service role');

// 5. Linguagem: sem alegação de verificação própria nem recomendação.
const page = presentQualificationPage({ rows: [], providers: [], entities: [], members: [], requirements: [], next: null, today: T });
assert.match(page.cards[0].lines.join(" "), /Não escolhe provedor nem substitui verificação especializada/);
const detail = presentQualificationDetail({ qualification: { id: Q, provider_id: P, category: 'acquiring', status: 'qualified', valid_until: '2026-10-01', decided_at: '2026-01-01T00:00:00Z', decision_reason: 'Atendeu tudo' }, provider: { name: 'Banco' }, requirements: reqs, evidence: [], exceptions: [], events: [], today: T });
assert.match(detail.lines[0], /^Vencida \(registrada como Qualificado/);
for (const file of ['lib/finance/qualification.mjs', 'lib/finance/qualification-presenter.mjs', 'lib/api/domains/finance-qualifications.mjs', 'finance/src/views/qualifications.js']) {
  const source = readFileSync(file, 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(source, /verificado pelo Arandu|aprovado pelo Arandu|melhor provedor|recomendamos|recommended provider|KYC aprovado/i, file);
}
assert.match(readFileSync('finance/app.js', 'utf8'), /qualifications: lazy\(/);
console.log('Provider qualification: validações, paridade SQL/JS da máquina de estados, prontidão factual, SoD, API só com JWT, consulta informativa e linguagem sem alegação de KYC aprovados.');
