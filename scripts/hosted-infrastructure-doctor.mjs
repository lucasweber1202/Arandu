#!/usr/bin/env node
// Read-only composition of existing gates. This report is never authorization
// to export, restore, migrate, seed, change assignments or release.
import fs from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inspectStaticStage0 } from './stage0-static-preflight.mjs';
import { assessConversion } from '../lib/consolidation-readiness.mjs';
import { assessReleaseCandidate } from '../lib/finance/pilot-release.mjs';
import { assessPublicHealth } from '../lib/live-release-health.mjs';
import { diagnoseRecovery } from '../lib/recovery-doctor.mjs';
import { currentCleanInstallDigest } from './current-migration-bundle.mjs';
import { CONSOLIDATION_TARGETS } from '../lib/deployment-topology.mjs';
import { readBoundedResponse } from '../lib/bounded-response.mjs';
import { publicHostname } from '../lib/public-site-url.mjs';
import { spawnSync } from 'node:child_process';
import { supabaseKeyRole } from '../lib/supabase-key-role.mjs';
import { demoPersonaSecretReady } from '../lib/finance/demo-entry-readiness.mjs';

const SHA = /^[a-f0-9]{40}$/;
const recoveryActions = {
  strategy: ['configuration', 'recovery_operator', 'Selecionar private-store ou s3 no procedimento de preservação.'],
  source: ['identity', 'recovery_operator', 'Confirmar o ref de origem antes do preflight.'],
  database: ['access', 'database_owner', 'Configurar conexão administrativa autorizada no executor seguro; nunca no chat.'],
  recipient: ['preservation', 'recovery_operator', 'Preparar destinatário age e manter identidade privada separada.'],
  destination: ['preservation', 'storage_owner', 'Preparar destino privado durável, retenção e custódia antes do export.'],
  storage: ['preservation', 'recovery_operator', 'Inventariar objetos e preparar export separado dos binários quando aplicável.'],
  postgres: ['tooling', 'engineer', 'Instalar cliente PostgreSQL 17 compatível no executor de recovery.'],
  age: ['tooling', 'engineer', 'Disponibilizar age verificado no executor de recovery.'],
  confirmation: ['authorization', 'database_owner', 'Obter autorização específica do export e do destino.']
};
const conversionActions = {
  source_identity: ['identity', 'database_owner', 'Reconciliar ref, hostname e destino com a topologia normativa.'],
  exact_inventory: ['inventory', 'engineer', 'Renovar inventário exato sanitizado e digest; validade máxima de 24 horas.'],
  no_customer_or_personal_data: ['classification', 'data_owner', 'Classificar dados, retenção e holds; preservar até decisão específica.'],
  verified_export: ['preservation', 'recovery_operator', 'Executar export autorizado da origem classificada para destino durável; registrar hashes.'],
  real_restore: ['recovery', 'recovery_operator', 'Restaurar o mesmo export em alvo isolado e reconciliar dados, permissões e componentes gerenciados.'],
  restore_schema_reconciliation: ['recovery', 'recovery_operator', 'Conferir fingerprint compatível do manifest e recibo do mesmo export: schema_reconciliation MATCH e hashes de origem/destino iguais ao snapshot; não preencher prova antiga por inferência.'],
  controlled_reconstruction: ['cutover', 'database_owner', 'Revisar reconstrução e rollback; obter autorização específica antes de executar.'],
  current_migration_bundle: ['schema', 'engineer', 'Regenerar o bundle canônico da árvore atual e revisar seu hash no plano.']
};

