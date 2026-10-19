#!/usr/bin/env node
// Fase 5 da integração efêmera: sondas adversariais sobre a Demo já semeada.
//
// Cobre o que a jornada (scripts/pilot-local/journey.mjs) não exercita:
// sessão depois do logout e cookie adulterado, acesso entre organizações por
// UUID conhecido (API, PostgREST e RPC direta), concorrência real de escritas
// (registro de contrato, concorrência de renovação, voto de aprovação) e o
// ciclo de vida da renovação depois de um aditivo de prorrogação. Cada sonda
// confere o estado persistido no Postgres, não só o status HTTP.
//
// Escreve no banco da Demo efêmera (contratos e votos sintéticos): roda por
// último, depois do E2E e da jornada. Variáveis: as de scripts/ci-demo/run.sh.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { assertLocalEnv } from './assert-local.mjs';
import { BUYERS, PROVIDERS } from '../../lib/finance/demo-personas.mjs';
import { decodeSessionValue, encodeSessionValue } from '../../lib/session-cookie.mjs';
import { rehearsalOrganizationId, rehearsalSqlFailure } from '../../lib/demo-rehearsal-context.mjs';

assertLocalEnv(process.env, 'adversarial');
const APP = process.env.ARANDU_DEMO_APP_URL;
const SB = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const DB = process.env.PILOT_DB_URL;
const PASSWORD = process.env.ARANDU_DEMO_PASSWORD;
for (const [name, value] of Object.entries({ ARANDU_DEMO_APP_URL: APP, SUPABASE_URL: SB, SUPABASE_ANON_KEY: ANON, PILOT_DB_URL: DB, ARANDU_DEMO_PASSWORD: PASSWORD })) {
  if (!value) { console.error(`${name} ausente.`); process.exit(2); }
}
const RUN = crypto.randomBytes(3).toString('hex');
const results = [];
const must = (condition, message) => { if (!condition) throw new Error(message); };
// Sonda sem a pré-condição no dataset não vira PASS nem FAIL: fica SKIPPED, com o motivo.
class Skip extends Error {}
async function probe(id, name, fn) {
  try { results.push({ id, name, status: 'PASS', evidence: String(await fn() ?? '') }); }
  catch (error) { results.push({ id, name, status: error instanceof Skip ? 'SKIPPED' : 'FAIL', evidence: error.message }); }
}
function sql(query) {
  const r = spawnSync('psql', [DB, '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate', '-At', '-c', query], { encoding: 'utf8', timeout: 30_000 });
  if (r.status !== 0) throw new Error(rehearsalSqlFailure(r.stderr));
  return r.stdout.trim();
}
const isoDay = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

