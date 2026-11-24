#!/usr/bin/env node
// Arandu recovery orchestrator (docs/ops/RECOVERY_ORCHESTRATOR.md).
//
//   node scripts/recovery/orchestrate.mjs check            requisitos, sem credencial e sem rede
//   node scripts/recovery/orchestrate.mjs run              procedimento completo, com pausas de autorização
//   node scripts/recovery/orchestrate.mjs run --until=backup|restore|release-gate
//
// Reutiliza os mecanismos canônicos (não os reimplementa):
//   recovery:doctor, recovery:key:prepare, recovery:store:init, recovery:export:private,
//   recovery:storage:export, recovery:verify, recovery:restore:verify (consolidation-restore-verify),
//   pilot:restore:drill (DB + Storage em Supabase descartável), backup:restore:verify e
//   release-migrations --dry-run. Esta camada só: verifica requisitos, coleta credenciais
//   por entrada oculta, valida o projeto de origem, sobe/derruba alvos loopback
//   descartáveis, encadeia as etapas e grava evidência sanitizada.
//
// Nunca: aceita credencial por argumento, imprime credencial, restaura em banco
// hospedado, aplica migration hospedada, grava backup no repositório ou em área temporária.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { DEMO_REF, demoConnectionProblems } from '../../lib/release-migration-guard.mjs';
import { HOSTED_DRILL_IMAGE } from '../../lib/pilot-backup-preflight.mjs';
import { ephemeralRoots } from '../../lib/recovery-doctor.mjs';
import { schemaFingerprint } from '../../lib/backup-evidence.mjs';

export const STAGES = Object.freeze(['requirements', 'credentials', 'source', 'store', 'key', 'custody', 'doctor',
  'export', 'storage-export', 'verify', 'restore-encrypted', 'restore-drill', 'release-backup', 'release-restore', 'release-dry-run', 'evidence']);
const UNTIL = { backup: 'verify', restore: 'restore-drill', 'release-gate': 'evidence' };
const MIN_FREE_BYTES = 20 * 1024 ** 3;
const MIN_MEMORY_BYTES = 4 * 1024 ** 3;

export class OrchestratorStop extends Error {
  constructor(stage, code, message) { super(message); this.stage = stage; this.code = code; }
}
const stop = (stage, code, message) => { throw new OrchestratorStop(stage, code, message); };
const inside = (parent, child) => { const r = path.relative(parent, child); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); };

/** Remove de qualquer texto as credenciais conhecidas e padrões sensíveis. */
export function sanitize(text, secrets = []) {
  let out = String(text ?? '');
  for (const secret of secrets.filter((s) => typeof s === 'string' && s.length >= 6)) out = out.split(secret).join('[REDACTED]');
  return out.replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, '[DATABASE_URL]').replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[JWT]')
    .replace(/AGE-SECRET-KEY-[A-Z0-9]+/g, '[AGE_IDENTITY]');
}

