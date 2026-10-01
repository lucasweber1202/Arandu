#!/usr/bin/env node
// Jornada real do piloto financeiro contra um Supabase de verdade.
//
// Não usa demo, mocks de rota nem service role no lugar do usuário: cada passo
// passa pela API do Arandu (`/api/...`) com a sessão da pessoa, o RLS do
// Postgres e o Storage privado. O service role aparece só onde o produto também
// o usa no servidor (assinar URL, cron) e onde o responsável agiria pelo painel
// do Supabase (criar contas, allowlist, operador, chave de e-mail).
//
// Variáveis: PILOT_APP_URL, PILOT_DB_URL (papel postgres), SUPABASE_URL,
// SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET.
// Saída: tabela de passos e ataques + JSON em PILOT_REPORT (opcional).
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { enrollTotp, verifyTotp, totpCode, jwtAal } from '../finance-operator-mfa.mjs';
import { renderTransactionalEmail } from '../../lib/email.mjs';
import { EXPECTED_SCHEMA_VERSION } from '../../lib/finance/pilot-doctor.mjs';

const APP = process.env.PILOT_APP_URL || 'https://localhost:4443';
const DB = process.env.PILOT_DB_URL;
const SB = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON = process.env.CRON_SECRET;
const RUN = crypto.randomBytes(3).toString('hex');
const PASSWORD = `Pilot-${crypto.randomBytes(9).toString('base64url')}`;
for (const [name, value] of Object.entries({ PILOT_DB_URL: DB, SUPABASE_URL: SB, SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SERVICE, CRON_SECRET: CRON })) {
  if (!value) { console.error(`${name} ausente.`); process.exit(2); }
}

const steps = [];
const attacks = [];
const ctx = {};
const today = new Date().toISOString().slice(0, 10);
const addDays = (days, from = today) => new Date(Date.parse(`${from}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

function sql(query) {
  const result = spawnSync('psql', [DB, '-v', 'ON_ERROR_STOP=1', '-At', '-c', query], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`SQL: ${result.stderr.trim().split('\n').pop()}`);
  return result.stdout.trim();
}
async function step(name, fn) {
  try { const evidence = await fn(); steps.push({ name, status: 'PASS', evidence: String(evidence ?? '') }); }
  catch (error) { steps.push({ name, status: 'FAIL', evidence: error.message }); }
}
async function attack(name, expected, fn) {
  try {
    const { ok, observed } = await fn();
    attacks.push({ name, expected, observed, status: ok ? 'PASS' : 'FAIL' });
  } catch (error) { attacks.push({ name, expected, observed: `erro: ${error.message}`, status: 'FAIL' }); }
}
function must(condition, message) { if (!condition) throw new Error(message); }

// ------------------------------------------------------------ HTTP do Arandu
async function api(who, method, path, body) {
  const headers = { Origin: APP, 'Content-Type': 'application/json' };
  if (who?.cookie) headers.Cookie = who.cookie;
  const response = await fetch(`${APP}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 200) }; }
  const setCookie = response.headers.getSetCookie?.() || [];
  const session = setCookie.find((value) => value.startsWith('arandu_session='));
  if (who && session) who.cookie = session.split(';')[0];
  return { status: response.status, data };
}
const ok = (result, label) => { must(result.status < 300 && result.data?.ok !== false, `${label}: ${result.status} ${result.data?.code || ''} ${result.data?.error || ''}`.trim()); return result.data; };
const accessToken = (who) => JSON.parse(Buffer.from(decodeURIComponent(who.cookie.split('=')[1]), 'base64url').toString('utf8')).access_token;
const sessionCookie = (session) => `arandu_session=${encodeURIComponent(Buffer.from(JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token, expires_at: Math.floor(Date.now() / 1000) + 3000 })).toString('base64url'))}`;
async function rest(who, path) {
  const response = await fetch(`${SB}/rest/v1/${path}`, { headers: { apikey: ANON, Authorization: `Bearer ${accessToken(who)}` } });
  return { status: response.status, rows: await response.json().catch(() => null) };
}

// -------------------------------------------------------------- 0. contas
const people = {
  buyer: { email: `comprador.${RUN}@empresa-piloto.example`, name: 'Comprador Piloto' },
  approver: { email: `aprovador.${RUN}@empresa-piloto.example`, name: 'Aprovador Piloto' },
  providerA: { email: `gerente.${RUN}@banco-a-piloto.example`, name: 'Gerente Banco A' },
  providerB: { email: `gerente.${RUN}@banco-b-piloto.example`, name: 'Gerente Banco B' },
  outsider: { email: `curioso.${RUN}@externo-nao-convidado.example`, name: 'Pessoa Externa' },
  // Colega no mesmo banco (mesmo domínio), e-mail diferente do contato do convite.
  colleagueA: { email: `colega.${RUN}@banco-a-piloto.example`, name: 'Colega Banco A' },
  // Operador financeiro de plataforma e operador legado do admin de arte.
  operator: { email: `operador.${RUN}@arandu-ops.example`, name: 'Operador Arandu', app: { arandu_role: 'finance_ops' } },
  legacyOperator: { email: `operador-legado.${RUN}@arandu-ops.example`, name: 'Operador legado', app: { arandu_role: 'operator' } }
};

await step('Contas de piloto criadas no Supabase Auth (buyer, approver, provider A/B, colega de A, externo, finance_ops, operador legado)', async () => {
  for (const person of Object.values(people)) {
    const response = await fetch(`${SB}/auth/v1/admin/users`, {
      method: 'POST', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: person.email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: person.name }, app_metadata: person.app || {} })
    });
    const data = await response.json();
    must(response.ok, `criar ${person.name}: ${response.status} ${data.msg || ''}`);
    person.id = data.id;
  }
  return `${Object.keys(people).length} contas (senha aleatória por execução, e-mails *.example)`;
});

await step('Login real pela API (/api/auth/login → cookie HttpOnly)', async () => {
  for (const person of Object.values(people)) ok(await api(person, 'POST', '/api/auth/login', { email: person.email, password: PASSWORD }), `login ${person.name}`);
  const session = ok(await api(people.buyer, 'GET', '/api/auth/session'), 'sessão');
  must(session.authenticated === true || session.user, 'sessão não autenticada');
  return 'seis sessões aal1 emitidas pelo GoTrue';
});

// ----------------------------------------------------------- 1. allowlist
sql(`delete from public.fin_pilot_allowlist where pattern like '%piloto.example' or pattern like '%${RUN}%'`);
const emptyAllowlist = Number(sql('select count(*) from public.fin_pilot_allowlist'));
await attack('Allowlist vazia: comprador cria organização', 'recusado (fail-closed)', async () => {
  const result = await api(people.buyer, 'POST', '/api/finance/organizations', { legal_name: `Empresa Piloto ${RUN}`, kind: 'BUYER' });
  return { ok: emptyAllowlist > 0 || result.status >= 400, observed: emptyAllowlist > 0 ? `allowlist já tinha ${emptyAllowlist} linhas (ambiente compartilhado)` : `${result.status} ${result.data?.code || result.data?.error}` };
});
sql(`insert into public.fin_pilot_allowlist (pattern, created_by, note) values ('@empresa-piloto.example', '${people.operator.id}', 'piloto local ${RUN}') on conflict do nothing`);
await attack('Allowlist parcial (só o comprador): provedor cria organização', 'recusado', async () => {
  const result = await api(people.providerA, 'POST', '/api/finance/organizations', { legal_name: `Banco A ${RUN}`, kind: 'PROVIDER' });
  return { ok: result.status >= 400, observed: `${result.status} ${result.data?.code || result.data?.error}` };
});
sql(`insert into public.fin_pilot_allowlist (pattern, created_by, note) values ('@banco-a-piloto.example', '${people.operator.id}', 'piloto local'), ('@banco-b-piloto.example', '${people.operator.id}', 'piloto local') on conflict do nothing`);
await attack('Conta fora da allowlist cria organização', 'recusado', async () => {
  const result = await api(people.outsider, 'POST', '/api/finance/organizations', { legal_name: `Intruso ${RUN}`, kind: 'BUYER' });
  return { ok: result.status >= 400, observed: `${result.status} ${result.data?.code || result.data?.error}` };
});