async function api(who, method, path, body) {
  const headers = { Origin: APP, 'Content-Type': 'application/json' };
  if (who?.cookie) headers.Cookie = who.cookie;
  const response = await fetch(`${APP}${path}`, { method, headers, signal: AbortSignal.timeout(30_000), ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 200) }; }
  const session = (response.headers.getSetCookie?.() || []).find((value) => value.startsWith('arandu_session='));
  if (who && session) who.cookie = session.split(';')[0];
  return { status: response.status, data };
}
const token = (who) => decodeSessionValue(decodeURIComponent(who.cookie.split('=')[1])).access_token;
async function rest(who, path, init = {}) {
  const response = await fetch(`${SB}/rest/v1/${path}`, { ...init, signal: AbortSignal.timeout(30_000),
    headers: { apikey: ANON, Authorization: `Bearer ${who ? token(who) : ANON}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data };
}
const rpc = (who, fn, args) => rest(who, `rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
async function login(email) {
  const who = { email };
  const r = await api(who, 'POST', '/api/auth/login', { email, password: PASSWORD });
  must(r.status === 200 && who.cookie, `login ${email}: ${r.status} ${r.data?.code || ''}`);
  return who;
}

// ------------------------------------------------------------------ contexto
const juliana = await login(BUYERS.juliana.email);   // finance_manager da Vitta
const helena = await login(BUYERS.helena.email);     // admin (CFO) da Vitta
const carlos = await login(BUYERS.carlos.email);     // viewer da Vitta
const eduardo = await login(PROVIDERS.atlas.person.email); // provedor (Atlas Bank)
const vitta = rehearsalOrganizationId(await api(juliana, 'GET', '/api/finance/organizations'), { kind: 'BUYER', legalName: 'Vitta Foods S.A.' });
const atlasOrg = rehearsalOrganizationId(await api(eduardo, 'GET', '/api/finance/organizations'), { kind: 'PROVIDER', legalName: 'Atlas Bank S.A.' });
const vittaContract = sql(`select id from public.fin_contracts where organization_id = '${vitta}' order by created_at limit 1`);
const vittaRfq = sql(`select id from public.fin_rfqs where organization_id = '${vitta}' order by created_at limit 1`);
const vittaProvider = sql(`select id from public.fin_providers where organization_id = '${vitta}' and name = 'Atlas Bank'`);
must(vitta && atlasOrg && vittaContract && vittaRfq && vittaProvider, 'dataset da Demo incompleto');

// --------------------------------------------------------------- 1. sessão
await probe('AUTH-1', 'Cookie com assinatura adulterada é recusado', async () => {
  const [name, value] = juliana.cookie.split('=');
  const raw = decodeURIComponent(value);
  const flipped = raw.slice(0, -2) + (raw.at(-2) === 'A' ? 'B' : 'A') + raw.at(-1);
  const r = await api({ cookie: `${name}=${encodeURIComponent(flipped)}` }, 'GET', '/api/auth/session');
  must(r.status === 200 && r.data.authenticated === false, `adulterado autenticou: ${JSON.stringify(r.data).slice(0, 120)}`);
  return 'authenticated=false';
});
await probe('AUTH-2', 'Cookie forjado sem assinatura (token válido de outra sessão) é recusado', async () => {
  const session = decodeSessionValue(decodeURIComponent(juliana.cookie.split('=')[1]));
  const forged = `arandu_session=${encodeURIComponent(Buffer.from(JSON.stringify(session)).toString('base64url'))}`;
  const r = await api({ cookie: forged }, 'GET', `/api/finance/contracts?organization_id=${vitta}`);
  must(r.status === 401, `cookie sem assinatura: HTTP ${r.status}`);
  return `HTTP ${r.status}`;
});
await probe('AUTH-3', 'Depois do logout, o cookie antigo não abre a API do Arandu', async () => {
  const victim = await login(BUYERS.rafael.email);
  const stolen = victim.cookie;
  must((await api(victim, 'GET', `/api/finance/contracts?organization_id=${vitta}`)).status === 200, 'pré-condição: sessão válida');
  must((await api(victim, 'POST', '/api/auth/logout', {})).status === 200, 'logout falhou');
  const r = await api({ cookie: stolen }, 'GET', `/api/finance/contracts?organization_id=${vitta}`);
  must(r.status === 401, `cookie copiado antes do logout ainda vale na API: HTTP ${r.status}`);
  return `HTTP ${r.status} após logout`;
});
await probe('AUTH-4', 'JWT assinado com outro segredo é recusado pelo PostgREST', async () => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ sub: crypto.randomUUID(), role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 600 });
  const sig = crypto.createHmac('sha256', 'outro-segredo').update(`${head}.${body}`).digest('base64url');
  const r = await fetch(`${SB}/rest/v1/fin_contracts?select=id`, { headers: { apikey: ANON, Authorization: `Bearer ${head}.${body}.${sig}` } });
  must(r.status === 401, `JWT forjado: HTTP ${r.status}`);
  return `HTTP ${r.status}`;
});
await probe('AUTH-5', 'JWT com alg "none" é recusado pelo PostgREST', async () => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const forged = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: crypto.randomUUID(), role: 'service_role', exp: Math.floor(Date.now() / 1000) + 600 })}.`;
  const r = await fetch(`${SB}/rest/v1/fin_contracts?select=id`, { headers: { apikey: ANON, Authorization: `Bearer ${forged}` } });
  must(r.status === 401, `alg none: HTTP ${r.status}`);
  return `HTTP ${r.status}`;
});

// ---------------------------------------------------- 2. entre organizações
await probe('TENANT-1', 'Provedor lê contrato da compradora pela API (UUID conhecido)', async () => {
  const r = await api(eduardo, 'GET', `/api/finance/contract-detail?id=${vittaContract}`);
  must(r.status === 404 && !JSON.stringify(r.data).includes('Vitta'), `HTTP ${r.status}`);
  return `HTTP ${r.status} ${r.data.code}`;
});
await probe('TENANT-2', 'Provedor lista contratos passando organization_id da compradora', async () => {
  const r = await api(eduardo, 'GET', `/api/finance/contracts?organization_id=${vitta}`);
  must(r.status === 403, `HTTP ${r.status}`);
  return `HTTP ${r.status} ${r.data.code}`;
});
await probe('TENANT-3', 'Provedor lê tabelas da compradora direto no PostgREST (contratos, tarefas, versões, aprovações, decisões)', async () => {
  const counts = [];
  for (const table of ['fin_contracts', 'fin_tasks', 'fin_contract_versions', 'fin_approval_requests', 'fin_decisions', 'fin_providers']) {
    const r = await rest(eduardo, `${table}?select=*&organization_id=eq.${vitta}`);
    must(r.status === 200 && Array.isArray(r.data) && r.data.length === 0, `${table}: HTTP ${r.status}, ${Array.isArray(r.data) ? r.data.length : '?'} linha(s)`);
    counts.push(`${table}=0`);
  }
  return counts.join(' ');
});
await probe('TENANT-3b', 'Provedor vê só documentos compartilhados com ele (nunca internos nem de proposta concorrente)', async () => {
  const r = await rest(eduardo, `fin_private_documents?select=id,visibility,entity_type,organization_id&buyer_organization_id=eq.${vitta}`);
  must(r.status === 200 && Array.isArray(r.data), `HTTP ${r.status}`);
  const internal = r.data.filter((row) => row.visibility !== 'shared');
  const foreign = r.data.filter((row) => row.entity_type === 'proposal' && row.organization_id !== atlasOrg);
  must(!internal.length && !foreign.length, `${internal.length} interno(s), ${foreign.length} de concorrente`);
  return `${r.data.length} compartilhado(s) com o Atlas; 0 interno; 0 de concorrente`;
});
await probe('TENANT-4', 'Provedor chama RPCs de escrita com IDs da compradora (aditivo, renovação, termos, marco)', async () => {
  const before = sql(`select count(*) from public.fin_contract_amendments where contract_id = '${vittaContract}'`) + '/' +
    sql(`select count(*) from public.fin_rfqs where organization_id = '${vitta}'`);
  const calls = [
    rpc(eduardo, 'fin_record_contract_amendment', { p_contract: vittaContract, p_title: 'Intruso', p_effective_from: isoDay(0), p_summary: 'tentativa de escrita cruzada', p_new_ends_on: isoDay(900) }),
    rpc(eduardo, 'fin_start_contract_rfq', { p_contract: vittaContract }),
    rpc(eduardo, 'fin_record_contract_terms', { p_contract: vittaContract, p_terms: {}, p_expected: 1, p_reason: 'x', p_effective_from: null }),
    rpc(eduardo, 'fin_create_contract_milestone', { p_contract: vittaContract, p_kind: 'review', p_title: 'Intruso', p_due_on: isoDay(10), p_lead_days: 1, p_recurrence: 'none', p_ends_after: null, p_owner: null })
  ];
  const outcomes = await Promise.all(calls);
  for (const r of outcomes) must(r.status >= 400, `RPC aceita: HTTP ${r.status}`);
  const after = sql(`select count(*) from public.fin_contract_amendments where contract_id = '${vittaContract}'`) + '/' +
    sql(`select count(*) from public.fin_rfqs where organization_id = '${vitta}'`);
  must(before === after, `estado mudou: ${before} → ${after}`);
  return `${outcomes.map((r) => r.status).join(',')}; aditivos/RFQs ${before} inalterados`;
});
await probe('TENANT-5', 'Provedor registra contrato na organização da compradora (contract-import)', async () => {
  const r = await api(eduardo, 'POST', '/api/finance/contract-import', { organization_id: vitta, provider_id: vittaProvider, product: 'credit', title: `Intruso ${RUN}`, starts_on: isoDay(-10), ends_on: isoDay(300) });
  must(r.status === 403, `HTTP ${r.status}`);
  return `HTTP ${r.status} ${r.data.code}`;
});
await probe('TENANT-6', 'Compradora usa provider_id de outra organização ao registrar contrato', async () => {
  const foreignProvider = sql(`select p.id from public.fin_providers p where p.organization_id <> '${vitta}' limit 1`);
  if (!foreignProvider) throw new Skip('nenhum cadastro de provedor de outra organização no banco (a jornada cria um)');
  const r = await api(juliana, 'POST', '/api/finance/contract-import', { organization_id: vitta, provider_id: foreignProvider, product: 'credit', title: `Cruzado ${RUN}`, starts_on: isoDay(-10), ends_on: isoDay(300) });
  must(r.status === 404, `HTTP ${r.status}`);
  return `HTTP ${r.status} ${r.data.code}`;
});
await probe('RBAC-1', 'Viewer (Controller) não registra contrato nem inicia renovação', async () => {
  const a = await api(carlos, 'POST', '/api/finance/contract-import', { organization_id: vitta, provider_id: vittaProvider, product: 'credit', title: `Viewer ${RUN}`, starts_on: isoDay(-10), ends_on: isoDay(300) });
  const b = await api(carlos, 'POST', '/api/finance/contract-renewal-rfq', { organization_id: vitta, contract_id: vittaContract });
  must(a.status === 403 && b.status === 403, `import ${a.status}, renovação ${b.status}`);
  return `import ${a.status}, renovação ${b.status}`;
});

// ---------------------------------------------------------- 3. concorrência
await probe('CONC-1', 'Seis registros simultâneos do mesmo contrato geram um só contrato e uma só tarefa', async () => {
  const body = { organization_id: vitta, provider_id: vittaProvider, product: 'credit', title: `Concorrente ${RUN}`, starts_on: isoDay(-30), ends_on: isoDay(400), renewal_notice_days: 60 };
  const outcomes = await Promise.all(Array.from({ length: 6 }, () => api(juliana, 'POST', '/api/finance/contract-import', body)));
  const created = outcomes.filter((r) => r.status === 201).length;
  const rows = Number(sql(`select count(*) from public.fin_contracts where organization_id = '${vitta}' and title = 'Concorrente ${RUN}'`));
  const tasks = Number(sql(`select count(*) from public.fin_tasks t join public.fin_contracts c on c.id = t.related_id where c.title = 'Concorrente ${RUN}' and t.status = 'open'`));
  must(created === 1 && rows === 1 && tasks === 1, `201=${created}, contratos=${rows}, tarefas=${tasks}, status=${outcomes.map((r) => r.status).join(',')}`);
  return `1×201, ${outcomes.filter((r) => r.status === 409).length}×409; 1 contrato, 1 tarefa`;
});
await probe('CONC-2', 'Seis pedidos simultâneos de concorrência de renovação devolvem a mesma RFQ', async () => {
  const contract = sql(`select id from public.fin_contracts where organization_id = '${vitta}' and title = 'Concorrente ${RUN}'`);
  must(contract, 'contrato de CONC-1 ausente');
  const outcomes = await Promise.all(Array.from({ length: 6 }, () => api(juliana, 'POST', '/api/finance/contract-renewal-rfq', { organization_id: vitta, contract_id: contract })));
  const ids = new Set(outcomes.filter((r) => r.status === 201).map((r) => r.data.id));
  const rfqs = Number(sql(`select count(*) from public.fin_events where event_type = 'rfq_created_from_contract' and metadata->>'contract_id' = '${contract}'`));
  const status = sql(`select status from public.fin_contracts where id = '${contract}'`);
  must(ids.size === 1 && rfqs === 1 && status === 'renewing', `ids=${ids.size}, rfqs=${rfqs}, status=${status}, http=${outcomes.map((r) => r.status).join(',')}`);
  return `1 RFQ, contrato em ${status}`;
});
await probe('CONC-3', 'Dois votos simultâneos da CFO na etapa pendente gravam um só voto', async () => {
  const request = sql(`select r.id from public.fin_approval_requests r join public.fin_approval_steps s on s.request_id = r.id
    join auth.users u on u.id = s.approver_id where r.organization_id = '${vitta}' and r.status = 'pending' and s.status = 'pending' and u.email = '${BUYERS.helena.email}' limit 1`);
  if (!request) throw new Skip('nenhuma aprovação pendente da CFO no banco (o seed cria uma; banco reaproveitado?)');
  const before = sql(`select count(*) filter (where status = 'approved') from public.fin_approval_steps where request_id = '${request}'`);
  const vote = () => api(helena, 'POST', '/api/finance/approvals/act', { request_id: request, action: 'approved', comment: `Voto concorrente ${RUN}` });
  const outcomes = await Promise.all([vote(), vote()]);
  const ok = outcomes.filter((r) => r.status < 300).length;
  const after = sql(`select count(*) filter (where status = 'approved') from public.fin_approval_steps where request_id = '${request}'`);
  const events = Number(sql(`select count(*) from public.fin_events where entity_id = '${request}' and event_type like 'approval_step%' and happened_at > now() - interval '2 minutes'`));
  must(ok === 1 && Number(after) === Number(before) + 1, `sucessos=${ok}, aprovados ${before}→${after}, http=${outcomes.map((r) => `${r.status}:${r.data.code || ''}`).join(',')}`);
  return `1 sucesso + ${outcomes.map((r) => r.status).filter((s) => s >= 400).join(',')}; etapas aprovadas ${before}→${after}; eventos recentes ${events}`;
});

// ------------------------------------------------- 4. ciclo de renovação
await probe('DEC-1', 'Decisão com versão de proposta diferente da que está na tela é recusada sem gravar nada', async () => {
  const row = sql(`select p.rfq_id || '|' || p.id || '|' || p.current_version from public.fin_proposals p join public.fin_rfqs r on r.id = p.rfq_id
    where r.organization_id = '${vitta}' and r.status in ('collecting','comparing') and p.current_version >= 1 order by p.created_at limit 1`);
  if (!row) throw new Skip('nenhuma RFQ da Vitta aberta com proposta no seed');
  const [rfq, proposal, version] = row.split('|');
  const before = sql(`select count(*) from public.fin_decisions where rfq_id = '${rfq}'`);
  const stale = await api(juliana, 'POST', '/api/finance/decisions', { rfq_id: rfq, proposal_id: proposal, expected_version: Number(version) + 1, rationale: 'versão que a pessoa não viu' });
  const missing = await api(juliana, 'POST', '/api/finance/decisions', { rfq_id: rfq, proposal_id: proposal, rationale: 'sem versão' });
  must(stale.status === 409 && stale.data.code === 'proposal_version_changed', `versão divergente: HTTP ${stale.status} ${stale.data.code}`);
  must(missing.status === 400 && missing.data.code === 'expected_version_required', `sem versão: HTTP ${missing.status} ${missing.data.code}`);
  must(sql(`select count(*) from public.fin_decisions where rfq_id = '${rfq}'`) === before, 'decisão gravada apesar da recusa');
  return `versão ${Number(version) + 1} ≠ ${version}: 409; sem versão: 400; decisões ${before} inalteradas`;
});
await probe('RENEW-1', 'Aditivo de prorrogação tira o contrato de "em renovação" e move a próxima ação', async () => {
  const title = `Prorrogado ${RUN}`;
  const created = await api(juliana, 'POST', '/api/finance/contract-import', { organization_id: vitta, provider_id: vittaProvider, product: 'credit', title, starts_on: isoDay(-340), ends_on: isoDay(20), renewal_notice_days: 60 });
  must(created.status === 201 && created.data.status === 'renewing', `registro: ${created.status} ${created.data.status}`);
  const amended = await api(juliana, 'POST', '/api/finance/contract-amendments', { contract_id: created.data.id, title: 'Prorrogação por 12 meses', effective_from: isoDay(0), summary: 'Prazo prorrogado por 12 meses.', new_ends_on: isoDay(385) });
  must(amended.status === 201, `aditivo: ${amended.status} ${amended.data.code}`);
  const [status, due] = sql(`select c.status || '|' || coalesce((select min(t.due_on)::text from public.fin_tasks t where t.related_type = 'contract' and t.related_id = c.id and t.status = 'open'), '') from public.fin_contracts c where c.id = '${created.data.id}'`).split('|');
  must(status === 'active' && due === isoDay(325), `depois do aditivo: status ${status}, próxima ação ${due} (esperado active e ${isoDay(325)})`);
  return `active, próxima ação ${due}`;
});
await probe('RENEW-2', 'Depois da prorrogação, o novo vencimento volta a gerar marco e aviso de renovação', async () => {
  const title = `Ciclo ${RUN}`;
  const created = await api(juliana, 'POST', '/api/finance/contract-import', { organization_id: vitta, provider_id: vittaProvider, product: 'credit', title, starts_on: isoDay(-340), ends_on: isoDay(20), renewal_notice_days: 60 });
  must(created.status === 201, `registro: ${created.status}`);
  const id = created.data.id;
  sql('select public.fin_run_renewal_schedule(current_date)');
  const first = Number(sql(`select count(*) from public.fin_renewal_milestones where contract_id = '${id}'`));
  // Prorroga e, para simular o ano seguinte sem relógio falso, um segundo aditivo
  // traz o fim de novo para daqui a 20 dias (é o que a agenda enxerga).
  for (const [label, ends] of [['Prorrogação', isoDay(385)], ['Fim ajustado', isoDay(19)]]) {
    const r = await api(juliana, 'POST', '/api/finance/contract-amendments', { contract_id: id, title: label, effective_from: isoDay(0), summary: `${label} do contrato.`, new_ends_on: ends });
    must(r.status === 201, `${label}: ${r.status} ${r.data.code}`);
  }
  sql('select public.fin_run_renewal_schedule(current_date)');
  const second = Number(sql(`select count(*) from public.fin_renewal_milestones where contract_id = '${id}'`));
  const notices = Number(sql(`select count(*) from public.fin_notifications where object_id = '${id}' and event_type = 'renewal_due'`));
  must(first === 1 && second === 2 && notices === 2, `marcos ${first}→${second}, avisos ${notices} (esperado 1→2 e 2 avisos)`);
  return `marcos 1→2, ${notices} avisos`;
});

// ------------------------------------------------------- 5. multi-entity
// A Demo não semeia entidades: o cenário nasce aqui, pela API real. O analista
// (Rafael) fica restrito à entidade A; um contrato é registrado em cada entidade.
const ent = {};
await probe('MENT-0', 'Cenário: duas entidades, analista restrito à entidade A, um contrato em cada', async () => {
  for (const key of ['A', 'B']) {
    const r = await api(helena, 'POST', '/api/finance/entities', { organization_id: vitta, kind: 'legal_entity', legal_name: `Vitta ${key} ${RUN} Ltda`, short_name: `V${key}${RUN}`.slice(0, 20), country: 'BR', currency: 'BRL' });
    must(r.status === 201, `entidade ${key}: ${r.status} ${r.data.code || ''}`);
    ent[key] = r.data.id;
  }
  const rafaelId = sql(`select id from auth.users where email = '${BUYERS.rafael.email}'`);
  const scoped = await api(helena, 'PUT', '/api/finance/entity-scopes', { organization_id: vitta, user_id: rafaelId, scope: 'entities', entity_ids: [ent.A] });
  must(scoped.status === 200, `escopo: ${scoped.status} ${scoped.data.code || ''}`);
  for (const key of ['A', 'B']) {
    const r = await api(juliana, 'POST', '/api/finance/contract-import', { organization_id: vitta, legal_entity_id: ent[key], provider_id: vittaProvider, product: 'credit',
      title: `Entidade ${key} ${RUN}`, starts_on: isoDay(-30), ends_on: isoDay(400) });
    must(r.status === 201, `contrato ${key}: ${r.status} ${r.data.code || ''}`);
    ent[`contract${key}`] = r.data.id;
  }
  return 'entidades A/B, Rafael restrito a A, contratos em A e B';
});
const rafael = await login(BUYERS.rafael.email);
await probe('MENT-1', 'Analista restrito não abre contrato da outra entidade (API, UUID conhecido)', async () => {
  must(ent.contractB, 'cenário ausente');
  const own = await api(rafael, 'GET', `/api/finance/contract-detail?id=${ent.contractA}`);
  const other = await api(rafael, 'GET', `/api/finance/contract-detail?id=${ent.contractB}`);
  must(own.status === 200 && other.status === 404, `A ${own.status}, B ${other.status}`);
  return `A 200, B ${other.status}`;
});
await probe('MENT-2', 'Listas, busca e tarefas do analista restrito não citam a outra entidade', async () => {
  must(ent.contractB, 'cenário ausente');
  const responses = await Promise.all([
    api(rafael, 'GET', `/api/finance/contracts?organization_id=${vitta}`),
    api(rafael, 'GET', `/api/finance/tasks?organization_id=${vitta}`),
    api(rafael, 'GET', `/api/finance/search?organization_id=${vitta}&q=${encodeURIComponent(`Entidade B ${RUN}`)}`),
    api(rafael, 'GET', `/api/finance/dashboard?organization_id=${vitta}`)
  ]);
  const leaks = responses.map((r, index) => [['contracts', 'tasks', 'search', 'dashboard'][index], r]).filter(([, r]) => {
    const text = JSON.stringify(r.data);
    return text.includes(ent.contractB) || text.includes(`Entidade B ${RUN}`);
  });
  must(responses.every((r) => r.status === 200), `HTTP ${responses.map((r) => r.status).join(',')}`);
  must(!leaks.length, `contrato da entidade B aparece em: ${leaks.map(([name]) => name).join(', ')}`);
  return 'contracts, tasks, search e dashboard sem a entidade B';
});
await probe('MENT-3', 'Analista restrito no PostgREST direto: contrato, versões, tarefas e eventos da outra entidade', async () => {
  must(ent.contractB, 'cenário ausente');
  const checks = [
    ['fin_contracts', `id=eq.${ent.contractB}`], ['fin_contract_versions', `contract_id=eq.${ent.contractB}`],
    ['fin_tasks', `related_id=eq.${ent.contractB}`], ['fin_events', `entity_id=eq.${ent.contractB}`]
  ];
  for (const [table, filter] of checks) {
    const r = await rest(rafael, `${table}?select=*&${filter}`);
    must(r.status === 200 && Array.isArray(r.data) && r.data.length === 0, `${table}: ${Array.isArray(r.data) ? r.data.length : r.status} linha(s)`);
  }
  const own = await rest(rafael, `fin_contracts?select=id&id=eq.${ent.contractA}`);
  must(own.data.length === 1, 'pré-condição: o próprio contrato visível');
  return '0 linhas da entidade B em 4 tabelas; contrato A visível';
});
await probe('MENT-4', 'Contrato do grupo é invisível ao restrito; atribuído à entidade A passa a ser visível; reatribuir é recusado', async () => {
  must(ent.A, 'cenário ausente');
  const created = await api(juliana, 'POST', '/api/finance/contract-import', { organization_id: vitta, provider_id: vittaProvider, product: 'credit',
    title: `Grupo ${RUN}`, starts_on: isoDay(-30), ends_on: isoDay(400) });
  must(created.status === 201, `registro: ${created.status}`);
  const id = created.data.id;
  const before = (await api(rafael, 'GET', `/api/finance/contract-detail?id=${id}`)).status;
  const assign = (entity) => api(juliana, 'POST', '/api/finance/contract-entity', { contract_id: id, legal_entity_id: entity });
  const first = await assign(ent.A);
  const after = (await api(rafael, 'GET', `/api/finance/contract-detail?id=${id}`)).status;
  const again = await assign(ent.B);
  const where = sql(`select legal_entity_id from public.fin_contracts where id = '${id}'`);
  const task = sql(`select legal_entity_id from public.fin_tasks where related_id = '${id}' and status = 'open' limit 1`);
  must(before === 404 && first.status === 200 && after === 200 && again.status === 409 && where === ent.A && task === ent.A,
    `antes ${before}, atribuir ${first.status}, depois ${after}, reatribuir ${again.status}, contrato em ${where === ent.A ? 'A' : where}, tarefa em ${task === ent.A ? 'A' : task}`);
  return 'grupo invisível (404) → atribuído a A visível (200); reatribuir 409; tarefa acompanhou a entidade';
});

// ------------------------------------------------------------- relatório
const table = ['| ID | Sonda | Status | Evidência |', '| --- | --- | --- | --- |',
  ...results.map((r) => `| ${r.id} | ${r.name} | ${r.status} | ${r.evidence.replace(/\|/g, '/').replace(/\n/g, ' ')} |`)].join('\n');
console.log(`# Sondas adversariais — execução ${RUN}\n\n${table}`);
if (process.env.ADVERSARIAL_REPORT) fs.writeFileSync(process.env.ADVERSARIAL_REPORT, `${table}\n`);
const failed = results.filter((r) => r.status === 'FAIL');
const skipped = results.filter((r) => r.status === 'SKIPPED');
console.log(`\n${results.length} sondas, ${results.length - failed.length - skipped.length} PASS, ${failed.length} FAIL, ${skipped.length} SKIPPED.`);
process.exit(failed.length ? 1 : 0);
