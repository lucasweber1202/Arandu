#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { validateReleaseEvidence } from '../lib/release-evidence.mjs';

const strict = process.argv.includes('--require-ready');
const sourcePath = path.join(process.cwd(), 'ops/release-evidence.json');
const reportPath = path.join(process.cwd(), 'reports/release-evidence.md');
const evidence = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const { rows, problems, releaseReady } = validateReleaseEvidence(evidence);
const markdown = [
  '# Evidências de liberação — Arandu', '', `Gerado em: ${new Date().toISOString()}`, '',
  `Resultado: **${releaseReady ? 'LIBERADO' : 'BLOQUEADO'}**`, '',
  '| Gate | Estado | Mínimo | Metadados | Resultado |', '| --- | --- | --- | --- | --- |',
  ...rows.map((row) => `| ${row.id} | ${row.state} | ${row.required} | ${row.problems.length ? 'inválidos' : 'válidos'} | ${row.meetsRelease ? 'aprovado' : 'pendente'} |`),
  '', '## Regras', '',
  '- `prepared`: tooling existe, sem afirmar execução em CI ou ambiente real.',
  '- `ci_validated`: execução de CI referenciada; não equivale a staging.',
  '- `staging_validated`: execução real no staging identificado.',
  '- `externally_verified`: evidência externa revisável; não pode nascer de local/CI.',
  '- `failed`: preserva uma tentativa falha sem promover o gate.',
  '- Estados não iniciados mantêm todos os metadados nulos.', '',
  '## Problemas de formato', '', ...(problems.length ? problems.map((problem) => `- ${problem}`) : ['- Nenhum.']), ''
].join('\n');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, markdown);
console.log('Arandu Release Evidence Check');
console.log(`Gates liberados: ${rows.filter((row) => row.meetsRelease).length}/${rows.length}`);
for (const row of rows) console.log(`${row.meetsRelease ? 'OK' : 'PENDENTE'} ${row.id}: ${row.state} (mínimo ${row.required})`);
problems.forEach((problem) => console.error(`- ${problem}`));
console.log('Relatório: reports/release-evidence.md');
if (problems.length || (strict && !releaseReady)) process.exit(1);
