#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'docs/supabase-migrations.json'), 'utf8'));
const flowArgument = process.argv.find((argument) => argument.startsWith('--flow='));
const flow = flowArgument ? flowArgument.split('=')[1] : 'cleanInstall';
const files = manifest[flow];
if (!Array.isArray(files)) {
  console.error(`Fluxo inválido: ${flow}. Use ${Object.keys(manifest).join(' ou ')}.`);
  process.exit(1);
}

const digest = (content) => createHash('sha256').update(content).digest('hex');
const sections = files.map((file, index) => {
  const content = fs.readFileSync(path.join(root, file), 'utf8').trim();
  return {
    file,
    sha256: digest(content),
    sql: `-- ============================================================\n-- ${index + 1}/${files.length}: ${file}\n-- sha256: ${digest(content)}\n-- ============================================================\n\n${content}\n`
  };
});
const sql = `-- Arandu — bundle auditável de migrations (${flow})\n-- Conteúdo determinístico: o horário de geração fica somente no relatório JSON.\n-- Execute somente no projeto Supabase correto e preserve o relatório JSON.\n\n${sections.map((item) => item.sql).join('\n')}`;

if (process.argv.includes('--stdout')) {
  process.stdout.write(sql);
  process.exit(0);
}

const reports = path.join(root, 'reports');
fs.mkdirSync(reports, { recursive: true });
const sqlPath = path.join(reports, `supabase-migrations-${flow}.sql`);
const reportPath = path.join(reports, `supabase-migrations-${flow}.json`);
fs.writeFileSync(sqlPath, sql);
fs.writeFileSync(reportPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  flow,
  bundleSha256: digest(sql),
  files: sections.map(({ file, sha256 }) => ({ file, sha256 }))
}, null, 2));
console.log(`Bundle SQL: ${path.relative(root, sqlPath)}`);
console.log(`Relatório: ${path.relative(root, reportPath)}`);
console.log(`SHA-256: ${digest(sql)}`);