export function diagnoseHostedInfrastructure({ environment, commit, inventory, candidate, recovery,
  healthObservation, vercelObservation, financeConfiguration, currentBundleSha256, inputInvalid = false, now = new Date() } = {}) {
  const validEnvironment = Object.hasOwn(CONSOLIDATION_TARGETS, environment || '');
  const target = validEnvironment ? CONSOLIDATION_TARGETS[environment] : null;
  const checks = [];
  const add = (id, category, result, next_action, owner, authorization_required = false, automatic_safe = false, evidence = {}) => checks.push({
    id, environment: validEnvironment ? environment : null, category,
    severity: result === 'PASS' ? 'info' : 'error', result, evidence,
    dependency: category, next_action: result === 'PASS' ? null : next_action,
    owner, authorization_required, automatic_safe
  });
  const fresh = (value, age = 86400000) => {
    const time = Date.parse(value);
    return Number.isFinite(time) && time <= now.getTime() && now.getTime() - time <= age;
  };
  const identity = observation => observation && target && observation.environment === environment
    && observation.project === target.vercelProject && observation.commit === commit && fresh(observation.observed_at);
  add('assessment_context', 'identity', validEnvironment && SHA.test(commit || '') && Number.isFinite(now.getTime()) ? 'PASS' : 'FAIL',
    'Usar ambiente demo|production e SHA completo da main observada.', 'engineer', false, true);
  add('input_documents', 'evidence', inputInvalid ? 'FAIL' : 'PASS',
    'Usar argumentos únicos conhecidos e documentos JSON legíveis de até 128000 bytes; caminhos e conteúdo são omitidos.', 'engineer', false, true);

  const topology = inspectStaticStage0().environments.find(item => item.environment === environment);
  add('active_database_assignment', 'topology', topology?.static_status === 'ASSIGNMENT_REGISTERED' ? 'PASS' : 'BLOCKED',
    'Concluir classificação, preservação, restore e PR de cutover antes de mudar a atribuição ativa.', 'database_owner', true, false,
    { source: 'repository-topology', reason_codes: topology?.reason_codes || ['INVALID_ENVIRONMENT'] });

  const conversion = assessConversion(inventory, { environment, now, currentBundleSha256 });
  for (const check of conversion.checks) {
    const [category, owner, action] = conversionActions[check.name];
    const automatic = ['source_identity', 'exact_inventory', 'current_migration_bundle'].includes(check.name);
    add(check.name, category, check.ok ? 'PASS' : 'BLOCKED', action, owner, !automatic, automatic,
      { source: 'consolidation:check', observed: Boolean(inventory), current_bundle_compared: check.name === 'current_migration_bundle' });
  }

  const requiredNames = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'CRON_SECRET', 'ARANDU_SITE_URL', ...(environment === 'demo' ? ['ARANDU_DEMO_PASSWORD'] : [])];
  add('financial_environment', 'configuration', !financeConfiguration ? 'NOT_RUN' : financeConfiguration.exit_code === 0 ? 'PASS' : 'BLOCKED',
    'Configurar somente no ambiente correto os itens ausentes e executar finance:env:check; não alterar a topologia para passar.',
    'deployment_operator', true, false, { source: 'finance:env:check', configuration_scope: 'local-executor-only', structural_only: true,
      required_presence: Object.fromEntries(requiredNames.map(name => [name, financeConfiguration?.required_presence?.[name] === true])),
      key_roles_match: financeConfiguration?.key_roles_match === true,
      demo_password_structurally_ready: environment === 'demo' ? financeConfiguration?.demo_password_structurally_ready === true : null });

  for (const [id, [category, owner, action]] of Object.entries(recoveryActions)) {
    const check = recovery?.checks?.find(item => item.id === id)
      || (id === 'strategy' && ['private-store', 's3'].includes(recovery?.strategy) ? { status: 'VALID' } : null);
    if (id === 'confirmation' && !check) continue;
    const result = !check ? 'NOT_RUN' : check.status === 'VALID' ? 'PASS' : check.status === 'NOT CHECKED' ? 'NOT_RUN' : 'BLOCKED';
    add(`recovery_${id}`, category, result, action, owner, !['tooling', 'identity', 'configuration'].includes(category), category === 'tooling',
      { source: 'recovery:doctor', configuration_scope: 'local-executor-only', configuration_only: true });
  }

  const vercelBound = identity(vercelObservation);
  const vercelStatus = vercelObservation?.http_status;
  add('vercel_inspection', 'access', vercelBound && [401, 403].includes(vercelStatus) ? 'ACCESS_BLOCKED' : 'NOT_PROVEN',
    'Habilitar leitura no team lucas-projects467 para os três projetos; depois ler configuração, escopos e primeira falha de logs.',
    'vercel_team_owner', true, false, { source: 'vercel-inspection', identity_bound: Boolean(vercelBound), ...(vercelBound && [401, 403].includes(vercelStatus) ? { http_status: vercelStatus } : {}) });

  const healthBound = identity(healthObservation) && fresh(healthObservation?.observed_at, 300000);
  const publicHealth = healthBound ? assessPublicHealth(healthObservation.payload, { environment, commit, readiness: true }) : null;
  const httpStatus = healthObservation?.http_status;
  const healthResult = !healthObservation ? 'NOT_RUN' : !healthBound ? 'NOT_PROVEN'
    : [401, 403].includes(httpStatus) ? 'ACCESS_BLOCKED' : httpStatus === 0 ? 'NOT_PROVEN'
      : httpStatus === 200 && publicHealth.outcome === 'PASS' ? 'PASS' : 'FAIL';
  const observedRelease = healthObservation?.payload?.release;
  add('published_readiness', 'backend', healthResult,
    'Verificar readiness do app publicado no SHA esperado, ambiente e datasource Supabase; não aceitar liveness ou fixtures.',
    'engineer', false, true, { source: 'public-readiness', identity_bound: Boolean(healthBound), ...(healthBound ? {
      http_status: Number.isInteger(httpStatus) && httpStatus >= 0 && httpStatus <= 599 ? httpStatus : null, code: publicHealth.code,
      observed_release: { commit: SHA.test(observedRelease?.commit || '') ? observedRelease.commit : null,
        branch_main: observedRelease?.branch === 'main',
        environment: ['demo', 'pilot', 'production'].includes(observedRelease?.environment) ? observedRelease.environment : null,
        datasource: ['supabase', 'synthetic-fixtures'].includes(observedRelease?.datasource) ? observedRelease.datasource : null }
    } : {}) });

  const release = assessReleaseCandidate(candidate, { commit, now });
  add('hosted_release_candidate', 'release', environment === 'production' ? 'NOT_PROVEN' : !candidate ? 'NOT_RUN' : release.result === 'RELEASE CANDIDATE GO' ? 'PASS' : 'BLOCKED',
    'Executar doctor, canário e jornadas reais e reunir a evidência v3 do mesmo SHA; avaliar release:candidate:check.',
    'release_owner', true, false, { source: environment === 'production' ? 'release:check-required-separately' : 'release:candidate:check', blocked_checks: release.checks.filter(check => !check.ok).map(check => check.name) });
  return {
    tool: 'arandu-hosted-infrastructure-doctor', format_version: 1,
    generated_at: Number.isFinite(now.getTime()) ? now.toISOString() : null,
    environment: validEnvironment ? environment : null, project: target?.vercelProject || null,
    commit: SHA.test(commit || '') ? commit : null, result: checks.every(check => check.result === 'PASS') ? 'PASS' : 'BLOCKED',
    executes_mutation: false, release_ready: false, cutover_authorized: false,
    evidence_origin_authenticated: false,
    disclaimer: 'Read-only composition of existing contracts. Imported evidence is assessed, not authenticated. No release or cutover authorization is issued.',
    checks
  };
}

