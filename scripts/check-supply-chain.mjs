#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const workflowDir = path.join(root, '.github/workflows');
const issues = [];
const workflows = fs.readdirSync(workflowDir).filter((file) => /\.ya?ml$/i.test(file)).sort();
// Um só runtime: a versão principal de engines.node vale para todo workflow e para o .nvmrc.
const engineMajor = String(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).engines?.node || '').match(/^(\d+)/)?.[1];
if (!engineMajor) issues.push('package.json: engines.node sem versão principal fixa.');
const nvmrc = fs.existsSync(path.join(root, '.nvmrc')) ? fs.readFileSync(path.join(root, '.nvmrc'), 'utf8').trim().replace(/^v/, '') : '';
if (engineMajor && nvmrc.split('.')[0] !== engineMajor) issues.push(`.nvmrc (${nvmrc || 'ausente'}) diverge de engines.node ${engineMajor}.x.`);
const pinnedAction = /^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)((?:\/[A-Za-z0-9_-]+)*)@([a-f0-9]{40})(?:\s+#\s+.+)?$/;
// Fonte única das Actions aprovadas (owner/repo -> SHA -> versão). Sem rede: determinístico em CI.
const approvedPath = path.join(root, '.github/approved-actions.json');
let approved = {};
try {
  approved = JSON.parse(fs.readFileSync(approvedPath, 'utf8')).actions || {};
} catch {
  issues.push('.github/approved-actions.json ausente ou inválido.');
}
for (const [action, shas] of Object.entries(approved)) {
  for (const [sha, version] of Object.entries(shas || {})) {
    if (!/^[a-f0-9]{40}$/.test(sha)) issues.push(`.github/approved-actions.json: ${action} com SHA inválido ${sha}.`);
    if (!/^v\d+\.\d+\.\d+$/.test(String(version))) issues.push(`.github/approved-actions.json: ${action}@${sha} sem versão semântica exata.`);
  }
}
// action -> SHAs efetivamente usados; todos os workflows devem convergir para um único SHA.
const usedShas = new Map();

for (const file of workflows) {
  const relative = `.github/workflows/${file}`;
  const source = fs.readFileSync(path.join(workflowDir, file), 'utf8');
  if (!/^permissions:\s*\n\s+contents:\s*read\s*$/m.test(source)) issues.push(`${relative}: permissions mínimas contents: read ausentes.`);
  if (/permissions:\s*write-all/.test(source)) issues.push(`${relative}: permissions write-all é proibido.`);
  if (/pull_request_target\s*:/.test(source)) issues.push(`${relative}: pull_request_target exige revisão explícita e não é permitido.`);
  if (/pull_request\s*:[\s\S]*?secrets\./.test(source)) issues.push(`${relative}: workflow de PR não pode consumir secrets.`);

  for (const [index, line] of source.split(/\r?\n/).entries()) {
    const match = line.match(/^\s*-?\s*uses:\s*(.+?)\s*$/);
    if (!match || match[1].startsWith('./')) continue;
    const pin = match[1].match(pinnedAction);
    if (!pin) {
      issues.push(`${relative}:${index + 1}: Action deve estar fixada por SHA completo.`);
      continue;
    }
    const [, action, , sha] = pin;
    if (!Object.hasOwn(approved, action)) {
      issues.push(`${relative}:${index + 1}: Action ${action} não aprovada em .github/approved-actions.json.`);
      continue;
    }
    if (!Object.hasOwn(approved[action], sha)) {
      issues.push(`${relative}:${index + 1}: ${action}@${sha} não é um SHA aprovado em .github/approved-actions.json.`);
      continue;
    }
    if (!usedShas.has(action)) usedShas.set(action, new Set());
    usedShas.get(action).add(sha);
  }

  for (const [index, line] of source.split(/\r?\n/).entries()) {
    const version = line.match(/^\s*node-version:\s*['"]?([^'"\s#]+)/)?.[1];
    if (version && engineMajor && version.split('.')[0] !== engineMajor) issues.push(`${relative}:${index + 1}: node-version ${version} diverge de engines.node ${engineMajor}.x.`);
  }

  const lines = source.split(/\r?\n/);
  let runIndent = null;
  for (const [index, line] of lines.entries()) {
    const indent = line.match(/^\s*/)[0].length;
    if (runIndent !== null && line.trim() && indent <= runIndent) runIndent = null;
    if (/^\s*run:\s*(?:[|>-]|$)/.test(line)) runIndent = indent;
    if (runIndent !== null && /\$\{\{\s*(?:inputs\.|github\.event\.)/.test(line)) {
      issues.push(`${relative}:${index + 1}: contexto não confiável interpolado diretamente em shell.`);
    }
  }
}

for (const [action, shas] of usedShas) {
  if (shas.size > 1) issues.push(`${action}: workflows divergem entre SHAs aprovados (${[...shas].join(', ')}); use um único SHA.`);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (packageJson.scripts?.['sbom:ci'] !== 'node scripts/create-sbom.mjs') issues.push('package.json: sbom:ci ausente ou não canônico.');
if (!String(packageJson.scripts?.['check:all'] || '').includes('check:supply-chain')) issues.push('package.json: check:all não executa check:supply-chain.');
if (!fs.existsSync(path.join(root, 'package-lock.json'))) issues.push('package-lock.json obrigatório para instalação determinística.');

console.log('Arandu Supply Chain Check');
console.log(`Workflows verificados: ${workflows.length}`);
console.log(`Problemas: ${issues.length}`);
issues.forEach((issue) => console.error(`- ${issue}`));
if (issues.length) process.exit(1);
