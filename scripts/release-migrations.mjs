#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { inspectBackupArtifact, inspectRestoreEvidence, validOperationalReference } from '../lib/backup-evidence.mjs';
import { DEMO_REF, assertSingleTransaction, demoConnectionProblems, guardPrefix, sanitizedChildEnv, selectPendingSections } from '../lib/release-migration-guard.mjs';

const root = process.cwd();
const args = new Map(process.argv.slice(2).map((argument) => {
  const [key, ...rest] = argument.split('=');
  return [key, rest.join('=') || true];
}));
const dryRun = args.has('--dry-run');
const apply = args.has('--apply');
const flow = String(args.get('--flow') || 'existingDatabase');
const environment = String(args.get('--environment') || 'staging');
const afterSchema = String(args.get('--after-schema') || '').trim();
const backupReference = String(args.get('--backup-reference') || '').trim();
const operator = String(args.get('--operator') || '').trim();
const databaseUrl = String(process.env.ARANDU_DATABASE_URL || '').trim();
const backupPath = String(process.env.ARANDU_BACKUP_PATH || '').trim();
const restoreReference = String(args.get('--restore-reference') || '').trim();
const restoreEvidencePath = path.resolve(String(args.get('--restore-evidence') || 'reports/backup-restore-verification.json'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'docs/supabase-migrations.json'), 'utf8'));
let files = manifest[flow];
let pending = null;
const report = {
  generatedAt: new Date().toISOString(),
  environment,
  flow,
  afterSchema: afterSchema || null,
  mode: dryRun ? 'dry-run' : apply ? 'apply' : 'preflight',
  operator: operator || null,
  backupReference: backupReference || null,
  restoreReference: restoreReference || null,
  bundleSha256: null,
  schemaVersion: null,
  steps: [],
  status: 'blocked'
};

function fail(message) {
  report.steps.push({ name: 'blocked', ok: false, detail: message });
  writeReport();
  console.error(`BLOQUEADO: ${message}`);
  process.exit(1);
}

function run(binary, commandArgs, options = {}) {
  const result = spawnSync(binary, commandArgs, {
    cwd: root,
    env: sanitizedChildEnv(process.env),
    encoding: 'utf8',
    input: options.input,
    stdio: options.capture === false ? 'inherit' : 'pipe'
  });
  if (result.error || result.status !== 0) {
    const detail = String(result.stderr || result.error?.message || `${binary} encerrou com ${result.status}`)
      .replaceAll(databaseUrl, '[DATABASE_URL]')
      .slice(-2000);
    throw new Error(detail);
  }
  return String(result.stdout || '').trim();
}

function writeReport() {
  const reports = path.join(root, 'reports');
  fs.mkdirSync(reports, { recursive: true });
  fs.writeFileSync(path.join(reports, 'migration-release-report.json'), JSON.stringify(report, null, 2));
}

if (!Array.isArray(files)) fail(`Fluxo inválido. Use: ${Object.keys(manifest).join(', ')}.`);
if (!['demo', 'staging', 'production'].includes(environment)) fail('Ambiente deve ser demo, staging ou production.');
if (dryRun && apply) fail('--dry-run e --apply não podem ser combinados.');
if (environment === 'demo' && flow !== 'existingDatabase') fail('Demo só aceita --flow=existingDatabase; instalação limpa é proibida no banco hospedado.');
if (environment === 'demo' && !afterSchema) fail('Demo exige --after-schema obtido do preflight e conferido contra o banco.');
if (afterSchema) {
  if (flow !== 'existingDatabase' || !/^financial-[a-z0-9-]+$/.test(afterSchema)) {
    fail('--after-schema exige --flow=existingDatabase e marcador financeiro válido.');
  }
  try {
    pending = selectPendingSections(files.map((file) => ({
      file, content: fs.readFileSync(path.join(root, file), 'utf8').trim()
    })), afterSchema);
    for (const section of pending) assertSingleTransaction(section.content, section.file);
  } catch (error) { fail(error.message); }
  files = pending.map((section) => section.file);
}
if (!dryRun && !operator) fail('Informe --operator com um papel operacional, sem PII.');
if (!dryRun && !validOperationalReference(backupReference)) {
  fail('Informe --backup-reference com protocolo, hash ou ticket auditável; valores vagos não são aceitos.');
}
if (apply && !validOperationalReference(restoreReference)) {
  fail('Aplicação exige --restore-reference com protocolo, hash ou ticket auditável.');
}
if (environment === 'production' && args.get('--confirm-production') !== 'ARANDU-PRODUCTION') {
  fail('Produção exige --confirm-production=ARANDU-PRODUCTION.');
}

