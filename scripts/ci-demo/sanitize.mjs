#!/usr/bin/env node
// Copia logs da integração efêmera para a pasta de evidências, sem segredo.
//
//   node scripts/ci-demo/sanitize.mjs <destino> <arquivo>...
//
// Remove os valores de scripts/pilot-local/.state/{.env,demo.env} (chaves JWT,
// senhas, segredo do cron), qualquer JWT, cookie de sessão, URL com senha e
// e-mails fora dos domínios sintéticos *.example. Depois relê o resultado e
// falha se algum valor proibido sobreviveu: evidência suja não é publicada.
import fs from 'node:fs';
import path from 'node:path';

const [destination, ...files] = process.argv.slice(2);
if (!destination || !files.length) { console.error('uso: sanitize.mjs <destino> <arquivo>...'); process.exit(2); }
const state = path.resolve(new URL('../pilot-local/.state', import.meta.url).pathname);
const secrets = [];
for (const name of ['.env', 'demo.env']) {
  const file = path.join(state, name);
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const value = line.slice(line.indexOf('=') + 1).trim();
    if (line.includes('=') && value.length >= 8) secrets.push(value);
  }
}
const patterns = [
  [/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[jwt]'],
  [/arandu_session=[^;\s"']+/g, 'arandu_session=[redacted]'],
  [/(postgres(?:ql)?:\/\/[^:\s/]+):[^@\s]+@/g, '$1:[redacted]@'],
  [/\b[A-Za-z0-9._%+-]+@(?![A-Za-z0-9.-]*\.example\b)[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[email]']
];
export function sanitize(text) {
  let out = text;
  for (const secret of secrets) out = out.split(secret).join('[redacted]');
  for (const [pattern, replacement] of patterns) out = out.replace(pattern, replacement);
  return out;
}
fs.mkdirSync(destination, { recursive: true });
let leaks = 0;
for (const file of files) {
  if (!fs.existsSync(file)) { console.log(`ausente (não copiado): ${file}`); continue; }
  const clean = sanitize(fs.readFileSync(file, 'utf8'));
  const leaked = secrets.filter((secret) => clean.includes(secret)).length + (/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\./.test(clean) ? 1 : 0);
  leaks += leaked;
  const target = path.join(destination, path.basename(file));
  fs.writeFileSync(target, clean);
  console.log(`sanitizado: ${file} → ${target}${leaked ? ' (VAZAMENTO)' : ''}`);
}
if (leaks) { console.error(`${leaks} valor(es) sensível(is) sobreviveram à sanitização.`); process.exit(1); }