// ---------------------------------------------------- 2. comprador e equipe
await step('Comprador: organização, perfil e nome', async () => {
  ctx.buyerOrg = ok(await api(people.buyer, 'POST', '/api/finance/organizations', { legal_name: `Empresa Piloto ${RUN} Ltda`, kind: 'BUYER' }), 'org').id;
  ok(await api(people.buyer, 'PATCH', '/api/finance/organizations', { organization_id: ctx.buyerOrg, trade_name: 'Empresa Piloto', sector: 'Indústria', revenue_band: '30m_300m' }), 'perfil org');
  ok(await api(people.buyer, 'POST', '/api/finance/profile', { organization_id: ctx.buyerOrg, field_key: 'receita_anual', field_value: '120000000', source: 'documento_interno' }), 'Financial Passport');
  ok(await api(people.buyer, 'POST', '/api/finance/profile/confirm', { organization_id: ctx.buyerOrg, field_key: 'receita_anual' }), 'confirmação do Passport');
  ok(await api(people.buyer, 'PATCH', '/api/finance/members/me', { organization_id: ctx.buyerOrg, display_name: 'Marina Piloto', title: 'Gerente Financeira' }), 'nome');
  ok(await api(people.buyer, 'POST', '/api/finance/terms', { organization_id: ctx.buyerOrg, terms_version: '2026-09-26-piloto', context: 'test' }), 'termos');
  return `org ${ctx.buyerOrg.slice(0, 8)}…`;
});
await step('Aprovador entra por convite de membro (papel viewer)', async () => {
  const invite = ok(await api(people.buyer, 'POST', '/api/finance/members/invite', { organization_id: ctx.buyerOrg, email: people.approver.email, role: 'viewer' }), 'convite');
  ok(await api(people.approver, 'POST', '/api/finance/members/accept', { token: invite.invitationToken }), 'aceite');
  ok(await api(people.approver, 'PATCH', '/api/finance/members/me', { organization_id: ctx.buyerOrg, display_name: 'Ricardo Piloto', title: 'CFO' }), 'nome');
  const members = ok(await api(people.buyer, 'GET', `/api/finance/members?organization_id=${ctx.buyerOrg}`), 'membros').rows;
  must(members.length === 2 && members.every((row) => !JSON.stringify(row).includes('@')), 'lista de membros inesperada ou com e-mail');
  return `${members.length} membros, sem e-mail na resposta`;
});
await step('Provedores A e B criam suas organizações', async () => {
  ctx.orgA = ok(await api(people.providerA, 'POST', '/api/finance/organizations', { legal_name: `Banco A Piloto ${RUN} S.A.`, kind: 'PROVIDER' }), 'org A').id;
  ctx.orgB = ok(await api(people.providerB, 'POST', '/api/finance/organizations', { legal_name: `Banco B Piloto ${RUN} S.A.`, kind: 'PROVIDER' }), 'org B').id;
  // Colega entra na organização do Banco A (mesmo domínio, outro e-mail).
  const invite = ok(await api(people.providerA, 'POST', '/api/finance/members/invite', { organization_id: ctx.orgA, email: people.colleagueA.email, role: 'provider_user' }), 'convite colega');
  ok(await api(people.colleagueA, 'POST', '/api/finance/members/accept', { token: invite.invitationToken }), 'aceite colega');
  return 'duas organizações PROVIDER; colega de A é membro do Banco A';
});

// ------------------------------------------------------------ 3. e-mail
// Preferências pedidas antes dos eventos; chave global ainda desligada.
sql(`update public.fin_settings set value = 'false' where key = 'email_enabled'`);
await step('Preferências de e-mail (comprador e aprovador) com email_enabled=false', async () => {
  for (const event of ['proposal_received', 'renewal_due', 'mention']) ok(await api(people.buyer, 'POST', '/api/finance/notification-preferences', { organization_id: ctx.buyerOrg, event_type: event, in_app: true, email: true }), event);
  for (const event of ['approval_requested', 'mention']) ok(await api(people.approver, 'POST', '/api/finance/notification-preferences', { organization_id: ctx.buyerOrg, event_type: event, in_app: true, email: true }), event);
  return 'opt-in por tipo de aviso';
});
const outboxCount = () => Number(sql(`select count(*) from public.transactional_email_outbox where template = 'finance_notification' and recipient_address in ('${people.buyer.email}','${people.approver.email}')`));

