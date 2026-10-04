// Política de publicação da demonstração interativa (`/demo/*`).
//
// A demonstração é um sandbox 100% no navegador, com dados fictícios. Ela nunca
// fala com o servidor real — mas, para não confundir ninguém, também nunca é
// publicada junto do ambiente financeiro de produção.
//
//   * Preview do Vercel: habilitada por padrão (ARANDU_DEMO_MODE=false desliga).
//   * Local/CI: só com ARANDU_DEMO_MODE=true ou ARANDU_PRESENTATION_MODE=true.
//   * Produção financeira (VERCEL_ENV=production): SEMPRE desligada. Pedir a
//     demonstração ali falha o build em vez de ser ignorado em silêncio.
//   * Build demonstrativo independente (ARANDU_DEPLOYMENT_KIND=demo, via
//     `npm run build:demo`): pode ir a um projeto Vercel próprio, inclusive como
//     "production" daquele projeto, desde que NENHUMA credencial real exista no
//     ambiente. Com credencial real presente, o build falha.
//   * Ambientes com banco próprio (ARANDU_ENV=demo|pilot|production): SEMPRE
//     desligada, também nos previews desses projetos. Pedir o sandbox ali falha
//     o build. ARANDU_ENV=demo é o ambiente de demonstração canônico: o produto
//     real, o mesmo código da `main`, ligado a um Supabase DEMO com a empresa
//     fictícia Vitta Foods (docs/demo/README.md) — não este sandbox.

import { presentationModeEnabled } from './presentation-mode.mjs';

const TRUTHY = new Set(['1', 'true', 'yes', 'sim']);
const FALSY = new Set(['0', 'false', 'no', 'nao', 'não', 'off']);
const read = (env, key) => String(env[key] ?? '').trim().toLowerCase();

/** Variáveis que só existem num ambiente real. Nenhuma pode acompanhar um build demonstrativo independente. */
export const REAL_CREDENTIAL_KEYS = Object.freeze([
  'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY', 'ARANDU_EMAIL_CRON_SECRET',
  'CRON_SECRET', 'ARANDU_ERROR_MONITORING_TOKEN'
]);

export function standaloneDemo(env = process.env) {
  return read(env, 'ARANDU_DEPLOYMENT_KIND') === 'demo';
}

// Ambientes servidos pela aplicação real, cada um com Supabase próprio.
export const SERVER_ENVIRONMENTS = Object.freeze(['demo', 'pilot', 'production']);
const REAL_ENVIRONMENTS = new Set(SERVER_ENVIRONMENTS);
export function realEnvironment(env = process.env) {
  return REAL_ENVIRONMENTS.has(read(env, 'ARANDU_ENV'));
}

export function demoModeEnabled(env = process.env) {
  const vercel = read(env, 'VERCEL_ENV');
  if (standaloneDemo(env)) return true;
  if (realEnvironment(env)) return false;
  if (vercel === 'production') return false;
  if (FALSY.has(read(env, 'ARANDU_DEMO_MODE'))) return false;
  return TRUTHY.has(read(env, 'ARANDU_DEMO_MODE')) || presentationModeEnabled(env) || vercel === 'preview';
}

export function assertDemoModeIsSafe(env = process.env) {
  const vercel = read(env, 'VERCEL_ENV');
  if (realEnvironment(env) && (standaloneDemo(env) || TRUTHY.has(read(env, 'ARANDU_DEMO_MODE')) || presentationModeEnabled(env))) {
    throw new Error(`Demonstração pedida em ARANDU_ENV=${read(env, 'ARANDU_ENV')}. Ambientes com banco próprio (demo, piloto, produção) nunca publicam o sandbox /demo.`);
  }
  if (standaloneDemo(env)) {
    const leaked = REAL_CREDENTIAL_KEYS.filter((key) => String(env[key] ?? '').trim());
    if (leaked.length) {
      throw new Error(`Build demonstrativo independente com credenciais reais no ambiente (${leaked.join(', ')}). Remova-as: a demonstração não pode ser publicada junto de dados reais.`);
    }
    return true;
  }
  if (vercel === 'production' && TRUTHY.has(read(env, 'ARANDU_DEMO_MODE'))) {
    throw new Error('ARANDU_DEMO_MODE não pode ser ativado na produção financeira. Publique a demonstração com `npm run build:demo` em um projeto separado.');
  }
  return demoModeEnabled(env);
}
