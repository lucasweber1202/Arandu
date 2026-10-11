#!/usr/bin/env node
// Testes negativos do gate de paridade: cada regressão típica (tela exclusiva
// da Demo, ramo por ambiente, check do seed apagado, novo acoplamento com o
// sandbox, desvio de rota, segredo no navegador, matriz desatualizada) precisa
// reprovar scripts/check-demo-parity.mjs. Roda numa cópia temporária.
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, appendFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const COPY = ['finance', 'provider', 'lib', 'scripts', 'vercel.json', 'package.json', 'node_modules'];
function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'arandu-parity-'));
  for (const item of COPY) {
    if (item === 'node_modules') continue;
    cpSync(item, join(dir, item), { recursive: true });
  }
  mkdirSync(join(dir, 'docs'));
  cpSync('docs/DEMO_PRODUCTION_PARITY_MATRIX.md', join(dir, 'docs/DEMO_PRODUCTION_PARITY_MATRIX.md'));
  return dir;
}
const run = (dir) => spawnSync(process.execPath, ['scripts/check-demo-parity.mjs'], { cwd: dir, encoding: 'utf8' });
const edit = (dir, file, fn) => writeFileSync(join(dir, file), fn(readFileSync(join(dir, file), 'utf8')));

const cases = [
  ['base íntegra passa', () => {}, null],
  ['tela decide pelo ambiente demo', (d) => appendFileSync(join(d, 'finance/src/views/fees.js'), "\nexport const x = (ctx) => ctx.environment === 'demo';\n"), /decide comportamento pelo ambiente/],
  ['servidor ramifica por isDemo', (d) => appendFileSync(join(d, 'lib/api/domains/finance-fees.mjs'), '\nexport const y = (runtime) => runtime.isDemo;\n'), /ramifica pelo runtime de demonstração/],
  ['check do seed removido', (d) => edit(d, 'scripts/demo/seed.mjs', (s) => s.replaceAll('Tarefas abertas', 'Tarefas')), /check do seed "Tarefas abertas" inexistente/],
  ['novo acoplamento com o sandbox', (d) => appendFileSync(join(d, 'finance/app.js'), "\nconst z = () => import('./demo/engine.js');\n"), /orçamento 3/],
  ['view canônica importa o sandbox', (d) => appendFileSync(join(d, 'finance/src/views/fees.js'), "\nimport '../../demo/engine.js';\n"), /importa o sandbox legado/],
  ['rota financeira desviada para /demo', (d) => edit(d, 'vercel.json', (s) => { const v = JSON.parse(s); v.redirects.push({ source: '/finance/rfqs.html', destination: '/demo/finance/rfqs.html', permanent: false }); return JSON.stringify(v); }), /desvia \/finance\/rfqs\.html/],
  ['leitura de ambiente no navegador', (d) => appendFileSync(join(d, 'finance/src/views/fees.js'), '\nexport const k = process.env.X;\n'), /leitura de ambiente no código do navegador/],
  ['tela nova sem capacidade', (d) => edit(d, 'scripts/generate-finance-pages.mjs', (s) => s.replace('export const PAGES = [', "export const PAGES = [\n  { path: 'finance/novo.html', view: 'novo', audience: 'company', title: 'Novo', h1: 'Novo', description: 'x' },")), /tela "novo"/],
  ['capacidade sem cobertura nem lacuna', (d) => edit(d, 'lib/finance/parity-manifest.mjs', (s) => s.replace("sanity: ['Valor de procurement com metodologia e registro sem cálculo']", 'sanity: []')), /PRT-VALUE: sem cobertura de dataset/],
  ['recurso de API inexistente', (d) => edit(d, 'lib/finance/parity-manifest.mjs', (s) => s.replace("api: ['tasks']", "api: ['tarefas-fantasma']")), /recurso \/api\/finance\/tarefas-fantasma inexistente/],
  ['persona com papel fora do modelo', (d) => edit(d, 'lib/finance/demo-personas.mjs', (s) => s.replace("role: 'viewer'", "role: 'superuser'")), /papel fora do modelo canônico: superuser/],
  ['matriz desatualizada', (d) => appendFileSync(join(d, 'docs/DEMO_PRODUCTION_PARITY_MATRIX.md'), '\nedição manual\n'), /diverge do manifesto/]
];

let failures = 0;
for (const [name, mutate, expected] of cases) {
  const dir = sandbox();
  try {
    mutate(dir);
    const result = run(dir);
    const output = `${result.stdout}${result.stderr}`;
    if (expected === null) assert.equal(result.status, 0, output);
    else {
      assert.notEqual(result.status, 0, `${name}: deveria reprovar\n${output}`);
      assert.match(output, expected, `${name}: mensagem inesperada\n${output}`);
    }
    console.log(`  ok  ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  FALHA ${name}: ${error.message}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
if (failures) process.exit(1);
console.log(`Paridade Demo × Oficial: ${cases.length} cenários negativos/positivos conferidos.`);
