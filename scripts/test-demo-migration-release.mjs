import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
console.log('Demo release guards: somente migrations pendentes, banco Demo, marker real e backup obrigatório.');
