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
  const check = (action) => {
    fs.writeFileSync(path.join(root, '.github/workflows/ci.yml'), `permissions:\n  contents: read\njobs:\n  validate:\n    steps:\n      - uses: ${action}\n`);
    return spawnSync(process.execPath, [checker], { cwd: root, encoding: 'utf8' });
  };
  const sha = '55cc8345863c7cc4c66a329aec7e433d2d1c52a9';
  for (const action of [`actions/cache@${sha}`, `actions/cache/restore@${sha} # pinned`, `actions/cache/save@${sha}`]) {
    const result = check(action);
    assert.equal(result.status, 0, result.stderr);
  }
  for (const action of ['actions/cache/restore@v6', 'actions/cache/save@main', 'actions/cache/save@55cc834', `actions/cache/../save@${sha}`]) {
    const result = check(action);
    assert.equal(result.status, 1, `${action} must be refused`);
    assert(result.stderr.includes('SHA completo'));
  }
  // Runtime único: node-version e .nvmrc seguem engines.node.
  const runtime = (nodeVersion) => {
    fs.writeFileSync(path.join(root, '.github/workflows/ci.yml'), `permissions:\n  contents: read\njobs:\n  validate:\n    steps:\n      - uses: actions/setup-node@${sha}\n        with:\n          node-version: ${nodeVersion}\n`);
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
  console.log('Supply chain: actions fixadas por SHA; node-version e .nvmrc presos a engines.node (22/20/18 e .nvmrc divergente recusados).');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
