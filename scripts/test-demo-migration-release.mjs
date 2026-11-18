import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { join, delimiter } from 'node:path';

const marker = 'financial-contract-email-links-1';
const demoRef = 'offgpyysgdhfemjlchod';
const demoUrl = 'postgresql://postgres@db.' + demoRef + '.supabase.co:5432/postgres';
const flags = ['--flow=existingDatabase', '--environment=demo', '--after-schema=' + marker];
const cleanEnv = { ...process.env, ARANDU_ENV: 'demo', ARANDU_DATABASE_URL: '',
  ARANDU_DEMO_DATABASE_URL: '', ARANDU_DEMO_CONFIRM: '', ARANDU_BACKUP_PATH: '' };

function run(args, extraEnv = {}) {
  return spawnSync(process.execPath, ['scripts/release-migrations.mjs', ...args], {
    cwd: process.cwd(), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
    env: { ...cleanEnv, ...extraEnv }
  });
}
function blocked(args, message, extraEnv) {
  const result = run(args, extraEnv);
  assert.notEqual(result.status, 0, 'Unsafe migration command unexpectedly succeeded');
  assert.match(result.stderr, message);
}
const dry = run([...flags, '--dry-run']);
assert.equal(dry.status, 0, dry.stderr);
const report = JSON.parse(readFileSync('reports/migration-release-report.json', 'utf8'));
assert.equal(report.status, 'planned');
assert.equal(report.afterSchema, marker);
assert.deepEqual(report.steps.find(s => s.name === 'canonical-order').detail.map(s => s.file),
  ['docs/supabase-financial-arandu-10.sql']);
assert.match(dry.stdout, /Nenhuma conexão foi aberta/);

blocked(['--environment=demo', '--dry-run'], /--after-schema/);
blocked(['--environment=demo', '--flow=cleanInstall', '--after-schema=' + marker, '--dry-run'], /existingDatabase/);
blocked([...flags, '--dry-run', '--apply'], /não podem ser combinados/);
blocked(['--environment=demo', '--flow=existingDatabase', '--after-schema=financial-not-a-marker', '--dry-run'], /desconhecido|ambíguo/);
blocked(['--environment=demo', '--flow=existingDatabase', '--after-schema=financial-arandu-10-1', '--dry-run'], /Nenhuma migration pendente/);

const preflight = [...flags, '--operator=demo-release', '--backup-reference=BACKUP-20261118-A',
  '--confirm-demo=ARANDU-DEMO'];
blocked(preflight, /ARANDU_DEMO_CONFIRM/);
blocked(preflight, /Conexão PostgreSQL/, { ARANDU_DEMO_CONFIRM: demoRef });
blocked(preflight, /Conexão PostgreSQL/, { ARANDU_DEMO_CONFIRM: demoRef,
  ARANDU_DATABASE_URL: 'postgresql://postgres@db.igacnfjeuqhxcmfyepgj.supabase.co:5432/postgres',
  ARANDU_DEMO_DATABASE_URL: 'postgresql://postgres@db.igacnfjeuqhxcmfyepgj.supabase.co:5432/postgres' });
blocked(preflight, /ARANDU_ENV/, { ARANDU_ENV: 'production', ARANDU_DEMO_CONFIRM: demoRef,
  ARANDU_DATABASE_URL: demoUrl, ARANDU_DEMO_DATABASE_URL: demoUrl });

for (const url of [
  demoUrl + '?host=db.' + 'igacnfjeuqhxcmfyepgj' + '.supabase.co',
  demoUrl + '?hostaddr=10.0.0.1',
  demoUrl + '?service=prod',
  'postgresql://postgres@db.' + demoRef + '.supabase.co:6543/postgres',
  'postgresql://postgres@db.' + demoRef + '.supabase.co:5432/template1',
  'postgresql://postgres@db.' + demoRef + '.supabase.co.evil.example:5432/postgres',
  'postgresql://postgres.igacnfjeuqhxcmfyepgj@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
  'mysql://postgres@db.' + demoRef + '.supabase.co:5432/postgres'
]) {
  blocked(preflight, /Conexão PostgreSQL/, { ARANDU_DEMO_CONFIRM: demoRef, ARANDU_DATABASE_URL: url, ARANDU_DEMO_DATABASE_URL: url });
}
blocked(preflight, /contraditórias/, { ARANDU_DEMO_CONFIRM: demoRef, ARANDU_DATABASE_URL: demoUrl,
  ARANDU_DEMO_DATABASE_URL: demoUrl, ARANDU_PRODUCTION_DATABASE_URL: demoUrl });
blocked([...flags, '--operator=demo-release', '--backup-reference=BACKUP-20261118-A'], /confirm-demo/,
  { ARANDU_DEMO_CONFIRM: demoRef, ARANDU_DATABASE_URL: demoUrl, ARANDU_DEMO_DATABASE_URL: demoUrl });
blocked([...flags, '--confirm-demo=ARANDU-DEMO', '--backup-reference=BACKUP-20261118-A'], /--operator/);
blocked([...flags, '--confirm-demo=ARANDU-DEMO', '--operator=demo-release', '--backup-reference=ok'], /backup-reference/);

