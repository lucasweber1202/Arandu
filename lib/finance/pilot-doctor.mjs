// Diagnóstico de prontidão do piloto financeiro (`npm run finance:pilot:doctor`).
//
// SOMENTE LEITURA: faz apenas GET/HEAD. Não cria organização, usuário, bucket,
// migration, operador nem entrada de allowlist, e nunca chama RPC.
// Nunca imprime segredo, chave, token, senha, JWT nem e-mail: só presença,
// formato, comprimento, contagem e estado.
//
// Níveis: OK · WARN (não bloqueia) · ERROR (bloqueia: NO-GO) · UNSAFE
// (configuração perigosa). Saída: 0 = GO, 1 = NO-GO, 2 = UNSAFE.
import { inspectEmailConfiguration } from '../email.mjs';
import { DOCUMENT_BUCKET, DOCUMENT_MAX_BYTES, DOCUMENT_MIME_TYPES } from './document-storage.mjs';
import { FINANCE_OPS_ROLE } from './ops-access.mjs';

export const EXPECTED_SCHEMA_VERSION = 'financial-legacy-art-decommission-1';
export const CATEGORIES = ['ENVIRONMENT', 'SECURITY', 'DATABASE', 'STORAGE', 'AUTH', 'PILOT', 'EMAIL', 'CRON', 'OPERATIONS'];
export const EXIT = { GO: 0, 'NO-GO': 1, UNSAFE: 2 };

export const REQUIRED_TABLES = [
  'fin_job_leases', 'fin_organizations', 'fin_members', 'fin_providers', 'fin_rfqs', 'fin_rfq_invites', 'fin_proposals', 'fin_proposal_versions',
  'fin_decisions', 'fin_contracts', 'fin_approval_policies', 'fin_comments', 'fin_notifications', 'fin_private_documents',
  'fin_document_versions', 'fin_settings', 'fin_pilot_allowlist', 'fin_platform_operators', 'fin_job_runs',
  'fin_invite_acceptance_denials', 'fin_renewal_milestones', 'transactional_email_outbox',
  'fin_company_profiles', 'fin_company_profile_history', 'fin_rfq_profile_snapshots'
];
export const REQUIRED_RPCS = [
  'fin_job_begin', 'fin_job_finish', 'fin_query_graph', 'fin_request_policy_approval', 'fin_act_on_approval_v2', 'fin_preview_approval_policy', 'fin_run_approval_deadlines',
  'fin_api_whoami', 'fin_webhook_claim', 'fin_webhook_complete', 'fin_create_service_account',
  'fin_sso_discover', 'fin_sso_password_allowed', 'fin_sso_authorize', 'fin_sso_session_valid',
  'consume_rate_limit', 'fin_create_organization', 'fin_invite_provider', 'fin_accept_provider_invite', 'fin_submit_proposal',
  'fin_request_approval', 'fin_record_decision', 'fin_register_contract', 'fin_document_begin_upload', 'fin_document_finalize_upload',
  'fin_document_authorize_download', 'fin_run_renewal_schedule', 'fin_record_job_run', 'fin_ops_overview', 'fin_platform_role',
  'fin_passport_set_field', 'fin_passport_confirm_field', 'fin_passport_set_scoped_field', 'fin_passport_confirm_scoped_field', 'fin_create_rfq_from_passport'
];
// Tabelas que a chave pública (anon) nunca pode ler.
const ANON_PROBES = ['fin_rfqs', 'fin_proposal_versions', 'fin_private_documents', 'fin_pilot_allowlist', 'fin_platform_operators', 'fin_invite_acceptance_denials', 'fin_company_profile_history', 'fin_rfq_profile_snapshots'];
const TRUTHY = new Set(['1', 'true', 'yes', 'sim']);
// Projeto Supabase histórico da vertical de arte: o piloto nunca aponta para ele.
export const LEGACY_SUPABASE_REFS = ['igacnfjeuqhxcmfyepgj'];
// Projeto Supabase dedicado ao piloto. A produção oficial nunca aponta para ele.
export const PILOT_SUPABASE_REFS = ['offgpyysgdhfemjlchod'];
// Projetos Supabase dedicados à demonstração (Vitta Foods) e à produção. Ficam
// vazios até cada projeto existir; quando o ref for conhecido, registre-o aqui
// para que nenhum ambiente aponte para o banco do outro. Enquanto vazios, a
// separação continua garantida pelo marcador `deployment_environment` em
// fin_settings (gravado só pelo seed da demo; ver lib/finance/demo-guard.mjs).
export const DEMO_SUPABASE_REFS = [];
export const PRODUCTION_SUPABASE_REFS = [];
export const DOCTOR_ENVIRONMENTS = ['demo', 'pilot', 'production'];
// Únicas RPCs que a chave pública pode executar (funções puras, sem dado).
export const ANON_RPC_ALLOWLIST = ['fin_document_mime_allowed', 'fin_jwt_aal'];

