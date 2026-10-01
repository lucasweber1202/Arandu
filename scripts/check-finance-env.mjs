#!/usr/bin/env node
// Verificação de ambiente do Arandu Finance.
//
// Diz o que está configurado, o que falta e o que está perigosamente
// configurado — sem NUNCA imprimir o valor de um segredo. O que aparece é
// presença, formato e comprimento; nada além disso.
//
//   npm run finance:env:check                  → verifica o ambiente atual
//   ARANDU_ENV=pilot npm run finance:env:check → aplica as exigências de piloto
//
// Sai com código 1 quando falta algo obrigatório para o ambiente declarado, ou
// quando encontra uma combinação que não deveria existir.

import { LEGACY_SUPABASE_REFS, PILOT_SUPABASE_REFS, foreignSupabaseRef } from '../lib/finance/pilot-doctor.mjs';

const env = process.env;
const problems = [];
const warnings = [];
const report = [];

const ENVIRONMENTS = ['development', 'preview', 'demo', 'pilot', 'production'];
// Ambientes servidos com banco próprio: mesmas exigências de configuração.
const SERVER_ENVIRONMENTS = ['demo', 'pilot', 'production'];
const declared = String(env.ARANDU_ENV || '').trim().toLowerCase();
const vercelEnv = String(env.VERCEL_ENV || '').trim().toLowerCase();
const environment = ENVIRONMENTS.includes(declared)
  ? declared
  : vercelEnv === 'production' ? 'production'
    : vercelEnv === 'preview' ? 'preview'
      : 'development';

if (declared && !ENVIRONMENTS.includes(declared)) {
  problems.push(`ARANDU_ENV="${declared}" não é um ambiente conhecido (${ENVIRONMENTS.join(', ')}).`);
}

/** Descreve uma variável sem revelar o conteúdo. */
function describe(name, { required = false, pattern = null, minLength = 0, secret = false } = {}) {
  const raw = env[name];
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) {
    if (required) problems.push(`${name} ausente.`);
    report.push(`  ${name}: ausente`);
    return null;
  }
  if (pattern && !pattern.test(value)) {
    problems.push(`${name} presente, mas fora do formato esperado.`);
    report.push(`  ${name}: presente, formato inválido`);
    return value;
  }
  if (minLength && value.length < minLength) {
    problems.push(`${name} presente, mas curto demais para ser uma credencial válida.`);
    report.push(`  ${name}: presente, comprimento suspeito`);
    return value;
  }
  // Segredo nunca é impresso — nem truncado, nem mascarado com parte do valor.
  report.push(`  ${name}: presente${secret ? ` (${value.length} caracteres)` : ` (${value})`}`);
  return value;
}

const TRUTHY = new Set(['1', 'true', 'yes', 'sim']);
const flag = (name) => TRUTHY.has(String(env[name] || '').trim().toLowerCase());

const needsSupabase = SERVER_ENVIRONMENTS.includes(environment);

report.push(`Ambiente: ${environment}${declared ? ' (declarado)' : ' (inferido)'}`);
report.push('');
report.push('Supabase:');
describe('SUPABASE_URL', { required: needsSupabase, pattern: /^https:\/\/[a-z0-9.-]+$/i });
describe('SUPABASE_ANON_KEY', { required: needsSupabase, minLength: 20, secret: true });
// Só no servidor: assina URLs curtas de documentos privados e roda a agenda de
// renovação. Nunca vai ao navegador (check:security e o build demo recusam).
const serviceRole = describe('SUPABASE_SERVICE_ROLE_KEY', { required: needsSupabase, minLength: 20, secret: true });
report.push('');
report.push('Cron:');
const cronSecret = describe('CRON_SECRET', { required: needsSupabase, minLength: 32, secret: true });

