#!/usr/bin/env node
// Release remoto da Demo com política proporcional (issue #366,
// docs/ops/DEMO_REMOTE_RELEASE.md). Feito para o GitHub-hosted runner
// (.github/workflows/demo-release.yml), sem máquina pessoal e sem identidade
// privada age em CI.
//
//   node scripts/demo/remote-release.mjs plan       identidade + inventário + política + plano (somente leitura)
//   node scripts/demo/remote-release.mjs rehearse   plan + snapshot + restore descartável + migrations ensaiadas na cópia
//   node scripts/demo/remote-release.mjs apply      rehearse + preservação + lease + release-migrations --apply + probes
//
// Conexão só por ARANDU_DEMO_DATABASE_URL (secret do environment demo). Plaintext
// do snapshot fica em diretório privado efêmero (RUNNER_TEMP, 0700) e é apagado;
// nunca vira artifact, commit ou log. Fora da Demo canônica: FULL_RECOVERY.
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { makeExec, disposablePostgres, releaseGateChain, validateSourceUrl, pgEnv, sanitize, OrchestratorStop } from '../recovery/orchestrate.mjs';
import { DEMO_REF, selectPendingSections, guardPrefix, transactionBody } from '../../lib/release-migration-guard.mjs';
import { DEMO_EMAIL_DOMAINS } from '../../lib/finance/demo-guard.mjs';
import { PATHS, POLICY_VERSION, recoveryPath, classifyData, nonRegenerableState, decideDemoRelease } from '../../lib/demo-recovery-policy.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const stop = (stage, code, message) => { throw new OrchestratorStop(stage, code, message); };
const manifest = () => JSON.parse(fs.readFileSync(path.join(root, 'docs/supabase-migrations.json'), 'utf8')).existingDatabase;

/** Inventário somente leitura (contagens). */
export function inventory(exec, sourceEnv) {
  const out = exec('inventory', 'psql', ['-XAt', '-v', 'ON_ERROR_STOP=1', '-v', `domains=${JSON.stringify(DEMO_EMAIL_DOMAINS)}`, '-f', path.join(root, 'ops/sql/demo-recovery-inventory.sql')], { env: sourceEnv }).stdout;
  try { return JSON.parse(out.split('\n').find((l) => l.startsWith('{'))); } catch { stop('inventory', 'DATA_INVENTORY_INVALID', 'Inventário ilegível.'); }
}

