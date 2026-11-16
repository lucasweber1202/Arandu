// Preflight SOMENTE LEITURA da Demo canônica hospedada.
//
// Responde GO / NO-GO para um provisionamento futuro (seed + workspaces), com
// códigos estáveis. Garantias:
//  - toda chamada de rede passa por readOnlyFetch: apenas GET/HEAD, qualquer
//    outro método lança antes de sair do processo (provado em teste);
//  - nenhum valor de segredo, token ou URL com credencial vai para o relatório;
//  - GO não dispara nada: a escrita continua sendo outra etapa, autorizada à parte.

import { assertDemoTarget, assertDemoDatabase } from '../finance/demo-guard.mjs';
import { ACTIVE_SUPABASE_ASSIGNMENTS } from '../deployment-topology.mjs';
import { supabaseApiKeyHeaders } from '../supabase-api-headers.mjs';
import { classifySchema, relationsFromOpenApi, migrationRelations, loadManifest } from './schema-reconcile.mjs';

export const REQUIRED_SECRETS = Object.freeze(['SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'ARANDU_DEMO_PASSWORD', 'CRON_SECRET']);
// Tabelas que o seed e os workspaces precisam ler/escrever (subconjunto do manifesto).
export const SEED_RELATIONS = Object.freeze(['fin_settings', 'fin_organizations', 'fin_members', 'fin_rfqs', 'fin_contracts', 'fin_decision_scenarios', 'fin_renewal_operations', 'fin_events']);

export const CODES = Object.freeze({
  GO: 'Pronto para provisionamento autorizado (nenhuma escrita foi feita).',
  SECRET_MISSING: 'Segredo obrigatório ausente no Environment.',
  SECRET_WEAK: 'Segredo presente mas fora do formato mínimo.',
  SECRET_INVALID: 'Segredo presente mas recusado pelo serviço (401).',
  TARGET_INVALID: 'Alvo Supabase recusado pelo guard da Demo.',
  TARGET_PRODUCTION: 'O alvo pertence a produção ou ao projeto legado.',
  APP_UNAVAILABLE: 'Aplicação Demo indisponível.',
  APP_NOT_CANONICAL: 'A aplicação não é a Demo canônica (ARANDU_ENV=demo com Supabase).',
  APP_COMMIT_MISMATCH: 'A aplicação publicada não é o commit esperado.',
  AUTH_UNAVAILABLE: 'Supabase Auth indisponível.',
  STORAGE_UNAVAILABLE: 'Bucket privado de documentos ausente ou público.',
  SCHEMA_PENDING: 'Migrations pendentes (atualização incremental possível).',
  SCHEMA_PARTIAL: 'Migration parcialmente aplicada: investigar antes de qualquer escrita.',
  SCHEMA_DIVERGENT: 'Estrutura divergente do manifesto: não aplicar nada sem análise.',
  SCHEMA_INDETERMINATE: 'Não foi possível ler a estrutura do banco.',
  DATA_MISSING: 'Dados da Demo ausentes ou sem marcador (status pós-provisionamento).',
  WORKSPACES_MISSING: 'Menos de dois workspaces prontos.',
  MARKER_MISMATCH: 'Marcador de ambiente do banco incompatível com Demo.',
  DATA_PRESENT: 'O banco já tem organizações/marcador: primeiro seed não pode sobrescrever.',
  PERMISSION: 'Permissão insuficiente para a leitura.',
  QUOTA: 'Limite de requisições/quota atingido.',
  NETWORK: 'Falha de rede ou tempo esgotado.',
  UNEXPECTED: 'Resposta inesperada.'
});

/** fetch restrito a GET/HEAD. Qualquer outro método falha antes da rede. Exportada para teste. */
export function readOnlyFetch(fetchImpl, log = []) {
  return async (url, options = {}) => {
    const method = String(options.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') throw Object.assign(new Error(`preflight somente leitura: método ${method} proibido`), { code: 'WRITE_ATTEMPT' });
    if (options.body !== undefined) throw Object.assign(new Error('preflight somente leitura: corpo proibido'), { code: 'WRITE_ATTEMPT' });
    const parsed = new URL(url);
    log.push({ method, host: parsed.host, path: parsed.pathname });
    return fetchImpl(url, { ...options, method, signal: options.signal || AbortSignal.timeout(30000) });
  };
}

/** HTTP → código estável. Exportada para teste. */
export function httpCode(status, fallback = 'UNEXPECTED') {
  if (status === 401) return 'SECRET_INVALID';
  if (status === 403) return 'PERMISSION';
  if (status === 429 || status === 402) return 'QUOTA';
  return fallback;
}

/**
 * Executa o preflight. `env` traz segredos/URLs; `expectedSha` é o commit que
 * se pretende provisionar. Devolve { verdict, checks[], requests[], schema }.
 * Nunca lança por falha de verificação: cada problema vira um check.
 */
// phase 'before-seed': GO exige banco vazio (primeiro provisionamento).
// phase 'status': leitura de readiness depois do provisionamento — exige dados
// marcados como Demo e workspaces prontos; continua só com GET.
export async function runHostedPreflight({ env = process.env, expectedSha = null, fetchImpl = globalThis.fetch, plan = null, phase = 'before-seed' } = {}) {
  if (!['before-seed', 'status'].includes(phase)) throw new Error(`fase desconhecida: ${phase}`);
  const layers = { app_compiled: 'unknown', api: 'unknown', canonical_runtime: 'unknown', auth: 'unknown', schema: 'unknown', demo_data: 'unknown', workspaces: 'unknown', journeys: 'not_verified_by_preflight' };
  const requests = [];
  const get = readOnlyFetch(fetchImpl, requests);
  const checks = [];
  let schema = null;
  const add = (id, code, detail = null) => { checks.push({ id, ok: code === 'GO' || code === 'OK', code, detail }); return code === 'OK'; };
  const call = async (id, url, options, onResponse) => {
    try {
      const response = await get(url, options);
      return await onResponse(response);
    } catch (error) {
      if (error?.code === 'WRITE_ATTEMPT') throw error;
      add(id, 'NETWORK', error?.name === 'TimeoutError' ? 'tempo esgotado' : 'falha de conexão');
      return null;
    }
  };

  // 1. Segredos: só nomes e formato mínimo, nunca valores.
  const missing = REQUIRED_SECRETS.filter((name) => !String(env[name] || '').trim());
  if (missing.length) add('secrets', 'SECRET_MISSING', missing.join(', '));
  else if (String(env.CRON_SECRET).length < 32 || String(env.ARANDU_DEMO_PASSWORD).length < 12) add('secrets', 'SECRET_WEAK', 'CRON_SECRET >= 32 e ARANDU_DEMO_PASSWORD >= 12 caracteres');
  else add('secrets', 'OK');

  // 2. Alvo: guard canônico + recusa explícita de produção/legado.
  let cfg = null;
  try { cfg = assertDemoTarget(env); add('target', 'OK', cfg.target.ref); }
  catch (error) { add('target', 'TARGET_INVALID', String(error?.message || '').slice(0, 200)); }
  const ref = cfg?.target?.ref || null;
  const forbidden = [...(ACTIVE_SUPABASE_ASSIGNMENTS.production || []), ...(ACTIVE_SUPABASE_ASSIGNMENTS.legacy || [])];
  if (cfg?.target?.kind === 'local') add('target-separation', 'OK', 'Supabase local descartável');
  else if (ref && forbidden.includes(ref)) add('target-separation', 'TARGET_PRODUCTION', ref);
  else if (ref && !(ACTIVE_SUPABASE_ASSIGNMENTS.demo || []).includes(ref)) add('target-separation', 'TARGET_INVALID', 'ref fora da atribuição Demo');
  else if (ref) add('target-separation', 'OK');
  if (!cfg || missing.some((name) => name.startsWith('SUPABASE_'))) return finish();

  // 3. Aplicação: Demo canônica, commit esperado.
  await call('app', `${cfg.appUrl}/api/health`, {}, async (response) => {
    layers.app_compiled = response.status === 404 ? 'missing' : 'present';
    if (response.status !== 200) { layers.api = 'down'; return add('app', 'APP_UNAVAILABLE', `HTTP ${response.status}`); }
    const health = await response.json().catch(() => null);
    layers.api = health?.status === 'alive' ? 'alive' : 'unexpected';
    const release = health?.release || {};
    layers.canonical_runtime = release.environment === 'demo' && release.datasource === 'supabase' ? 'demo+supabase' : `${release.environment ?? 'sem ARANDU_ENV'}+${release.datasource ?? '?'}`;
    if (release.environment !== 'demo' || release.datasource !== 'supabase') return add('app', 'APP_NOT_CANONICAL', `environment=${release.environment ?? 'ausente'} datasource=${release.datasource ?? 'ausente'}`);
    if (expectedSha && release.commit !== expectedSha) return add('app', 'APP_COMMIT_MISMATCH', `publicado=${String(release.commit || 'ausente').slice(0, 12)} esperado=${expectedSha.slice(0, 12)}`);
    return add('app', 'OK', String(release.commit || '').slice(0, 12));
  });

  const service = supabaseApiKeyHeaders(cfg.serviceKey);
  // 4. Auth (chave pública).
  await call('auth', `${cfg.supabaseUrl}/auth/v1/health`, { headers: supabaseApiKeyHeaders(env.SUPABASE_ANON_KEY) }, (response) => {
    layers.auth = response.ok ? 'up' : 'down';
    return add('auth', response.ok ? 'OK' : httpCode(response.status, 'AUTH_UNAVAILABLE'), response.ok ? null : `HTTP ${response.status}`);
  });
  // 5. Storage privado.
  await call('storage', `${cfg.supabaseUrl}/storage/v1/bucket/fin-documents`, { headers: service }, async (response) => {
    if (!response.ok) return add('storage', response.status === 404 || response.status === 400 ? 'STORAGE_UNAVAILABLE' : httpCode(response.status, 'STORAGE_UNAVAILABLE'), `HTTP ${response.status}`);
    const bucket = await response.json().catch(() => null);
    return add('storage', bucket?.public === false ? 'OK' : 'STORAGE_UNAVAILABLE', bucket?.public === false ? null : 'bucket público ou ilegível');
  });
  // 6. Schema: OpenAPI do PostgREST (GET) contra o manifesto.
  await call('schema', `${cfg.supabaseUrl}/rest/v1/`, { headers: { ...service, Accept: 'application/openapi+json' } }, async (response) => {
    if (!response.ok) return add('schema', httpCode(response.status, 'SCHEMA_INDETERMINATE'), `HTTP ${response.status}`);
    const relations = relationsFromOpenApi(await response.json().catch(() => null));
    let schemaVersion = null;
    if (relations?.includes('fin_settings')) {
      const version = await get(`${cfg.supabaseUrl}/rest/v1/fin_settings?select=value&key=eq.schema_version`, { headers: service }).catch(() => null);
      if (version?.ok) schemaVersion = (await version.json().catch(() => []))?.[0]?.value ?? null;
    }
    const manifestPlan = plan || migrationRelations(loadManifest());
    // O OpenAPI só lista o que o papel consultado pode ler; o Arandu revoga o
    // service_role de algumas views (ex.: fin_renewal_operations). Para cada
    // relação esperada que não apareceu, um GET limit=0 decide: 42501 (sem
    // privilégio) prova que existe; 42P01/PGRST205 prova que não existe.
    let inventory = relations;
    if (relations) {
      const seen = new Set(relations);
      const absent = [...new Set(manifestPlan.flatMap((row) => row.relations))].filter((name) => !seen.has(name));
      inventory = [...relations];
      for (const name of absent) {
        const probe = await get(`${cfg.supabaseUrl}/rest/v1/${name}?select=*&limit=0`, { headers: service }).catch(() => null);
        if (!probe) { inventory = null; break; }
        const body = await probe.json().catch(() => ({}));
        if (probe.ok || body?.code === '42501') inventory.push(name);
        else if (!(probe.status === 404 && ['42P01', 'PGRST205'].includes(body?.code))) { inventory = null; break; }
      }
    }
    schema = classifySchema(manifestPlan, inventory, { schemaVersion });
    schema.schemaVersion = schemaVersion;
    layers.schema = schema.state;
    const code = { compatible: 'OK', incremental: 'SCHEMA_PENDING', partial: 'SCHEMA_PARTIAL', divergent: 'SCHEMA_DIVERGENT' }[schema.state] || 'SCHEMA_INDETERMINATE';
    return add('schema', code, schema.state === 'incremental' ? `${schema.pending.length} migration(s) pendente(s)` : schema.reason || null);
  });
  // 7. Dados: marcador e organizações (só quando as tabelas existem).
  if (schema && ['compatible', 'incremental'].includes(schema.state) && !schema.missing.includes('fin_settings') && !schema.missing.includes('fin_organizations')) {
    let marker;
    await call('marker', `${cfg.supabaseUrl}/rest/v1/fin_settings?select=value&key=eq.deployment_environment`, { headers: service }, async (response) => {
      if (!response.ok) return add('marker', httpCode(response.status), `HTTP ${response.status}`);
      marker = (await response.json())?.[0]?.value ?? null;
      return add('marker', marker === null || marker === 'demo' ? 'OK' : 'MARKER_MISMATCH', marker === null ? 'sem marcador' : String(marker).slice(0, 40));
    });
    await call('data', `${cfg.supabaseUrl}/rest/v1/fin_organizations?select=id&limit=1`, { headers: service }, async (response) => {
      if (!response.ok) return add('data', httpCode(response.status), `HTTP ${response.status}`);
      const organizations = (await response.json()).length;
      try { assertDemoDatabase({ marker: marker ?? null, organizations }); }
      catch { layers.demo_data = 'foreign'; return add('data', 'MARKER_MISMATCH', 'guard recusou o banco'); }
      layers.demo_data = marker === 'demo' && organizations ? 'seeded' : organizations ? 'unmarked' : 'empty';
      if (phase === 'status') return add('data', layers.demo_data === 'seeded' ? 'OK' : 'DATA_MISSING', layers.demo_data);
      return add('data', marker === 'demo' || organizations ? 'DATA_PRESENT' : 'OK', organizations ? 'há organizações' : null);
    });
    if (!schema.missing.includes('fin_demo_workspaces')) {
      await call('workspaces', `${cfg.supabaseUrl}/rest/v1/fin_demo_workspaces?select=status&status=eq.ready&limit=50`, { headers: service }, async (response) => {
        if (!response.ok) return add('workspaces', httpCode(response.status), `HTTP ${response.status}`);
        const ready = (await response.json()).length;
        layers.workspaces = `${ready} pronto(s)`;
        return phase === 'status' ? add('workspaces', ready >= 2 ? 'OK' : 'WORKSPACES_MISSING', `${ready} pronto(s), mínimo 2`) : true;
      });
    }
  }
  return finish();

  function finish() {
    const failing = checks.filter((check) => !check.ok);
    return { phase, layers, verdict: failing.length ? (phase === 'status' ? 'NOT_READY' : 'NO-GO') : (phase === 'status' ? 'READY' : 'GO'), codes: [...new Set(failing.map((check) => check.code))], checks,
      requests, schema: schema && { schema_version: schema.schemaVersion ?? null, unverifiable: schema.unverifiable || [], state: schema.state, reason: schema.reason || null, pending: schema.pending, missing: schema.missing, unexpected: schema.unexpected, partial: schema.partial } };
  }
}
