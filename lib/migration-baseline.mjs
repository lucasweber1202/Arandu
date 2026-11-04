// Baseline is an additional installation path. Historical clean/upgrade arrays
// remain authoritative and immutable; future migrations append after its prefix.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export function financialBaselineFiles(root, manifest) {
  const descriptor = JSON.parse(fs.readFileSync(path.join(root, 'docs/baselines/financial-v1.json'), 'utf8'));
  if (descriptor.version !== 1 || descriptor.sql !== 'docs/baselines/financial-v1.sql' ||
      !Array.isArray(descriptor.sources) || !descriptor.sources.length || descriptor.sources.length > manifest.cleanInstall.length) {
    throw new Error('Invalid financial baseline descriptor');
  }
  const digest = file => createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
  for (const [index, item] of descriptor.sources.entries()) {
    if (item.file !== manifest.cleanInstall[index] || item.sha256 !== digest(item.file)) {
      throw new Error('Financial baseline historical prefix changed; rebuild and prove equivalence');
    }
  }
  if (descriptor.sha256 !== digest(descriptor.sql)) throw new Error('Financial baseline digest mismatch');
  const last = fs.readFileSync(path.join(root, descriptor.sources.at(-1).file), 'utf8');
  const marker = [...last.matchAll(/\(\s*'schema_version'\s*,\s*'([^']+)'\s*\)/g)].at(-1)?.[1];
  if (!marker || marker !== descriptor.marker) throw new Error('Financial baseline marker mismatch');
  return [descriptor.sql, ...manifest.cleanInstall.slice(descriptor.sources.length)];
}