// ------------------------------------------------------------ requisitos
/** Diagnóstico do executor. Puro sobre `probe`, para teste. */
export function checkRequirements({ env = process.env, probe = defaultProbe(), root = process.cwd() } = {}) {
  const items = [];
  const add = (id, ok, detail, fix = null) => items.push({ id, ok, detail, ...(ok ? {} : { fix }) });
  const nodeMajor = Number(String(probe.nodeVersion).replace(/^v/, '').split('.')[0]);
  add('node', nodeMajor >= 22, `Node ${probe.nodeVersion} (repositório declara 24.x)`, 'Instale Node 24 (o bootstrap WSL usa nvm).');
  add('docker', probe.docker === true, probe.docker ? 'Docker funcional' : 'Docker indisponível', 'Instale/ligue o Docker Engine no WSL2 ou o Docker Desktop com integração WSL.');
  for (const tool of ['pg_dump', 'pg_restore', 'psql']) {
    const major = probe.pgMajor?.[tool] ?? null;
    add(tool, major === 17, major ? `${tool} ${major}` : `${tool} ausente`, 'Instale postgresql-client-17 (repositório PGDG); o bootstrap WSL faz isso com sua autorização.');
  }
  for (const tool of ['age', 'age-keygen']) add(tool, probe.tools?.[tool] === true, probe.tools?.[tool] ? `${tool} presente` : `${tool} ausente`, 'Instale o pacote age.');
  add('openssl', probe.tools?.openssl === true, probe.tools?.openssl ? 'openssl presente' : 'openssl ausente', 'Instale openssl (usado pelo restore drill).');
  add('memory', probe.memoryBytes >= MIN_MEMORY_BYTES, `${Math.round(probe.memoryBytes / 1024 ** 3)} GiB de memória`, 'Reserve ao menos 4 GiB ao WSL2 (.wslconfig).');
  const store = env.ARANDU_RECOVERY_DIRECTORY;
  const identity = env.ARANDU_RECOVERY_IDENTITY_FILE;
  const persistent = (target) => target && path.isAbsolute(target) && !ephemeralRoots(env).some((r) => inside(r, path.resolve(target)))
    && !/^\/(?:tmp|var\/tmp|dev\/shm|run)(?:\/|$)/.test(target) && !inside(path.resolve(root), path.resolve(target)) && !/^\/mnt\/[a-z]\//i.test(target);
  add('store-path', persistent(store), store ? 'Store privado fora do repositório e de áreas temporárias' : 'ARANDU_RECOVERY_DIRECTORY ausente',
    'Use um caminho no disco persistente do WSL (ex.: ~/arandu-recovery/store). /tmp, o repositório e /mnt/c não servem (sem permissão 0700 real).');
  add('identity-path', persistent(identity) && (!store || !inside(path.resolve(store), path.resolve(identity))),
    identity ? 'Identidade age fora do store e do repositório' : 'ARANDU_RECOVERY_IDENTITY_FILE ausente',
    'Use, por exemplo, ~/arandu-recovery/keys/identity.age (diretório 0700), separado do store.');
  add('disk', probe.freeBytes >= MIN_FREE_BYTES, `${Math.round(probe.freeBytes / 1024 ** 3)} GiB livres no destino`, 'Libere ao menos 20 GiB no disco do store.');
  add('ci', !['true', '1'].includes(String(env.CI || '').toLowerCase()) && env.GITHUB_ACTIONS !== 'true' && env.RUNNER_ENVIRONMENT !== 'github-hosted',
    'Fora de CI', 'Execute na máquina confiável do operador: a identidade privada nunca vai para CI.');
  return { ok: items.every((i) => i.ok), items };
}

function defaultProbe() {
  const has = (bin, args = ['--version']) => { const r = spawnSync(bin, args, { encoding: 'utf8', timeout: 15000 }); return !r.error && r.status === 0 ? String(r.stdout || r.stderr) : null; };
  const major = (bin) => { const v = has(bin); const m = /\b(\d+)(?:\.\d+)+/.exec(v || ''); return m ? Number(m[1]) : null; };
  let freeBytes = 0;
  try { const target = process.env.ARANDU_RECOVERY_DIRECTORY; const dir = target && fs.existsSync(target) ? target : target ? path.dirname(target) : os.homedir();
    const s = fs.statfsSync(dir); freeBytes = Number(s.bavail) * Number(s.bsize); } catch { freeBytes = 0; }
  return {
    nodeVersion: process.version, docker: spawnSync('docker', ['info'], { timeout: 20000 }).status === 0,
    pgMajor: { pg_dump: major('pg_dump'), pg_restore: major('pg_restore'), psql: major('psql') },
    tools: { age: !!has('age', ['--version']), 'age-keygen': !!has('age-keygen', ['--version']), openssl: !!has('openssl', ['version']) },
    memoryBytes: os.totalmem(), freeBytes
  };
}

// ------------------------------------------------------------ entrada oculta
/** Lê uma linha sem eco no terminal; nunca usa argv nem grava histórico. */
export function hiddenPrompt(question, { input = process.stdin, output = process.stderr } = {}) {
  return new Promise((resolve, reject) => {
    if (!input.isTTY) { reject(new OrchestratorStop('credentials', 'NO_TTY', 'Entrada protegida exige terminal interativo.')); return; }
    output.write(question);
    let value = '';
    input.setRawMode(true); input.resume(); input.setEncoding('utf8');
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') { done(); return; }
        if (ch === '\u0003') { cleanup(); reject(new OrchestratorStop('credentials', 'CANCELLED', 'Cancelado pelo operador.')); return; }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1); else value += ch;
      }
    };
    const cleanup = () => { input.setRawMode(false); input.pause(); input.removeListener('data', onData); output.write('\n'); };
    const done = () => { cleanup(); resolve(value.trim()); };
    input.on('data', onData);
  });
}