// --------------------------------------------------------------- 4. RFQ
await step('RFQ de crédito criada, provedores cadastrados e convidados', async () => {
  ctx.rfq = ok(await api(people.buyer, 'POST', '/api/finance/rfqs', {
    organization_id: ctx.buyerOrg, product: 'credit', title: `Capital de giro piloto ${RUN}`, description: 'Linha para o ciclo de estoque.',
    demand: { amount: 3000000, purpose: 'capital_de_giro', term_months: 24, annual_revenue: 120000000, sector: 'Indústria' }, response_deadline: addDays(14),
    passport_fields: [{ demand_key: 'annual_revenue', field_key: 'receita_anual' }, { demand_key: 'sector', field_key: 'sector' }]
  }), 'rfq').id;
  // A RFQ guarda a fotografia do Passport; mudar o Passport depois não a alcança.
  ok(await api(people.buyer, 'POST', '/api/finance/profile', { organization_id: ctx.buyerOrg, field_key: 'receita_anual', field_value: '130000000', source: 'documento_interno' }), 'Passport alterado depois');
  must(sql(`select string_agg(field_key || '=' || field_value || ':' || used_as_is, ',' order by field_key) from public.fin_rfq_profile_snapshots where rfq_id = '${ctx.rfq}'`) === 'receita_anual=120000000:true,sector=Indústria:true', 'snapshot do Passport ausente ou alterado');
  must(Number(sql(`select count(*) from public.fin_company_profile_history where organization_id = '${ctx.buyerOrg}' and field_key = 'receita_anual'`)) === 3, 'histórico do Passport incompleto');
  ctx.provA = ok(await api(people.buyer, 'POST', '/api/finance/providers', { organization_id: ctx.buyerOrg, name: `Banco A Piloto ${RUN}`, kind: 'bank', contact_email: people.providerA.email }), 'prov A').row.id;
  ctx.provB = ok(await api(people.buyer, 'POST', '/api/finance/providers', { organization_id: ctx.buyerOrg, name: `Banco B Piloto ${RUN}`, kind: 'bank', contact_email: people.providerB.email }), 'prov B').row.id;
  ok(await api(people.buyer, 'POST', '/api/finance/transition', { kind: 'rfq', id: ctx.rfq, from: 'draft', status: 'open' }), 'abrir');
  const sentA = ok(await api(people.buyer, 'POST', '/api/finance/invites/send', { rfq_id: ctx.rfq, provider_id: ctx.provA }), 'convite A');
  const sentB = ok(await api(people.buyer, 'POST', '/api/finance/invites/send', { rfq_id: ctx.rfq, provider_id: ctx.provB }), 'convite B');
  ctx.tokenA = sentA.invitationToken; ctx.tokenB = sentB.invitationToken;
  must(sentA.recipient_mode === 'exact_email' && sentB.recipient_mode === 'exact_email', 'convite com contato deveria ser exact_email');
  return `rfq ${ctx.rfq.slice(0, 8)}…, dois convites de uso único vinculados ao e-mail do contato`;
});
await step('Provedor B aceita o próprio convite', async () => {
  ok(await api(people.providerB, 'POST', '/api/finance/invites/accept', { token: ctx.tokenB, provider_organization_id: ctx.orgB }), 'aceite B');
  return 'vaga B ocupada pela conta B';
});
await attack('Colega do Banco A (mesmo domínio, outro e-mail) aceita o convite de A', 'recusado, erro genérico', async () => {
  const result = await api(people.colleagueA, 'POST', '/api/finance/invites/accept', { token: ctx.tokenA, provider_organization_id: ctx.orgA });
  const used = await api(people.providerB, 'POST', '/api/finance/invites/accept', { token: 'f'.repeat(64), provider_organization_id: ctx.orgB });
  const generic = result.data?.error === used.data?.error && !/@|piloto\.example/.test(JSON.stringify(result.data));
  return { ok: result.status === 409 && result.data?.code === 'invite_invalid' && generic, observed: `${result.status} ${result.data?.code}; mesma mensagem de token inexistente=${generic}` };
});
await attack('Provedor B (já na RFQ) aceita o link encaminhado do provedor A', 'recusado', async () => {
  const result = await api(people.providerB, 'POST', '/api/finance/invites/accept', { token: ctx.tokenA, provider_organization_id: ctx.orgB });
  return { ok: result.status >= 400, observed: `${result.status} ${result.data?.code || result.data?.error}` };
});
await step('Provedor A aceita o próprio convite; reuso recusado; RFQ em coleta', async () => {
  ok(await api(people.providerA, 'POST', '/api/finance/invites/accept', { token: ctx.tokenA, provider_organization_id: ctx.orgA }), 'aceite A');
  const reuse = await api(people.providerA, 'POST', '/api/finance/invites/accept', { token: ctx.tokenA, provider_organization_id: ctx.orgA });
  must(reuse.status >= 400, 'convite reutilizado foi aceito');
  ok(await api(people.buyer, 'POST', '/api/finance/transition', { kind: 'rfq', id: ctx.rfq, from: 'open', status: 'collecting' }), 'coleta');
  return `reuso recusado (${reuse.status})`;
});
await attack('Nova RFQ: B usa o link de "Banco A" (cadastro já vinculado à conta A)', 'recusado', async () => {
  const rfq2 = ok(await api(people.buyer, 'POST', '/api/finance/rfqs', {
    organization_id: ctx.buyerOrg, product: 'acquiring', title: `Adquirência piloto ${RUN}`, demand: { monthly_volume: 8000000 }, response_deadline: addDays(10)
  }), 'rfq2').id;
  ctx.rfq2 = rfq2;
  ok(await api(people.buyer, 'POST', '/api/finance/transition', { kind: 'rfq', id: rfq2, from: 'draft', status: 'open' }), 'abrir rfq2');
  const tokenA2 = ok(await api(people.buyer, 'POST', '/api/finance/invites/send', { rfq_id: rfq2, provider_id: ctx.provA }), 'convite A2').invitationToken;
  const hijack = await api(people.providerB, 'POST', '/api/finance/invites/accept', { token: tokenA2, provider_organization_id: ctx.orgB });
  const legit = await api(people.providerA, 'POST', '/api/finance/invites/accept', { token: tokenA2, provider_organization_id: ctx.orgA });
  return { ok: hijack.status >= 400 && legit.status === 200, observed: `B ${hijack.status} ${hijack.data?.code}; A ${legit.status}` };
});
await attack('Convite expirado (e-mail certo)', 'recusado', async () => {
  const tokenB2 = ok(await api(people.buyer, 'POST', '/api/finance/invites/send', { rfq_id: ctx.rfq2, provider_id: ctx.provB }), 'convite B2').invitationToken;
  ctx.tokenB2 = tokenB2;
  sql(`update public.fin_rfq_invites set expires_at = now() - interval '1 minute' where rfq_id = '${ctx.rfq2}' and provider_id = '${ctx.provB}'`);
  const r = await api(people.providerB, 'POST', '/api/finance/invites/accept', { token: tokenB2, provider_organization_id: ctx.orgB });
  return { ok: r.status === 409 && r.data?.code === 'invite_invalid', observed: `${r.status} ${r.data?.code}` };
});
await attack('Convite revogado (e-mail certo, dentro do prazo)', 'recusado', async () => {
  sql(`update public.fin_rfq_invites set expires_at = now() + interval '7 days', status = 'revoked' where rfq_id = '${ctx.rfq2}' and provider_id = '${ctx.provB}'`);
  const r = await api(people.providerB, 'POST', '/api/finance/invites/accept', { token: ctx.tokenB2, provider_organization_id: ctx.orgB });
  return { ok: r.status === 409 && r.data?.code === 'invite_invalid', observed: `${r.status} ${r.data?.code}` };
});
await step('Convite sem contato cadastrado é explicitamente organization_open', async () => {
  const provC = ok(await api(people.buyer, 'POST', '/api/finance/providers', { organization_id: ctx.buyerOrg, name: `Correspondente Piloto ${RUN}`, kind: 'other' }), 'prov C').row.id;
  const sent = ok(await api(people.buyer, 'POST', '/api/finance/invites/send', { rfq_id: ctx.rfq2, provider_id: provC }), 'convite C');
  must(sent.recipient_mode === 'organization_open', `modo ${sent.recipient_mode}`);
  ok(await api(people.providerB, 'POST', '/api/finance/invites/accept', { token: sent.invitationToken, provider_organization_id: ctx.orgB }), 'aceite aberto');
  const reasons = sql(`select string_agg(reason, ',' order by reason) from public.fin_invite_acceptance_denials where rfq_id in ('${ctx.rfq}','${ctx.rfq2}')`);
  const leaked = Number(sql(`select count(*) from public.fin_invite_acceptance_denials d where d.rfq_id in ('${ctx.rfq}','${ctx.rfq2}') and d.reason ~ '@'`));
  must(reasons && leaked === 0, 'trilha de recusas ausente');
  return `API avisa "organization_open"; conta provedora com o link aceitou; recusas auditadas internamente: ${reasons}`;
});

// ------------------------------------------------------------ 5. propostas
const proposalTerms = (rate, institution) => ({ offered_amount: 3000000, interest_rate_month: rate, term_months: 24, institution, product_name: 'Capital de giro' });
await step('Provedor A: rascunho com autosave, retomada e envio (email_enabled=false)', async () => {
  const assignments = ok(await api(people.providerA, 'GET', `/api/finance/assignments?organization_id=${ctx.orgA}`), 'atribuições').rows;
  ctx.propA = assignments.find((row) => row.rfq_id === ctx.rfq)?.proposal_id;
  must(ctx.propA, 'proposta A não encontrada');
  const saved = ok(await api(people.providerA, 'PATCH', '/api/finance/proposal-draft', { proposal_id: ctx.propA, terms: { offered_amount: 3000000, interest_rate_month: 1.52 }, expected_revision: 0, base_version: 0 }), 'autosave');
  const stale = await api(people.providerA, 'PATCH', '/api/finance/proposal-draft', { proposal_id: ctx.propA, terms: { interest_rate_month: 1.6 }, expected_revision: 0, base_version: 0 });
  must(stale.status === 409 || stale.status >= 400, 'gravação desatualizada aceita');
  const draft = ok(await api(people.providerA, 'GET', `/api/finance/proposal-draft?proposal_id=${ctx.propA}`), 'retomada').draft;
  must(Number(draft?.terms?.interest_rate_month) === 1.52, 'rascunho não retomado');
  ok(await api(people.providerA, 'POST', '/api/finance/proposals', { proposal_id: ctx.propA, terms: proposalTerms(1.52, 'Banco A'), note: 'Condição válida por 10 dias.' }), 'envio');
  must(outboxCount() === 0, 'e-mail enfileirado com email_enabled=false');
  return `autosave rev ${saved.revision}, conflito ${stale.status}, 0 e-mails na fila`;
});
sql(`update public.fin_settings set value = 'true' where key = 'email_enabled'`);
await step('Provedor B envia proposta (email_enabled=true → proposal_received na fila)', async () => {
  const assignments = ok(await api(people.providerB, 'GET', `/api/finance/assignments?organization_id=${ctx.orgB}`), 'atribuições').rows;
  ctx.propB = assignments.find((row) => row.rfq_id === ctx.rfq)?.proposal_id;
  ok(await api(people.providerB, 'POST', '/api/finance/proposals', { proposal_id: ctx.propB, terms: proposalTerms(1.39, 'Banco B'), note: 'Taxa exclusiva B.' }), 'envio B');
  ok(await api(people.providerA, 'POST', '/api/finance/proposals', { proposal_id: ctx.propA, terms: proposalTerms(1.47, 'Banco A'), note: 'Revisão A.' }), 'v2 A');
  const queued = outboxCount();
  must(queued >= 1, 'nenhum e-mail de proposta enfileirado');
  return `${queued} aviso(s) na fila; proposta A agora na versão 2`;
});

