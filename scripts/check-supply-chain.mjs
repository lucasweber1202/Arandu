#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const workflowDir = path.join(root, '.github/workflows');
const issues = [];
const workflows = fs.readdirSync(workflowDir).filter((file) => /\.ya?ml$/i.test(file)).sort();
const pinnedAction = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_-]+)*@[a-f0-9]{40}(?:\s+#\s+.+)?$/;

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
    if (!pinnedAction.test(match[1])) issues.push(`${relative}:${index + 1}: Action deve estar fixada por SHA completo.`);
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

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (packageJson.scripts?.['sbom:ci'] !== 'node scripts/create-sbom.mjs') issues.push('package.json: sbom:ci ausente ou não canônico.');
if (!String(packageJson.scripts?.['check:all'] || '').includes('check:supply-chain')) issues.push('package.json: check:all não executa check:supply-chain.');
if (!fs.existsSync(path.join(root, 'package-lock.json'))) issues.push('package-lock.json obrigatório para instalação determinística.');

console.log('Arandu Supply Chain Check');
console.log(`Workflows verificados: ${workflows.length}`);
console.log(`Problemas: ${issues.length}`);
issues.forEach((issue) => console.error(`- ${issue}`));
if (issues.length) process.exit(1);