export function visiblePrompt(question, { input = process.stdin, output = process.stderr } = {}) {
  return new Promise((resolve) => {
    output.write(question); input.resume(); input.setEncoding('utf8');
    input.once('data', (d) => { input.pause(); resolve(String(d).split(/\r?\n/)[0].trim()); });
  });
}

// ------------------------------------------------------------ validações puras
export function validateSourceUrl(url) {
  const problems = demoConnectionProblems(String(url || ''));
  // pg_dump precisa de sessão: direct ou Session pooler (5432), nunca o transaction pooler (6543).
  try { if ((new URL(String(url)).port || '5432') !== '5432') problems.push('Use a porta 5432 (direct ou Session pooler).'); } catch { /* já reprovado */ }
  return { ok: problems.length === 0, problems };
}

/** libpq não expande URL em PGDATABASE: separa em variáveis PG* (só no filho). */
export function pgEnv(url) {
  const u = new URL(url);
  return { PGHOST: u.hostname, PGPORT: u.port || '5432', PGUSER: decodeURIComponent(u.username), PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: u.pathname.slice(1) || 'postgres', PGSSLMODE: u.searchParams.get('sslmode') || 'require', PGCONNECT_TIMEOUT: '15' };
}

export function validateServiceKey(key) {
  const parts = String(key || '').split('.');
  if (parts.length !== 3) return false;
  try { const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); return claims.role === 'service_role' && (!claims.ref || claims.ref === DEMO_REF); }
  catch { return false; }
}

/** Referências auditáveis derivadas do próprio artefato (hash + instante real), nunca inventadas. */
export function releaseReferences({ sha256, at = new Date() }) {
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('hash inválido');
  const stamp = at.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  return { backupReference: `demo-public-backup-${stamp}-sha256-${sha256.slice(0, 16)}`, restoreReference: `demo-disposable-restore-${stamp}-sha256-${sha256.slice(0, 16)}` };
}

