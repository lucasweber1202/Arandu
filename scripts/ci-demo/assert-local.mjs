#!/usr/bin/env node
// Trava da integração efêmera da Demo (.github/workflows/demo-integration.yml):
// toda URL que os scripts usam precisa apontar para este runner. Uma variável
// com host remoto (Supabase hospedado, deploy da Vercel, outro banco) aborta a
// fase antes de qualquer requisição. Importável (assertLocalEnv) e executável.
import { pathToFileURL } from 'node:url';

export const URL_VARIABLES = Object.freeze([
  'SUPABASE_URL', 'ARANDU_DEMO_APP_URL', 'ARANDU_DEMO_REST_URL', 'ARANDU_SITE_URL', 'PILOT_APP_URL', 'PILOT_DB_URL', 'ARANDU_DATABASE_TEST_URL'
]);
// Nenhuma credencial de ambiente hospedado pode estar presente no processo.
export const FORBIDDEN_VARIABLES = Object.freeze(['VERCEL_ENV', 'VERCEL_URL', 'SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_PASSWORD', 'DEMO_SUPABASE_REFS']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function localViolations(env = process.env) {
  const problems = [];
  for (const name of URL_VARIABLES) {
    const raw = String(env[name] ?? '').trim();
    if (!raw) continue;
    let host;
    try { host = new URL(raw).hostname.toLowerCase(); } catch { problems.push(`${name}: não é uma URL válida`); continue; }
    if (!LOCAL_HOSTS.has(host)) problems.push(`${name}: host remoto (${host}); só serviços locais são permitidos`);
  }
  for (const name of FORBIDDEN_VARIABLES) if (String(env[name] ?? '').trim()) problems.push(`${name}: presente; integração efêmera não usa ambiente hospedado`);
  return problems;
}

export function assertLocalEnv(env = process.env, label = 'fase') {
  const problems = localViolations(env);
  if (problems.length) {
    console.error(`[${label}] alvo não local; nada foi executado:`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(3);
  }
  const used = URL_VARIABLES.filter((name) => String(env[name] ?? '').trim());
  // Só nomes e hosts: a URL do banco carrega senha.
  console.log(`[${label}] alvo local confirmado: ${used.map((name) => `${name}→${new URL(env[name]).host}`).join(', ') || 'nenhuma URL definida'}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) assertLocalEnv(process.env, process.argv[2] || 'fase');