report.push('');
report.push('Aplicação:');
describe('ARANDU_SITE_URL', { required: needsSupabase, pattern: /^https:\/\// });

report.push('');
report.push('Modos:');
const presentation = flag('ARANDU_PRESENTATION_MODE');
const financeEnabled = env.ARANDU_FINANCE_ENABLED === undefined ? true : flag('ARANDU_FINANCE_ENABLED');
const commercial = flag('ARANDU_COMMERCIAL_READY');
report.push(`  ARANDU_FINANCE_ENABLED: ${financeEnabled ? 'ligado' : 'desligado'}${env.ARANDU_FINANCE_ENABLED === undefined ? ' (padrão)' : ''}`);
report.push(`  ARANDU_PRESENTATION_MODE: ${presentation ? 'ligado' : 'desligado'}`);
report.push(`  ARANDU_COMMERCIAL_READY: ${commercial ? 'ligado' : 'desligado'}`);

// --- combinações que não devem existir -------------------------------------

// Dado de demonstração e dado real de empresa não convivem na mesma base.
if (presentation && environment === 'production') {
  problems.push('ARANDU_PRESENTATION_MODE ligado em produção. O build já falha nessa combinação, e ela nunca deve ser tentada.');
}
if (presentation && environment === 'pilot') {
  problems.push('ARANDU_PRESENTATION_MODE ligado no piloto: dado de demonstração misturaria com dado real da empresa piloto.');
}

// A service role atravessa o RLS. O procurement a usa só no servidor, depois
// de uma RPC com o token do usuário autorizar: documentos privados (assinar URL
// e conferir o objeto) e a agenda de renovação do cron.
if (cronSecret && cronSecret === serviceRole) {
  problems.push('CRON_SECRET igual ao service role. Use um segredo próprio, aleatório, com 32+ caracteres.');
}

// O piloto tem Supabase dedicado; o projeto histórico de arte nunca recebe a
// stack financeira nem dado de empresa piloto.
const supabaseRef = (() => { try { const host = new URL(String(env.SUPABASE_URL || '')).hostname.toLowerCase(); return host.endsWith('.supabase.co') ? host.split('.')[0] : null; } catch { return null; } })();
if (environment === 'pilot' && supabaseRef && LEGACY_SUPABASE_REFS.includes(supabaseRef)) {
  problems.push('SUPABASE_URL do piloto aponta para o projeto legado de arte. Use o projeto dedicado ao piloto financeiro.');
}
if (environment === 'pilot' && supabaseRef && !LEGACY_SUPABASE_REFS.includes(supabaseRef) && !PILOT_SUPABASE_REFS.includes(supabaseRef)) {
  warnings.push('SUPABASE_URL do piloto não é o projeto piloto conhecido. Se o piloto mudou de projeto, atualize PILOT_SUPABASE_REFS em lib/finance/pilot-doctor.mjs.');
}
// Demo, piloto e produção não compartilham banco, e nenhum usa o legado.
if (environment === 'production' && supabaseRef && (PILOT_SUPABASE_REFS.includes(supabaseRef) || LEGACY_SUPABASE_REFS.includes(supabaseRef))) {
  problems.push(`SUPABASE_URL da produção aponta para o projeto ${PILOT_SUPABASE_REFS.includes(supabaseRef) ? 'do piloto' : 'legado de arte'}. A produção tem Supabase próprio, que começa vazio.`);
} else if (['demo', 'production'].includes(environment) && foreignSupabaseRef(environment, supabaseRef)) {
  problems.push(`SUPABASE_URL: ${foreignSupabaseRef(environment, supabaseRef)}.`);
}
// Cada ambiente real sai de uma única branch: pilot → piloto; main → produção
// e demonstração (a demo é a main com outra configuração, nunca outra branch).
const expectedBranch = { pilot: 'pilot', production: 'main', demo: 'main' }[environment];
const branch = String(env.VERCEL_GIT_COMMIT_REF || '').trim();
if (expectedBranch && branch && branch !== expectedBranch) {
  problems.push(`Deploy com ARANDU_ENV=${environment} a partir da branch "${branch}"; só a branch ${expectedBranch} publica esse ambiente. No Vercel, deixe as variáveis desse ambiente só no escopo Production.`);
}
// Demonstração nunca convive com credencial real.
if (SERVER_ENVIRONMENTS.includes(environment) && (flag('ARANDU_DEMO_MODE') || String(env.ARANDU_DEPLOYMENT_KIND || '').trim().toLowerCase() === 'demo')) {
  problems.push(`Sandbox de demonstração ligado em ${environment}. Ambientes com banco próprio nunca publicam o sandbox /demo (ARANDU_DEMO_MODE / ARANDU_DEPLOYMENT_KIND=demo).`);
}
if (presentation && environment === 'demo') {
  problems.push('ARANDU_PRESENTATION_MODE ligado no ambiente de demonstração: a demo canônica é o produto real com dados fictícios no banco, não o sandbox.');
}
// Seed e reset da demonstração existem só como comandos manuais
// (npm run demo:seed / demo:reset); nada no deploy os executa.
if (environment !== 'demo' && String(env.ARANDU_DEMO_PASSWORD || '').trim()) {
  problems.push(`ARANDU_DEMO_PASSWORD presente em ${environment}. Credencial das personas fictícias só existe na máquina de quem roda o seed da demonstração.`);
}
const keyRef = (key) => { try { return JSON.parse(Buffer.from(String(key || '').split('.')[1] || '', 'base64url').toString('utf8')).ref || null; } catch { return null; } };
for (const name of ['SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
  const ref = keyRef(env[name]);
  if (supabaseRef && ref && ref !== supabaseRef) problems.push(`${name} pertence a outro projeto Supabase (ref diferente de SUPABASE_URL).`);
}
const roleOf = (key) => { const value = String(key || ''); if (value.startsWith('sb_secret_')) return 'service_role'; try { return JSON.parse(Buffer.from(value.split('.')[1] || '', 'base64url').toString('utf8')).role || null; } catch { return null; } };
if (roleOf(env.SUPABASE_ANON_KEY) === 'service_role') {
  problems.push('SUPABASE_ANON_KEY é uma chave de serviço: ela atravessa o RLS e chegaria ao navegador.');
}

// A allowlist falha fechada: com a tabela vazia, NINGUÉM cria organização
// (fin_pilot_access_allowed). Lembrete, não risco de abertura.
if (environment === 'pilot' && !flag('ARANDU_PILOT_ALLOWLIST_CONFIRMED')) {
  warnings.push('Confirme que fin_pilot_allowlist tem as entradas do piloto; com a tabela vazia ninguém consegue criar organização. Defina ARANDU_PILOT_ALLOWLIST_CONFIRMED=true depois de conferir.');
}

report.push('');
report.push('E-mail transacional:');
const emailKeys = ['RESEND_API_KEY', 'SENDGRID_API_KEY', 'SMTP_URL', 'ARANDU_EMAIL_PROVIDER_KEY'];
const configuredEmail = emailKeys.filter((key) => String(env[key] || '').trim());
if (configuredEmail.length) {
  report.push(`  provedor configurado: ${configuredEmail.join(', ')}`);
} else {
  report.push('  nenhum provedor configurado');
  if (environment === 'pilot') {
    warnings.push('Nenhum provedor de e-mail configurado: o convite de provedor será entregue manualmente. Isso é aceitável no piloto, e está documentado em docs/FINANCIAL_EMAIL_TEMPLATES.md.');
  }
}

console.log('Arandu Finance — Environment Check');
console.log(report.join('\n'));
console.log('');
if (warnings.length) {
  console.log(`Avisos: ${warnings.length}`);
  for (const warning of warnings) console.log(`  - ${warning}`);
  console.log('');
}
console.log(`Erros: ${problems.length}`);
for (const problem of problems) console.log(`  - ${problem}`);
if (problems.length) process.exit(1);
console.log('');
console.log(environment === 'demo'
  ? 'Ambiente de demonstração apto: produto real, banco DEMO próprio. Dados fictícios entram só por npm run demo:seed.'
  : needsSupabase
  ? 'Ambiente apto a operar o Financial Procurement com dados reais.'
  : 'Ambiente de desenvolvimento: Supabase não é exigido, e as rotas financeiras respondem como indisponíveis sem ele.');
