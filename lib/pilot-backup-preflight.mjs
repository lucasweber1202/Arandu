import { spawnSync } from 'node:child_process';

export const PILOT_REF = 'offgpyysgdhfemjlchod';
export const RECOVERY_REFS = Object.freeze([PILOT_REF, 'igacnfjeuqhxcmfyepgj']);
export const HOSTED_DRILL_IMAGE = 'public.ecr.aws/supabase/postgres:17.6.1.166';

// Connection identity is checked before any query. Pooler tenants are identified
// by username, not by their shared hostname. Never return credentials in reports.
export function sourceConnection(value, { local = false, projectRef = PILOT_REF } = {}) {
  if (!RECOVERY_REFS.includes(projectRef)) throw new Error('Projeto de recuperação não aprovado.');
  let url;
  try { url = new URL(value); } catch { throw new Error('Conexão administrativa ausente ou inválida.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Use uma conexão PostgreSQL.');
  if (url.hash || [...url.searchParams.keys()].some(key => !['sslmode', 'connect_timeout', 'application_name'].includes(key))) {
    throw new Error('Parâmetros de conexão não reconhecidos.');
  }
  const host = url.hostname.toLowerCase();
  const user = decodeURIComponent(url.username);
  const database = decodeURIComponent(url.pathname.slice(1));
  const port = url.port || '5432';
  let mode;
  if (local && ['localhost', '127.0.0.1', '[::1]'].includes(host)) mode = 'local';
  else if (host === `db.${projectRef}.supabase.co` && user === 'postgres' && port === '5432') mode = 'direct';
  else if (/^aws-\d+-sa-east-1\.pooler\.supabase\.com$/.test(host) && user === `postgres.${projectRef}` && port === '5432') mode = 'session_pooler';
  else throw new Error('Origem deve corresponder ao projeto aprovado, via direct ou session pooler; transaction pooler e outros projetos são recusados.');
  if (!database || database.includes('/') || (mode !== 'local' && database !== 'postgres')) throw new Error('Banco de origem inválido.');
  const sslmode = url.searchParams.get('sslmode') || (mode === 'local' ? 'prefer' : 'require');
  if (mode !== 'local' && !['require', 'verify-ca', 'verify-full'].includes(sslmode)) throw new Error('TLS obrigatório na origem hospedada.');
  return {
    mode, projectRef: mode === 'local' ? null : projectRef,
    // Private execution data: deliberately excluded from every report.
    env: { PGHOST: host.replace(/^\[|\]$/g, ''), PGPORT: port, PGDATABASE: database, PGUSER: user,
      PGPASSWORD: decodeURIComponent(url.password), PGSSLMODE: sslmode, PGCONNECT_TIMEOUT: '10',
      PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=10000' }
  };
}

export function majorVersion(value) {
  const match = String(value).match(/(?:PostgreSQL\)?\s+)?(\d+)\./);
  return match ? Number(match[1]) : null;
}

export function assessBackup({ sourceMajor, dumpMajor, restoreMajor, image, storageObjects, mfaFactors, authPolicies }) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail });
  add('pg_dump_major', sourceMajor > 0 && dumpMajor === sourceMajor, { sourceMajor, dumpMajor });
  add('pg_restore_major', restoreMajor === dumpMajor && restoreMajor > 0, { dumpMajor, restoreMajor });
  const imageMajor = Number(String(image).match(/:(\d+)\./)?.[1]) || null;
  add('target_image_format', /^public\.ecr\.aws\/supabase\/postgres:\d+\.\d+\.\d+\.\d+$/.test(String(image)), 'Imagem Supabase versionada obrigatória.');
  add('target_image_major', imageMajor === sourceMajor && sourceMajor > 0, { sourceMajor, imageMajor });
  // This drill does not export Storage binaries, MFA secrets or Auth policies.
  // A database-only restore must not masquerade as recovery of these objects.
  add('storage_objects_empty', storageObjects === 0, { count: storageObjects });
  add('mfa_factors_empty', mfaFactors === 0, { count: mfaFactors });
  add('auth_policies_empty', authPolicies === 0, { count: authPolicies });
  return checks;
}