// A Demo não herda autorização de staging/production: host, usuário, porta,
// banco e parâmetros são validados antes de qualquer SQL (lib/release-migration-guard.mjs).
if (!dryRun && environment === 'demo') {
  if (args.get('--confirm-demo') !== 'ARANDU-DEMO' || process.env.ARANDU_DEMO_CONFIRM !== DEMO_REF) {
    fail('Demo exige --confirm-demo=ARANDU-DEMO e ARANDU_DEMO_CONFIRM com o ref exato da Demo.');
  }
  for (const name of ['ARANDU_STAGING_DATABASE_URL', 'ARANDU_PRODUCTION_DATABASE_URL']) {
    if (databaseUrl && String(process.env[name] || '').trim() === databaseUrl) {
      fail(`Variáveis contraditórias: ARANDU_DATABASE_URL coincide com ${name}.`);
    }
  }
  if (process.env.ARANDU_ENV && process.env.ARANDU_ENV !== 'demo') {
    fail('ARANDU_ENV não corresponde à Demo: operação bloqueada.');
  }
  if (!databaseUrl || !process.env.ARANDU_DEMO_DATABASE_URL ||
      databaseUrl !== String(process.env.ARANDU_DEMO_DATABASE_URL).trim() ||
      demoConnectionProblems(databaseUrl).length > 0) {
    fail('Conexão PostgreSQL não corresponde ao Supabase Demo confirmado.');
  }
}

const sections = files.map((file) => {
  const content = fs.readFileSync(path.join(root, file), 'utf8').trim();
  return { file, sha256: createHash('sha256').update(content).digest('hex'), content };
});
const bundle = sections.map(({ file, sha256, content }) => (
  `-- ${file}\n-- sha256: ${sha256}\n${content}\n`
)).join('\n');
report.bundleSha256 = createHash('sha256').update(bundle).digest('hex');
report.steps.push({
  name: 'canonical-order',
  ok: true,
  detail: sections.map(({ file, sha256 }) => ({ file, sha256 }))
});

if (dryRun) {
  report.status = 'planned';
  report.steps.push(
    { name: 'schema-preflight', ok: null, detail: 'Será executado antes de qualquer DDL.' },
    { name: 'backup', ok: null, detail: 'Backup local ou referência externa obrigatória.' },
    { name: 'apply', ok: null, detail: 'Migrations serão aplicadas na ordem canônica.' },
    { name: 'post-migration-probes', ok: null, detail: 'Grants, RLS, expiração e integridade serão verificados.' },
    { name: 'write-canary', ok: null, detail: 'Executado por check:supabase:write no endpoint protegido.' },
    { name: 'rollback-disposable', ok: null, detail: 'Permanece obrigatório em CI/PostgreSQL descartável.' }
  );
  writeReport();
  console.log('Arandu Migration Release — dry-run');
  console.log(`Fluxo: ${flow}`);
  console.log(`Ambiente: ${environment}`);
  console.log(`Bundle SHA-256: ${report.bundleSha256}`);
  console.log('Nenhuma conexão foi aberta e nenhuma alteração foi aplicada.');
  console.log('Relatório: reports/migration-release-report.json');
  process.exit(0);
}

if (!databaseUrl) fail('ARANDU_DATABASE_URL não configurada.');
if (apply && environment === 'staging' && databaseUrl !== String(process.env.ARANDU_STAGING_DATABASE_URL || '').trim()) {
  fail('ARANDU_DATABASE_URL deve coincidir exatamente com ARANDU_STAGING_DATABASE_URL.');
}
if (apply && environment === 'production' && databaseUrl !== String(process.env.ARANDU_PRODUCTION_DATABASE_URL || '').trim()) {
  fail('ARANDU_DATABASE_URL deve coincidir exatamente com ARANDU_PRODUCTION_DATABASE_URL.');
}