if (process.platform !== 'win32') {
  const directory = mkdtempSync(join(tmpdir(), 'arandu-migration-guard-'));
  try {
    const stub = join(directory, 'psql');
    const env = { ARANDU_DEMO_CONFIRM: demoRef, ARANDU_DATABASE_URL: demoUrl,
      ARANDU_DEMO_DATABASE_URL: demoUrl, PATH: directory + delimiter + process.env.PATH };
    writeFileSync(stub, '#!/bin/sh\nprintf "financial-unexpected-marker\\n"\n');
    chmodSync(stub, 0o700);
    blocked(preflight, /Marcador real do banco não coincide/, env);
    writeFileSync(stub, '#!/bin/sh\nprintf "financial-contract-email-links-1\\n"\n');
    chmodSync(stub, 0o700);
    const readOnly = run(preflight, env);
    assert.equal(readOnly.status, 0, readOnly.stderr);
    const result = JSON.parse(readFileSync('reports/migration-release-report.json', 'utf8'));
    assert.equal(result.status, 'preflight_passed');
    assert.equal(result.schemaVersion, marker);
    blocked([...preflight, '--apply', '--restore-reference=RESTORE-20261118-A'],
      /ARANDU_BACKUP_PATH/, env);

    // PG* do operador não podem chegar ao psql: o stub falha se herdar PGHOST.
    writeFileSync(stub, '#!/bin/sh\nif env | grep -q "^PG"; then echo "PG env vazou" >&2; exit 9; fi\nprintf "financial-contract-email-links-1\\n"\n');
    chmodSync(stub, 0o700);
    const leaked = run(preflight, { ...env, PGHOST: 'db.igacnfjeuqhxcmfyepgj.supabase.co', PGSERVICE: 'prod', PGOPTIONS: '-c x=y' });
    assert.equal(leaked.status, 0, leaked.stderr);

    // Apply completo com backup/restore válidos e psql simulado: falha SQL no
    // meio e marcador divergente após aplicação nunca viram sucesso.
    const backup = join(directory, 'backup.dump');
    writeFileSync(backup, Buffer.alloc(4096, 7));
    const backupSha = createHash('sha256').update(readFileSync(backup)).digest('hex');
    const evidence = join(directory, 'restore.json');
    const checks = ['backup-artifact', 'backup-readable', 'restore-executed', 'schema-fingerprint', 'post-restore-probes']
      .map((name) => ({ name, ok: true }));
    const goodEvidence = { classification: 'restore_verification', environment: 'disposable_restore', backupScope: 'public_schema',
      result: 'passed', generatedAt: new Date().toISOString(), backupReference: 'BACKUP-20261118-A',
      restoreReference: 'RESTORE-20261118-A', backupSha256: backupSha, checks };
    const applyArgs = [...preflight, '--apply', '--restore-reference=RESTORE-20261118-A', '--restore-evidence=' + evidence];
    const applyEnv = { ...env, ARANDU_BACKUP_PATH: backup };
    const log = join(directory, 'psql.log');
    // Stub: preflight devolve o marcador; apply grava stdin e falha/sucede.
    const stubScript = (applyExit, after) => '#!/bin/sh\n'
      + 'case "$*" in *"-1"*) cat > "' + log + '"; exit ' + applyExit + ';; esac\n'
      + 'if [ -f "' + log + '" ]; then printf "' + after + '\\n"; else printf "financial-contract-email-links-1\\n"; fi\n';

    writeFileSync(evidence, JSON.stringify({ ...goodEvidence, backupSha256: 'f'.repeat(64) }));
    writeFileSync(stub, stubScript(0, 'financial-arandu-10-1')); chmodSync(stub, 0o700);
    blocked(applyArgs, /Hash do backup/, applyEnv);
    writeFileSync(evidence, JSON.stringify({ ...goodEvidence, restoreReference: 'RESTORE-OTHER-0001' }));
    blocked(applyArgs, /Referência de restore/, applyEnv);
    writeFileSync(evidence, JSON.stringify({ ...goodEvidence, generatedAt: new Date(Date.now() - 7 * 3600000).toISOString() }));
    blocked(applyArgs, /janela/, applyEnv);
    writeFileSync(evidence, JSON.stringify({ ...goodEvidence, checks: checks.slice(0, 2) }));
    blocked(applyArgs, /restore-executed/, applyEnv);
    writeFileSync(evidence, JSON.stringify(goodEvidence));
    blocked(applyArgs, /fora do repositório/, { ...applyEnv, ARANDU_BACKUP_PATH: join(process.cwd(), 'package.json') });

    rmSync(log, { force: true });
    writeFileSync(stub, stubScript(3, 'financial-contract-email-links-1')); chmodSync(stub, 0o700);
    blocked(applyArgs, /falhou e foi revertida/, applyEnv);
    let failed = JSON.parse(readFileSync('reports/migration-release-report.json', 'utf8'));
    assert.equal(failed.status, 'blocked');
    assert.ok(!failed.steps.some((step) => step.name === 'apply' && step.ok === true));
    const sent = readFileSync(log, 'utf8');
    assert.match(sent, /pg_advisory_xact_lock/);
    assert.match(sent, /<> 'financial-contract-email-links-1'/);
    assert.ok(sent.indexOf('arandu-release-guard') < sent.indexOf('-- docs/supabase-financial-arandu-10.sql'));
    assert.equal((sent.match(/^-- docs\/supabase-financial-/gm) || []).length, 1, 'histórico não pode ser reaplicado');

    rmSync(log, { force: true });
    writeFileSync(stub, stubScript(0, 'financial-unexpected-marker')); chmodSync(stub, 0o700);
    blocked(applyArgs, /Marcador final não corresponde/, applyEnv);
    failed = JSON.parse(readFileSync('reports/migration-release-report.json', 'utf8'));
    assert.notEqual(failed.status, 'applied_and_probed');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
console.log('Demo release guards: somente migrations pendentes, banco Demo, marker real e backup obrigatório.');