// ------------------------------------------------------------ execução
export function makeExec({ cwd = process.cwd(), secrets = [], log = (line) => process.stderr.write(line + '\n') } = {}) {
  return (stage, command, args, { env = {}, input, allowFail = false } = {}) => {
    // Ambiente mínimo: PATH/HOME e o que a etapa precisa. Nada do shell do operador vaza.
    const childEnv = { PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'C.UTF-8', ...env };
    const result = spawnSync(command, args, { cwd, env: childEnv, input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    // Log só do stderr (diagnóstico); stdout é dado de trabalho (ex.: schema) e
    // só aparece, sanitizado, quando a etapa falha.
    const failed = Boolean(result.error) || result.status !== 0;
    const out = sanitize(`${failed ? result.stdout || '' : ''}${result.stderr || ''}`, secrets);
    if (out.trim()) log(out.trim().split('\n').slice(-200).map((l) => `  [${stage}] ${l}`).join('\n'));
    if (!allowFail && (result.error || result.status !== 0)) {
      const blocked = /BLOQUEADO \(([A-Z_]+)\)/.exec(out)?.[1] || /\(((?:RECOVERY|STORAGE)_[A-Z_]+)\)/.exec(out)?.[1];
      stop(stage, blocked || 'STEP_FAILED', `Etapa ${stage} falhou (${command} ${args[0] || ''}); nada posterior foi executado.`);
    }
    return { status: result.status, stdout: sanitize(result.stdout || '', secrets) };
  };
}

/** Postgres 17 Supabase descartável em loopback; sempre removido no fim. */
export function disposablePostgres(exec, { label, image = HOSTED_DRILL_IMAGE } = {}) {
  const name = `arandu-orchestrator-${label}-${randomBytes(4).toString('hex')}`;
  const password = randomBytes(18).toString('hex');
  const port = 55000 + Math.floor(Math.random() * 4000);
  exec('disposable', 'docker', ['run', '-d', '--name', name, '--label', 'arandu.recovery-orchestrator=1', '-e', `POSTGRES_PASSWORD=${password}`,
    '-e', `JWT_SECRET=${randomBytes(32).toString('hex')}`, '-p', `127.0.0.1:${port}:5432`, image, 'postgres', '-c', 'config_file=/etc/postgresql/postgresql.conf']);
  const url = `postgresql://supabase_admin:${password}@127.0.0.1:${port}/postgres`;
  for (let i = 0; i < 90; i += 1) {
    if (exec('disposable', 'psql', [url, '-XAtc', 'select 1'], { allowFail: true }).status === 0) break;
    spawnSync('sleep', ['2']);
  }
  const ready = exec('disposable', 'psql', [url, '-XAtc', "select current_setting('server_version_num')::int/10000"], { allowFail: true });
  if (ready.status !== 0 || ready.stdout.trim() !== '17') { exec('disposable', 'docker', ['rm', '-f', name], { allowFail: true }); stop('disposable', 'DISPOSABLE_UNAVAILABLE', 'PostgreSQL 17 descartável não ficou pronto.'); }
  return { url, password, close: () => exec('disposable', 'docker', ['rm', '-f', '-v', name], { allowFail: true }) };
}


/**
 * Cadeia exigida por scripts/release-migrations.mjs --apply: backup `public`
 * (custom) fora do repositório, sha256, restore em PostgreSQL 17 Supabase
 * descartável por verify-backup-restore (mesmos checks e janela de 6 h) e o
 * plano canônico em dry-run. Nunca aplica migration.
 */
export function releaseGateChain({ exec, sourceEnv, store, root, schema, postgres, at = new Date(), mark = () => {}, dryRun = true }) {
  const gateDir = path.join(store, 'release-gate');
  fs.mkdirSync(gateDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(gateDir, 0o700);
  const dumpFile = path.join(gateDir, `demo-public-${at.toISOString().replace(/[:.]/g, '-')}.dump`);
  // Com ACLs: o ensaio de migrations restaura grants fielmente; verify-backup-restore os ignora (--no-acl no restore).
  exec('release-backup', 'pg_dump', ['--schema=public', '--format=custom', '--no-owner', '--file', dumpFile], { env: sourceEnv });
  fs.chmodSync(dumpFile, 0o600);
  const sha256 = createHash('sha256').update(fs.readFileSync(dumpFile)).digest('hex');
  const schemaSql = exec('release-backup', 'pg_dump', ['--schema=public', '--schema-only', '--no-owner', '--no-acl'], { env: sourceEnv }).stdout;
  const sourceRaw = schemaFingerprint(schemaSql);
  // Forma canônica: o PostgreSQL re-deparsa expressões ao recarregar um dump
  // (ex.: CHECK com BETWEEN perde parênteses redundantes). O esperado é o schema
  // da PRÓPRIA origem após uma ida e volta num PostgreSQL 17 descartável sem
  // dados; o restore completo precisa chegar exatamente nele.
  const schemaFile = path.join(gateDir, `demo-public-schema-${at.toISOString().replace(/[:.]/g, '-')}.dump`);
  exec('release-backup', 'pg_dump', ['--schema=public', '--schema-only', '--format=custom', '--no-owner', '--no-acl', '--file', schemaFile], { env: sourceEnv });
  fs.chmodSync(schemaFile, 0o600);
  const scratch = postgres(exec, { label: 'schema' });
  let expected;
  try {
    exec('release-backup', 'pg_restore', ['--clean', '--if-exists', '--no-owner', '--no-acl', '--exit-on-error', '--single-transaction', '--dbname', scratch.url, schemaFile]);
    expected = schemaFingerprint(exec('release-backup', 'pg_dump', [scratch.url, '--schema=public', '--schema-only', '--no-owner', '--no-acl']).stdout);
  } finally { scratch.close(); fs.rmSync(schemaFile, { force: true }); }
  const refs = releaseReferences({ sha256, at });
  mark('release-backup', { sha256, schema_sha256: expected, source_schema_sha256_raw: sourceRaw, schema_canonicalization: 'pg17_roundtrip_without_data', ...refs });
  const gate = postgres(exec, { label: 'release' });
  try {
    exec('release-restore', process.execPath, [path.join(root, 'scripts/verify-backup-restore.mjs'), `--backup-file=${dumpFile}`, `--backup-reference=${refs.backupReference}`,
      `--restore-reference=${refs.restoreReference}`, '--operator=demo-recovery-operator', `--expected-schema-sha256=${expected}`, '--restore-backup',
      '--scope=public_schema', '--max-age-hours=6', '--confirm=ARANDU-RESTORE-VERIFY'], { env: { ARANDU_RESTORE_DATABASE_URL: gate.url } });
  } finally { gate.close(); }
  const report = JSON.parse(fs.readFileSync(path.join(root, 'reports/backup-restore-verification.json'), 'utf8'));
  if (report.result !== 'passed' || report.backupSha256 !== sha256) stop('release-restore', 'RESTORE_EVIDENCE_MISMATCH', 'Evidência de restore não corresponde ao backup.');
  mark('release-restore', { result: report.result, generated_at: report.generatedAt });
  const gate_ = { valid_until: new Date(at.getTime() + 6 * 3600000).toISOString(), after_schema: schema, backup_file: dumpFile, backup_sha256: sha256,
    backup_reference: refs.backupReference, restore_reference: refs.restoreReference };
  if (!dryRun) return gate_;
  exec('release-dry-run', process.execPath, [path.join(root, 'scripts/release-migrations.mjs'), '--environment=demo', '--flow=existingDatabase', `--after-schema=${schema}`, '--dry-run']);
  const plan = JSON.parse(fs.readFileSync(path.join(root, 'reports/migration-release-report.json'), 'utf8'));
  mark('release-dry-run', { bundle_sha256: plan.bundleSha256 });
  return { ...gate_, bundle_sha256: plan.bundleSha256,
    pending: plan.steps.find((s) => s.name === 'canonical-order')?.detail?.map((d) => d.file) || [],
    apply_command: ['ARANDU_ENV=demo', `ARANDU_DEMO_CONFIRM=${DEMO_REF}`, 'ARANDU_DATABASE_URL=<entrada oculta>', 'ARANDU_DEMO_DATABASE_URL=<mesma>',
      `ARANDU_BACKUP_PATH=${dumpFile}`, 'node scripts/release-migrations.mjs --environment=demo --flow=existingDatabase', `--after-schema=${schema}`,
      '--operator=demo-release-operator', `--backup-reference=${refs.backupReference}`, `--restore-reference=${refs.restoreReference}`,
      '--restore-evidence=reports/backup-restore-verification.json', '--confirm-demo=ARANDU-DEMO', '--apply'].join(' ') };
}

/**
 * Procedimento completo. Dependências injetáveis para teste: exec, prompts,
 * probe e o fábrica de Postgres descartável. Cada etapa é um gate: a primeira
 * falha encerra tudo e registra a etapa e o código, sem segredo.
 */
export async function runProcedure({
  env = process.env, root = process.cwd(), until = 'evidence', probe, ask = hiddenPrompt, confirm = visiblePrompt,
  execFactory = makeExec, postgres = disposablePostgres, now = () => new Date(), log = (l) => process.stderr.write(l + '\n')
} = {}) {
  const evidence = { classification: 'recovery_orchestration', format_version: 1, project_ref: DEMO_REF, started_at: now().toISOString(), stages: [], result: 'blocked' };
  const secrets = [];
  const store = env.ARANDU_RECOVERY_DIRECTORY;
  const identity = env.ARANDU_RECOVERY_IDENTITY_FILE;
  const last = STAGES.indexOf(UNTIL[until] || until);
  if (last < 0) stop('requirements', 'INVALID_UNTIL', '--until inválido.');
  let exec = execFactory({ cwd: root, secrets, log });
  const mark = (stage, detail = {}) => { evidence.stages.push({ stage, ok: true, at: now().toISOString(), ...detail }); log(`OK  ${stage}`); };
  const reached = (stage) => STAGES.indexOf(stage) <= last;
  const ctx = {};
  const shared = () => ({ ARANDU_RECOVERY_DIRECTORY: store, ARANDU_RECOVERY_IDENTITY_FILE: identity, ARANDU_RECOVERY_PROJECT_REF: DEMO_REF });
  try {
    // 1. requisitos
    const req = checkRequirements({ env, probe, root });
    if (!req.ok) { evidence.requirements = req.items; stop('requirements', 'REQUIREMENTS_MISSING', `Requisitos ausentes: ${req.items.filter((i) => !i.ok).map((i) => i.id).join(', ')}.`); }
    mark('requirements', { items: req.items.map(({ id, ok }) => ({ id, ok })) });

    // 2. credenciais (somente entrada oculta)
    ctx.databaseUrl = await ask('Conexão PostgreSQL administrativa da Demo (Session pooler, entrada oculta): ');
    secrets.push(ctx.databaseUrl);
    const source = validateSourceUrl(ctx.databaseUrl);
    if (!source.ok) stop('credentials', 'SOURCE_NOT_DEMO', 'A conexão não é do projeto Demo aprovado (host, usuário, porta ou parâmetros).');
    ctx.serviceKey = await ask('Chave service_role da Demo (para exportar o Storage, entrada oculta): ');
    secrets.push(ctx.serviceKey);
    if (!validateServiceKey(ctx.serviceKey)) stop('credentials', 'SERVICE_KEY_INVALID', 'A chave não é uma service_role da Demo.');
    try { secrets.push(new URL(ctx.databaseUrl).password); } catch { /* validado acima */ }
    exec = execFactory({ cwd: root, secrets, log });
    mark('credentials', { database: 'demo_pooler_validated', storage_key: 'service_role_shape_validated' });

    // 3. origem: leitura apenas, conferindo identidade e estado
    const probeSql = "select json_build_object('schema', (select value from public.fin_settings where key='schema_version'), 'env', (select value from public.fin_settings where key='deployment_environment'), 'pg', current_setting('server_version_num')::int/10000, 'objects', (select count(*) from storage.objects))";
    const row = exec('source', 'psql', ['-XAt', '-v', 'ON_ERROR_STOP=1', '-c', `begin read only; ${probeSql}; rollback;`], { env: pgEnv(ctx.databaseUrl) });
    let facts;
    try { facts = JSON.parse(row.stdout.split('\n').find((l) => l.startsWith('{'))); } catch { stop('source', 'SOURCE_UNREADABLE', 'Não foi possível ler o estado da origem.'); }
    if (facts.env !== 'demo') stop('source', 'SOURCE_NOT_DEMO', 'fin_settings.deployment_environment não é demo.');
    if (facts.pg !== 17) stop('source', 'SOURCE_MAJOR_MISMATCH', 'Origem não é PostgreSQL 17.');
    if (!/^financial-[a-z0-9-]+$/.test(String(facts.schema || ''))) stop('source', 'SOURCE_SCHEMA_UNKNOWN', 'Origem sem marcador financeiro.');
    ctx.schema = facts.schema; ctx.objects = facts.objects;
    mark('source', { schema_version: facts.schema, postgres_major: facts.pg, storage_objects: facts.objects });

    // 4. store privado persistente (recovery:store:init), com atestado explícito
    const marker = path.join(store, '.arandu-recovery-store.json');
    if (!fs.existsSync(store)) {
      const answer = await confirm(`Criar o store privado em ${store}? Ele precisa sobreviver a reinícios e ter backup próprio. Digite PERSISTENTE para atestar: `);
      if (answer !== 'PERSISTENTE') stop('store', 'STORE_NOT_ATTESTED', 'Persistência do store não atestada.');
      exec('store', process.execPath, ['scripts/recovery.mjs', 'store-init', '--attest-persistent'], { env: shared() });
    }
    mark('store', { initialized: fs.existsSync(store), marker_present: fs.existsSync(marker) || undefined });
    if (!reached('key')) return finish();

    // 5. identidade age (recovery:key:prepare) e 6. custódia
    const generate = !fs.existsSync(identity) && (await confirm('Identidade age inexistente. Gerar agora neste computador? (SIM/NAO): ')) === 'SIM';
    const key = exec('key', process.execPath, ['scripts/recovery.mjs', 'key', ...(generate ? ['--generate'] : [])], { env: shared() });
    const recipient = /age1[0-9a-z]{58}/.exec(key.stdout)?.[0];
    const fingerprint = /Fingerprint: ([0-9a-f]{16})/.exec(key.stdout)?.[1];
    if (!recipient || !fingerprint) stop('key', 'RECOVERY_IDENTITY_INVALID', 'Ida e volta da identidade não comprovada.');
    ctx.recipient = recipient;
    mark('key', { fingerprint, generated: generate, roundtrip: 'VERIFIED' });
    const custody = await confirm(`Custódia: guarde uma cópia offline da identidade FORA deste computador e do store. Depois digite os 6 últimos caracteres do fingerprint (${fingerprint.slice(0, 10)}……): `);
    if (custody !== fingerprint.slice(-6)) stop('custody', 'CUSTODY_NOT_CONFIRMED', 'Custódia da identidade não confirmada; nenhum backup foi feito.');
    mark('custody', { confirmed: true });

    const recoveryEnv = { ...shared(), ARANDU_RECOVERY_DATABASE_URL: ctx.databaseUrl, ARANDU_RECOVERY_RECIPIENT: ctx.recipient,
      ARANDU_RECOVERY_CONFIRM: 'ARANDU-ENCRYPTED-EXPORT', ARANDU_RECOVERY_STORAGE_BINARIES: ctx.objects > 0 ? '1' : '0',
      ARANDU_STORAGE_SOURCE_URL: `https://${DEMO_REF}.supabase.co`, ARANDU_STORAGE_SOURCE_SERVICE_KEY: ctx.serviceKey };

    // 7. preflight canônico
    exec('doctor', process.execPath, ['scripts/recovery.mjs', 'doctor', '--export'], { env: recoveryEnv });
    mark('doctor');
    const auth = await confirm('Autorizar o export criptografado da Demo (somente leitura na origem)? Digite EXPORTAR: ');
    if (auth !== 'EXPORTAR') stop('export', 'NOT_AUTHORIZED', 'Export não autorizado.');

    // 8. export + 9. Storage + verificação de integridade
    const before = new Set(fs.readdirSync(store));
    exec('export', process.execPath, ['scripts/recovery.mjs', 'export'], { env: recoveryEnv });
    const created = fs.readdirSync(store).filter((n) => !before.has(n));
    if (created.length !== 1) stop('export', 'RECOVERY_PERSISTENCE_FAILED', 'Export não identificável no store.');
    ctx.backup = path.join(store, created[0]);
    mark('export', { export: created[0] });
    if (ctx.objects > 0) {
      exec('storage-export', process.execPath, ['scripts/storage-recovery.mjs', 'export'], { env: { ARANDU_STORAGE_CONFIRM: 'ARANDU-STORAGE-EXPORT',
        ARANDU_STORAGE_PROJECT_REF: DEMO_REF, ARANDU_STORAGE_DATABASE_URL: ctx.databaseUrl, ARANDU_STORAGE_SOURCE_URL: recoveryEnv.ARANDU_STORAGE_SOURCE_URL,
        ARANDU_STORAGE_SOURCE_SERVICE_KEY: ctx.serviceKey, ARANDU_STORAGE_RECIPIENT: ctx.recipient, ARANDU_STORAGE_DIRECTORY: ctx.backup } });
      mark('storage-export', { objects: ctx.objects });
    } else mark('storage-export', { objects: 0, skipped: 'no_objects' });
    const verified = exec('verify', process.execPath, ['scripts/recovery.mjs', 'verify'], { env: { ...shared(), ARANDU_RECOVERY_BACKUP: ctx.backup } });
    let integrity;
    try { integrity = JSON.parse(verified.stdout.trim().split('\n').at(-1)); } catch { stop('verify', 'RECOVERY_READBACK_FAILED', 'Verificação ilegível.'); }
    if (integrity.integrity !== 'VERIFIED') stop('verify', 'RECOVERY_READBACK_FAILED', 'Integridade do export não verificada.');
    mark('verify', { integrity: integrity.integrity, level: integrity.level, files: integrity.files?.map(({ name, sha256 }) => ({ name, sha256 })) });
    if (!reached('restore-encrypted')) return finish();

    // 10. restore isolado do export criptografado (recovery:restore:verify)
    const target = postgres(exec, { label: 'encrypted' });
    try {
      exec('restore-encrypted', process.execPath, ['scripts/consolidation-restore-verify.mjs'], { env: { ARANDU_RESTORE_CONFIRM: 'ARANDU-ISOLATED-RESTORE',
        ARANDU_RESTORE_BACKUP: ctx.backup, ARANDU_RESTORE_IDENTITY: identity, ARANDU_RESTORE_TARGET_URL: target.url, ARANDU_RECOVERY_PROJECT_REF: DEMO_REF } });
    } finally { target.close(); }
    mark('restore-encrypted', { target: 'loopback_disposable_postgresql17' });

    // 11. DB + Storage em Supabase descartável completo (pilot:restore:drill)
    if (reached('restore-drill')) {
      exec('restore-drill', 'bash', ['scripts/pilot-restore-drill.sh'], { env: { PILOT_SOURCE_DATABASE_URL: ctx.databaseUrl,
        PILOT_DRILL_STORAGE_BINARIES: ctx.objects > 0 ? '1' : '0', PILOT_DRILL_STORAGE_SOURCE_URL: recoveryEnv.ARANDU_STORAGE_SOURCE_URL,
        PILOT_DRILL_STORAGE_SOURCE_KEY: ctx.serviceKey, PILOT_DRILL_DB_IMAGE: HOSTED_DRILL_IMAGE, DOCKER_HOST: env.DOCKER_HOST, TMPDIR: env.TMPDIR } });
      const drill = JSON.parse(fs.readFileSync(path.join(root, 'reports/pilot-restore-drill.json'), 'utf8'));
      mark('restore-drill', { result: drill.result ?? drill.status ?? null, completeness: drill.completeness ?? null });
    }
    if (!reached('release-backup')) return finish();

    // 12–13. cadeia do gate de release (backup public + restore descartável + dry-run)
    evidence.release_gate = releaseGateChain({ exec, sourceEnv: pgEnv(ctx.databaseUrl), store, root, schema: ctx.schema, postgres, at: now(), mark });
    return finish();
  } catch (error) {
    if (!(error instanceof OrchestratorStop)) throw error;
    evidence.result = 'blocked';
    evidence.blocked = { stage: error.stage, code: error.code, message: sanitize(error.message, secrets) };
    write();
    return evidence;
  }

  function finish() { evidence.result = 'passed'; evidence.completed_at = now().toISOString(); mark('evidence'); write(); return evidence; }
  function write() {
    const text = sanitize(JSON.stringify(evidence, null, 2), secrets) + '\n';
    const reports = path.join(root, 'reports');
    fs.mkdirSync(reports, { recursive: true });
    fs.writeFileSync(path.join(reports, 'recovery-orchestration.json'), text, { mode: 0o600 });
    if (store && fs.existsSync(store)) fs.writeFileSync(path.join(store, `orchestration-${evidence.started_at.replace(/[:.]/g, '-')}.json`), text, { mode: 0o600 });
  }
}

async function main() {
  const [command = 'check', ...args] = process.argv.slice(2);
  if (args.some((a) => /postgres(?:ql)?:\/\/|eyJ|service_role|password/i.test(a))) {
    console.error('Recusado: credenciais nunca por argumento. O procedimento pergunta em entrada oculta.'); return 2;
  }
  if (command === 'check') {
    const report = checkRequirements();
    for (const item of report.items) console.log(`${item.ok ? 'OK  ' : 'FALTA'} ${item.id.padEnd(13)} ${item.detail}${item.ok ? '' : `\n      → ${item.fix}`}`);
    console.log(report.ok ? '\nExecutor pronto.' : '\nExecutor incompleto: resolva os itens FALTA (o bootstrap WSL automatiza a maioria).');
    return report.ok ? 0 : 1;
  }
  if (command === 'run') {
    const until = args.find((a) => a.startsWith('--until='))?.split('=')[1] || 'release-gate';
    const result = await runProcedure({ until });
    console.log(JSON.stringify({ result: result.result, blocked: result.blocked || null, stages: result.stages.map((s) => s.stage), release_gate: result.release_gate || null }, null, 2));
    return result.result === 'passed' ? 0 : 1;
  }
  console.error('uso: node scripts/recovery/orchestrate.mjs check | run [--until=backup|restore|release-gate]');
  return 2;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url))) {
  try { process.exitCode = await main(); }
  catch (error) { console.error(`Falha inesperada: ${sanitize(error.message)}`); process.exitCode = 1; }
}
