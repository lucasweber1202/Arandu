#!/usr/bin/env node
// Jornada real das capacidades de plataforma (#297–#302) contra Supabase de verdade.
//
// Igual a journey.mjs: cada passo passa pela API do Arandu com a sessão da
// pessoa, o RLS do Postgres e o GoTrue. Service role só cria contas (o que o
// responsável faria no painel) e SQL só ajusta a allowlist de piloto e lê
// evidência. Nada é simulado. O Copilot generativo NÃO é chamado com modelo
// real: sem credencial, `copilot/ask` deve responder 503 copilot_not_configured;
// a confirmação de atividade preparada (`copilot/confirm`) é exercida de verdade.
//
// Variáveis: PILOT_APP_URL, PILOT_DB_URL, SUPABASE_URL, SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY. Saída: tabela + JSON em PILOT_REPORT (opcional).
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';

const APP = process.env.PILOT_APP_URL || 'https://localhost:4443';
const DB = process.env.PILOT_DB_URL;
const SB = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
for (const [name, value] of Object.entries({ PILOT_DB_URL: DB, SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: SERVICE })) if (!value) { console.error(`${name} ausente.`); process.exit(2); }
const RUN = crypto.randomBytes(3).toString('hex');
const PASSWORD = `Plat-${crypto.randomBytes(9).toString('base64url')}`;
const steps = []; const attacks = []; const ctx = {};
const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const uuid = () => crypto.randomUUID();

