#!/usr/bin/env node
// Prova negativa do gate check:legacy-art: numa cópia descartável do tree, cada
// regressão típica de reintrodução da vertical de arte precisa reprovar o gate
// com a mensagem certa; o tree limpo precisa passar.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = process.cwd();
const skip = new Set(['node_modules', 'dist', '.git', 'test-results', 'playwright-report']);

function copyTree() {
  const dir = mkdtempSync(join(tmpdir(), 'arandu-legacy-gate-'));
  cpSync(root, dir, { recursive: true, filter: (source) => !skip.has(source.slice(root.length + 1).split(/[\\/]/)[0]) });
  return dir;
}
function gate(dir) {
  return spawnSync(process.execPath, [join(dir, 'scripts/check-legacy-art.mjs')], { cwd: dir, encoding: 'utf8' });
}

const clean = copyTree();
try {
  const result = gate(clean);
  assert.equal(result.status, 0, `tree limpo reprovou:\n${result.stderr}`);
} finally { rmSync(clean, { recursive: true, force: true }); }

const regressions = [
  ['módulo aposentado de volta', (dir) => writeFileSync(join(dir, 'lib/profile-access.mjs'), 'export const x = 1;\n'), /módulo de runtime da vertical de arte voltou: lib\/profile-access\.mjs/],
  ['import de módulo aposentado', (dir) => appendFileSync(join(dir, 'scripts/check-backend.mjs'), "\nimport { x } from '../lib/admin-rbac.mjs';\n"), /import de módulo aposentado em scripts\/check-backend\.mjs/],
  ['handler de arte no roteador', (dir) => {
    const file = join(dir, 'api/[...path].js');
    writeFileSync(file, readFileSync(file, 'utf8').replace("if (route.startsWith('auth/'))", "if (route === 'reservations') return null;\n    if (route.startsWith('auth/'))"));
  }, /roteador atende rota fora da superfície financeira: reservations/],
  ['variável de ambiente de arte', (dir) => appendFileSync(join(dir, '.env.example'), 'ARANDU_COMMERCIAL_READY=false\n'), /variável de ambiente da vertical de arte em \.env\.example: ARANDU_COMMERCIAL_READY/],
  ['modelo de e-mail de pedido', (dir) => appendFileSync(join(dir, 'lib/email.mjs'), "\nconst order_created = 'Pedido criado';\n"), /modelo de e-mail da vertical de arte em lib\/email\.mjs: order_created/],
  ['página de arte na raiz', (dir) => writeFileSync(join(dir, 'obras.html'), '<!doctype html><title>x</title>\n'), /página HTML fora da superfície financeira na raiz: obras\.html/],
  ['dependência da stack antiga', (dir) => {
    const file = join(dir, 'package.json');
    const pkg = JSON.parse(readFileSync(file, 'utf8'));
    pkg.devDependencies = { ...pkg.devDependencies, typescript: '5.0.0' };
    writeFileSync(file, JSON.stringify(pkg, null, 2));
  }, /dependência da antiga stack de arte: typescript/]
];

for (const [name, inject, expected] of regressions) {
  const dir = copyTree();
  try {
    inject(dir);
    const result = gate(dir);
    assert.notEqual(result.status, 0, `${name}: gate não reprovou`);
    assert.match(result.stderr, expected, `${name}: mensagem inesperada:\n${result.stderr}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

console.log('Arandu Legacy Art Gate Negative Tests');
console.log(`Tree limpo aprovado e ${regressions.length} regressões reprovadas.`);