function jwtClaims(key) {
  try { return JSON.parse(Buffer.from(String(key || '').split('.')[1] || '', 'base64url').toString('utf8')) || {}; } catch { return {}; }
}
function projectRef(url) {
  try { const host = new URL(url).hostname.toLowerCase(); return host.endsWith('.supabase.co') ? host.split('.')[0] : null; } catch { return null; }
}

/**
 * Diz, em texto, por que um ref de Supabase não pode servir a um ambiente;
 * null quando pode. Demo, piloto e produção nunca compartilham banco, e
 * nenhum usa o projeto legado de arte.
 */
export function foreignSupabaseRef(environment, ref) {
  if (!ref) return null;
  if (LEGACY_SUPABASE_REFS.includes(ref)) return 'SUPABASE_URL aponta para o projeto legado de arte — cada ambiente tem Supabase dedicado';
  const owners = { pilot: PILOT_SUPABASE_REFS, demo: DEMO_SUPABASE_REFS, production: PRODUCTION_SUPABASE_REFS };
  for (const [owner, refs] of Object.entries(owners)) {
    if (owner !== environment && refs.includes(ref)) return `${environment || 'ambiente'} apontando para o Supabase ${owner === 'pilot' ? 'do piloto' : owner === 'demo' ? 'da demonstração' : 'da produção'} — cada ambiente tem banco próprio`;
  }
  return null;
}

function jwtRole(key) {
  const value = String(key || '');
  if (value.startsWith('sb_secret_')) return 'service_role';
  if (value.startsWith('sb_publishable_')) return 'anon';
  try { return JSON.parse(Buffer.from(value.split('.')[1] || '', 'base64url').toString('utf8')).role || null; } catch { return null; }
}