try {
  // O marker do schema diz de onde o bundle parte; banco sem marker financeiro
  // não é alvo desta ferramenta.
  const schemaVersion = String(run('psql', [
    databaseUrl,
    '-XAt',
    '-v', 'ON_ERROR_STOP=1',
    '-c',
    "select coalesce((select value from public.fin_settings where key = 'schema_version'), '') where to_regclass('public.fin_settings') is not null;"
  ]) || '').trim();
  report.schemaVersion = schemaVersion || null;
  report.steps.push({ name: 'schema-preflight', ok: /^financial-[a-z0-9-]+$/.test(schemaVersion), detail: { schema_version: schemaVersion || null } });
  if (!/^financial-[a-z0-9-]+$/.test(schemaVersion)) fail('Banco sem marker financeiro em fin_settings.schema_version: confirme o ambiente antes de aplicar.');
  if (afterSchema && schemaVersion !== afterSchema) {
    fail('Marcador real do banco não coincide com --after-schema: abortado antes de qualquer escrita.');
  }

  if (apply) {
    if (!backupPath || !path.isAbsolute(backupPath)) fail('Aplicação exige ARANDU_BACKUP_PATH absoluto fora do repositório.');
    const resolved = path.resolve(backupPath);
    const relative = path.relative(root, resolved);
    if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
      fail('ARANDU_BACKUP_PATH deve ser absoluto e ficar fora do repositório.');
    }
    let backupStat;
    try { backupStat = fs.statSync(resolved); } catch { fail('Backup verificado não foi encontrado em ARANDU_BACKUP_PATH.'); }
    const artifact = inspectBackupArtifact({ stat: backupStat, reference: backupReference, maxAgeHours: 6 });
    if (!artifact.ok) fail(artifact.problems.join(' '));
    const sha256 = createHash('sha256').update(fs.readFileSync(resolved)).digest('hex');
    let restoreEvidence;
    try { restoreEvidence = JSON.parse(fs.readFileSync(restoreEvidencePath, 'utf8')); } catch { fail('Relatório verificável de backup/restore ausente ou inválido.'); }
    const verified = inspectRestoreEvidence({
      report: restoreEvidence,
      backupReference,
      restoreReference,
      backupSha256: sha256,
      maxAgeHours: 6
    });
    if (!verified.ok) fail(verified.problems.join(' '));
    report.steps.push({
      name: 'backup-restore-evidence', ok: true,
      detail: { backupReference, restoreReference, backupSha256: sha256, evidenceAgeHours: Number(verified.ageHours.toFixed(2)) }
    });
  } else if (backupPath) {
    const resolved = path.resolve(backupPath);
    const relative = path.relative(root, resolved);
    if (!path.isAbsolute(backupPath) || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
      fail('ARANDU_BACKUP_PATH deve ser absoluto e ficar fora do repositório.');
    }
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    run('pg_dump', [databaseUrl, '--format=custom', '--no-owner', '--no-acl', '--file', resolved]);
    const sha256 = createHash('sha256').update(fs.readFileSync(resolved)).digest('hex');
    report.steps.push({ name: 'backup-unverified', ok: true, detail: { reference: backupReference, sha256 } });
  } else {
    report.steps.push({ name: 'backup-reference-only', ok: true, detail: { reference: backupReference, mode: 'preflight-only' } });
  }

  if (!apply) {
    report.status = 'preflight_passed';
    writeReport();
    console.log('Preflight aprovado. Nenhuma migration foi aplicada; use --apply para continuar.');
    process.exit(0);
  }

  if (pending) {
    // Uma transação por migration: advisory lock + marcador real conferido no
    // mesmo BEGIN; falha intermediária reverte o arquivo inteiro e interrompe.
    for (const section of pending) {
      const sha256 = sections.find((item) => item.file === section.file).sha256;
      try {
        run('psql', [databaseUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-1'],
          { input: `${guardPrefix(section.expectedBefore)}\n-- ${section.file}\n-- sha256: ${sha256}\n${section.content}\n` });
      } catch (error) {
        report.steps.push({ name: 'apply', ok: false, detail: { file: section.file, sha256 } });
        fail(`Migration ${section.file} falhou e foi revertida: ${error.message}`);
      }
      const actualSchema = run('psql', [databaseUrl, '-XAt', '-v', 'ON_ERROR_STOP=1', '-c',
        "select value from public.fin_settings where key='schema_version';"]).trim();
      if (actualSchema !== section.expectedAfter) {
        report.steps.push({ name: 'apply', ok: false, detail: { file: section.file, sha256, schema_version: actualSchema || null } });
        fail('Marcador final não corresponde ao esperado após a migration.');
      }
      report.steps.push({ name: 'apply', ok: true, detail: { file: section.file, sha256, schema_version: actualSchema } });
    }
    report.steps.push({ name: 'schema-postflight', ok: true, detail: { schema_version: pending.at(-1).expectedAfter } });
  } else {
    run('psql', [databaseUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-1'], { input: bundle });
    report.steps.push({ name: 'apply', ok: true, detail: { bundleSha256: report.bundleSha256 } });
  }

  run('psql', [
    databaseUrl,
    '-X',
    '-v', 'ON_ERROR_STOP=1',
    '-f', path.join(root, 'ops/sql/post-migration-probes.sql')
  ]);
  report.steps.push({ name: 'post-migration-probes', ok: true, detail: 'Grants, RLS, expiração e constraints aprovados.' });

  run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'check:supabase:write'], { capture: false });
  report.steps.push({ name: 'write-canary', ok: true, detail: 'Endpoint protegido respondeu ao canário configurado.' });
  report.steps.push({
    name: 'rollback-disposable',
    ok: null,
    detail: 'Use a execução referenciada de npm run test:database; este script não executa rollback no banco-alvo.'
  });
  report.status = 'applied_and_probed';
  writeReport();
  console.log('Migrations aplicadas e probes concluídos.');
  console.log('Relatório: reports/migration-release-report.json');
} catch (error) {
  fail(error.message || String(error));
}
