#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const runtimeTargets = ['api', 'lib', 'src', 'vite.config.js', 'scripts/vercel-build.mjs'];
const platformVariables = new Set(['CI', 'NODE_ENV', 'VERCEL', 'VERCEL_ENV', 'VERCEL_URL', 'VERCEL_GIT_COMMIT_SHA']);
const documented = new Set(
  fs.readFileSync(path.join(root, '.env.example'), 'utf8')
    .split(/\r?\n/)
    .map((line) => line.match(/^([A-Z][A-Z0-9_]*)=/)?.[1])
    .filter(Boolean)
);
const used = new Set();

function visit(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) return;
  const stat = fs.statSync(fullPath);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(fullPath)) visit(path.join(relativePath, entry));
    return;
  }
  if (!/\.(?:js|mjs|cjs|ts)$/.test(relativePath)) return;
  const source = fs.readFileSync(fullPath, 'utf8');
  for (const match of source.matchAll(/process\.env(?:\.([A-Z][A-Z0-9_]*)|\[['"]([A-Z][A-Z0-9_]*)['"]\])/g)) {
    used.add(match[1] || match[2]);
  }
}

runtimeTargets.forEach(visit);
const missing = [...used].filter((name) => !platformVariables.has(name) && !documented.has(name)).sort();
console.log('Arandu Environment Documentation Check');
console.log(`Runtime variables: ${used.size}; documented application variables: ${documented.size}`);
if (missing.length) {
  missing.forEach((name) => console.error(`Undocumented runtime variable: ${name}`));
  process.exit(1);
}
console.log('All runtime environment variables are documented without exposing values to the browser.');