export async function observePublishedReadiness(site, { environment, commit, fetchImpl = fetch, now = new Date() } = {}) {
  const context = { environment, project: CONSOLIDATION_TARGETS[environment]?.vercelProject, commit, observed_at: now.toISOString() };
  try {
    const url = new URL(site);
    if (url.protocol !== 'https:' || url.origin !== site || !publicHostname(url.hostname)) throw Error();
    const response = await fetchImpl(`${url.origin}/api/health?probe=ready`, {
      method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(5000), headers: { Accept: 'application/json' }
    });
    let payload = null;
    try { payload = JSON.parse((await readBoundedResponse(response, 65536)).toString('utf8')); } catch {}
    return { ...context, http_status: response.status, payload };
  } catch { return { ...context, http_status: 0, payload: null }; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const options = {};
  let invalid = false;
  for (const arg of process.argv.slice(2)) {
    const match = /^--(environment|commit|evidence|candidate|vercel-observation)=(.+)$/.exec(arg);
    if (arg === '--live' && !options.live) options.live = true;
    else if (match && !Object.hasOwn(options, match[1])) options[match[1]] = match[2];
    else invalid = true;
  }
  const read = file => {
    if (!file) return undefined;
    try { if (fs.statSync(file).size > 128000) throw Error(); return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { invalid = true; return undefined; }
  };
  const inventory = read(options.evidence), candidate = read(options.candidate), vercelObservation = read(options['vercel-observation']);
  const contextValid = !invalid && Object.hasOwn(CONSOLIDATION_TARGETS, options.environment || '') && SHA.test(options.commit || '');
  const recovery = contextValid ? diagnoseRecovery({ env: { ...process.env, ARANDU_RECOVERY_PROJECT_REF: CONSOLIDATION_TARGETS[options.environment].sourceRef }, requireConfirmation: true }) : null;
  let financeConfiguration;
  if (contextValid) {
    const check = spawnSync(process.execPath, ['scripts/check-finance-env.mjs'], { env: { ...process.env, ARANDU_ENV: options.environment }, encoding: 'utf8', timeout: 15000, maxBuffer: 128000 });
    const requiredNames = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'CRON_SECRET', 'ARANDU_SITE_URL', 'ARANDU_DEMO_PASSWORD'];
    financeConfiguration = { exit_code: check.error ? null : check.status,
      required_presence: Object.fromEntries(requiredNames.map(name => [name, Boolean(String(process.env[name] || '').trim())])),
      key_roles_match: supabaseKeyRole(process.env.SUPABASE_ANON_KEY) === 'anon' && supabaseKeyRole(process.env.SUPABASE_SERVICE_ROLE_KEY) === 'service_role',
      demo_password_structurally_ready: demoPersonaSecretReady(process.env.ARANDU_DEMO_PASSWORD) };
  }
  const healthObservation = options.live && contextValid ? await observePublishedReadiness(process.env.ARANDU_SITE_URL, { environment: options.environment, commit: options.commit }) : null;
  const report = diagnoseHostedInfrastructure({ environment: Object.hasOwn(CONSOLIDATION_TARGETS, options.environment || '') ? options.environment : null, commit: SHA.test(options.commit || '') ? options.commit : null,
    inventory, candidate, recovery, financeConfiguration, healthObservation, vercelObservation, inputInvalid: invalid, currentBundleSha256: contextValid ? currentCleanInstallDigest() : null });
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.result === 'PASS' ? 0 : 1;
}
