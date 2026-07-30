#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const bannedSharedSecret = ['ARANDU', 'ADMIN', 'TOKEN'].join('_');
const bannedSharedHeader = ['x-arandu', 'admin-token'].join('-');
const bannedStorageKeys = [
  ['arandu', 'admin', 'token'].join('.'),
  `arandu.${['adminToken', 'v1'].join('.')}`
];
const ignored = new Set(['.git', 'node_modules', 'dist', 'reports', 'playwright-report', 'test-results']);
const issues = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(absolute);
      continue;
    }
    if (!/\.(?:js|mjs|ts|html|json|md|sql|yml|yaml|example|txt)$/.test(entry.name)) continue;
    const relative = path.relative(root, absolute);
    const source = fs.readFileSync(absolute, 'utf8');
    if (source.includes(bannedSharedSecret)) issues.push(`${relative}: variável legada de segredo compartilhado.`);
    if (source.includes(bannedSharedHeader)) issues.push(`${relative}: header legado de segredo compartilhado.`);
    for (const key of bannedStorageKeys) {
      if (source.includes(key)) issues.push(`${relative}: chave legada de credencial no storage.`);
    }
    if (/SUPABASE_SERVICE_ROLE_KEY[\s\S]{0,80}\|\|[\s\S]{0,80}SUPABASE_(?:ANON|PUBLISHABLE)_KEY/.test(source)) {
      issues.push(`${relative}: fallback da service role para chave pública.`);
    }
    if (/^(?:api|lib)\//.test(relative)
      && /user_metadata[\s\S]{0,100}\b(?:role|roles)\b/i.test(source)
      && !/raw_user_meta_data/.test(source)) {
      issues.push(`${relative}: possível autorização baseada em user_metadata.`);
    }
  }
}

walk(root);
console.log('Arandu Secret & Legacy Credential Check');
console.log(`Erros: ${issues.length}`);
issues.forEach((issue) => console.error(`- ${issue}`));
if (issues.length) process.exit(1);
