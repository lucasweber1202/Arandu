#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const reportsDir = path.join(root, 'reports');
const args = new Map(process.argv.slice(2).map((argument) => {
  const [key, ...rest] = argument.split('=');
  return [key, rest.join('=')];
}));

const ALLOWED_STATUSES = new Set(['success', 'failure', 'skipped', 'cancelled', 'unknown']);

function status(name) {
  const value = String(args.get(`--${name}`) || 'unknown').toLowerCase();
  return ALLOWED_STATUSES.has(value) ? value : 'unknown';
}

function readJson(relativePath) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) return null;
  try {
    return JSON.parse(fs.readFileSync(absolute, 'utf8'));
  } catch {
    return null;
  }
}

function safeTargetUrl(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return null;
  const url = new URL(raw);
  if (url.protocol !== 'https:') throw new Error('A URL remota do rehearsal deve usar HTTPS.');
  if (url.username || url.password) throw new Error('A URL remota não pode conter credenciais.');
  if (url.search || url.hash) throw new Error('A URL remota não pode conter query string ou fragmento.');
  return url.origin;
}

const flow = String(args.get('--flow') || 'existingDatabase');
if (!['existingDatabase', 'cleanInstall'].includes(flow)) {
  throw new Error('Fluxo inválido. Use existingDatabase ou cleanInstall.');
}

const targetUrl = safeTargetUrl(args.get('--target-url'));
const checks = {
  dependencyAudit: status('audit-status'),
  sourceAndContracts: status('checks-status'),
  buildAndSeo: status('build-status'),
  migrationBundle: status('bundle-status'),
  migrationDryRun: status('dry-run-status'),
  disposableDatabase: status('database-status'),
  browserJourneys: status('browser-status'),
  remoteSmoke: status('live-status')
};

const bundleReport = readJson(`reports/supabase-migrations-${flow}.json`);
const migrationReport = readJson('reports/migration-release-report.json');
const releaseEvidence = readJson('ops/release-evidence.json');
const gates = releaseEvidence?.gates && typeof releaseEvidence.gates === 'object'
  ? releaseEvidence.gates
  : {};
const gateStateCounts = Object.values(gates).reduce((counts, gate) => {
  const state = String(gate?.state || 'unknown');
  counts[state] = (counts[state] || 0) + 1;
  return counts;
}, {});

const requiredChecks = [
  checks.dependencyAudit,
  checks.sourceAndContracts,
  checks.buildAndSeo,
  checks.migrationBundle,
  checks.migrationDryRun,
  checks.disposableDatabase
];
const optionalChecks = [checks.browserJourneys, checks.remoteSmoke];
const requiredPassed = requiredChecks.every((value) => value === 'success');
const optionalFailed = optionalChecks.some((value) => value === 'failure' || value === 'cancelled');
const rehearsalPassed = requiredPassed && !optionalFailed;

const repository = String(process.env.GITHUB_REPOSITORY || '').trim() || null;
const runId = String(process.env.GITHUB_RUN_ID || '').trim() || null;
const runUrl = repository && runId ? `https://github.com/${repository}/actions/runs/${runId}` : null;
const commitSha = String(process.env.GITHUB_SHA || '').trim() || null;

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  classification: 'ci_rehearsal_only',
  status: rehearsalPassed ? 'rehearsal_passed' : 'rehearsal_incomplete',
  promotesReleaseGates: false,
  targetEnvironment: 'staging',
  targetUrl,
  flow,
  source: {
    repository,
    commitSha,
    runId,
    runUrl
  },
  checks,
  migration: {
    bundleSha256: bundleReport?.bundleSha256 || migrationReport?.bundleSha256 || null,
    bundleFiles: Array.isArray(bundleReport?.files) ? bundleReport.files : [],
    dryRunStatus: migrationReport?.status || null,
    dryRunMode: migrationReport?.mode || null
  },
  releaseGateSnapshot: {
    total: Object.keys(gates).length,
    states: gateStateCounts,
    modifiedByRehearsal: false
  },
  limitations: [
    'Não conecta ao banco Supabase real.',
    'Não comprova backup ou restauração.',
    'Não aplica migrations em staging.',
    'Não executa canário autenticado de escrita.',
    'Não promove automaticamente nenhum gate em ops/release-evidence.json.',
    'Não substitui aprovação humana comercial, jurídica, curatorial ou do piloto.'
  ]
};

const rows = Object.entries(checks).map(([name, value]) => `| ${name} | ${value} |`);
const markdown = [
  '# Rehearsal de staging — Arandu',
  '',
  `Gerado em: ${report.generatedAt}`,
  '',
  `Resultado: **${report.status}**`,
  '',
  '> Esta execução é uma simulação de CI. Ela não comprova staging real e não promove gates de release.',
  '',
  `- Fluxo de migration: \`${flow}\``,
  `- Commit: \`${commitSha || 'não informado'}\``,
  `- Execução: ${runUrl || 'não informada'}`,
  `- URL remota: ${targetUrl || 'não executada'}`,
  `- SHA-256 do bundle: \`${report.migration.bundleSha256 || 'não disponível'}\``,
  '',
  '| Verificação | Estado |',
  '| --- | --- |',
  ...rows,
  '',
  '## Snapshot dos gates',
  '',
  `- Total: ${report.releaseGateSnapshot.total}`,
  ...Object.entries(gateStateCounts).map(([state, count]) => `- ${state}: ${count}`),
  '- Alterados por esta execução: não.',
  '',
  '## Limitações',
  '',
  ...report.limitations.map((item) => `- ${item}`),
  ''
].join('\n');

fs.mkdirSync(reportsDir, { recursive: true });
fs.writeFileSync(path.join(reportsDir, 'staging-rehearsal.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(reportsDir, 'staging-rehearsal.md'), markdown);

console.log('Arandu Staging Rehearsal Report');
console.log(`Resultado: ${report.status}`);
console.log(`Promove gates: ${report.promotesReleaseGates ? 'sim' : 'não'}`);
console.log('Relatórios: reports/staging-rehearsal.json e reports/staging-rehearsal.md');
