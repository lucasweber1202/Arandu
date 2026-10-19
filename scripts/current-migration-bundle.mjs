import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

// Operator tooling: reuse the canonical generator, including exact SQL order.
// --stdout never writes a report or applies SQL. A failed generator proves nothing.
export function currentCleanInstallDigest({ root = process.cwd(), run = spawnSync } = {}) {
  const result = run(process.execPath, ['scripts/build-supabase-migration-bundle.mjs', '--flow=cleanInstall', '--stdout'], {
    cwd: root, encoding: 'utf8', timeout: 15000, maxBuffer: 8 * 1024 * 1024,
    env: { PATH: process.env.PATH }
  });
  if (result.error || result.status !== 0 || !result.stdout) return null;
  return createHash('sha256').update(result.stdout).digest('hex');
}
