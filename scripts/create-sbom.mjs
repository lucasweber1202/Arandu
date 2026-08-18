#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npm, ['sbom', '--sbom-format=cyclonedx'], {
  cwd: root,
  encoding: 'utf8',
  env: process.env
});

if (result.error || result.status !== 0) {
  console.error(String(result.stderr || result.error?.message || `npm sbom encerrou com ${result.status}`).slice(-2000));
  process.exit(1);
}

let sbom;
try { sbom = JSON.parse(result.stdout); } catch { throw new Error('npm sbom não produziu JSON válido.'); }
if (sbom.bomFormat !== 'CycloneDX' || !Array.isArray(sbom.components) || sbom.components.length === 0) {
  throw new Error('SBOM CycloneDX vazio ou inválido.');
}

const output = path.join(root, 'reports/arandu-sbom.cdx.json');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(sbom, null, 2)}\n`, { mode: 0o600 });
console.log(`SBOM CycloneDX gerado com ${sbom.components.length} componentes.`);
