#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const problems = [];
const workflowPath = '.github/workflows/staging-rehearsal.yml';
const reportScriptPath = 'scripts/create-staging-rehearsal-report.mjs';
const docsPath = 'docs/STAGING_REHEARSAL.md';
const packagePath = 'package.json';

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

for (const file of [workflowPath, reportScriptPath, docsPath, packagePath]) {
  if (!exists(file)) problems.push(`${file}: arquivo obrigatório ausente.`);
}

if (exists(workflowPath)) {
  const workflow = read(workflowPath);
  const requiredFragments = [
    'workflow_dispatch:',
    'permissions:',
    'contents: read',
    'persist-credentials: false',
    'npm run audit:ci',
    'npm run check:all',
    'npm run build',
    'npm run check:build-size',
    'npm run check:seo:dist',
    'npm run migrations:bundle',
    'npm run migrations:release',
    '--dry-run',
    'npm run test:database',
    'create-staging-rehearsal-report.mjs',
    'actions/checkout@v7',
    'actions/setup-node@v7',
    'actions/upload-artifact@v7'
  ];
  for (const fragment of requiredFragments) {
    if (!workflow.includes(fragment)) problems.push(`${workflowPath}: fragmento obrigatório ausente: ${fragment}.`);
  }

  const forbiddenFragments = [
    'push:',
    'pull_request:',
    '--apply',
    'ARANDU_DATABASE_URL',
    'ops/release-evidence.json',
    'secrets.',
    'permissions: write-all'
  ];
  for (const fragment of forbiddenFragments) {
    if (workflow.includes(fragment)) problems.push(`${workflowPath}: conteúdo proibido encontrado: ${fragment}.`);
  }

  if (!/target_url:[\s\S]*required:\s*false/.test(workflow)) {
    problems.push(`${workflowPath}: target_url deve ser opcional.`);
  }
  if (!/timeout-minutes:\s*(?:[1-5]?\d|60)\b/.test(workflow)) {
    problems.push(`${workflowPath}: timeout entre 1 e 60 minutos é obrigatório.`);
  }
}

if (exists(reportScriptPath)) {
  const script = read(reportScriptPath);
  if (!script.includes("classification: 'ci_rehearsal_only'")) {
    problems.push(`${reportScriptPath}: classificação de rehearsal ausente.`);
  }
  if (!script.includes('promotesReleaseGates: false')) {
    problems.push(`${reportScriptPath}: deve declarar que não promove gates.`);
  }
  if (!script.includes("url.protocol !== 'https:'")) {
    problems.push(`${reportScriptPath}: URL remota não está limitada a HTTPS.`);
  }
  if (/process\.env\.(?:ARANDU_DATABASE_URL|SUPABASE_SERVICE_ROLE_KEY)/.test(script)) {
    problems.push(`${reportScriptPath}: não pode ler credenciais de banco ou service role.`);
  }
}

if (exists(docsPath)) {
  const docs = read(docsPath);
  const requiredPhrases = [
    'não aplica migrations',
    'não promove',
    'staging real',
    'workflow_dispatch',
    'ops/release-evidence.json'
  ];
  for (const phrase of requiredPhrases) {
    if (!docs.toLowerCase().includes(phrase.toLowerCase())) {
      problems.push(`${docsPath}: orientação obrigatória ausente: ${phrase}.`);
    }
  }
}

if (exists(packagePath)) {
  const packageJson = JSON.parse(read(packagePath));
  if (!packageJson.scripts?.['check:staging']) {
    problems.push('package.json: script check:staging ausente.');
  }
  if (!packageJson.scripts?.['staging:evidence']) {
    problems.push('package.json: script staging:evidence ausente.');
  }
  if (!String(packageJson.scripts?.['check:all'] || '').includes('check:staging')) {
    problems.push('package.json: check:all não executa check:staging.');
  }
}

console.log('Arandu Staging Rehearsal Check');
console.log(`Problemas: ${problems.length}`);
for (const problem of problems) console.error(`- ${problem}`);
if (problems.length) process.exit(1);
