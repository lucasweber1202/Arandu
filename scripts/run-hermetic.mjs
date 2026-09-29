#!/usr/bin/env node
// Roda um comando com o ambiente de deploy removido, nas mesmas condições do CI.
//
// O deploy de piloto/produção define ARANDU_ENV, VERCEL_ENV, SUPABASE_* e
// segredos. Os testes de contrato do check:all são herméticos: com essas
// variáveis herdadas, eles viam a API legada fechada (404) e reprovavam o deploy
// real de arandu-pilot e arandu, além de receberem credenciais reais sem motivo.
// O build e o finance:env:check continuam rodando com o ambiente completo.
import { spawnSync } from 'node:child_process';

const KEEP = new Set(['ARANDU_SITE_URL']);
export function hermeticEnv(env = process.env) {
  const clean = {};
  for (const [key, value] of Object.entries(env)) {
    if (KEEP.has(key)) { clean[key] = value; continue; }
    if (/^(ARANDU_|SUPABASE_|VERCEL|RESEND_|CRON_SECRET$|PILOT_)/.test(key)) continue;
    clean[key] = value;
  }
  return clean;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [command, ...args] = process.argv.slice(2);
  if (!command) { console.error('uso: node scripts/run-hermetic.mjs <comando> [args...]'); process.exit(2); }
  const result = spawnSync(command, args, { stdio: 'inherit', env: hermeticEnv() });
  if (result.error) { console.error(result.error.message); process.exit(1); }
  process.exit(result.status ?? 1);
}