/** Migrations pendentes a partir do marcador REAL do banco (mesma seleção do release). */
export function pendingMigrations(schema) {
  const sections = manifest().map((file) => ({ file, content: fs.readFileSync(path.join(root, file), 'utf8').trim() }));
  try { return selectPendingSections(sections, schema).map((s) => ({ file: s.file, rollback: s.file.replace(/^docs\//, 'docs/rollback/').replace(/\.sql$/, '.rollback.sql'),
    sha256: createHash('sha256').update(s.content).digest('hex'), expectedBefore: s.expectedBefore, expectedAfter: s.expectedAfter })); }
  catch (error) { if (/Nenhuma migration pendente/.test(error.message)) return []; stop('plan', 'PLAN_INVALID', error.message); }
}

export function plan({ exec, sourceEnv, declaredEnvironment, connectionRef }) {
  const inv = inventory(exec, sourceEnv);
  const pathDecision = recoveryPath({ declaredEnvironment, connectionRef, databaseEnvironment: inv.deployment_environment });
  const pending = pathDecision === PATHS.demo ? pendingMigrations(inv.schema_version) : [];
  return { policy_version: POLICY_VERSION, path: pathDecision, schema_version: inv.schema_version, inventory: inv,
    classification: classifyData(inv), non_regenerable: nonRegenerableState(inv), pending,
    bundle_sha256: createHash('sha256').update(pending.map((p) => `${p.file}:${p.sha256}`).join('\n')).digest('hex') };
}

/**
 * Ensaio na cópia: cadeia do gate de release (#365) + restore do MESMO snapshot
 * num segundo PG 17 descartável, migrations pendentes aplicadas, probes,
 * canário, rollback (ordem inversa) e reaplicação. A origem só é lida.
 */
export function rehearse({ exec, sourceEnv, planned, workDir, postgres = disposablePostgres, now = () => new Date() }) {
  if (planned.path !== PATHS.demo) stop('rehearse', 'FULL_RECOVERY_REQUIRED', 'Fora da Demo canônica o ensaio proporcional não se aplica.');
  if (!planned.pending.length) stop('rehearse', 'NOTHING_PENDING', 'Nenhuma migration pendente.');
  fs.mkdirSync(workDir, { recursive: true, mode: 0o700 }); fs.chmodSync(workDir, 0o700);
  const at = now();
  const gate = releaseGateChain({ exec, sourceEnv, store: workDir, root, schema: planned.schema_version, postgres, at, dryRun: false });
  const checks = { restore: 'PASS' };
  const target = postgres(exec, { label: 'rehearsal' });
  const t = { ...pgEnv(target.url), PGSSLMODE: 'disable' }; // loopback descartável
  const psql = (stage, args) => exec(stage, 'psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', ...args], { env: t });
  const marker = () => exec('rehearse', 'psql', ['-XAtc', "select value from public.fin_settings where key='schema_version'"], { env: t }).stdout.trim();
  try {
    // Mesmo restore do gate (seções + placeholders de auth.users só no descartável).
    // Com ACLs (o snapshot as carrega): probes de grants/RLS valem na cópia.
    const restoreArgs = ['--no-owner', '--exit-on-error', '--single-transaction', '--dbname', target.url];
    exec('rehearse', 'pg_restore', ['--clean', '--if-exists', ...restoreArgs, '--section=pre-data', gate.backup_file]);
    exec('rehearse', 'pg_restore', [...restoreArgs, '--section=data', gate.backup_file]);
    const post = exec('rehearse', 'pg_restore', ['--section=post-data', '--file=-', gate.backup_file]).stdout;
    const refs = [...post.matchAll(/ALTER TABLE ONLY public\.("?[a-z0-9_]+"?)\s+ADD CONSTRAINT "?[a-z0-9_]+"? FOREIGN KEY \(("?[a-z0-9_]+"?)\) REFERENCES auth\.users\(id\)/g)]
      .map((m) => ({ table: m[1].replaceAll('"', ''), column: m[2].replaceAll('"', '') }));
    psql('rehearse', ['-v', `refs=${JSON.stringify(refs)}`, '-f', path.join(root, 'ops/sql/restore-auth-reference-stubs.sql')]);
    exec('rehearse', 'pg_restore', [...restoreArgs, '--section=post-data', gate.backup_file]);
    // Configuração de role não vem no pg_dump: copia só pgrst.* do authenticator
    // (ex.: pgrst.db_pre_request da revogação de sessão), lida da origem.
    const roleConfig = exec('rehearse', 'psql', ['-XAtc', "select coalesce(string_agg(c, E'\\n'), '') from pg_roles r, unnest(r.rolconfig) c where r.rolname='authenticator' and c like 'pgrst.%'"], { env: sourceEnv }).stdout.trim();
    for (const line of roleConfig.split('\n').filter(Boolean)) {
      const [key, ...rest] = line.split('='); const value = rest.join('=');
      if (!/^pgrst\.[a-z_]+$/.test(key) || !/^[A-Za-z0-9_.]+$/.test(value)) stop('rehearse', 'ROLE_CONFIG_UNEXPECTED', 'Configuração pgrst.* inesperada na origem.');
      psql('rehearse', ['-c', `alter role authenticator set ${key} = '${value}'`]);
    }
    if (marker() !== planned.schema_version) stop('rehearse', 'REHEARSAL_SOURCE_MISMATCH', 'Cópia não está no marcador da origem.');
    // Mesma forma do apply hospedado (scripts/release-migrations.mjs): uma
    // transação do executor por arquivo, com advisory lock + marcador conferidos
    // nela, e o arquivo sem o próprio BEGIN/COMMIT (transactionBody).
    const atomic = (stage, expectedBefore, file) => exec(stage, 'psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-1'],
      { env: t, input: `${guardPrefix(expectedBefore)}\n-- ${file}\n${transactionBody(fs.readFileSync(path.join(root, file), 'utf8'), file)}\n` });
    const apply = () => { for (const m of planned.pending) { atomic('migrations', m.expectedBefore, m.file); if (marker() !== m.expectedAfter) stop('migrations', 'MIGRATION_MARKER_MISMATCH', `${m.file} não gravou ${m.expectedAfter}.`); } };
    apply(); checks.migrations_applied = 'PASS';
    psql('probes', ['-f', path.join(root, 'ops/sql/post-migration-probes.sql')]); checks.post_migration_probes = 'PASS';
    psql('canary', ['-f', path.join(root, 'ops/sql/pilot-isolation-canary.sql')]); checks.isolation_canary = 'PASS';
    for (const m of [...planned.pending].reverse()) { if (!fs.existsSync(path.join(root, m.rollback))) stop('rollback', 'ROLLBACK_MISSING', `${m.rollback} ausente.`); atomic('rollback', planned.pending.at(-1).expectedAfter, m.rollback); }
    // Os rollbacks versionados não regravam schema_version; só na cópia
    // descartável o marcador volta ao da origem, para a reaplicação passar pelo
    // mesmo guard (lock + marcador) do apply hospedado.
    if (!/^financial-[a-z0-9-]+$/.test(planned.schema_version)) stop('rollback', 'PLAN_INVALID', 'Marcador de origem inválido.');
    psql('rollback', ['-1', '-c', `update public.fin_settings set value = '${planned.schema_version}' where key = 'schema_version'`]);
    checks.rollback = 'PASS';
    apply();
    psql('probes', ['-f', path.join(root, 'ops/sql/post-migration-probes.sql')]); checks.reapply = 'PASS';
  } finally { target.close(); }
  const report = JSON.parse(fs.readFileSync(path.join(root, 'reports/backup-restore-verification.json'), 'utf8'));
  return { result: 'passed', generated_at: at.toISOString(), source_ref: DEMO_REF, source_schema: planned.schema_version,
    snapshot_sha256: gate.backup_sha256, snapshot_file: gate.backup_file, release_gate: gate,
    restore: { backup_sha256: report.backupSha256, generated_at: report.generatedAt }, bundle_sha256: planned.bundle_sha256,
    pending: planned.pending.map(({ file, sha256 }) => ({ file, sha256 })), checks,
    scope: { restored: 'public schema (data + constraints) with auth.users id placeholders', not_restored: 'Auth content, Storage binaries (see full recovery #365)' } };
}

