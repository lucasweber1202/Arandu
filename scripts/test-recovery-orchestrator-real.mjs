// Prova REAL (Docker + PostgreSQL 17 Supabase + clientes 17) da cadeia do gate de
// release montada pelo orquestrador: origem descartável com o schema canônico
// completo e dados sintéticos -> pg_dump public -> verify-backup-restore em outro
// PostgreSQL 17 descartável -> as MESMAS inspeções que release-migrations --apply
// faz (inspectBackupArtifact + inspectRestoreEvidence), com negativos.
// Nada hospedado é tocado. Requer docker e pg_dump/pg_restore/psql 17 no PATH.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { makeExec, disposablePostgres, releaseGateChain, OrchestratorStop } from './recovery/orchestrate.mjs';
import { inspectBackupArtifact, inspectRestoreEvidence } from '../lib/backup-evidence.mjs';

const root = process.cwd();
const logLines = [];
const exec = makeExec({ cwd: root, log: (l) => logLines.push(l) });
const base = fs.mkdtempSync(path.join(os.homedir(), '.arandu-orch-real-'));
const store = path.join(base, 'store'); fs.mkdirSync(store, { mode: 0o700 });
const containers = [];
const pg = (e, o) => { const c = disposablePostgres(e, o); containers.push(c); return c; };
const env = (url) => { const u = new URL(url); return { PGHOST: u.hostname, PGPORT: u.port, PGUSER: u.username, PGPASSWORD: u.password, PGDATABASE: 'postgres', PGSSLMODE: 'disable' }; };
try {
  const source = pg(exec, { label: 'source' });
  const manifest = JSON.parse(fs.readFileSync('docs/supabase-migrations.json', 'utf8')).cleanInstall;
  for (const file of manifest) exec('source-schema', 'psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', file], { env: env(source.url) });
  exec('source-data', 'psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-c', `
    insert into auth.users(id, email) values ('00000000-0000-4000-8000-00000000d001', 'synthetic@example.invalid');
    insert into public.fin_organizations(id, legal_name, kind, created_by) values ('00000000-0000-4000-8000-00000000d101', 'Synthetic Buyer', 'BUYER', '00000000-0000-4000-8000-00000000d001');`], { env: env(source.url) });
  const schema = exec('source', 'psql', ['-XAtc', "select value from public.fin_settings where key='schema_version'"], { env: env(source.url) }).stdout.trim();
  assert.match(schema, /^financial-/);

  const at = new Date();
  const gate = releaseGateChain({ exec, sourceEnv: env(source.url), store, root, schema, postgres: pg, at, dryRun: false });
  // As inspeções exatas do --apply (scripts/release-migrations.mjs).
  const stat = fs.statSync(gate.backup_file);
  assert.equal(stat.mode & 0o777, 0o600);
  assert(!path.relative(root, gate.backup_file).match(/^[^.]/), 'backup fora do repositório');
  assert.equal(inspectBackupArtifact({ stat, reference: gate.backup_reference, maxAgeHours: 6 }).ok, true);
  const sha = createHash('sha256').update(fs.readFileSync(gate.backup_file)).digest('hex');
  const report = JSON.parse(fs.readFileSync('reports/backup-restore-verification.json', 'utf8'));
  const ok = inspectRestoreEvidence({ report, backupReference: gate.backup_reference, restoreReference: gate.restore_reference, backupSha256: sha, maxAgeHours: 6 });
  assert.equal(ok.ok, true, ok.problems.join(' '));
  // Negativos: backup adulterado, referência trocada, evidência vencida.
  const tampered = createHash('sha256').update(Buffer.concat([fs.readFileSync(gate.backup_file), Buffer.from('x')])).digest('hex');
  assert.equal(inspectRestoreEvidence({ report, backupReference: gate.backup_reference, restoreReference: gate.restore_reference, backupSha256: tampered, maxAgeHours: 6 }).ok, false);
  assert.equal(inspectRestoreEvidence({ report, backupReference: 'demo-public-backup-other-0000', restoreReference: gate.restore_reference, backupSha256: sha, maxAgeHours: 6 }).ok, false);
  assert.equal(inspectRestoreEvidence({ report, backupReference: gate.backup_reference, restoreReference: gate.restore_reference, backupSha256: sha, maxAgeHours: 6, now: Date.now() + 7 * 3600000 }).ok, false);
  // Falha real de restauração: dump truncado é recusado pelo verify canônico e a cadeia para.
  const broken = path.join(store, 'release-gate', 'broken.dump');
  fs.writeFileSync(broken, fs.readFileSync(gate.backup_file).subarray(0, 4096), { mode: 0o600 });
  const target = pg(exec, { label: 'broken' });
  await assert.rejects(async () => exec('release-restore', process.execPath, ['scripts/verify-backup-restore.mjs', `--backup-file=${broken}`, `--backup-reference=${gate.backup_reference}`,
    `--restore-reference=${gate.restore_reference}`, '--operator=demo-recovery-operator', `--expected-schema-sha256=${'0'.repeat(64)}`, '--restore-backup', '--scope=public_schema',
    '--confirm=ARANDU-RESTORE-VERIFY'], { env: { ARANDU_RESTORE_DATABASE_URL: target.url } }), (e) => e instanceof OrchestratorStop && e.stage === 'release-restore');
  assert(!logLines.join('\n').includes(new URL(source.url).password), 'senha do alvo descartável fora dos logs');
  console.log(`Recovery orchestrator (real): schema ${schema}; backup public ${(stat.size / 1024).toFixed(0)} KiB sha256 ${sha.slice(0, 12)}…; restore descartável PostgreSQL 17 PASS; evidência aceita pelas inspeções do --apply; adulteração, referência trocada, evidência vencida e dump truncado recusados.`);
} finally {
  for (const c of containers) c.close();
  fs.rmSync(base, { recursive: true, force: true });
}