// --------------------------------------------- 6. colaboração e documentos
await step('Comentários: interno, visível ao provedor, resposta e menção', async () => {
  ctx.cInternal = ok(await api(people.buyer, 'POST', '/api/finance/comments', { organization_id: ctx.buyerOrg, object_type: 'rfq', object_id: ctx.rfq, visibility: 'internal', body: 'Nota interna: teto de 1,45% a.m.', mention_ids: [people.approver.id], client_id: crypto.randomUUID() }), 'interno').id;
  ctx.cToA = ok(await api(people.buyer, 'POST', '/api/finance/comments', { organization_id: ctx.buyerOrg, object_type: 'proposal', object_id: ctx.propA, visibility: 'provider_visible', body: 'Pergunta ao Banco A sobre garantias.', client_id: crypto.randomUUID() }), 'para A').id;
  ctx.cFromA = ok(await api(people.providerA, 'POST', '/api/finance/comments', { organization_id: ctx.orgA, object_type: 'proposal', object_id: ctx.propA, visibility: 'provider_visible', body: 'Resposta A: aval dos sócios.', client_id: crypto.randomUUID() }), 'de A').id;
  ok(await api(people.buyer, 'POST', '/api/finance/comments', { organization_id: ctx.buyerOrg, parent_id: ctx.cFromA, body: 'Obrigado, Banco A.', client_id: crypto.randomUUID() }), 'resposta');
  const approverInbox = ok(await api(people.approver, 'GET', `/api/finance/notifications?organization_id=${ctx.buyerOrg}`), 'avisos').rows;
  must(approverInbox.some((row) => row.event_type === 'mention'), 'menção não notificada');
  const seenByA = ok(await api(people.providerA, 'GET', `/api/finance/comments?organization_id=${ctx.orgA}&object_type=proposal&object_id=${ctx.propA}`), 'A lê').rows;
  must(seenByA.length === 3 && seenByA.every((row) => row.visibility === 'provider_visible'), `A deveria ver pergunta, própria resposta e réplica (viu ${seenByA.length})`);
  const seenByBuyer = ok(await api(people.buyer, 'GET', `/api/finance/comments?organization_id=${ctx.buyerOrg}&object_type=rfq&object_id=${ctx.rfq}`), 'comprador lê').rows;
  must(seenByBuyer.some((row) => row.visibility === 'internal'), 'comprador não vê a nota interna');
  return `menção entregue ao aprovador; A vê ${seenByA.length} mensagens da própria proposta; nota interna só no comprador`;
});

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
async function upload(who, org, entityType, entityId, visibility, title, bytes = PDF, documentId = null) {
  const begin = ok(await api(who, 'POST', '/api/finance/private-documents/upload', {
    organization_id: org, entity_type: entityType, entity_id: entityId, title, visibility, mime_type: 'application/pdf', size: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'), ...(documentId ? { document_id: documentId } : {})
  }), `upload ${title}`);
  const put = await fetch(begin.upload_url, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: bytes });
  must(put.ok, `PUT storage ${put.status}`);
  ok(await api(who, 'POST', '/api/finance/private-documents/complete', { document_id: begin.document_id, version: begin.version }), 'complete');
  return begin;
}
const tokenTtl = (signedUrl) => {
  const token = new URL(signedUrl).searchParams.get('token');
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  return payload.exp - payload.iat;
};
async function download(who, documentId, version) {
  return api(who, 'POST', '/api/finance/private-documents/download', { document_id: documentId, ...(version ? { version } : {}) });
}

await step('Documentos: upload interno e compartilhado (bucket privado, prazo real da URL, reserva de 10 min)', async () => {
  const internal = await upload(people.buyer, ctx.buyerOrg, 'rfq', ctx.rfq, 'internal', 'Parecer interno');
  ctx.docInternal = internal.document_id;
  ctx.uploadTtl = tokenTtl(internal.upload_url);
  const shared = await upload(people.buyer, ctx.buyerOrg, 'rfq', ctx.rfq, 'shared', 'Demonstrações financeiras');
  ctx.docShared = shared.document_id;
  const fromA = await upload(people.providerA, ctx.orgA, 'proposal', ctx.propA, 'shared', 'Minuta Banco A');
  ctx.docA = fromA.document_id;
  // O Storage decide a validade da URL de upload (config do servidor); a API
  // precisa dizer a verdade e o banco limita a reserva a 10 minutos.
  must(internal.expires_in === ctx.uploadTtl && internal.complete_within === 600, `API diz ${internal.expires_in}s, token ${ctx.uploadTtl}s, janela ${internal.complete_within}`);
  return `URL de upload: ${ctx.uploadTtl}s (definido pelo Storage, informado corretamente pela API); reserva: ${internal.complete_within}s`;
});
await step('Documentos: download do comprador (URL de 60 s, conteúdo íntegro)', async () => {
  const grant = ok(await download(people.buyer, ctx.docShared), 'download');
  ctx.downloadTtl = tokenTtl(grant.url);
  ctx.downloadUrl = grant.url;
  const file = Buffer.from(await (await fetch(grant.url)).arrayBuffer());
  must(file.equals(PDF), 'conteúdo divergente');
  must(grant.expires_in === 60 && ctx.downloadTtl === 60, `TTL de download ${ctx.downloadTtl}`);
  const buyerSeesA = ok(await download(people.buyer, ctx.docA), 'comprador baixa documento do provedor A');
  return `download TTL ${ctx.downloadTtl}s; comprador também lê a minuta enviada por A (${Boolean(buyerSeesA.url)})`;
});
await step('Documentos: versão 2, histórico e remoção', async () => {
  const v2 = await upload(people.buyer, ctx.buyerOrg, 'rfq', ctx.rfq, 'shared', 'Demonstrações financeiras', Buffer.concat([PDF, Buffer.from('%v2\n')]), ctx.docShared);
  must(v2.version === 2, `versão ${v2.version}`);
  const list = ok(await api(people.buyer, 'GET', `/api/finance/private-documents?organization_id=${ctx.buyerOrg}&entity_type=rfq&entity_id=${ctx.rfq}`), 'lista').rows;
  const doc = list.find((row) => row.id === ctx.docShared);
  must(doc?.current_version === 2 && doc.versions.length === 2, 'histórico incompleto');
  const old = ok(await download(people.buyer, ctx.docShared, 1), 'v1');
  must(Boolean(old.url), 'v1 indisponível');
  ctx.docRemoved = (await upload(people.buyer, ctx.buyerOrg, 'rfq', ctx.rfq, 'shared', 'Documento a remover')).document_id;
  ok(await api(people.buyer, 'POST', '/api/finance/private-documents/remove', { document_id: ctx.docRemoved }), 'remover');
  return 'v1 e v2 baixáveis, documento removido';
});

// -------------------------------------------- 7. comparação e aprovação
await step('Comparação factual e pesos definidos pelo comprador', async () => {
  ok(await api(people.buyer, 'POST', '/api/finance/transition', { kind: 'rfq', id: ctx.rfq, from: 'collecting', status: 'comparing' }), 'comparar');
  const factual = ok(await api(people.buyer, 'POST', '/api/finance/comparison', { rfq_id: ctx.rfq }), 'comparação');
  must(factual.weighted.applied === false, 'ordenação sem pesos');
  const keys = factual.criteria.map((row) => row.key);
  ctx.weights = Object.fromEntries(keys.slice(0, 2).map((key, index) => [key, index ? 30 : 70]));
  const weighted = ok(await api(people.buyer, 'POST', '/api/finance/comparison', { rfq_id: ctx.rfq, weights: ctx.weights }), 'ponderada');
  must(weighted.weighted.applied === true, 'pesos não aplicados');
  return `${keys.length} critérios comparáveis; pesos ${JSON.stringify(ctx.weights)}`;
});
await step('Pedido de aprovação (política exige aprovação)', async () => {
  ok(await api(people.buyer, 'POST', '/api/finance/approval-policy', { organization_id: ctx.buyerOrg, required_for_decision: true }), 'política');
  const early = await api(people.buyer, 'POST', '/api/finance/decisions', { rfq_id: ctx.rfq, proposal_id: ctx.propB, criteria: { weights: ctx.weights } });
  must(early.status >= 400, 'decisão sem aprovação aceita');
  ctx.approval = ok(await api(people.buyer, 'POST', '/api/finance/approvals/request', { rfq_id: ctx.rfq, proposal_id: ctx.propB, approver_ids: [people.approver.id], rationale: 'Menor taxa com prazo igual.' }), 'pedido').id;
  return `decisão antes da aprovação recusada (${early.status})`;
});
await attack('Comprador aprova o próprio pedido (buyer ≠ approver)', 'recusado', async () => {
  const result = await api(people.buyer, 'POST', '/api/finance/approvals/act', { request_id: ctx.approval, action: 'approved' });
  return { ok: result.status === 403, observed: `${result.status} ${result.data?.code}` };
});
await step('Aprovador revisa e aprova', async () => {
  const inbox = ok(await api(people.approver, 'GET', `/api/finance/approvals?organization_id=${ctx.buyerOrg}`), 'fila').rows;
  must(inbox.some((row) => row.id === ctx.approval), 'pedido não aparece para o aprovador');
  const acted = ok(await api(people.approver, 'POST', '/api/finance/approvals/act', { request_id: ctx.approval, action: 'approved', comment: 'De acordo.' }), 'aprovar');
  return `status ${acted.status}`;
});
await step('Decisão, contrato, documento do contrato e renovação', async () => {
  ctx.decision = ok(await api(people.buyer, 'POST', '/api/finance/decisions', { rfq_id: ctx.rfq, proposal_id: ctx.propB, criteria: { weights: ctx.weights }, rationale: 'Aprovado pelo CFO.' }), 'decisão').id;
  ctx.contract = ok(await api(people.buyer, 'POST', '/api/finance/contracts', { decision_id: ctx.decision, starts_on: today, ends_on: addDays(120), renewal_notice_days: 30, cost_summary: 'Conforme proposta B v1' }), 'contrato').id;
  ctx.docContract = (await upload(people.buyer, ctx.buyerOrg, 'contract', ctx.contract, 'internal', 'Contrato assinado')).document_id;
  const rfq = ok(await api(people.buyer, 'GET', `/api/finance/rfq/${ctx.rfq}`), 'rfq').rfq;
  return `RFQ em ${rfq.status}; contrato ${ctx.contract.slice(0, 8)}… termina em ${addDays(120)}`;
});