export async function runDoctor({ env = process.env, fetchImpl = globalThis.fetch, vercelConfig = null, now = () => new Date(), timeoutMs = 5000 } = {}) {
  const checks = [];
  const add = (category, name, level, detail = '') => checks.push({ category, name, level, detail });
  const flag = (name) => TRUTHY.has(String(env[name] || '').trim().toLowerCase());
  const value = (name) => String(env[name] || '').trim();

  // ------------------------------------------------------------ ENVIRONMENT
  const declared = value('ARANDU_ENV').toLowerCase();
  const known = DOCTOR_ENVIRONMENTS.includes(declared);
  add('ENVIRONMENT', 'ARANDU_ENV', known ? 'OK' : 'ERROR', known ? declared : `"${declared || 'ausente'}" — este diagnóstico avalia demo, piloto ou produção; use ARANDU_ENV=demo, pilot ou production`);
  const siteUrl = value('ARANDU_SITE_URL').replace(/\/+$/, '');
  add('ENVIRONMENT', 'ARANDU_SITE_URL', /^https:\/\/[^/\s]+/.test(siteUrl) ? 'OK' : 'ERROR', siteUrl ? (/^https:\/\//.test(siteUrl) ? 'https' : 'precisa ser https') : 'ausente');
  const supabaseUrl = value('SUPABASE_URL').replace(/\/+$/, '');
  const urlOk = /^https:\/\/[^/\s]+$/.test(supabaseUrl);
  add('ENVIRONMENT', 'SUPABASE_URL', urlOk ? 'OK' : 'ERROR', supabaseUrl ? (urlOk ? 'https' : 'formato inválido (https://<projeto>)') : 'ausente');
  const anon = value('SUPABASE_ANON_KEY');
  const service = value('SUPABASE_SERVICE_ROLE_KEY');
  const cron = value('CRON_SECRET');
  add('ENVIRONMENT', 'SUPABASE_ANON_KEY', anon ? 'OK' : 'ERROR', anon ? `presente (${anon.length} caracteres)` : 'ausente');
  add('ENVIRONMENT', 'SUPABASE_SERVICE_ROLE_KEY', service ? 'OK' : 'ERROR', service ? `presente só no servidor (${service.length} caracteres)` : 'ausente — documentos e cron não funcionam');
  add('ENVIRONMENT', 'CRON_SECRET', cron.length >= 32 ? 'OK' : 'ERROR', cron ? (cron.length >= 32 ? `${cron.length} caracteres` : `curto (${cron.length}; mínimo 32)`) : 'ausente');

  // --------------------------------------------------------------- SECURITY
  const demo = flag('ARANDU_DEMO_MODE') || flag('ARANDU_PRESENTATION_MODE') || value('ARANDU_DEPLOYMENT_KIND').toLowerCase() === 'demo';
  add('SECURITY', 'sandbox de demonstração desligado', demo ? 'UNSAFE' : 'OK', demo ? 'sandbox/apresentação ligado num ambiente com banco próprio' : 'desligado');
  if (anon) {
    const role = jwtRole(anon);
    add('SECURITY', 'chave pública é anon', role === 'service_role' ? 'UNSAFE' : role === 'anon' ? 'OK' : 'WARN',
      role === 'service_role' ? 'SUPABASE_ANON_KEY é uma chave de serviço (atravessa o RLS no navegador)' : role === 'anon' ? 'papel anon' : 'papel não identificado');
  }
  if (service) {
    const role = jwtRole(service);
    add('SECURITY', 'chave de servidor é service_role', role === 'service_role' ? 'OK' : 'ERROR', role === 'service_role' ? 'papel service_role' : 'SUPABASE_SERVICE_ROLE_KEY não é chave de serviço');
  }
  const ref = projectRef(supabaseUrl);
  const foreignRef = foreignSupabaseRef(declared, ref);
  if (foreignRef) add('SECURITY', 'projeto Supabase do ambiente', 'UNSAFE', foreignRef);
  else add('SECURITY', 'projeto Supabase do ambiente', 'OK', ref ? `dedicado ao ambiente ${declared || '?'} (não é o legado nem o de outro ambiente)` : 'domínio próprio (ref não verificável)');
  const foreign = [['SUPABASE_ANON_KEY', anon], ['SUPABASE_SERVICE_ROLE_KEY', service]]
    .filter(([, key]) => key && ref && jwtClaims(key).ref && jwtClaims(key).ref !== ref).map(([name]) => name);
  add('SECURITY', 'chaves do mesmo projeto', foreign.length ? 'UNSAFE' : 'OK', foreign.length
    ? `${foreign.join(', ')} de outro projeto Supabase (ref da chave diferente de SUPABASE_URL)`
    : 'ref das chaves confere com SUPABASE_URL (ou chave sem ref)');
  const reused = cron && (cron === service || cron === anon);
  add('SECURITY', 'CRON_SECRET próprio', reused ? 'UNSAFE' : 'OK', reused ? 'CRON_SECRET igual a uma chave do Supabase' : 'distinto das chaves');
  const secrets = [service, cron].filter((item) => item.length >= 12);
  const exposed = Object.keys(env).filter((name) => /^(VITE_|NEXT_PUBLIC_|PUBLIC_)/.test(name) && secrets.includes(String(env[name] || '').trim()));
  add('SECURITY', 'segredo fora de variável pública', exposed.length ? 'UNSAFE' : 'OK', exposed.length ? `segredo em variável exposta ao navegador (${exposed.join(', ')})` : 'nenhum segredo em VITE_/NEXT_PUBLIC_/PUBLIC_');

  // --------------------------------------------------------- acesso remoto
  const request = async (url, { key, method = 'GET', headers = {} } = {}) => {
    try {
      const response = await fetchImpl(url, {
        method, signal: AbortSignal.timeout(timeoutMs),
        headers: key ? { apikey: key, Authorization: `Bearer ${key}`, ...headers } : headers
      });
      const text = method === 'HEAD' ? '' : await response.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = null; }
      return { ok: response.ok, status: response.status, data, headers: response.headers };
    } catch (error) {
      return { ok: false, status: 0, data: null, error: error?.name === 'TimeoutError' ? 'timeout' : 'network_error' };
    }
  };
  const rest = (path, key = service, options) => request(`${supabaseUrl}/rest/v1/${path}`, { key, ...options });
  const count = async (table, filter = '') => {
    const response = await rest(`${table}?select=*${filter ? `&${filter}` : ''}`, service, { method: 'HEAD', headers: { Prefer: 'count=exact' } });
    if (!response.ok) return null;
    const total = Number(String(response.headers?.get?.('content-range') || '').split('/')[1]);
    return Number.isFinite(total) ? total : null;
  };
  const why = (response) => response.status ? `HTTP ${response.status}` : response.error;

  const remote = urlOk && service && anon;
  let reachable = false;
  if (!remote) {
    for (const category of ['DATABASE', 'STORAGE', 'AUTH', 'PILOT']) add(category, 'conexão', 'ERROR', 'sem SUPABASE_URL, chave anon e service role não há como diagnosticar');
  } else {
    // --------------------------------------------------------------- DATABASE
    const openapi = await rest('');
    reachable = openapi.ok && openapi.data && typeof openapi.data === 'object';
    add('DATABASE', 'conexão (PostgREST)', reachable ? 'OK' : 'ERROR', reachable ? 'respondendo' : why(openapi));
    if (reachable) {
      const tables = new Set(Object.keys(openapi.data.definitions || {}));
      const rpcs = new Set(Object.keys(openapi.data.paths || {}).filter((path) => path.startsWith('/rpc/')).map((path) => path.slice(5)));
      const missingTables = REQUIRED_TABLES.filter((table) => !tables.has(table));
      const missingRpcs = REQUIRED_RPCS.filter((rpc) => !rpcs.has(rpc));
      add('DATABASE', 'tabelas obrigatórias', missingTables.length ? 'ERROR' : 'OK', missingTables.length ? `ausentes: ${missingTables.join(', ')}` : `${REQUIRED_TABLES.length} presentes`);
      add('DATABASE', 'funções obrigatórias', missingRpcs.length ? 'ERROR' : 'OK', missingRpcs.length ? `ausentes: ${missingRpcs.join(', ')} — aplique docs/supabase-migrations.json` : `${REQUIRED_RPCS.length} presentes`);
      const version = await rest('fin_settings?select=value&key=eq.schema_version');
      const current = version.ok ? version.data?.[0]?.value || null : null;
      add('DATABASE', 'versão das migrations', current === EXPECTED_SCHEMA_VERSION ? 'OK' : 'ERROR', current ? `${current}${current === EXPECTED_SCHEMA_VERSION ? '' : ` (esperado ${EXPECTED_SCHEMA_VERSION})`}` : `marcador ausente (esperado ${EXPECTED_SCHEMA_VERSION})`);
      // Marcador gravado só pelo seed da demonstração (scripts/demo/seed.mjs).
      // Num banco de piloto ou produção ele nunca existe; na demo ele precisa existir.
      const marker = await rest('fin_settings?select=value&key=eq.deployment_environment');
      const markedAs = marker.ok ? marker.data?.[0]?.value || null : null;
      if (declared === 'demo') add('DATABASE', 'marcador de ambiente', markedAs === 'demo' ? 'OK' : markedAs ? 'UNSAFE' : 'WARN', markedAs === 'demo' ? 'banco marcado como demonstração' : markedAs ? `banco marcado como "${markedAs}"` : 'ausente — rode npm run demo:seed neste banco');
      else if (known) add('DATABASE', 'marcador de ambiente', markedAs === 'demo' ? 'UNSAFE' : 'OK', markedAs === 'demo' ? `banco de demonstração ligado a ARANDU_ENV=${declared}` : 'sem marcador de demonstração');
      const leaks = [];
      for (const table of ANON_PROBES) {
        const probe = await rest(`${table}?select=*&limit=1`, anon);
        if (probe.ok && Array.isArray(probe.data) && probe.data.length) leaks.push(table);
      }
      add('DATABASE', 'RLS/grants contra a chave pública', leaks.length ? 'UNSAFE' : 'OK', leaks.length ? `anon lê: ${leaks.join(', ')}` : `${ANON_PROBES.length} tabelas sensíveis sem leitura anônima`);
      // O que a chave pública enxerga pelo PostgREST (a OpenAPI lista só o que o
      // papel anon pode usar): prova, no projeto real, que o hardening da
      // superfície (docs/supabase-financial-pilot-surface-hardening.sql) valeu.
      const anonSpec = await rest('', anon);
      if (anonSpec.ok && anonSpec.data && typeof anonSpec.data === 'object') {
        const anonRpcs = Object.keys(anonSpec.data.paths || {}).filter((path) => path.startsWith('/rpc/')).map((path) => path.slice(5))
          .filter((rpc) => !ANON_RPC_ALLOWLIST.includes(rpc));
        const anonRelations = Object.keys(anonSpec.data.definitions || {}).filter((name) => /^(fin_|v_)/.test(name) || name === 'artwork_events');
        add('DATABASE', 'RPCs executáveis pela chave pública', anonRpcs.length ? 'UNSAFE' : 'OK', anonRpcs.length
          ? `anon executa: ${anonRpcs.slice(0, 8).join(', ')}${anonRpcs.length > 8 ? ` (+${anonRpcs.length - 8})` : ''}`
          : `só ${ANON_RPC_ALLOWLIST.length} funções puras`);
        add('DATABASE', 'tabelas financeiras e views legadas fora da chave pública', anonRelations.length ? 'UNSAFE' : 'OK', anonRelations.length
          ? `anon alcança: ${anonRelations.slice(0, 8).join(', ')}` : 'nenhuma fin_*, view legada ou artwork_events visível');
      } else add('DATABASE', 'RPCs executáveis pela chave pública', 'WARN', `superfície anônima não conferida (${why(anonSpec)})`);
    }

    // ---------------------------------------------------------------- STORAGE
    const bucket = await request(`${supabaseUrl}/storage/v1/bucket/${DOCUMENT_BUCKET}`, { key: service });
    if (!bucket.ok || !bucket.data?.id) {
      add('STORAGE', `${DOCUMENT_BUCKET} existe`, 'ERROR', bucket.status === 404 || bucket.status === 400 ? 'bucket ausente — a migration financeira o cria' : why(bucket));
    } else {
      add('STORAGE', `${DOCUMENT_BUCKET} existe`, 'OK', 'presente');
      add('STORAGE', 'bucket privado', bucket.data.public === false ? 'OK' : 'UNSAFE', bucket.data.public === false ? 'public=false' : 'bucket PÚBLICO: documentos acessíveis sem autorização');
      add('STORAGE', 'limite de tamanho', Number(bucket.data.file_size_limit) === DOCUMENT_MAX_BYTES ? 'OK' : 'ERROR', `${bucket.data.file_size_limit ?? 'sem limite'} bytes (esperado ${DOCUMENT_MAX_BYTES})`);
      const mimes = [...(bucket.data.allowed_mime_types || [])].sort();
      const expected = Object.keys(DOCUMENT_MIME_TYPES).sort();
      add('STORAGE', 'tipos permitidos', JSON.stringify(mimes) === JSON.stringify(expected) ? 'OK' : 'ERROR', `${mimes.length} tipos${JSON.stringify(mimes) === JSON.stringify(expected) ? '' : ` (esperado ${expected.length}: PDF, JPG, PNG, XLSX, DOCX)`}`);
    }

    // ------------------------------------------------------------------- AUTH
    const health = await request(`${supabaseUrl}/auth/v1/health`, { key: anon });
    add('AUTH', 'Supabase Auth acessível', health.ok ? 'OK' : 'ERROR', health.ok ? 'respondendo' : why(health));
    const settings = await request(`${supabaseUrl}/auth/v1/settings`, { key: anon });
    if (settings.ok && settings.data) {
      add('AUTH', 'login por e-mail', settings.data.external?.email ? 'OK' : 'ERROR', settings.data.external?.email ? 'habilitado' : 'desabilitado');
      add('AUTH', 'confirmação de e-mail', settings.data.mailer_autoconfirm ? 'UNSAFE' : 'OK', settings.data.mailer_autoconfirm
        ? 'autoconfirm ligado: qualquer um cria conta com e-mail alheio e aceita convite destinado a ele'
        : 'exigida (convite por e-mail exato depende disso)');
    } else add('AUTH', 'configuração do Auth', 'WARN', `não lida (${why(settings)})`);
    const users = [];
    let usersOk = true;
    for (let page = 1; page <= 20; page += 1) {
      const response = await request(`${supabaseUrl}/auth/v1/admin/users?page=${page}&per_page=500`, { key: service });
      if (!response.ok) { usersOk = false; break; }
      const batch = Array.isArray(response.data?.users) ? response.data.users : [];
      users.push(...batch);
      if (batch.length < 500) break;
    }
    const roleOf = (user) => String(user?.app_metadata?.arandu_role || '').toLowerCase();
    const financeOps = users.filter((user) => roleOf(user) === FINANCE_OPS_ROLE);
    // A listagem administrativa não traz os fatores MFA; a leitura por usuário traz.
    const withMfa = [];
    for (const user of financeOps.slice(0, 50)) {
      const detail = await request(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, { key: service });
      if ((detail.data?.factors || []).some((factor) => factor?.factor_type === 'totp' && factor?.status === 'verified')) withMfa.push(user);
    }
    if (!usersOk) add('AUTH', 'contas de plataforma', 'WARN', 'lista administrativa de usuários indisponível');

    // ------------------------------------------------------------------ PILOT
    const allowlist = await count('fin_pilot_allowlist');
    add('PILOT', 'allowlist', allowlist > 0 ? 'OK' : 'ERROR', allowlist == null ? 'não lida' : allowlist > 0 ? `${allowlist} entradas` : 'vazia — ninguém consegue criar organização');
    const buyers = await count('fin_organizations', 'kind=eq.BUYER');
    const providers = await count('fin_organizations', 'kind=eq.PROVIDER');
    add('PILOT', 'empresas compradoras', buyers > 0 ? 'OK' : 'WARN', buyers == null ? 'não lida' : `${buyers}`);
    add('PILOT', 'organizações provedoras', providers > 0 ? 'OK' : 'WARN', providers == null ? 'não lida' : `${providers}`);
    const approval = await count('fin_approval_policies', 'required_for_decision=eq.true');
    add('PILOT', 'política de aprovação', approval > 0 ? 'OK' : 'WARN', approval == null ? 'não lida' : approval > 0 ? `${approval} empresa(s) exigem aprovação` : 'nenhuma empresa exige aprovação antes da decisão');
    const operators = await rest('fin_platform_operators?select=user_id');
    const operatorIds = new Set(operators.ok && Array.isArray(operators.data) ? operators.data.map((row) => row.user_id) : []);
    const registeredOps = financeOps.filter((user) => operatorIds.has(user.id));
    const orphanGrants = usersOk ? [...operatorIds].filter((id) => !financeOps.some((user) => user.id === id)).length : 0;
    add('PILOT', 'operadores finance_ops', registeredOps.length ? 'OK' : 'WARN', usersOk ? `${registeredOps.length} com papel e registro${orphanGrants ? `; ${orphanGrants} registro(s) sem papel finance_ops (não abrem o console)` : ''}` : 'não conferido');

    // ------------------------------------------------------------- OPERATIONS
    const readyOps = registeredOps.filter((user) => withMfa.includes(user));
    add('OPERATIONS', 'finance_ops com MFA', readyOps.length ? 'OK' : 'WARN', usersOk ? `${readyOps.length} pronto(s) para o console` : 'não conferido');
    const legacy = users.filter((user) => roleOf(user) === 'operator').length;
    if (legacy) add('OPERATIONS', 'operador legado', 'WARN', `${legacy} conta(s) com arandu_role=operator: admin de arte, sem acesso ao console financeiro`);
    const stuck = await count('fin_document_versions', `status=eq.pending&created_at=lt.${encodeURIComponent(new Date(now().getTime() - 3600_000).toISOString())}`);
    const failed = await count('fin_document_versions', `status=eq.failed&completed_at=gt.${encodeURIComponent(new Date(now().getTime() - 86_400_000).toISOString())}`);
    add('OPERATIONS', 'envios presos (> 1 h)', stuck ? 'WARN' : 'OK', stuck == null ? 'não lido' : `${stuck}`);
    add('OPERATIONS', 'envios com falha (24 h)', failed ? 'WARN' : 'OK', failed == null ? 'não lido' : `${failed}`);
  }

  // ------------------------------------------------------------------ EMAIL
  const email = inspectEmailConfiguration(env);
  let emailEnabled = null;
  if (remote && reachable) {
    const setting = await rest('fin_settings?select=value&key=eq.email_enabled');
    emailEnabled = setting.ok ? setting.data?.[0]?.value === 'true' : null;
  }
  const dispatch = flag('ARANDU_EMAIL_DISPATCH_ENABLED');
  add('EMAIL', 'provedor', email.ready ? 'OK' : emailEnabled ? 'ERROR' : 'WARN',
    email.ready ? `${email.provider} pronto` : `não configurado (${email.provider})${emailEnabled ? ' — mas email_enabled=true: avisos ficariam presos na fila' : ' — convites entregues manualmente'}`);
  add('EMAIL', 'email_enabled', emailEnabled == null ? 'WARN' : 'OK', emailEnabled == null ? 'não lido' : String(emailEnabled));
  if (email.ready) add('EMAIL', 'despachante', dispatch ? 'OK' : (emailEnabled ? 'ERROR' : 'WARN'), dispatch ? 'ARANDU_EMAIL_DISPATCH_ENABLED ligado' : 'ARANDU_EMAIL_DISPATCH_ENABLED desligado');
  if (remote && reachable) {
    const dead = await count('transactional_email_outbox', 'status=eq.dead&template=in.(finance_notification,finance_provider_invite)');
    add('EMAIL', 'falhas definitivas na fila', dead ? 'WARN' : 'OK', dead == null ? 'não lido' : `${dead}`);
  }

  // ------------------------------------------------------------------- CRON
  const scheduled = (vercelConfig?.crons || []).some((item) => String(item.path).split('?')[0] === '/api/jobs/renewals');
  add('CRON', 'agenda de renovação', scheduled ? 'OK' : 'ERROR', scheduled ? '/api/jobs/renewals em vercel.json' : 'ausente de vercel.json');
  add('CRON', 'segredo do cron', cron.length >= 32 ? 'OK' : 'ERROR', cron.length >= 32 ? 'configurado' : 'ausente ou curto');
  if (remote && reachable) {
    const last = await rest('fin_job_runs?select=status,error_code,finished_at&job=eq.renewals&order=finished_at.desc&limit=1');
    const run = last.ok ? last.data?.[0] : null;
    if (!run) add('CRON', 'última execução', 'WARN', 'nunca executou');
    else {
      const hours = (now().getTime() - Date.parse(run.finished_at)) / 3600_000;
      add('CRON', 'última execução', run.status === 'succeeded' && hours <= 26 ? 'OK' : 'WARN',
        `${run.status}${run.error_code ? ` (${run.error_code})` : ''} há ${Math.max(0, Math.round(hours))} h`);
    }
  }

  // ------------------------------------------------------ app publicada
  if (/^https:\/\//.test(siteUrl)) {
    const probe = (path) => request(`${siteUrl}${path}`);
    const [health, products, renewals, legacyForms] = await Promise.all([probe('/api/health'), probe('/api/finance/products'), probe('/api/jobs/renewals'), probe('/api/forms')]);
    add('OPERATIONS', 'API publicada', health.ok ? 'OK' : 'ERROR', health.ok ? '/api/health respondendo' : why(health));
    add('OPERATIONS', 'API financeira', products.ok ? 'OK' : 'ERROR', products.ok ? '/api/finance/products respondendo'
      : `${why(products)}${products.data?.code ? ` ${products.data.code}` : ''}${products.data?.code === 'rate_limit_unavailable' ? ' — consume_rate_limit ausente no banco' : ''}`);
    add('OPERATIONS', 'rotas legadas de arte fechadas', legacyForms.status === 404 && legacyForms.data?.code === 'legacy_surface_closed' ? 'OK' : 'ERROR',
      legacyForms.status === 404 && legacyForms.data?.code === 'legacy_surface_closed' ? '/api/forms responde 404 no piloto'
        : `/api/forms ${why(legacyForms)} — a vertical de arte gravaria no banco do piloto (deploy sem ARANDU_ENV=pilot?)`);
    const requestId = products.headers?.get?.('x-request-id') || '';
    add('OPERATIONS', 'identificador de requisição', /^[A-Za-z0-9-]{8,80}$/.test(requestId) ? 'OK' : 'WARN',
      requestId ? 'X-Request-ID devolvido pela API financeira' : 'API financeira sem X-Request-ID — erros não rastreáveis nos logs');
    add('OPERATIONS', 'rota do cron', renewals.status === 401 && renewals.data?.code === 'cron_unauthorized' ? 'OK' : 'ERROR',
      renewals.status === 401 && renewals.data?.code === 'cron_unauthorized' ? 'chega ao código e exige segredo' : `${why(renewals)} (esperado 401 cron_unauthorized)`);
  }

  const levels = checks.map((check) => check.level);
  const result = levels.includes('UNSAFE') ? 'UNSAFE' : levels.includes('ERROR') ? 'NO-GO' : 'GO';
  const summary = Object.fromEntries(['OK', 'WARN', 'ERROR', 'UNSAFE'].map((level) => [level.toLowerCase(), levels.filter((item) => item === level).length]));
  return { tool: 'arandu-financial-pilot-doctor', generated_at: now().toISOString(), environment: declared || null, result, exit_code: EXIT[result], summary, checks };
}

export function formatDoctor(report) {
  const lines = ['ARANDU FINANCIAL PILOT DOCTOR', ''];
  for (const category of CATEGORIES) {
    const rows = report.checks.filter((check) => check.category === category);
    if (!rows.length) continue;
    lines.push(category);
    for (const row of rows) lines.push(`[${row.level}]${' '.repeat(Math.max(1, 7 - row.level.length))}${row.name}${row.detail ? ` — ${row.detail}` : ''}`);
    lines.push('');
  }
  lines.push('RESULT', `${report.result} (exit ${report.exit_code}) — ${report.summary.ok} OK, ${report.summary.warn} WARN, ${report.summary.error} ERROR, ${report.summary.unsafe} UNSAFE`);
  return lines.join('\n');
}