function sql(query) {
  const r = spawnSync('psql', [DB, '-v', 'ON_ERROR_STOP=1', '-At', '-c', query], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`SQL: ${r.stderr.trim().split('\n').pop()}`);
  return r.stdout.trim();
}
async function step(name, fn) {
  try { steps.push({ name, status: 'PASS', evidence: String(await fn() ?? '') }); }
  catch (error) { steps.push({ name, status: 'FAIL', evidence: error.message }); }
}
async function attack(name, expected, fn) {
  try { const { ok, observed } = await fn(); attacks.push({ name, expected, observed, status: ok ? 'PASS' : 'FAIL' }); }
  catch (error) { attacks.push({ name, expected, observed: `erro: ${error.message}`, status: 'FAIL' }); }
}
const must = (c, m) => { if (!c) throw new Error(m); };
async function api(who, method, path, body) {
  for (let i = 0; i < 25; i += 1) {
    const headers = { Origin: APP, 'Content-Type': 'application/json' };
    if (who?.cookie) headers.Cookie = who.cookie;
    const res = await fetch(`${APP}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 200) }; }
    const session = (res.headers.getSetCookie?.() || []).find((v) => v.startsWith('arandu_session='));
    if (who && session) who.cookie = session.split(';')[0];
    if (res.status === 429 && !path.includes('/copilot/')) { await new Promise((r) => setTimeout(r, 30_000)); continue; }
    return { status: res.status, data };
  }
  throw new Error(`${path}: limite de requisições persistente`);
}
const ok = (r, label) => { must(r.status < 300 && r.data?.ok !== false, `${label}: ${r.status} ${r.data?.code || ''} ${r.data?.error || ''}`.trim()); return r.data; };
const F = (p) => `/api/finance/${p}`;

// ---------------------------------------------------------------- contas
const people = {
  adminA: { email: `tesouraria.${RUN}@grupo-a-plataforma.example`, name: 'Tesouraria A' },
  viewerA: { email: `leitura.${RUN}@grupo-a-plataforma.example`, name: 'Leitura A' },
  adminB: { email: `tesouraria.${RUN}@grupo-b-plataforma.example`, name: 'Tesouraria B' }
};
await step('Contas sintéticas no Supabase Auth e login real (cookie HttpOnly)', async () => {
  for (const p of Object.values(people)) {
    const res = await fetch(`${SB}/auth/v1/admin/users`, { method: 'POST', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: p.email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: p.name } }) });
    const data = await res.json(); must(res.ok, `criar ${p.name}: ${res.status}`); p.id = data.id;
    ok(await api(p, 'POST', '/api/auth/login', { email: p.email, password: PASSWORD }), `login ${p.name}`);
  }
  return '3 contas *.example, senha aleatória por execução';
});
sql(`insert into public.fin_pilot_allowlist (pattern, created_by, note) values ('@grupo-a-plataforma.example', '${people.adminA.id}', 'plataforma ${RUN}'), ('@grupo-b-plataforma.example', '${people.adminA.id}', 'plataforma ${RUN}') on conflict do nothing`);

await step('Duas organizações compradoras; leitor entra em A por convite (viewer)', async () => {
  ctx.orgA = ok(await api(people.adminA, 'POST', F('organizations'), { legal_name: `Grupo A Plataforma ${RUN}`, kind: 'BUYER' }), 'org A').id;
  ctx.orgB = ok(await api(people.adminB, 'POST', F('organizations'), { legal_name: `Grupo B Plataforma ${RUN}`, kind: 'BUYER' }), 'org B').id;
  const inv = ok(await api(people.adminA, 'POST', F('members/invite'), { organization_id: ctx.orgA, email: people.viewerA.email, role: 'viewer' }), 'convite');
  ok(await api(people.viewerA, 'POST', F('members/accept'), { token: inv.invitationToken }), 'aceite');
  ctx.provA = ok(await api(people.adminA, 'POST', F('providers'), { organization_id: ctx.orgA, name: `Banco Sintético ${RUN}`, kind: 'bank' }), 'instituição').row.id;
  return 'A (admin + viewer) e B (admin), instituição sintética em A';
});

// -------------------------------------------------------- contratos e termos
const GUAR = { schema_version: 'financial-product-terms-1', modality: 'bank_guarantee', values: { source_reference: 'Cláusula sintética 3', beneficiary: 'Beneficiário sintético', currency: 'BRL',
  guaranteed_amount: 1000000, valid_from: day(-30), valid_until: day(335), commission_pct_year: 2, day_count: 'ACT/365F', upfront_fee: 100, other_expenses: 50 } };
await step('Contrato de fiança registrado; condições especializadas gravadas como nova versão preservando termos', async () => {
  const c = ok(await api(people.adminA, 'POST', F('contract-import'), { organization_id: ctx.orgA, provider_id: ctx.provA, product: 'guarantee', title: `Fiança sintética ${RUN}`,
    starts_on: day(-30), ends_on: day(335), renewal_notice_days: 30, terms: { currency: 'BRL' }, request_key: uuid() }), 'contrato');
  ctx.contract = c.id;
  const before = ok(await api(people.adminA, 'GET', F(`contract-detail?id=${c.id}`)), 'detalhe').contract.current_version;
  ok(await api(people.adminA, 'POST', F('contract-terms'), { contract_id: c.id, expected_version: before, terms: { currency: 'BRL', contract_number: 'FIA-SINT-1', product_terms: GUAR }, reason: 'Condições da cláusula 3' }), 'termos');
  const after = ok(await api(people.adminA, 'GET', F(`contract-detail?id=${c.id}`)), 'detalhe 2');
  must(after.contract.current_version === before + 1, 'versão não avançou');
  must(after.effective.terms.product_terms?.modality === 'bank_guarantee' && after.effective.terms.contract_number === 'FIA-SINT-1', 'termos não preservados');
  ctx.version = after.contract.current_version;
  return `v${before} → v${ctx.version}; product_terms e demais termos presentes; ${after.versions.length} versões no histórico`;
});
await attack('Versão nova que omite product_terms (cliente antigo)', '409, sem perda silenciosa', async () => {
  const r = await api(people.adminA, 'POST', F('contract-terms'), { contract_id: ctx.contract, expected_version: ctx.version, terms: { currency: 'BRL' }, reason: 'cliente antigo' });
  return { ok: r.status === 409, observed: `${r.status} ${r.data?.code || ''}` };
});
await attack('Termos de fiança inválidos (vigência invertida)', '400/409, nada gravado', async () => {
  const bad = { ...GUAR, values: { ...GUAR.values, valid_from: day(400) } };
  const r = await api(people.adminA, 'POST', F('contract-terms'), { contract_id: ctx.contract, expected_version: ctx.version, terms: { currency: 'BRL', product_terms: bad }, reason: 'x' });
  const v = ok(await api(people.adminA, 'GET', F(`contract-detail?id=${ctx.contract}`)), 'detalhe').contract.current_version;
  return { ok: r.status >= 400 && v === ctx.version, observed: `${r.status} ${r.data?.code || ''}; versão continua v${v}` };
});

// --------------------------------------------------------------- economics
await step('Economics de fiança: cenário dentro da vigência calcula componentes; fora dela é incomparável', async () => {
  const out = ok(await api(people.adminA, 'POST', F('guarantee-economics'), { organization_id: ctx.orgA, sources: [{ contract_id: ctx.contract, version: ctx.version }],
    scenarios: [{ label: 'Base', period_start: day(-30), period_end: day(335), currency: 'BRL', guaranteed_amount: 1000000, source_reference: 'Cenário sintético' },
      { label: 'Fora', period_start: day(-60), period_end: day(300), currency: 'BRL', guaranteed_amount: 1000000, source_reference: 'Cenário sintético' }] }), 'economics').analysis;
  const base = out.scenarios[0].results[0]; const fora = out.scenarios[1].results[0];
  must(base.comparable && base.total === 20150 && base.components.commission === 20000, `cálculo inesperado: ${JSON.stringify(base).slice(0, 160)}`);
  must(!fora.comparable && fora.total === null && fora.reasons.includes('outside_contractual_validity'), 'incomparabilidade ausente');
  return `${out.methodology}: base BRL ${base.total} (comissão ${base.components.commission} + 100 + 50); fora da vigência → incomparável`;
});
await attack('Organização B usa contrato de A como fonte econômica', '404', async () => {
  const r = await api(people.adminB, 'POST', F('guarantee-economics'), { organization_id: ctx.orgB, sources: [{ contract_id: ctx.contract, version: ctx.version }], scenarios: [{ label: 'Tentativa', period_start: day(-30), period_end: day(335), currency: 'BRL', guaranteed_amount: 1000000, source_reference: 'Cenário sintético' }] });
  return { ok: r.status === 404 || r.status === 403, observed: `${r.status} ${r.data?.code || ''}` };
});

// --------------------------------------------------------------------- CRM
await step('CRM: contato, reunião, processo ligado ao contrato, etapa e histórico versionados', async () => {
  const contact = ok(await api(people.adminA, 'POST', F('crm-contacts'), { organization_id: ctx.orgA, provider_id: ctx.provA, request_key: uuid(), values: { name: 'Gerente Sintética', title: 'Relacionamento', source_reference: 'Cadastro da jornada' } }), 'contato');
  const meetingKey = uuid();
  const meeting = { organization_id: ctx.orgA, request_key: meetingKey, values: { kind: 'meeting', subject: 'Revisão da fiança', status: 'recorded', occurred_at: new Date(Date.now() - 3600_000).toISOString(), contact_id: contact.id, related_type: 'contract', related_id: ctx.contract, source_reference: 'Ata sintética' } };
  const m1 = ok(await api(people.adminA, 'POST', F('crm-activities'), meeting), 'reunião');
  const m2 = ok(await api(people.adminA, 'POST', F('crm-activities'), meeting), 'replay');
  must(m2.replayed === true && m2.id === m1.id, 'replay não idempotente');
  const proc = ok(await api(people.adminA, 'POST', F('crm-processes'), { organization_id: ctx.orgA, request_key: uuid(), values: { title: 'Renovação da fiança', stage: 'prospect', next_action: 'Pedir minuta', related_type: 'contract', related_id: ctx.contract, contact_id: contact.id, source_reference: 'Comitê sintético' } }), 'processo');
  ok(await api(people.adminA, 'PATCH', F('crm-processes'), { organization_id: ctx.orgA, id: proc.id, expected_version: 1, request_key: uuid(), values: { stage: 'negotiation', source_reference: 'Etapa atualizada' } }), 'etapa');
  ctx.process = proc.id;
  const conflict = await api(people.adminA, 'PATCH', F('crm-processes'), { organization_id: ctx.orgA, id: proc.id, expected_version: 1, request_key: uuid(), values: { stage: 'qualification', source_reference: 'edição concorrente' } });
  must(conflict.status === 409, `edição concorrente não recusada: ${conflict.status}`);
  const linked = ok(await api(people.adminA, 'GET', F(`crm-processes?organization_id=${ctx.orgA}&related_id=${ctx.contract}`)), 'vínculo').rows;
  must(linked.length === 1 && linked[0].stage === 'negotiation' && linked[0].version === 2, 'vínculo/etapa inesperados');
  const hist = ok(await api(people.adminA, 'GET', F(`crm-history?organization_id=${ctx.orgA}&object_type=process&object_id=${proc.id}`)), 'histórico').rows;
  must(hist.length >= 2, 'histórico incompleto');
  return `contato, reunião (replay idempotente), processo v2 em negociação, 409 na edição concorrente, ${hist.length} eventos no histórico`;
});
await attack('Leitor (viewer) cria contato', 'recusado', async () => {
  const r = await api(people.viewerA, 'POST', F('crm-contacts'), { organization_id: ctx.orgA, provider_id: ctx.provA, request_key: uuid(), values: { name: 'Intruso', source_reference: 'tentativa' } });
  return { ok: r.status === 403 || r.status === 400, observed: `${r.status} ${r.data?.code || ''}` };
});
await attack('Organização B lê processos de A', 'recusado ou vazio', async () => {
  const r = await api(people.adminB, 'GET', F(`crm-processes?organization_id=${ctx.orgA}`));
  return { ok: r.status === 403 || (r.status === 200 && r.data.rows.length === 0), observed: `${r.status} ${r.data?.rows?.length ?? r.data?.code ?? ''}` };
});
await attack('Organização B altera processo de A pela própria organização', 'recusado', async () => {
  const r = await api(people.adminB, 'PATCH', F('crm-processes'), { organization_id: ctx.orgB, id: ctx.process, expected_version: 2, request_key: uuid(), values: { stage: 'lost', outcome: 'sabotagem', source_reference: 'tentativa' } });
  const stage = sql(`select stage from public.fin_crm_processes where id='${ctx.process}'`);
  return { ok: r.status >= 400 && stage === 'negotiation', observed: `${r.status} ${r.data?.code || ''}; etapa continua ${stage}` };
});

// ------------------------------------------------------------------ Copilot
await step('Copilot: sem modelo configurado responde 503 e não inventa resposta; confirmação de atividade preparada grava pelo comando canônico', async () => {
  const ask = await api(people.adminA, 'POST', F('copilot/ask'), { organization_id: ctx.orgA, question: 'Quais contratos vencem nos próximos 90 dias?' });
  must(ask.status === 503 && !ask.data.answer, `ask inesperado: ${ask.status} ${ask.data?.code}`);
  const key = uuid();
  const body = { organization_id: ctx.orgA, request_key: key, confirmation: true, values: { kind: 'follow_up', subject: 'Follow-up preparado', status: 'planned', due_on: day(7), related_type: 'provider', related_id: ctx.provA, source_reference: 'Preparado pelo Copilot e revisado' } };
  const c1 = ok(await api(people.adminA, 'POST', F('copilot/confirm'), body), 'confirm');
  const c2 = ok(await api(people.adminA, 'POST', F('copilot/confirm'), body), 'replay');
  must(c2.replayed === true && c2.id === c1.id, 'confirmação não idempotente');
  const without = await api(people.adminA, 'POST', F('copilot/confirm'), { ...body, request_key: uuid(), confirmation: false });
  must(without.status === 400, 'gravou sem confirmação explícita');
  const n = sql(`select count(*) from public.fin_crm_activities where organization_id='${ctx.orgA}' and subject='Follow-up preparado'`);
  return `ask → 503 ${ask.data.code} (sem modelo, NOT RUN externo); confirm 201 + replay; sem confirmation:true → 400; ${n} atividade gravada`;
});

// ---------------------------------------------------------------- ingestão
const CSV = `ID;Serviço;Unidade;Moeda;Início;Fim;Valor\nJ1;Comissão de fiança;one_off;BRL;${day(-60)};${day(-31)};1500,00\nJ2;Despesa cartorária;one_off;BRL;${day(-60)};${day(-31)};80,00\nJ3;Sem valor;one_off;BRL;${day(-60)};${day(-31)};\n`;
const fileBody = () => ({ organization_id: ctx.orgA, contract_id: ctx.contract, file: { name: 'tarifas-sinteticas.csv', format: 'csv', content_base64: Buffer.from(CSV).toString('base64') }, delimiter: ';', source_reference: `Extrato sintetico ${RUN}`,
  mapping: { source_object_id: 'ID', service: 'Serviço', charging_unit: 'Unidade', currency: 'Moeda', period_start: 'Início', period_end: 'Fim', observed_amount: 'Valor' } });
await step('Importação CSV: prévia por linha, confirmação, replay idempotente, reimportação vira duplicada e histórico', async () => {
  const p = ok(await api(people.adminA, 'POST', F('fee-imports/preview'), fileBody()), 'prévia').preview;
  const states = p.rows.map((r) => r.state).join(',');
  must(p.rows.filter((r) => r.state === 'valid').length === 2 && p.rows.some((r) => r.state === 'incomplete' || r.state === 'invalid'), `estados inesperados: ${states}`);
  const key = uuid();
  const confirm = { ...fileBody(), confirmation: true, preview_fingerprint: p.fingerprint, selected_lines: p.rows.filter((r) => r.state === 'valid').map((r) => r.line), request_key: key };
  const r1 = ok(await api(people.adminA, 'POST', F('fee-imports/confirm'), confirm), 'confirmação');
  const r2 = ok(await api(people.adminA, 'POST', F('fee-imports/confirm'), confirm), 'replay');
  must(r1.imported === 2 && r2.replayed === true, `recibo inesperado: ${JSON.stringify(r1).slice(0, 120)} / replay ${r2.replayed}`);
  const again = ok(await api(people.adminA, 'POST', F('fee-imports/preview'), fileBody()), 'nova prévia').preview;
  must(again.rows.filter((r) => r.state === 'duplicate').length === 2, 'reimportação não reconheceu duplicadas');
  const hist = ok(await api(people.adminA, 'GET', F(`fee-imports/history?organization_id=${ctx.orgA}&contract_id=${ctx.contract}`)), 'histórico').rows;
  const obs = sql(`select count(*) from public.fin_fee_observations where contract_id='${ctx.contract}'`);
  must(hist.length === 1 && Number(obs) === 2, `persistência inesperada: ${hist.length} recibos, ${obs} observações`);
  return `prévia [${states}]; 2 importadas; replay mesma chave; reimportação = 2 duplicadas; 1 recibo; ${obs} observações no banco`;
});
await attack('Leitor confirma importação', '403 forbidden, nada gravado', async () => {
  const p = ok(await api(people.viewerA, 'POST', F('fee-imports/preview'), fileBody()), 'prévia leitor').preview;
  const line = p.rows.find(row => ['valid', 'duplicate'].includes(row.state))?.line;
  must(Number.isInteger(line), 'prévia precisa conter uma linha confirmável para testar autorização');
  const r = await api(people.viewerA, 'POST', F('fee-imports/confirm'), { ...fileBody(), confirmation: true, preview_fingerprint: p.fingerprint, selected_lines: [line], request_key: uuid() });
  const obs = sql(`select count(*) from public.fin_fee_observations where contract_id='${ctx.contract}'`);
  return { ok: r.status === 403 && r.data?.code === 'forbidden' && obs === '2', observed: `${r.status} ${r.data?.code || ''}; observações continuam ${obs}` };
});
await attack('Organização B pré-visualiza importação no contrato de A', '404', async () => {
  const r = await api(people.adminB, 'POST', F('fee-imports/preview'), { ...fileBody(), organization_id: ctx.orgB });
  return { ok: r.status === 404 || r.status === 403, observed: `${r.status} ${r.data?.code || ''}` };
});

// ---------------------------------------------------------------- ERP Hub
await step('ERP Hub: configuração sem segredo, conexão não testada, prévia sem credencial recusa sem chamada externa, suspensão e revogação', async () => {
  const id = uuid();
  const settings = { tenant_id: uuid(), environment: 'sandbox', company_id: uuid(), account_id: uuid(), currency: 'BRL', service: 'Tarifas sintéticas', charging_unit: 'one_off' };
  const c = ok(await api(people.adminA, 'POST', F('erp-fees/configure'), { organization_id: ctx.orgA, integration_id: id, contract_id: ctx.contract, expected_version: 0, request_key: uuid(), status: 'configured', settings }), 'configurar').configuration;
  must(c.version === 1 && c.connection_state === 'not_tested', 'estado de conexão inesperado');
  const prev = await api(people.adminA, 'POST', F('erp-fees/preview'), { organization_id: ctx.orgA, integration_id: id, period_start: day(-60), period_end: day(-31) });
  must(prev.status === 503 && prev.data.code === 'erp_not_configured', `prévia sem credencial: ${prev.status} ${prev.data?.code}`);
  ok(await api(people.adminA, 'POST', F('erp-fees/configure'), { organization_id: ctx.orgA, integration_id: id, contract_id: ctx.contract, expected_version: 1, request_key: uuid(), status: 'suspended', settings }), 'suspender');
  const blocked = await api(people.adminA, 'POST', F('erp-fees/preview'), { organization_id: ctx.orgA, integration_id: id, period_start: day(-60), period_end: day(-31) });
  must(blocked.status === 409, `suspensa não bloqueou: ${blocked.status}`);
  ok(await api(people.adminA, 'POST', F('erp-fees/configure'), { organization_id: ctx.orgA, integration_id: id, contract_id: ctx.contract, expected_version: 2, request_key: uuid(), status: 'revoked', settings }), 'revogar');
  const list = ok(await api(people.adminA, 'GET', F(`erp-fees?organization_id=${ctx.orgA}`)), 'lista').rows;
  must(list.length === 1 && list[0].status === 'revoked' && list[0].version === 3, 'lista inesperada');
  return 'v1 configurada (not_tested) → prévia 503 erp_not_configured → v2 suspensa (409) → v3 revogada';
});
await attack('Leitor configura integração ERP', 'recusado', async () => {
  const r = await api(people.viewerA, 'POST', F('erp-fees/configure'), { organization_id: ctx.orgA, integration_id: uuid(), contract_id: ctx.contract, expected_version: 0, request_key: uuid(), status: 'configured',
    settings: { tenant_id: uuid(), environment: 'sandbox', company_id: uuid(), account_id: uuid(), currency: 'BRL', service: 'x x', charging_unit: 'one_off' } });
  return { ok: r.status >= 400, observed: `${r.status} ${r.data?.code || ''}` };
});
await attack('Organização B lê o contrato de A', '404/403', async () => {
  const r = await api(people.adminB, 'GET', F(`contract-detail?id=${ctx.contract}`));
  return { ok: r.status === 404 || r.status === 403, observed: `${r.status} ${r.data?.code || ''}` };
});

// ------------------------------------------------------------------ saída
sql(`delete from public.fin_pilot_allowlist where note = 'plataforma ${RUN}'`);
const pad = (s, n) => String(s).padEnd(n).slice(0, n);
console.log(`\nJornada de plataforma (${RUN}) contra ${APP}\n`);
for (const s of steps) console.log(`${s.status === 'PASS' ? 'PASS' : 'FAIL'}  ${pad(s.name, 110)}  ${s.evidence}`);
console.log('\nAtaques');
for (const a of attacks) console.log(`${a.status}  ${pad(a.name, 70)}  esperado: ${pad(a.expected, 28)} observado: ${a.observed}`);
const failed = [...steps, ...attacks].filter((x) => x.status !== 'PASS').length;
console.log(`\n${steps.length} passos, ${attacks.length} ataques, ${failed} falha(s).`);
if (process.env.PILOT_REPORT) fs.writeFileSync(process.env.PILOT_REPORT, JSON.stringify({ run: RUN, app: APP, steps, attacks }, null, 2));
process.exit(failed ? 1 : 0);
