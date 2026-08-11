#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { inspectBackupArtifact, validOperationalReference } from '../lib/backup-evidence.mjs';

const args = new Map(process.argv.slice(2).map((item) => { const [key, ...rest] = item.split('='); return [key, rest.join('=') || true]; }));
const root = process.cwd();
const backupFile = path.resolve(String(args.get('--backup-file') || ''));
const backupReference = String(args.get('--backup-reference') || '');
const restoreReference = String(args.get('--restore-reference') || '');
const operator = String(args.get('--operator') || '').trim();
const expectedSchema = String(args.get('--expected-schema-sha256') || '').toLowerCase();
const maxAgeHours = Number(args.get('--max-age-hours') || 48);
const confirmation = String(args.get('--confirm') || '');
const restoredUrl = String(process.env.ARANDU_RESTORE_DATABASE_URL || '');
const stagingUrl = String(process.env.ARANDU_STAGING_DATABASE_URL || '');
const reportPath = path.join(root, 'reports/backup-restore-verification.json');
const report = { classification: 'restore_verification', generatedAt: new Date().toISOString(), operator: operator || null, backupReference: backupReference || null, restoreReference: restoreReference || null, environment: 'disposable_restore', result: 'failed', checks: [] };
const write = () => { fs.mkdirSync(path.dirname(reportPath), { recursive: true }); fs.writeFileSync(reportPath, JSON.stringify(report, null, 2)); };
const fail = (message) => { report.checks.push({ name: 'blocked', ok: false, detail: message }); write(); console.error(`BLOQUEADO: ${message}`); process.exit(1); };
const run = (binary, commandArgs) => { const result = spawnSync(binary, commandArgs, { cwd: root, encoding: 'utf8' }); if (result.error || result.status !== 0) throw new Error(String(result.stderr || result.error?.message || 'falha operacional').replaceAll(restoredUrl, '[RESTORE_DATABASE_URL]').slice(-1000)); return String(result.stdout || ''); };

if (confirmation !== 'ARANDU-RESTORE-VERIFY') fail('Use --confirm=ARANDU-RESTORE-VERIFY.');
if (operator.length < 3 || operator.includes('@')) fail('Informe um papel operacional sem PII.');
if (!validOperationalReference(restoreReference)) fail('Referência verificável de restore é obrigatória.');
if (!/^[a-f0-9]{64}$/.test(expectedSchema)) fail('Informe --expected-schema-sha256 com o fingerprint esperado.');
if (!restoredUrl || restoredUrl === stagingUrl) fail('Use um banco restaurado descartável distinto de staging.');
const relative = path.relative(root, backupFile);
if (!path.isAbsolute(backupFile) || (!relative.startsWith('..') && !path.isAbsolute(relative))) fail('Backup deve ficar fora do repositório.');
let backupStat;
try { backupStat = fs.statSync(backupFile); } catch { fail('Artefato de backup não encontrado.'); }
const inspection = inspectBackupArtifact({ stat: backupStat, reference: backupReference, maxAgeHours });
report.checks.push({ name: 'backup-artifact', ok: inspection.ok, detail: { ageHours: Number(inspection.ageHours.toFixed(2)), maxAgeHours } });
if (!inspection.ok) fail(inspection.problems.join(' '));

try {
  run('pg_restore', ['--list', backupFile]);
  report.checks.push({ name: 'backup-readable', ok: true });
  const schema = run('pg_dump', [restoredUrl, '--schema-only', '--no-owner', '--no-acl']);
  const schemaSha256 = createHash('sha256').update(schema).digest('hex');
  report.checks.push({ name: 'schema-fingerprint', ok: schemaSha256 === expectedSchema, detail: { schemaSha256, expectedSchemaSha256: expectedSchema } });
  if (schemaSha256 !== expectedSchema) fail('Schema restaurado diverge do fingerprint esperado.');
  run('psql', [restoredUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-f', path.join(root, 'ops/sql/post-migration-probes.sql')]);
  report.checks.push({ name: 'post-restore-probes', ok: true });
  report.backupSha256 = createHash('sha256').update(fs.readFileSync(backupFile)).digest('hex');
  report.result = 'passed';
  write();
  console.log(`Restore verificado. Relatório: ${path.relative(root, reportPath)}`);
} catch (error) { fail(error.message || String(error)); }
