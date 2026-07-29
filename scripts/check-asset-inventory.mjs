#!/usr/bin/env node
/**
 * Inventário de assets front-end.
 *
 * O site acumulou dezenas de camadas de CSS e JS ao longo dos sprints. Quando um
 * arquivo deixa de ser referenciado, ele não some sozinho: continua no repositório,
 * é copiado para o `dist` e confunde quem for editar a camada certa.
 *
 * Este gate falha quando aparecem novos órfãos além dos já conhecidos. Ao remover
 * um órfão da lista abaixo, o limite cai junto — a dívida só pode diminuir.
 *
 * Um arquivo é considerado órfão quando seu nome não aparece em nenhum HTML, JS,
 * TS, JSON, YAML ou Markdown do repositório. Referências dentro do próprio
 * diretório `css/` (por `@import`, por exemplo) também contam.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'reports', 'test-results', 'playwright-report']);
const SEARCHABLE = /\.(html|js|mjs|ts|json|css|yml|yaml|md)$/;

/**
 * Órfãos tolerados hoje. Cada entrada é dívida conhecida, não permissão para
 * criar mais. Removeu o arquivo? Remova a linha também.
 */
const KNOWN_ORPHANS = new Set([]);

// Este próprio arquivo cita nomes de assets em KNOWN_ORPHANS; incluí-lo na busca
// faria cada órfão tolerado parecer referenciado e o gate nunca acusaria nada.
const SELF = path.resolve(process.argv[1]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const allFiles = walk(root);
const cssDir = `${path.sep}css${path.sep}`;

// O corpo de busca exclui o próprio css/ para que uma folha não "referencie" a si
// mesma; as referências reais vêm de HTML, do vite.config.js e de js/site.js.
const haystack = allFiles
  .filter((file) => SEARCHABLE.test(file) && !file.includes(cssDir) && path.resolve(file) !== SELF)
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n');

// @import dentro de css/ é referência legítima entre folhas.
const cssImports = allFiles
  .filter((file) => file.includes(cssDir))
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n');

const orphans = [];
for (const dir of ['css', 'js']) {
  const dirPath = path.join(root, dir);
  if (!fs.existsSync(dirPath)) continue;
  for (const asset of fs.readdirSync(dirPath).sort()) {
    const needle = asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(needle);
    if (pattern.test(haystack)) continue;
    if (dir === 'css' && new RegExp(`@import[^;]*${needle}`).test(cssImports)) continue;
    orphans.push(`${dir}/${asset}`);
  }
}

const novos = orphans.filter((asset) => !KNOWN_ORPHANS.has(asset));
const resolvidos = [...KNOWN_ORPHANS].filter((asset) => !orphans.includes(asset));

console.log('Arandu Asset Inventory Check');
console.log(`Assets em css/ e js/: ${fs.readdirSync('css').length + fs.readdirSync('js').length}`);
console.log(`Órfãos: ${orphans.length} (tolerados: ${KNOWN_ORPHANS.size})`);

if (resolvidos.length) {
  console.log('\nJá não são órfãos — remova de KNOWN_ORPHANS:');
  resolvidos.forEach((asset) => console.log(`- ${asset}`));
}

if (novos.length) {
  console.error(`\nNovos assets órfãos: ${novos.length}`);
  novos.forEach((asset) => console.error(`- ${asset}`));
  console.error('\nRemova o arquivo ou passe a referenciá-lo. Se for dívida deliberada, registre em KNOWN_ORPHANS com justificativa.');
  process.exit(1);
}

console.log('Nenhum asset órfão novo.');