// ------------------------------------------- 8. segurança entre provedores
const B = people.providerB, O = people.outsider;
const denied = (result) => result.status >= 400 || (Array.isArray(result.data?.rows) && result.data.rows.length === 0);
const show = (result) => `${result.status}${result.data?.code ? ` ${result.data.code}` : ''}${Array.isArray(result.data?.rows) ? ` rows=${result.data.rows.length}` : ''}`;
await attack('B lê a RFQ inteira (/rfq/:id) e vê a proposta de A', 'só a própria proposta', async () => {
  const result = await api(B, 'GET', `/api/finance/rfq/${ctx.rfq}`);
  const leaked = JSON.stringify(result.data).includes(ctx.propA) || JSON.stringify(result.data).includes('Banco A');
  return { ok: !leaked, observed: `${result.status}; proposta de A ${leaked ? 'VISÍVEL' : 'ausente'}` };
});
await attack('B lista propostas da RFQ (?rfq_id)', 'só a própria', async () => {
  const result = await api(B, 'GET', `/api/finance/proposals?organization_id=${ctx.orgB}&rfq_id=${ctx.rfq}`);
  const ids = (result.data?.rows || []).map((row) => row.id);
  return { ok: !ids.includes(ctx.propA), observed: `${result.status}; ids=${ids.length}, A ${ids.includes(ctx.propA) ? 'VISÍVEL' : 'ausente'}` };
});
await attack('B (convidado na RFQ) lê o Financial Passport da compradora', 'recusado', async () => { const r = await api(B, 'GET', `/api/finance/profile?organization_id=${ctx.buyerOrg}`); return { ok: r.status >= 400 && !JSON.stringify(r.data).includes('120000000'), observed: show(r) }; });
await attack('B lê a fotografia do Passport na RFQ', 'recusado', async () => { const r = await api(B, 'GET', `/api/finance/rfq-passport?organization_id=${ctx.buyerOrg}&rfq_id=${ctx.rfq}`); return { ok: r.status >= 400, observed: show(r) }; });
await attack('B grava no Passport da compradora', 'recusado', async () => { const r = await api(B, 'POST', '/api/finance/profile', { organization_id: ctx.buyerOrg, field_key: 'porte', field_value: 'me', source: 'outro' }); return { ok: r.status >= 400, observed: show(r) }; });
await attack('B abre a comparação', 'recusado', async () => { const r = await api(B, 'POST', '/api/finance/comparison', { rfq_id: ctx.rfq }); return { ok: r.status >= 400, observed: show(r) }; });
await attack('B lê o rascunho da proposta de A', 'recusado', async () => { const r = await api(B, 'GET', `/api/finance/proposal-draft?proposal_id=${ctx.propA}`); return { ok: r.status >= 400 || !r.data?.draft, observed: show(r) }; });
await attack('B grava no rascunho de A', 'recusado', async () => { const r = await api(B, 'PATCH', '/api/finance/proposal-draft', { proposal_id: ctx.propA, terms: { interest_rate_month: 9 }, expected_revision: 1, base_version: 2 }); return { ok: r.status >= 400, observed: show(r) }; });
await attack('B envia versão da proposta de A', 'recusado', async () => { const r = await api(B, 'POST', '/api/finance/proposals', { proposal_id: ctx.propA, terms: proposalTerms(9, 'Falso') }); return { ok: r.status >= 400, observed: show(r) }; });
await attack('B lê comentários da proposta de A', 'nenhum', async () => { const r = await api(B, 'GET', `/api/finance/comments?organization_id=${ctx.orgB}&object_type=proposal&object_id=${ctx.propA}`); return { ok: denied(r), observed: show(r) }; });
await attack('B lê comentários internos da RFQ', 'nenhum interno', async () => {
  const r = await api(B, 'GET', `/api/finance/comments?organization_id=${ctx.orgB}&object_type=rfq&object_id=${ctx.rfq}`);
  const internal = (r.data?.rows || []).some((row) => row.visibility === 'internal');
  return { ok: !internal, observed: `${show(r)}; interno ${internal ? 'VISÍVEL' : 'ausente'}` };
});
await attack('B responde ao comentário de A', 'recusado', async () => { const r = await api(B, 'POST', '/api/finance/comments', { organization_id: ctx.orgB, parent_id: ctx.cFromA, body: 'intrusão', client_id: crypto.randomUUID() }); return { ok: r.status >= 400, observed: show(r) }; });
await attack('B menciona o comprador em objeto de A', 'recusado', async () => { const r = await api(B, 'POST', '/api/finance/comments', { organization_id: ctx.orgB, object_type: 'proposal', object_id: ctx.propA, visibility: 'provider_visible', body: 'oi', mention_ids: [people.buyer.id], client_id: crypto.randomUUID() }); return { ok: r.status >= 400, observed: show(r) }; });
await attack('Concluir envio com reserva de mais de 10 minutos', 'recusado', async () => {
  const bytes = Buffer.from('%PDF-1.4\n%late\n');
  const begin = ok(await api(people.buyer, 'POST', '/api/finance/private-documents/upload', { organization_id: ctx.buyerOrg, entity_type: 'rfq', entity_id: ctx.rfq, title: 'Envio atrasado', visibility: 'internal', mime_type: 'application/pdf', size: bytes.length }), 'reserva');
  const put = await fetch(begin.upload_url, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: bytes });
  sql(`update public.fin_document_versions set created_at = now() - interval '11 minutes' where document_id = '${begin.document_id}'`);
  const r = await api(people.buyer, 'POST', '/api/finance/private-documents/complete', { document_id: begin.document_id, version: begin.version });
  const d = await download(people.buyer, begin.document_id);
  return { ok: put.ok && r.status >= 400 && d.status >= 400, observed: `PUT ${put.status}; concluir ${show(r)}; download ${show(d)}` };
});
await attack('B baixa documento enviado por A', 'recusado', async () => { const r = await download(B, ctx.docA); return { ok: r.status >= 400, observed: show(r) }; });
await attack('B baixa documento interno do comprador', 'recusado', async () => { const r = await download(B, ctx.docInternal); return { ok: r.status >= 400, observed: show(r) }; });
await attack('A baixa documento interno do comprador', 'recusado', async () => { const r = await download(people.providerA, ctx.docInternal); return { ok: r.status >= 400, observed: show(r) }; });
await attack('A baixa documento compartilhado da RFQ', 'permitido', async () => { const r = await download(people.providerA, ctx.docShared); return { ok: r.status === 200 && Boolean(r.data?.url), observed: show(r) }; });
await attack('B lista documentos da proposta de A', 'nenhum', async () => { const r = await api(B, 'GET', `/api/finance/private-documents?organization_id=${ctx.orgB}&entity_type=proposal&entity_id=${ctx.propA}`); return { ok: denied(r), observed: show(r) }; });
await attack('Download de documento removido', 'recusado', async () => { const r = await download(people.buyer, ctx.docRemoved); return { ok: r.status >= 400, observed: show(r) }; });
await attack('Externo baixa documento compartilhado', 'recusado', async () => { const r = await download(O, ctx.docShared); return { ok: r.status >= 400, observed: show(r) }; });
await attack('Externo lê a RFQ', 'recusado', async () => { const r = await api(O, 'GET', `/api/finance/rfq/${ctx.rfq}`); return { ok: r.status >= 400, observed: show(r) }; });
await attack('B usa a busca global', 'recusado (só comprador)', async () => { const r = await api(B, 'GET', `/api/finance/search?organization_id=${ctx.orgB}&q=Banco`); return { ok: r.status >= 400, observed: show(r) }; });
await attack('B lê revisões da RFQ com org do comprador', 'recusado', async () => { const r = await api(B, 'GET', `/api/finance/rfq-revisions?organization_id=${ctx.buyerOrg}&rfq_id=${ctx.rfq}`); return { ok: r.status >= 400, observed: show(r) }; });
await attack('B lê avisos do comprador', 'recusado', async () => { const r = await api(B, 'GET', `/api/finance/notifications?organization_id=${ctx.buyerOrg}`); return { ok: r.status >= 400, observed: show(r) }; });
await attack('Avisos de B citam proposta/comentário de A', 'nenhum', async () => {
  const r = await api(B, 'GET', `/api/finance/notifications?organization_id=${ctx.orgB}`);
  const text = JSON.stringify(r.data?.rows || []);
  const leaked = text.includes(ctx.propA) || text.includes('Banco A') || text.includes('1,45');
  return { ok: r.status === 200 && !leaked, observed: `${show(r)}; ${leaked ? 'VAZOU' : 'sem referência a A'}` };
});
await attack('B exporta o processo', 'recusado', async () => { const r = await api(B, 'GET', `/api/finance/export?rfq_id=${ctx.rfq}`); return { ok: r.status >= 400, observed: show(r) }; });

