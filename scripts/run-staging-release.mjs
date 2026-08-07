#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { databaseFingerprint } from './database-fingerprint.mjs';

const args = new Map(process.argv.slice(2).map((argument) => {
  const [key, ...rest] = argument.split('=');
  return [key, rest.join('=') || true];
}));

const flow = String(args.get('--flow') || 'existingDatabase');
const operator = String(args.get('--operator') || '').trim();
const backupReference = String(args.get('--backup-reference') || process.env.ARANDU_STAGING_BACKUP_REFERENCE || '').trim();
const restoreReference = String(args.get('--restore-reference') || process.env.ARANDU_STAGING_RESTORE_REFERENCE || '').trim();
const confirmation = String(args.get('--confirm') || '').trim();
const stagingDatabaseUrl = String(process.env.ARANDU_STAGING_DATABASE_URL || '').trim();
const expectedFingerprint = String(process.env.ARANDU_STAGING_DATABASE_FINGERPRINT || '').trim();
const expectedProjectRef = String(process.env.ARANDU_STAGING_PROJECT_REF || '').trim().toLowerCase();
const stagingSupabaseUrl = String(process.env.SUPABASE_URL || '').trim();

function validReference(value) {
  return value.length >= 8 && !/^(?:feito|ok|sim|yes|done|true|pronto|decision_required)$/i.test(value);
}

function fail(message) {
  console.error(`BLOQUEADO: ${message}`);
  process.exit(1);
}

function verifySupabaseProjectRef() {
  if (!expectedProjectRef || !/^[a-z0-9-]{6,80}$/.test(expectedProjectRef)) {
    fail('ARANDU_STAGING_PROJECT_REF ausente ou inválido.');
  }
  let url;
  try {
    url = new URL(stagingSupabaseUrl);
  } catch {
    fail('SUPABASE_URL de staging inválida.');
  }
  if (url.protocol !== 'https:') fail('SUPABASE_URL de staging precisa usar HTTPS.');
  const observedRef = url.hostname.toLowerCase().split('.')[0];
  if (observedRef !== expectedProjectRef) {
    fail('O project ref observado não corresponde ao staging esperado.');
  }
}

if (!['existingDatabase', 'cleanInstall'].includes(flow)) fail('Fluxo de migration inválido.');
if (confirmation !== 'ARANDU-STAGING') fail('Execução real exige --confirm=ARANDU-STAGING.');
if (!operator || operator.length < 3) fail('Informe --operator com um papel operacional sem PII.');
if (!validReference(backupReference)) fail('Referência verificável de backup é obrigatória.');
if (!validReference(restoreReference)) fail('Referência verificável de restore testado é obrigatória.');
if (!stagingDatabaseUrl) fail('ARANDU_STAGING_DATABASE_URL não configurada.');
if (!/^sha256:[0-9a-f]{64}$/i.test(expectedFingerprint)) fail('ARANDU_STAGING_DATABASE_FINGERPRINT inválido ou ausente.');

const observedFingerprint = databaseFingerprint(stagingDatabaseUrl);
if (observedFingerprint.toLowerCase() !== expectedFingerprint.toLowerCase()) {
  fail('Fingerprint do banco não corresponde ao ambiente de staging autorizado.');
}
verifySupabaseProjectRef();

const root = process.cwd();
const reportPath = path.join(root, 'reports', 'staging-release-execution.json');
const env = {
  ...process.env,
  ARANDU_DATABASE_URL: stagingDatabaseUrl
};

function run(commandArgs) {
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', commandArgs, {
    cwd: root,
    env,
    encoding: 'utf8',
    stdio: 'inherit'
  });
  if (result.error || result.status !== 0) {
    fail(`Falha em npm ${commandArgs.join(' ')}.`);
  }
}

run([
  'run', 'migrations:release', '--',
  `--flow=${flow}`,
  '--environment=staging',
  `--operator=${operator}`,
  `--backup-reference=${backupReference}`
]);

run([
  'run', 'migrations:release', '--',
  '--apply',
  `--flow=${flow}`,
  '--environment=staging',
  `--operator=${operator}`,
  `--backup-reference=${backupReference}`
]);

const migrationReportFile = path.join(root, 'reports', 'migration-release-report.json');
const migrationReport = JSON.parse(fs.readFileSync(migrationReportFile, 'utf8'));
if (migrationReport.status !== 'applied_and_probed') {
  fail('Migration não terminou em applied_and_probed.');
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
const evidence = {
  classification: 'staging_execution_candidate',
  generatedAt: new Date().toISOString(),
  flow,
  operator,
  backupReference,
  restoreReference,
  databaseIdentityVerified: true,
  projectRefVerified: true,
  migrationReportSha256: createHash('sha256')
    .update(fs.readFileSync(migrationReportFile))
    .digest('hex'),
  migrationStatus: migrationReport.status,
  promotesReleaseGates: false,
  manualReviewRequired: true,
  note: 'Este relatório não promove gates de release. A promoção exige revisão humana das evidências externas.'
};
fs.writeFileSync(reportPath, JSON.stringify(evidence, null, 2));
console.log(`Execução de staging concluída. Relatório: ${path.relative(root, reportPath)}`);
