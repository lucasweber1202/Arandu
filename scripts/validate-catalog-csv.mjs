#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const fileArg = process.argv.find((argument) => argument.startsWith('--file='));
const requirePublishable = process.argv.includes('--require-publishable');
if (!fileArg) {
  console.error('Use --file=/caminho/catalogo.csv.');
  process.exit(1);
}

const sourcePath = path.resolve(fileArg.slice('--file='.length));
await import(`../js/catalog-intake-core.js?cli=${Date.now()}`);
const core = globalThis.AranduCatalogIntakeCore;
const entries = core.buildEntries(fs.readFileSync(sourcePath, 'utf8'));
const report = {
  generatedAt: new Date().toISOString(),
  source: path.basename(sourcePath),
  dryRun: true,
  summary: {
    rows: entries.length,
    artists: entries.filter((entry) => entry.item.panel === 'artistas').length,
    artworks: entries.filter((entry) => entry.item.panel === 'obras').length,
    errors: entries.reduce((sum, entry) => sum + entry.errors.length, 0),
    warnings: entries.reduce((sum, entry) => sum + entry.warnings.length, 0)
  },
  rows: entries.map((entry) => ({
    line: entry.index,
    type: entry.item.panel,
    id: entry.item.data.id || null,
    errors: entry.errors,
    warnings: entry.warnings
  }))
};
const publishable = report.summary.errors === 0
  && report.summary.artists >= 5
  && report.summary.artworks >= 20;
report.publishable = publishable;

fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/catalog-intake-report.json', JSON.stringify(report, null, 2));
fs.writeFileSync('reports/catalog-intake-report.md', [
  '# Dry-run do catálogo',
  '',
  `Arquivo: ${report.source}`,
  `Linhas: ${report.summary.rows}`,
  `Artistas: ${report.summary.artists}`,
  `Obras: ${report.summary.artworks}`,
  `Erros: ${report.summary.errors}`,
  `Alertas: ${report.summary.warnings}`,
  `Elegível para publicação: ${publishable ? 'sim' : 'não'}`,
  '',
  '| Linha | Tipo | ID | Erros | Alertas |',
  '| ---: | --- | --- | --- | --- |',
  ...report.rows.map((row) => `| ${row.line} | ${row.type} | ${row.id || '—'} | ${row.errors.join('; ') || '—'} | ${row.warnings.join('; ') || '—'} |`),
  ''
].join('\n'));

console.log('Arandu Catalog CSV Dry-run');
console.log(`Linhas: ${report.summary.rows}; erros: ${report.summary.errors}; alertas: ${report.summary.warnings}.`);
console.log(`Publicável: ${publishable}.`);
console.log('Relatórios: reports/catalog-intake-report.json e reports/catalog-intake-report.md');
if (report.summary.errors || (requirePublishable && !publishable)) process.exit(1);