// Direto no PostgREST, com o JWT do próprio usuário (o que um atacante com a
// chave anon pública teria): o RLS é a última barreira.
for (const [table, filter, foreign] of [
  ['fin_proposals', `id=eq.${'PROP_A'}`, 'PROP_A'],
  ['fin_proposal_versions', `proposal_id=eq.${'PROP_A'}`, 'PROP_A'],
  ['fin_proposal_drafts', `proposal_id=eq.${'PROP_A'}`, 'PROP_A'],
  ['fin_comments', `object_id=eq.${'PROP_A'}`, 'PROP_A'],
  ['fin_private_documents', `entity_id=eq.${'PROP_A'}`, 'PROP_A'],
  ['fin_decisions', `rfq_id=eq.${'RFQ'}`, 'RFQ'],
  ['fin_approval_requests', `rfq_id=eq.${'RFQ'}`, 'RFQ'],
  ['fin_notifications', `object_id=eq.${'PROP_A'}`, 'PROP_A'],
  ['fin_events', `entity_id=eq.${'PROP_A'}`, 'PROP_A']
]) {
  await attack(`PostgREST direto com JWT de B: ${table}`, '0 linhas', async () => {
    const resolved = filter.replace('PROP_A', ctx.propA).replace('RFQ', ctx.rfq);
    const r = await rest(B, `${table}?select=*&${resolved}`);
    return { ok: Array.isArray(r.rows) ? r.rows.length === 0 : r.status >= 400, observed: `${r.status} rows=${Array.isArray(r.rows) ? r.rows.length : '-'}` };
  });
}
await attack('PostgREST direto com JWT externo: fin_rfqs / fin_proposal_versions', '0 linhas', async () => {
  const a = await rest(O, 'fin_rfqs?select=id'); const b = await rest(O, 'fin_proposal_versions?select=proposal_id');
  return { ok: a.rows?.length === 0 && b.rows?.length === 0, observed: `rfqs=${a.rows?.length}, versions=${b.rows?.length}` };
});
async function rpc(who, name, body) {
  const headers = { apikey: ANON, 'Content-Type': 'application/json' };
  if (who) headers.Authorization = `Bearer ${accessToken(who)}`;
  const response = await fetch(`${SB}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: response.status, data: await response.json().catch(() => null) };
}
// Auxiliares internas expostas pelos default privileges do Supabase
// (docs/supabase-financial-pilot-surface-hardening.sql).
await attack('Externo pergunta à allowlist se um domínio participa do piloto', 'recusado (42501)', async () => {
  const r = await rpc(O, 'fin_pilot_access_allowed', { p_email: people.buyer.email });
  return { ok: r.status >= 400 && r.data?.code === '42501', observed: `${r.status} ${r.data?.code || JSON.stringify(r.data)}` };
});
await attack('Externo descobre a organização dona da RFQ pelo UUID', 'recusado (42501)', async () => {
  const r = await rpc(O, 'fin_comment_object_org', { p_type: 'rfq', p_id: ctx.rfq });
  return { ok: r.status >= 400 && r.data?.code === '42501', observed: `${r.status} ${r.data?.code || JSON.stringify(r.data)}` };
});
await attack('Anônimo chama RPC financeira e lê view legada de arte', 'recusado', async () => {
  const a = await rpc(null, 'fin_create_organization', { p_name: 'Anon', p_kind: 'BUYER', p_country: 'BR' });
  const v = await fetch(`${SB}/rest/v1/v_commercial_pipeline?select=*`, { headers: { apikey: ANON } });
  return { ok: a.status >= 400 && v.status >= 400, observed: `rpc ${a.status} ${a.data?.code || ''}; view ${v.status}` };
});
await attack('Storage direto com JWT de A (objeto do bucket privado)', 'recusado', async () => {
  const path = sql(`select storage_path from public.fin_document_versions where document_id = '${ctx.docShared}' and version = 1`);
  const r = await fetch(`${SB}/storage/v1/object/fin-documents/${path}`, { headers: { apikey: ANON, Authorization: `Bearer ${accessToken(people.providerA)}` } });
  const pub = await fetch(`${SB}/storage/v1/object/public/fin-documents/${path}`);
  return { ok: r.status >= 400 && pub.status >= 400, observed: `autenticado ${r.status}, público ${pub.status}` };
});

// ------------------------------------------------------------------ 9. cron
const cron = (secret) => fetch(`${APP}/api/jobs/renewals`, { headers: secret ? { Authorization: `Bearer ${secret}` } : {} }).then(async (r) => ({ status: r.status, data: await r.json() }));
const counts = () => JSON.parse(sql(`select json_build_object(
  'milestones', (select count(*) from public.fin_renewal_milestones where contract_id = '${ctx.contract}'),
  'tasks', (select count(*) from public.fin_tasks where related_id = '${ctx.contract}'),
  'notifications', (select count(*) from public.fin_notifications where object_id = '${ctx.contract}'),
  'events', (select count(*) from public.fin_events where entity_id = '${ctx.contract}'))`));
await attack('Cron sem segredo', '401', async () => { const r = await cron(''); return { ok: r.status === 401, observed: `${r.status} ${r.data.code}` }; });
await attack('Cron com segredo errado', '401', async () => { const r = await cron('x'.repeat(CRON.length)); return { ok: r.status === 401, observed: `${r.status} ${r.data.code}` }; });
await step('Cron com segredo: marcos 90/60/30/aviso pela rota HTTP, duas execuções cada, sem duplicar', async () => {
  // O cron só aceita o dia corrente (±1). Para alcançar cada marco hoje, o fim do
  // contrato é deslocado — como o tempo passaria — e a rota real roda duas vezes.
  const plan = [['d90', 85, 30], ['d60', 55, 30], ['d30', 25, 20], ['notice', 15, 20]];
  const seen = [];
  for (const [label, days, notice] of plan) {
    sql(`update public.fin_contracts set ends_on = '${addDays(days)}'::date, renewal_notice_days = ${notice} where id = '${ctx.contract}'`);
    const first = await cron(CRON); const second = await cron(CRON);
    must(first.status === 200 && second.status === 200, `${label}: cron ${first.status}/${second.status}`);
    must(second.data.tasks_created === 0, `${label}: segunda execução criou tarefa`);
    const marks = sql(`select string_agg(milestone, ',' order by triggered_at) from public.fin_renewal_milestones where contract_id = '${ctx.contract}'`);
    must(marks.split(',').includes(label), `${label} não registrado (${marks})`);
    seen.push(`${label}:${first.data.tasks_created}+${second.data.tasks_created}`);
  }
  const final = counts();
  const duplicates = Number(sql(`select count(*) from (select milestone from public.fin_renewal_milestones where contract_id = '${ctx.contract}' group by milestone having count(*) > 1) d`));
  const dupNotifications = Number(sql(`select count(*) from (select user_id, event_type, event_id from public.fin_notifications where object_id = '${ctx.contract}' group by 1,2,3 having count(*) > 1) d`));
  const dupEvents = Number(sql(`select count(*) from (select metadata->>'milestone' from public.fin_events where entity_id = '${ctx.contract}' and event_type = 'renewal_milestone_reached' group by 1 having count(*) > 1) d`));
  const openTasks = Number(sql(`select count(*) from public.fin_tasks where related_id = '${ctx.contract}' and status = 'open'`));
  must(duplicates === 0 && dupNotifications === 0 && dupEvents === 0 && openTasks === 1, `duplicados: marcos ${duplicates}, avisos ${dupNotifications}, eventos ${dupEvents}, tarefas abertas ${openTasks}`);
  const runs = sql(`select count(*) from public.fin_job_runs where job = 'renewals' and status = 'succeeded'`);
  return `${seen.join(' ')} (tarefas criadas por execução); final ${JSON.stringify(final)}; 1 tarefa aberta, 0 marco/aviso/evento duplicado; ${runs} execuções registradas`;
});

await attack('Duas execuções simultâneas do cron no mesmo dia', '1 marco, 1 aviso', async () => {
  // Contrato vencendo hoje: marco novo "expired". Duas chamadas concorrentes.
  sql(`update public.fin_contracts set ends_on = current_date where id = '${ctx.contract}'`);
  const [a, b] = await Promise.all([cron(CRON), cron(CRON)]);
  const expired = Number(sql(`select count(*) from public.fin_renewal_milestones where contract_id = '${ctx.contract}' and milestone = 'expired'`));
  const notices = Number(sql(`select count(*) from public.fin_notifications n join public.fin_renewal_milestones m on m.id = n.event_id where m.contract_id = '${ctx.contract}' and m.milestone = 'expired'`));
  return { ok: a.status === 200 && b.status === 200 && expired === 1 && notices === 1, observed: `${a.status}/${b.status}; marcos expired=${expired}, avisos=${notices}` };
});
await attack('Sessão expirada sem refresh token', '401', async () => {
  const stale = { cookie: `arandu_session=${encodeURIComponent(Buffer.from(JSON.stringify({ access_token: accessToken(people.buyer), expires_at: Math.floor(Date.now() / 1000) - 60 })).toString('base64url'))}` };
  const r = await api(stale, 'GET', `/api/finance/overview?organization_id=${ctx.buyerOrg}`);
  return { ok: r.status === 401, observed: show(r) };
});

// ---------------------------------------------------------------- 10. e-mail
await step('E-mail: mention, approval_requested, proposal_received, renewal_due na fila, sem conteúdo do processo', async () => {
  const rows = JSON.parse(sql(`select coalesce(json_agg(json_build_object('event', payload->>'event', 'kind', payload->>'kind', 'path', payload->>'path', 'keys', (select array_agg(k order by k) from jsonb_object_keys(payload) k), 'key', idempotency_key)), '[]') from public.transactional_email_outbox where template = 'finance_notification' and recipient_address in ('${people.buyer.email}','${people.approver.email}')`));
  const events = [...new Set(rows.map((row) => row.event))].sort();
  for (const needed of ['approval_requested', 'mention', 'proposal_received', 'renewal_due']) must(events.includes(needed), `sem e-mail de ${needed} (fila: ${events.join(',')})`);
  for (const row of rows) {
    must(JSON.stringify(row.keys) === JSON.stringify(['event', 'kind', 'path']), `payload com chaves extras: ${row.keys}`);
    must(/^\/finance\/[a-z-]+\.html([?#][A-Za-z0-9=_-]+)?$/.test(row.path), `link fora do portal: ${row.path}`);
    const mail = renderTransactionalEmail('finance_notification', { kind: row.kind, event: row.event, path: row.path });
    const text = `${mail.subject}\n${mail.text}\n${mail.html}`;
    for (const secret of ['3000000', '3.000.000', '1,52', '1.52', '1,39', '1.39', 'Banco A', 'Banco B', 'aval', 'teto', 'Parecer', 'Demonstrações']) must(!text.includes(secret), `e-mail contém "${secret}"`);
  }
  const unique = new Set(rows.map((row) => row.key)).size === rows.length;
  must(unique, 'idempotency_key repetida');
  return `${rows.length} e-mails: ${events.join(', ')}; payload só {event, kind, path}; nenhum valor, taxa, concorrente, comentário ou documento`;
});
await step('E-mail: preferência desligada e limite de 20/h por destinatário', async () => {
  ok(await api(people.approver, 'POST', '/api/finance/notification-preferences', { organization_id: ctx.buyerOrg, event_type: 'mention', in_app: true, email: false }), 'desligar');
  const before = outboxCount();
  ok(await api(people.buyer, 'POST', '/api/finance/comments', { organization_id: ctx.buyerOrg, object_type: 'rfq', object_id: ctx.rfq, visibility: 'internal', body: 'Nova menção sem e-mail.', mention_ids: [people.approver.id], client_id: crypto.randomUUID() }), 'menção');
  must(outboxCount() === before, 'e-mail enfileirado com preferência desligada');
  sql(`insert into public.fin_notifications (organization_id, user_id, event_type, object_type, object_id, event_id, title, body)
       select '${ctx.buyerOrg}', '${people.buyer.id}', 'mention', 'rfq', '${ctx.rfq}', gen_random_uuid(), 'Mencionaram você', 'Abra o processo.' from generate_series(1, 30)`);
  const lastHour = Number(sql(`select count(*) from public.transactional_email_outbox where template = 'finance_notification' and recipient_address = '${people.buyer.email}' and created_at > now() - interval '1 hour'`));
  must(lastHour === 20, `limite: ${lastHour}`);
  return `preferência respeitada; 30 avisos → ${lastHour} e-mails na última hora`;
});
// Sem provedor de e-mail configurado, o piloto roda com email_enabled=false
// (convites entregues à mão). O ensaio devolve o ambiente a esse estado.
sql(`update public.fin_settings set value = 'false' where key = 'email_enabled'`);

// ------------------------------------------------------------ 11. operador
// finance_ops = papel de plataforma (app_metadata) + registro + aal2. O operador
// legado (admin de arte) mantém o admin de arte e não abre o console financeiro.
const LEGACY_ADMIN = [
  ['GET', '/api/admin-auth?action=session'], ['POST', '/api/admin-auth?action=challenge'],
  ['GET', '/api/admin?panel=artworks'], ['GET', '/api/dashboard'], ['GET', '/api/admin/quality'],
  ['GET', '/api/operational?resource=artwork'], ['GET', '/api/media'], ['GET', '/api/catalog-review'],
  ['GET', '/api/artist-accounts'], ['POST', '/api/admin-update'], ['GET', '/api/orders'], ['GET', '/api/commercial'],
  ['POST', '/api/upload'], ['GET', '/api/mvp-dashboard'], ['GET', '/api/readiness'], ['GET', '/api/internal-page?page=admin.html'],
  ['GET', '/api/pilot/metrics']
];
sql(`insert into public.fin_platform_operators (user_id, granted_by) values ('${people.operator.id}', 'piloto local ${RUN}'), ('${people.legacyOperator.id}', 'grant antigo ${RUN}') on conflict do nothing`);
await attack('Admin de empresa (aal1) abre o console', '403 finance_ops_required', async () => { const r = await api(people.buyer, 'GET', '/api/finance/ops/overview'); return { ok: r.status === 403 && r.data?.code === 'finance_ops_required', observed: show(r) }; });
await attack('Admin de provedor abre o console', '403 finance_ops_required', async () => { const r = await api(people.providerA, 'GET', '/api/finance/ops/overview'); return { ok: r.status === 403 && r.data?.code === 'finance_ops_required', observed: show(r) }; });
await attack('Externo abre o console', '403', async () => { const r = await api(O, 'GET', '/api/finance/ops/overview'); return { ok: r.status === 403, observed: show(r) }; });
await attack('finance_ops sem MFA (aal1) abre o console', '403 mfa_required', async () => {
  const r = await api(people.operator, 'GET', '/api/finance/ops/overview');
  return { ok: r.status === 403 && r.data?.code === 'mfa_required', observed: show(r) };
});
await attack('Admin de empresa com MFA (aal2), sem papel finance_ops', '403 finance_ops_required', async () => {
  const enrolled = await enrollTotp({ url: SB, anonKey: ANON, accessToken: accessToken(people.buyer) });
  const session = await verifyTotp({ url: SB, anonKey: ANON, accessToken: accessToken(people.buyer), factorId: enrolled.factorId, code: totpCode(enrolled.secret) });
  const elevated = { cookie: sessionCookie(session) };
  const r = await api(elevated, 'GET', '/api/finance/ops/overview');
  const mfa = await api(elevated, 'POST', '/api/finance/ops/mfa', { step: 'challenge' });
  return { ok: jwtAal(session.access_token) === 'aal2' && r.status === 403 && r.data?.code === 'finance_ops_required' && mfa.status === 403, observed: `aal=${jwtAal(session.access_token)}; console ${show(r)}; MFA do console ${show(mfa)}` };
});
await attack('Operador legado (arandu_role=operator) com MFA e registro antigo abre o console', '403 finance_ops_required; admin legado fechado no piloto (404)', async () => {
  const enrolled = await enrollTotp({ url: SB, anonKey: ANON, accessToken: accessToken(people.legacyOperator) });
  const session = await verifyTotp({ url: SB, anonKey: ANON, accessToken: accessToken(people.legacyOperator), factorId: enrolled.factorId, code: totpCode(enrolled.secret) });
  people.legacyOperator.cookie = sessionCookie(session);
  const legacySession = await api(people.legacyOperator, 'GET', '/api/admin-auth?action=session');
  const r = await api(people.legacyOperator, 'GET', '/api/finance/ops/overview');
  return { ok: jwtAal(accessToken(people.legacyOperator)) === 'aal2' && legacySession.status === 404 && legacySession.data?.code === 'legacy_surface_closed'
      && r.status === 403 && r.data?.code === 'finance_ops_required',
    observed: `admin legado ${show(legacySession)}; console ${show(r)}` };
});
await attack('finance_ops tenta o MFA do admin legado', '404 legacy_surface_closed', async () => {
  const r = await api(people.operator, 'POST', '/api/admin-auth?action=challenge', {});
  return { ok: r.status === 404 && r.data?.code === 'legacy_surface_closed', observed: show(r) };
});
await step('finance_ops: cadastra TOTP (npm run finance:operator:mfa), confirma no próprio console e abre o console', async () => {
  const enrolled = await enrollTotp({ url: SB, anonKey: ANON, accessToken: accessToken(people.operator) });
  await verifyTotp({ url: SB, anonKey: ANON, accessToken: accessToken(people.operator), factorId: enrolled.factorId, code: totpCode(enrolled.secret) });
  const wrong = await api(people.operator, 'POST', '/api/finance/ops/mfa', { step: 'challenge' });
  const bad = await api(people.operator, 'POST', '/api/finance/ops/mfa', { step: 'verify', factor_id: wrong.data.factor_id, challenge_id: wrong.data.challenge_id, code: totpCode(enrolled.secret, Date.now() - 300_000) });
  must(bad.status === 401 && jwtAal(accessToken(people.operator)) === 'aal1', `código errado aceito (${bad.status})`);
  const challenge = ok(await api(people.operator, 'POST', '/api/finance/ops/mfa', { step: 'challenge' }), 'desafio');
  await new Promise((resolve) => setTimeout(resolve, 1100));
  ok(await api(people.operator, 'POST', '/api/finance/ops/mfa', { step: 'verify', factor_id: challenge.factor_id, challenge_id: challenge.challenge_id, code: totpCode(enrolled.secret) }), 'verificar');
  must(jwtAal(accessToken(people.operator)) === 'aal2', 'cookie sem aal2');
  const overview = ok(await api(people.operator, 'GET', '/api/finance/ops/overview'), 'console');
  const text = JSON.stringify(overview);
  for (const forbidden of ['@', '3000000', '1.52', '1.39', 'Banco A', 'Banco B', 'Capital de giro', 'Parecer', 'aval', 'teto']) must(!text.includes(forbidden), `console expõe "${forbidden}"`);
  must(overview.overview.schema_version === EXPECTED_SCHEMA_VERSION, `schema ${overview.overview.schema_version}`);
  const trace = ok(await api(people.operator, 'GET', `/api/finance/ops/trace?entity_id=${ctx.rfq}`), 'rastreio');
  const denials = trace.trace.invite_denials || [];
  must(denials.length >= 2 && !JSON.stringify(trace).includes('@') && !JSON.stringify(trace).includes('Capital de giro'), 'rastreio sem recusas ou com dado de cliente');
  const logged = Number(sql(`select count(*) from public.fin_ops_access_log where user_id = '${people.operator.id}'`));
  return `código errado recusado (401); overview sem e-mail/valor/título; recusas de convite no rastreio (${denials.map((row) => row.reason).join(', ')}); ${logged} acessos auditados`;
});
await attack(`finance_ops com MFA nas ${LEGACY_ADMIN.length} rotas legadas de arte`, '404 legacy_surface_closed em todas (ARANDU_ENV=pilot)', async () => {
  const results = [];
  for (const [method, path] of LEGACY_ADMIN) {
    const r = await api(people.operator, method, path, method === 'POST' ? {} : undefined);
    results.push([path, r.status, r.data?.code]);
  }
  const open = results.filter(([, status, code]) => !(status === 404 && code === 'legacy_surface_closed'));
  return { ok: jwtAal(accessToken(people.operator)) === 'aal2' && open.length === 0,
    observed: open.length ? `abertas/inesperadas: ${open.map(([path, status, code]) => `${path} ${status} ${code}`).join('; ')}` : `${results.length}/${results.length} fechadas` };
});
await attack('Anônimo grava lead pelo formulário legado de arte no banco do piloto', '404; nenhuma linha em leads', async () => {
  const before = Number(sql('select count(*) from public.leads'));
  const r = await api(null, 'POST', '/api/forms', { type: 'contact', name: 'Spam', email: `spam.${RUN}@example.invalid`, message: 'x', consent: true });
  const after = Number(sql('select count(*) from public.leads'));
  return { ok: r.status === 404 && after === before, observed: `${show(r)}; leads ${before}->${after}` };
});

// ----------------------------------------------------------------- relatório
const table = (rows, columns) => [`| ${columns.join(' | ')} |`, `| ${columns.map(() => '---').join(' | ')} |`, ...rows.map((row) => `| ${columns.map((column) => String(row[column] ?? '').replace(/\|/g, '/').replace(/\n/g, ' ')).join(' | ')} |`)].join('\n');
const report = [
  `# Jornada real do piloto — ${new Date().toISOString()}`, '', `App: ${APP} · Supabase: ${SB} · execução ${RUN}`, '',
  '## Jornada', '', table(steps.map((row) => ({ Step: row.name, Status: row.status, Evidence: row.evidence })), ['Step', 'Status', 'Evidence']), '',
  '## Ataques', '', table(attacks.map((row) => ({ Attack: row.name, Expected: row.expected, Observed: row.observed, Status: row.status })), ['Attack', 'Expected', 'Observed', 'Status'])
].join('\n');
console.log(report);
if (process.env.PILOT_REPORT) fs.writeFileSync(process.env.PILOT_REPORT, `${report}\n`);
const failed = [...steps, ...attacks].filter((row) => row.status !== 'PASS');
console.log(`\n${steps.length} passos, ${attacks.length} ataques, ${failed.length} falhas.`);
process.exit(failed.length ? 1 : 0);
