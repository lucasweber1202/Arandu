#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { inspectBackupArtifact, schemaFingerprint, validOperationalReference } from '../lib/backup-evidence.mjs';

const args = new Map(process.argv.slice(2).map((item) => { const [key, ...rest] = item.split('='); return [key, rest.join('=') || true]; }));
const root = process.cwd();
const backupFile = path.resolve(String(args.get('--backup-file') || ''));
const backupReference = String(args.get('--backup-reference') || '');
const restoreReference = String(args.get('--restore-reference') || '');
const operator = String(args.get('--operator') || '').trim();
let expectedSchema = String(args.get('--expected-schema-sha256') || '').toLowerCase();
const compareSourceSchema = args.has('--compare-source-schema');
const restoreBackup = args.has('--restore-backup');
const backupScope = String(args.get('--scope') || '');
const maxAgeHours = Number(args.get('--max-age-hours') || 48);
const confirmation = String(args.get('--confirm') || '');
const restoredUrl = String(process.env.ARANDU_RESTORE_DATABASE_URL || '');
const stagingUrl = String(process.env.ARANDU_STAGING_DATABASE_URL || '');
const productionUrl = String(process.env.ARANDU_PRODUCTION_DATABASE_URL || '');
const reportPath = path.join(root, 'reports/backup-restore-verification.json');
const report = { classification: 'restore_verification', generatedAt: new Date().toISOString(), operator: operator || null, backupReference: backupReference || null, restoreReference: restoreReference || null, backupScope: backupScope || null, environment: 'disposable_restore', result: 'failed', checks: [] };
const write = () => { fs.mkdirSync(path.dirname(reportPath), { recursive: true }); fs.writeFileSync(reportPath, JSON.stringify(report, null, 2)); };
const fail = (message) => { report.checks.push({ name: 'blocked', ok: false, detail: message }); write(); console.error(`BLOQUEADO: ${message}`); process.exit(1); };
const redact = (value) => [restoredUrl, stagingUrl, productionUrl].filter(Boolean).reduce((text, secret) => text.replaceAll(secret, '[DATABASE_URL]'), String(value || ''));
const run = (binary, commandArgs) => { const result = spawnSync(binary, commandArgs, { cwd: root, encoding: 'utf8' }); if (result.error || result.status !== 0) throw new Error(redact(result.stderr || result.error?.message || 'falha operacional').slice(-1000)); return String(result.stdout || ''); };
const databaseIdentity = (value) => {
  try {
    const url = new URL(value);
    return `${url.hostname.toLowerCase()}:${url.port || '5432'}${url.pathname}`;
  } catch { return null; }
};

if (confirmation !== 'ARANDU-RESTORE-VERIFY') fail('Use --confirm=ARANDU-RESTORE-VERIFY.');
if (operator.length < 3 || operator.includes('@')) fail('Informe um papel operacional sem PII.');
if (!validOperationalReference(backupReference)) fail('Referência verificável de backup é obrigatória.');
if (!validOperationalReference(restoreReference)) fail('Referência verificável de restore é obrigatória.');
if (!restoreBackup) fail('Use --restore-backup para executar a restauração, não apenas inspecionar um banco existente.');
if (backupScope !== 'public_schema') fail('Use --scope=public_schema; outros escopos exigem ambiente Supabase descartável equivalente.');
if (!restoredUrl || !databaseIdentity(restoredUrl)) fail('ARANDU_RESTORE_DATABASE_URL inválida ou ausente.');
if (databaseIdentity(restoredUrl) === databaseIdentity(stagingUrl) || databaseIdentity(restoredUrl) === databaseIdentity(productionUrl)) {
  fail('Use um banco restaurado descartável distinto de staging e produção.');
}
if (compareSourceSchema && !stagingUrl) fail('--compare-source-schema exige ARANDU_STAGING_DATABASE_URL.');
if (!compareSourceSchema && !/^[a-f0-9]{64}$/.test(expectedSchema)) fail('Informe --expected-schema-sha256 ou --compare-source-schema.');
const relative = path.relative(root, backupFile);
if (!path.isAbsolute(backupFile) || (!relative.startsWith('..') && !path.isAbsolute(relative))) fail('Backup deve ficar fora do repositório.');
let backupStat;
try { backupStat = fs.statSync(backupFile); } catch { fail('Artefato de backup não encontrado.'); }
const inspection = inspectBackupArtifact({ stat: backupStat, reference: backupReference, maxAgeHours });
report.checks.push({ name: 'backup-artifact', ok: inspection.ok, detail: { ageHours: Number(inspection.ageHours.toFixed(2)), maxAgeHours } });
if (!inspection.ok) fail(inspection.problems.join(' '));

try {
  const backupList = run('pg_restore', ['--list', backupFile]);
  if (/\s(?:SCHEMA -|TABLE|TABLE DATA|SEQUENCE|FUNCTION|PROCEDURE)\s+(?:auth|storage|vault|realtime|extensions)\b/i.test(backupList)) {
    fail('O backup contém schemas Supabase internos e não pode ser restaurado no PostgreSQL descartável genérico.');
  }
  report.checks.push({ name: 'backup-readable', ok: true });
  if (compareSourceSchema) {
    const sourceSchema = run('pg_dump', [stagingUrl, '--schema=public', '--schema-only', '--no-owner', '--no-acl']);
    expectedSchema = schemaFingerprint(sourceSchema);
    report.checks.push({ name: 'source-schema-fingerprint', ok: true, detail: { schemaSha256: expectedSchema } });
  }
  run('pg_restore', [
    '--clean', '--if-exists', '--no-owner', '--no-acl', '--exit-on-error', '--single-transaction',
    '--dbname', restoredUrl, backupFile
  ]);
  report.checks.push({ name: 'restore-executed', ok: true });
  const schema = run('pg_dump', [restoredUrl, '--schema=public', '--schema-only', '--no-owner', '--no-acl']);
  const schemaSha256 = schemaFingerprint(schema);
  report.checks.push({ name: 'schema-fingerprint', ok: schemaSha256 === expectedSchema, detail: { schemaSha256, expectedSchemaSha256: expectedSchema } });
  if (schemaSha256 !== expectedSchema) fail('Schema restaurado diverge do fingerprint esperado.');
  run('psql', [restoredUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-f', path.join(root, 'ops/sql/post-restore-probes.sql')]);
  report.checks.push({ name: 'post-restore-probes', ok: true });
  report.backupSha256 = createHash('sha256').update(fs.readFileSync(backupFile)).digest('hex');
  report.schemaSha256 = schemaSha256;
  report.result = 'passed';
  write();
  console.log(`Restore verificado. Relatório: ${path.relative(root, reportPath)}`);
} catch (error) { fail(error.message || String(error)); }