/**
 * Preservação do estado não regenerável: age para o destinatário público
 * aprovado e envio a um destino PRIVADO aprovado, com releitura por hash.
 * Destino suportado sem custo novo: release de um repositório GitHub privado
 * do owner (ARANDU_DEMO_BACKUP_REPOSITORY + token com escopo só nele).
 */
export async function preserve({ exec, evidence, recipient, repository, token, fetchImpl = globalThis.fetch, workDir }) {
  if (!/^age1[0-9a-z]{58}$/.test(recipient || '') || !repository || !token) return { destination_approved: false, reason: 'PRESERVATION_DESTINATION_MISSING' };
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(repository) || repository.toLowerCase() === 'lucasweber1202/arandu') return { destination_approved: false, reason: 'PRESERVATION_DESTINATION_INVALID' };
  const api = (p, init = {}) => fetchImpl(`https://api.github.com${p}`, { ...init, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', ...(init.headers || {}) } });
  const repo = await (await api(`/repos/${repository}`)).json();
  if (repo?.private !== true) return { destination_approved: false, reason: 'PRESERVATION_DESTINATION_NOT_PRIVATE' };
  const cipher = path.join(workDir, 'snapshot.dump.age');
  exec('preserve', 'age', ['--encrypt', '--recipient', recipient, '--output', cipher, evidence.snapshot_file]);
  const bytes = fs.readFileSync(cipher);
  const sha = createHash('sha256').update(bytes).digest('hex');
  const tag = `demo-snapshot-${evidence.generated_at.replace(/[:.]/g, '-')}`;
  const release = await (await api(`/repos/${repository}/releases`, { method: 'POST', body: JSON.stringify({ tag_name: tag, name: tag, draft: true,
    body: `Arandu Demo snapshot ciphertext. plaintext sha256 ${evidence.snapshot_sha256}; ciphertext sha256 ${sha}. Decrypt only on the owner's trusted machine.` }) })).json();
  if (!release?.id) return { destination_approved: true, reason: 'PRESERVATION_UPLOAD_FAILED' };
  const asset = await (await fetchImpl(`https://uploads.github.com/repos/${repository}/releases/${release.id}/assets?name=snapshot.dump.age`, { method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' }, body: bytes })).json();
  const back = Buffer.from(await (await api(`/repos/${repository}/releases/assets/${asset.id}`, { headers: { Accept: 'application/octet-stream' } })).arrayBuffer());
  return { destination_approved: true, destination: `github-private-release:${repository}#${tag}`, plaintext_sha256: evidence.snapshot_sha256,
    ciphertext_sha256: sha, uploaded_sha256: createHash('sha256').update(back).digest('hex'), restore_verification: 'OWNER_MACHINE_DECRYPT_REQUIRED' };
}

async function main() {
  const [command = 'plan'] = process.argv.slice(2);
  if (process.argv.slice(3).some((a) => /postgres|eyJ|password|token/i.test(a))) { console.error('Recusado: segredos nunca por argumento.'); return 2; }
  const url = String(process.env.ARANDU_DEMO_DATABASE_URL || '');
  const secrets = [url, process.env.ARANDU_DEMO_BACKUP_TOKEN || ''];
  try { secrets.push(new URL(url).password); } catch { /* validado abaixo */ }
  const exec = makeExec({ cwd: root, secrets });
  const out = path.join(root, 'reports'); fs.mkdirSync(out, { recursive: true });
  const report = { classification: 'demo_remote_release', command, started_at: new Date().toISOString(), run: process.env.GITHUB_RUN_ID || null, sha: process.env.GITHUB_SHA || null };
  const workDir = path.join(process.env.RUNNER_TEMP || path.join(root, '..', '.arandu-demo-release'), `demo-release-${randomBytes(6).toString('hex')}`);
  const write = () => fs.writeFileSync(path.join(out, 'demo-release.json'), sanitize(JSON.stringify(report, null, 2), secrets) + '\n', { mode: 0o600 });
  try {
    if (process.env.ARANDU_ENV !== 'demo') stop('identity', 'FULL_RECOVERY_REQUIRED', 'ARANDU_ENV não é demo: este fluxo não se aplica.');
    if (!validateSourceUrl(url).ok) stop('identity', 'SOURCE_NOT_DEMO', 'Conexão não corresponde ao Supabase Demo (host, usuário, porta 5432, parâmetros).');
    for (const name of ['ARANDU_PRODUCTION_DATABASE_URL', 'ARANDU_STAGING_DATABASE_URL', 'SUPABASE_PRODUCTION_SERVICE_ROLE_KEY']) if (process.env[name]) stop('identity', 'PRODUCTION_CREDENTIAL_PRESENT', `${name} presente: o release da Demo não roda com credencial de outro ambiente.`);
    const sourceEnv = pgEnv(url);
    const planned = plan({ exec, sourceEnv, declaredEnvironment: 'demo', connectionRef: DEMO_REF });
    report.plan = { path: planned.path, schema_version: planned.schema_version, classification: planned.classification, non_regenerable: planned.non_regenerable,
      pending: planned.pending.map(({ file, sha256 }) => ({ file, sha256 })), bundle_sha256: planned.bundle_sha256, inventory: planned.inventory };
    if (command === 'plan') { report.result = 'planned'; write(); console.log(JSON.stringify(report.plan, null, 2)); return 0; }
    if (!['rehearse', 'apply'].includes(command)) stop('usage', 'USAGE', 'Comando inválido.');
    // Concorrência (auditoria pós-#367): no apply o lease do pool é tomado ANTES
    // do snapshot e mantido até o fim. maintain/cleanup ficam bloqueados entre
    // snapshot, decisão e apply; claims de visitante (que não usam o lease) são
    // vistos pela decisão, que relê o inventário imediatamente antes de aplicar.
    const holder = `release-${(process.env.GITHUB_RUN_ID || randomBytes(4).toString('hex')).toLowerCase()}`.slice(0, 64);
    const lease = command === 'apply' && exec('lock', 'psql', ['-XAtc', `select public.fin_demo_pool_lease('${holder}', 3600)`], { env: sourceEnv }).stdout.trim() === 't';
    if (command === 'apply' && !lease) stop('lock', 'LOCK_NOT_HELD', 'Lease do pool está com outro controlador ou release: nada foi lido nem aplicado.');
    try {
      const evidence = rehearse({ exec, sourceEnv, planned, workDir });
      report.rehearsal = { ...evidence, snapshot_file: undefined, release_gate: { ...evidence.release_gate, backup_file: undefined } };
      if (command === 'rehearse') { report.result = 'rehearsed'; write(); console.log(JSON.stringify({ result: report.result, checks: evidence.checks, snapshot_sha256: evidence.snapshot_sha256 })); return 0; }
      const current = plan({ exec, sourceEnv, declaredEnvironment: 'demo', connectionRef: DEMO_REF }).inventory;
      const preservation = nonRegenerableState(current).present
        ? await preserve({ exec, evidence, recipient: process.env.ARANDU_DEMO_BACKUP_RECIPIENT, repository: process.env.ARANDU_DEMO_BACKUP_REPOSITORY, token: process.env.ARANDU_DEMO_BACKUP_TOKEN, workDir })
        : { destination_approved: false, reason: 'NOT_REQUIRED' };
      report.preservation = preservation;
      const decision = decideDemoRelease({ declaredEnvironment: 'demo', connectionRef: DEMO_REF, inventory: plan({ exec, sourceEnv, declaredEnvironment: 'demo', connectionRef: DEMO_REF }).inventory,
        evidence, preservation, lock: { held: lease, holder_matches: lease }, authorization: process.env.ARANDU_RELEASE_AUTHORIZATION });
      report.decision = decision;
      if (!decision.go) stop('decision', decision.nogo[0].code, decision.nogo.map((n) => `${n.code}: ${n.message}`).join(' | '));
      exec('apply', process.execPath, [path.join(root, 'scripts/release-migrations.mjs'), '--environment=demo', '--flow=existingDatabase', `--after-schema=${planned.schema_version}`,
        '--operator=demo-release-workflow', `--backup-reference=${evidence.release_gate.backup_reference}`, `--restore-reference=${evidence.release_gate.restore_reference}`,
        '--restore-evidence=reports/backup-restore-verification.json', '--confirm-demo=ARANDU-DEMO', '--apply'],
        { env: { ARANDU_ENV: 'demo', ARANDU_DEMO_CONFIRM: DEMO_REF, ARANDU_DATABASE_URL: url, ARANDU_DEMO_DATABASE_URL: url, ARANDU_BACKUP_PATH: evidence.snapshot_file } });
      exec('verify', 'psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', path.join(root, 'ops/sql/post-migration-probes.sql')], { env: sourceEnv });
      report.result = 'applied';
    } finally {
      if (lease) exec('lock', 'psql', ['-XAtc', `select public.fin_demo_pool_release('${holder}')`], { env: sourceEnv, allowFail: true });
    }
    write(); console.log(JSON.stringify({ result: report.result })); return 0;
  } catch (error) {
    if (!(error instanceof OrchestratorStop)) throw error;
    report.result = 'blocked'; report.blocked = { stage: error.stage, code: error.code, message: sanitize(error.message, secrets) };
    write(); console.error(`BLOQUEADO (${error.code}): ${sanitize(error.message, secrets)}`); return 1;
  } finally { fs.rmSync(workDir, { recursive: true, force: true }); }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url))) {
  try { process.exitCode = await main(); } catch (error) { console.error(`Falha inesperada: ${sanitize(error.message)}`); process.exitCode = 1; }
}
