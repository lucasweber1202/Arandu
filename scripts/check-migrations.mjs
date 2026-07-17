import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const manifestPath = path.join(root, 'docs/supabase-migrations.json');
const issues = [];
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

for (const [flow, files] of Object.entries(manifest)) {
  if (!Array.isArray(files) || !files.length) {
    issues.push(`${flow}: sequência vazia.`);
    continue;
  }
  if (new Set(files).size !== files.length) issues.push(`${flow}: contém migration duplicada.`);
  files.forEach((file) => {
    const absolute = path.join(root, file);
    if (!fs.existsSync(absolute)) issues.push(`${flow}: arquivo ausente ${file}.`);
    else if (!fs.readFileSync(absolute, 'utf8').trim()) issues.push(`${flow}: arquivo vazio ${file}.`);
  });
  const sprint2 = files.indexOf('docs/supabase-sprint2-catalog-readiness.sql');
  const collections = files.indexOf('docs/arandu-mvp-collections.sql');
  const sprint5 = files.indexOf('docs/supabase-sprint5-pilot.sql');
  const production = files.indexOf('docs/supabase-production.sql');
  if (sprint2 === -1) issues.push(`${flow}: migration do Sprint 2 ausente.`);
  if (sprint5 === -1) issues.push(`${flow}: migration do Sprint 5 ausente.`);
  if (collections === -1) issues.push(`${flow}: migration de coleções públicas ausente.`);
  if (production === -1) issues.push(`${flow}: migration de produção ausente.`);
  if (sprint2 !== -1 && production !== -1 && sprint2 < production) issues.push(`${flow}: a migration do Sprint 2 precisa vir depois da camada de produção para fechar as políticas.`);
  if (sprint5 < sprint2) issues.push(`${flow}: a migration do Sprint 5 precisa vir depois do gate de catálogo.`);
  if (collections !== -1 && sprint2 !== -1 && collections < sprint2) issues.push(`${flow}: coleções precisam vir depois do gate de catálogo.`);
  if (collections !== -1 && sprint5 !== -1 && collections > sprint5) issues.push(`${flow}: coleções precisam vir antes da telemetria do piloto.`);
}

console.log('Arandu Migration Order Check');
console.log(`Fluxos: ${Object.keys(manifest).length}`);
console.log(`Erros: ${issues.length}`);
issues.forEach((issue) => console.error(`- ${issue}`));
if (issues.length) process.exit(1);
