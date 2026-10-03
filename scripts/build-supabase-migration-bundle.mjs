#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'docs/supabase-migrations.json'), 'utf8'));
const flowArgument = process.argv.find((argument) => argument.startsWith('--flow='));
const flow = flowArgument ? flowArgument.split('=')[1] : 'cleanInstall';
let files = manifest[flow];
if (!Array.isArray(files)) {
  console.error(`Fluxo inválido: ${flow}. Use ${Object.keys(manifest).join(' ou ')}.`);
  process.exit(1);
}

// A hosted upgrade must start after its observed marker, never from a guessed
// migration number. Derive the position and target from the canonical SQL.
const afterArgument = process.argv.find((argument) => argument.startsWith('--after-schema='));
const afterSchema = afterArgument ? afterArgument.slice('--after-schema='.length) : null;
if (afterSchema !== null) {
  if (flow !== 'existingDatabase') {
    console.error('--after-schema exige --flow=existingDatabase; instalação limpa nunca pula migrations.');
    process.exit(1);
  }
  const matches = files.map((file, index) => {
    const sql = fs.readFileSync(path.join(root, file), 'utf8');
    const markers = [...sql.matchAll(/\(\s*'schema_version'\s*,\s*'([^']+)'\s*\)/g)];
    return { index, marker: markers.at(-1)?.[1] };
  }).filter(({ marker }) => marker === afterSchema);
  if (matches.length !== 1) {
    console.error('schema_version desconhecido ou ambíguo no manifesto; nenhum SQL foi gerado.');
    process.exit(1);
  }
  files = files.slice(matches[0].index + 1);
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
const sql = `${afterSchema ? `-- Upgrade após schema_version=${afterSchema}; ${files.length} migration(s) pendente(s).\n-- Backup/restore verificado é pré-condição externa; este comando não aplica SQL.\n\n` : ''}-- Arandu — bundle auditável de migrations (${flow})\n-- Conteúdo determinístico: o horário de geração fica somente no relatório JSON.\n-- Execute somente no projeto Supabase correto e preserve o relatório JSON.\n\n${sections.map((item) => item.sql).join('\n')}`;

if (process.argv.includes('--stdout')) {
  // Sair só depois do flush: com stdout em pipe a escrita é assíncrona e um
  // process.exit imediato truncava o bundle em 64 KB (SQL parcial aplicável).
  process.stdout.write(sql, () => process.exit(0));
  await new Promise(() => {});
}

const reports = path.join(root, 'reports');
fs.mkdirSync(reports, { recursive: true });
const sqlPath = path.join(reports, `supabase-migrations-${flow}.sql`);
const reportPath = path.join(reports, `supabase-migrations-${flow}.json`);
fs.writeFileSync(sqlPath, sql);
fs.writeFileSync(reportPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  flow,
  afterSchema,
  pendingCount: files.length,
  bundleSha256: digest(sql),
  files: sections.map(({ file, sha256 }) => ({ file, sha256 }))
}, null, 2));
console.log(`Bundle SQL: ${path.relative(root, sqlPath)}`);
console.log(`Relatório: ${path.relative(root, reportPath)}`);
console.log(`SHA-256: ${digest(sql)}`);
