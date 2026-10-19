import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arandu-action-pin-'));
const checker = fileURLToPath(new URL('./check-supply-chain.mjs', import.meta.url));
try {
  fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
  const pkg = { engines: { node: '24.x' }, scripts: { 'sbom:ci': 'node scripts/create-sbom.mjs', 'check:all': 'npm run check:supply-chain' } };
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(pkg));
  fs.writeFileSync(path.join(root, '.nvmrc'), '24\n');
  fs.writeFileSync(path.join(root, 'package-lock.json'), '{}');
  const sha = '55cc8345863c7cc4c66a329aec7e433d2d1c52a9';
  const oldNode = '820762786026740c76f36085b0efc47a31fe5020';
  const newNode = '949feb2413d6458794dcd2491c4babbbce0c15c1';
  const approved = { actions: { 'actions/cache': { [sha]: 'v6.1.0' }, 'actions/setup-node': { [oldNode]: 'v7.0.0', [newNode]: 'v7.1.0' } } };
  const writeApproved = (value) => fs.writeFileSync(path.join(root, '.github/approved-actions.json'), JSON.stringify(value));
  writeApproved(approved);
  const check = (action) => {
    fs.writeFileSync(path.join(root, '.github/workflows/ci.yml'), `permissions:\n  contents: read\njobs:\n  validate:\n    steps:\n      - uses: ${action}\n`);
    return spawnSync(process.execPath, [checker], { cwd: root, encoding: 'utf8' });
  };
  for (const action of [`actions/cache@${sha}`, `actions/cache/restore@${sha} # pinned`, `actions/cache/save@${sha}`]) {
    const result = check(action);
    assert.equal(result.status, 0, result.stderr);
  }
  for (const action of ['actions/cache/restore@v6', 'actions/cache/save@main', 'actions/cache/save@55cc834', `actions/cache/../save@${sha}`]) {
    const result = check(action);
    assert.equal(result.status, 1, `${action} must be refused`);
    assert(result.stderr.includes('SHA completo'));
  }
  // Allowlist: SHA anterior e novo aprovados passam; SHA, fornecedor ou Action fora da lista falham.
  for (const action of [`actions/setup-node@${oldNode} # v7`, `actions/setup-node@${newNode} # v7.1.0`]) assert.equal(check(action).status, 0, `${action} aprovado deve passar`);
  const refused = (action, message) => {
    const result = check(action);
    assert.equal(result.status, 1, `${action} must be refused`);
    assert(result.stderr.includes(message), `${action}: ${result.stderr}`);
  };
  refused(`actions/setup-node@${'a'.repeat(40)}`, 'não é um SHA aprovado');
  refused(`evil-fork/setup-node@${newNode}`, 'não aprovada');
  refused(`actions/unknown@${sha}`, 'não aprovada');
  refused('actions/setup-node@v7', 'SHA completo');
  refused(`actions/setup-node@${newNode.slice(0, 12)}`, 'SHA completo');
  // Divergência entre workflows: dois SHAs aprovados da mesma Action ao mesmo tempo são recusados.
  fs.writeFileSync(path.join(root, '.github/workflows/other.yml'), `permissions:\n  contents: read\njobs:\n  x:\n    steps:\n      - uses: actions/setup-node@${oldNode}\n`);
  refused(`actions/setup-node@${newNode}`, 'workflows divergem');
  fs.rmSync(path.join(root, '.github/workflows/other.yml'));
  // Allowlist malformada falha fechada.
  writeApproved({ actions: { 'actions/cache': { [sha.slice(0, 20)]: 'v6.1.0', [sha]: 'v6' } } });
  refused(`actions/cache@${sha}`, 'sem versão semântica exata');
  assert(check(`actions/cache@${sha}`).stderr.includes('SHA inválido'));
  fs.rmSync(path.join(root, '.github/approved-actions.json'));
  refused(`actions/cache@${sha}`, 'approved-actions.json ausente');
  writeApproved(approved);
  // Runtime único: node-version e .nvmrc seguem engines.node.
  const runtime = (nodeVersion) => {
    fs.writeFileSync(path.join(root, '.github/workflows/ci.yml'), `permissions:\n  contents: read\njobs:\n  validate:\n    steps:\n      - uses: actions/setup-node@${newNode}\n        with:\n          node-version: ${nodeVersion}\n`);
    return spawnSync(process.execPath, [checker], { cwd: root, encoding: 'utf8' });
  };
  for (const version of ['24', "'24'", '24.11.0']) assert.equal(runtime(version).status, 0, `node-version ${version} must be accepted`);
  for (const version of ['22', '20.x', "'18'"]) {
    const result = runtime(version);
    assert.equal(result.status, 1, `node-version ${version} must be refused`);
    assert(result.stderr.includes('diverge de engines.node 24.x'));
  }
  fs.writeFileSync(path.join(root, '.nvmrc'), '20\n');
  assert(runtime('24').stderr.includes('.nvmrc (20) diverge'), '.nvmrc divergente deve ser recusado');
  fs.writeFileSync(path.join(root, '.nvmrc'), '24\n');
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ ...pkg, engines: {} }));
  assert(runtime('24').stderr.includes('engines.node sem versão principal'), 'engines ausente deve ser recusado');
  console.log('Supply chain: actions fixadas por SHA aprovado na allowlist (truncado, tag, fornecedor, SHA desconhecido e divergência recusados); node-version e .nvmrc presos a engines.node (22/20/18 e .nvmrc divergente recusados).');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
