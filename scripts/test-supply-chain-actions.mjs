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
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { 'sbom:ci': 'node scripts/create-sbom.mjs', 'check:all': 'npm run check:supply-chain' } }));
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
  console.log('Supply chain action pinning: nested actions accepted, mutable refs and path traversal refused.');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
