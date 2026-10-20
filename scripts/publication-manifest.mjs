import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { assertDemoModeIsSafe, standaloneDemo } from '../lib/demo-mode.mjs';
import { releaseIdentity } from '../lib/runtime-mode.mjs';

export const MANIFEST = 'arandu-build.json';
export const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function assertPublicBytes(bytes) {
  const text = bytes.toString();
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|sb_secret_[A-Za-z0-9_-]{12,}/.test(text)) throw new Error('Private credential in public artifact');
  for (const token of text.matchAll(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) {
    try { if (JSON.parse(Buffer.from(token[0].split('.')[1], 'base64url')).role === 'service_role') throw new Error('service_role in public artifact'); }
    catch (error) { if (error.message === 'service_role in public artifact') throw error; }
  }
}
export function writePublicationManifest(dist, env = process.env) {
  if (!standaloneDemo(env)) return; // Static P0-A only; never invent server readiness.
  assertDemoModeIsSafe(env);
  const identity = releaseIdentity(env);
  let commit = identity.commit;
  if (env.VERCEL_GIT_COMMIT_SHA && !commit) throw new Error('Invalid build commit');
  if (env.VERCEL && (!commit || !env.VERCEL_GIT_COMMIT_REF)) throw new Error('Hosted static build requires deployment SHA/ref');
  const files = {};
  function walk(directory, prefix = '') {
    for (const name of readdirSync(directory).sort()) {
      const file = join(directory, name), path = prefix + name;
      if (lstatSync(file).isSymbolicLink()) throw new Error('Symlink in public artifact');
      if (lstatSync(file).isDirectory()) { walk(file, path + '/'); continue; }
      if (path === MANIFEST) continue;
      if (/(^|\/)(?:\.|node_modules|docs\/)|\.(?:map|sql|pem|key)$/.test(path)) throw new Error('Private file in public artifact');
      const bytes = readFileSync(file);
      assertPublicBytes(bytes);
      for (const [key, value] of Object.entries(env)) {
        if (/(?:SECRET|PASSWORD|PRIVATE_KEY|SERVICE_ROLE_KEY|TOKEN|API_KEY)$/.test(key) && typeof value === 'string' && value.length >= 8 && bytes.includes(Buffer.from(value))) throw new Error('Server secret value in public artifact');
      }
      files['/' + path] = { sha256: digest(bytes), bytes: bytes.length };
    }
  }
  walk(dist);
  if (!files['/index.html'] || !files['/demo/index.html']) throw new Error('Missing standalone entry');
  const manifest = { schema: 1, application: 'arandu', commit: commit || null,
    branch: env.VERCEL_GIT_COMMIT_REF || null, built_at: new Date().toISOString(),
    modality: files['/demo/visita.html'] ? 'informative-tour-with-browser-sandbox' : 'browser-sandbox', datasource: 'synthetic-fixtures', backend_required: false,
    canonical_hosted_m3: 'BLOCKED', files };
  writeFileSync(join(dist, MANIFEST), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