export function runBackupPreflight({ env = process.env, run = spawnSync } = {}) {
  const checks = [];
  const report = { classification: 'pilot_backup_preflight', generatedAt: new Date().toISOString(),
    result: 'blocked', backup: 'NOT RUN', restore: 'NOT RUN', checks };
  const add = (name, ok, detail) => checks.push({ name, ok, detail });
  let connection;
  try { connection = sourceConnection(env.PILOT_SOURCE_DATABASE_URL, { local: env.PILOT_DRILL_SOURCE_KIND === 'pilot-local' }); }
  catch (error) { add('source_identity', false, error.message); return report; }
  report.source = connection.mode === 'local' ? 'pilot-local' : 'pilot';
  report.projectRef = connection.projectRef;
  report.connectionMode = connection.mode;
  add('source_identity', true, 'Origem conhecida; credenciais omitidas.');
  const versions = {};
  for (const binary of ['psql', 'pg_dump', 'pg_restore']) {
    const result = run(binary, ['--version'], { encoding: 'utf8', timeout: 15000 });
    versions[binary] = result.status === 0 ? majorVersion(result.stdout) : null;
    add(binary, versions[binary] !== null, versions[binary] ? { major: versions[binary] } : 'Executável indisponível.');
  }
  const docker = run('docker', ['info', '--format', '{{.ServerVersion}}'], { encoding: 'utf8', timeout: 15000 });
  add('docker_daemon', docker.status === 0, docker.status === 0 ? 'Disponível.' : 'Docker com daemon é necessário para o destino Supabase descartável.');
  if (checks.some(check => !check.ok)) return report;
  const sql = `select json_build_object('server_major',current_setting('server_version_num')::int/10000,
    'schema_version',(select value from public.fin_settings where key='schema_version'),
    'storage_objects',(select count(*) from storage.objects),
    'mfa_factors',(select count(*) from auth.mfa_factors),
    'auth_policies',(select count(*) from pg_policies where schemaname='auth'))::text`;
  const query = run('psql', ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', sql],
    { encoding: 'utf8', timeout: 20000, env: { ...env, ...connection.env } });
  // Never echo database stderr: libpq and SQL errors may contain sensitive data.
  if (query.status !== 0) { add('source_read', false, 'Conexão/probe falhou; nenhum dump foi gerado.'); return report; }
  let state;
  try { state = JSON.parse(query.stdout.trim()); } catch { add('source_read', false, 'Probe de origem inválido.'); return report; }
  if (!Number.isInteger(state.server_major) || ![state.storage_objects, state.mfa_factors, state.auth_policies].every(value => Number.isSafeInteger(value) && value >= 0)) {
    add('source_read', false, 'Contagens/versão da origem inválidas.'); return report;
  }
  add('source_read', true, 'Probe somente leitura.');
  if (typeof state.schema_version !== 'string' || !['financial-surface-hardening-1', 'financial-approval-handoff-1', 'financial-passport-1', 'financial-multi-entity-1', 'financial-contracts-v2-1', 'financial-relationships-portfolio-1', 'financial-passport-entities-1', 'financial-graph-1', 'financial-policy-engine-1', 'financial-public-api-1', 'financial-sso-1', 'financial-operational-resilience-1', 'financial-data-governance-1', 'financial-legacy-art-decommission-1','financial-p0-closure-1','financial-value-realization-1','financial-fee-intelligence-1','financial-opportunity-engine-1','financial-document-intelligence-1','financial-provider-qualification-1','financial-implementation-1','financial-covenants-1','financial-provider-performance-1','financial-spend-intelligence-1','financial-opportunity-discriminator-1'].includes(state.schema_version)) {
    add('schema_version', false, 'Marcador financeiro ausente ou inválido.'); return report;
  }
  report.schemaVersion = state.schema_version;
  add('schema_version', true, { marker: state.schema_version });
  const image = env.PILOT_DRILL_DB_IMAGE || env.PILOT_LOCAL_DB_IMAGE || (report.source === 'pilot' ? HOSTED_DRILL_IMAGE : 'public.ecr.aws/supabase/postgres:15.14.1.064');
  if (!/^public\.ecr\.aws\/supabase\/postgres:\d+\.\d+\.\d+\.\d+$/.test(image)) {
    add('target_image_format', false, 'Imagem Supabase versionada obrigatória; valor omitido.'); return report;
  }
  report.image = image;
  checks.push(...assessBackup({ sourceMajor: state.server_major, dumpMajor: versions.pg_dump, restoreMajor: versions.pg_restore,
    image: report.image, storageObjects: state.storage_objects, mfaFactors: state.mfa_factors, authPolicies: state.auth_policies }));
  if (checks.every(check => check.ok)) report.result = 'ready';
  return report;
}
