import fs from 'node:fs';

// Contrato estático de segurança da conta e da sessão do Arandu Financial
// Procurement: login/cadastro/refresh/logout no domínio de auth, console
// finance_ops com papel de plataforma + MFA aal2, health mínimo e nenhum
// segredo administrativo compartilhado. O comportamento é coberto por
// scripts/test-auth-api.mjs e scripts/test-finance-sso.mjs.

const issues = [];

function source(file) {
  if (!fs.existsSync(file)) {
    issues.push(`Arquivo obrigatório ausente: ${file}`);
    return '';
  }
  return fs.readFileSync(file, 'utf8');
}

function requireTerm(file, content, term, message) {
  if (!content.includes(term)) issues.push(`${file}: ${message}`);
}

const router = source('api/[...path].js');
const auth = source('lib/api/domains/auth.mjs');
const api = [
  router,
  ...fs.readdirSync('lib/api/domains').filter((file) => file.endsWith('.mjs')).map((file) => source(`lib/api/domains/${file}`))
].join('\n');
const apiCore = source('lib/api-core.mjs');
const health = source('api/health.js');
const opsAccess = source('lib/finance/ops-access.mjs');

requireTerm('lib/api-core.mjs', apiCore, 'MAX_BODY_BYTES', 'requisições ainda não possuem limite de tamanho.');
requireTerm('api/[...path].js', router, 'async function enforceRateLimit', 'rotas públicas ainda não possuem contenção de abuso.');
requireTerm('api/[...path].js', router, 'rpc/consume_rate_limit', 'rate limit não usa contador distribuído no ambiente hospedado.');
requireTerm('lib/api/domains/auth.mjs', auth, "'auth-login-account'", 'login não limita tentativas também por identidade.');
requireTerm('lib/api/domains/auth.mjs', auth, "'auth-refresh'", 'refresh de sessão não possui rate limit.');
requireTerm('lib/api/domains/auth.mjs', auth, 'if (clean(body.website', 'cadastro público ainda não usa honeypot.');
requireTerm('lib/api/domains/auth.mjs', auth, "const profileType = 'comprador'", 'cadastro público ainda permite autoatribuição de perfil.');
requireTerm('lib/api/domains/auth.mjs', auth, 'function authFailure', 'falhas do provedor de identidade ainda chegam cruas ao cliente.');
requireTerm('lib/api/domains/auth.mjs', auth, "throw authFailure(error, { scope: 'login' })", 'login ainda repassa a mensagem original do provedor e permite enumerar contas.');
requireTerm('lib/api/domains/auth.mjs', auth, 'signupAlreadyRegistered', 'cadastro ainda revela quando o e-mail já está registrado.');
requireTerm('lib/api/domains/auth.mjs', auth, 'grant_type=refresh_token', 'sessão não renova o token do Supabase.');
requireTerm('lib/api/domains/auth.mjs', auth, "supabaseAuth('logout'", 'logout local não revoga a sessão no Supabase.');
requireTerm('lib/api/domains/auth.mjs', auth, 'HttpOnly; SameSite=Lax; Secure', 'cookie de sessão não é HttpOnly/Secure/SameSite.');
requireTerm('lib/api/domains/auth.mjs', auth, "'fin_sso_password_allowed'", 'login por senha ignora a exigência de SSO da organização.');
requireTerm('lib/api/domains/auth.mjs', auth, "'fin_sso_session_valid'", 'refresh de sessão SSO não revalida conexão e membro.');
requireTerm('lib/finance/ops-access.mjs', opsAccess, 'app_metadata', 'papel de plataforma não vem de metadados imutáveis.');
requireTerm('lib/finance/ops-access.mjs', opsAccess, "tokenAal(token) !== 'aal2'", 'console finance_ops não exige MFA aal2.');
requireTerm('api/health.js', health, "status: 'alive'", 'health público não está limitado à liveness.');
if (/SUPABASE|process\.env|routes|missing|checks/i.test(health)) issues.push('api/health.js: liveness pública ainda expõe detalhes internos.');

const legacySecret = ['ARANDU', 'ADMIN', 'TOKEN'].join('_');
const legacyHeader = ['x-arandu', 'admin-token'].join('-');
if (api.includes(legacySecret) || api.includes(legacyHeader)) issues.push('APIs privilegiadas ainda aceitam o segredo administrativo compartilhado.');
if (/SUPABASE_SERVICE_KEY\s*\|\|\s*SUPABASE_ANON_KEY/.test(api)) issues.push('Service role ainda possui fallback inseguro para anon key.');
// O admin da antiga vertical de arte (papéis admin/operator/curator) foi
// aposentado: nenhum guard administrativo genérico volta ao roteador.
for (const retired of ['admin-auth.mjs', 'admin-rbac.mjs', 'adminGuard(', 'requireAdminPermission', 'ADMIN_ROLES']) {
  if (api.includes(retired)) issues.push(`API reintroduziu o guard administrativo aposentado: ${retired}`);
}

console.log('Arandu Auth & Security Check');
console.log(`Erros: ${issues.length}`);
if (issues.length) {
  issues.forEach((issue) => console.error(`- ${issue}`));
  process.exit(1);
}
console.log('Login, cadastro, sessão, SSO, console finance_ops e health protegidos.');
