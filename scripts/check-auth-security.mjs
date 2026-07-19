import fs from 'node:fs';

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

const api = source('api/[...path].js');
const mvpApi = source('api/mvp-dashboard.js');
const health = source('api/health.js');
const commercialApi = source('api/commercial.js');
const uploadApi = source('api/upload.js');
const schema = source('docs/supabase-schema.sql');
const productionSql = source('docs/supabase-production.sql');
const migration = source('docs/supabase-sprint1-auth-ownership.sql');
const auth = source('js/auth.js');
const site = source('js/site.js');
const selections = source('js/selection-tools.js');
const reservations = source('js/reservation.js');
const adminDashboard = source('js/admin-dashboard.js');
const launchDashboard = source('js/launch-dashboard.js');
const launchChecklist = source('js/launch-checklist.js');

requireTerm('api/[...path].js', api, 'MAX_BODY_BYTES', 'requisições ainda não possuem limite de tamanho.');
requireTerm('api/[...path].js', api, 'enforceRateLimit', 'rotas públicas ainda não possuem contenção de abuso.');
requireTerm('api/[...path].js', api, "if (clean(body.website", 'cadastro público ainda não usa honeypot.');
requireTerm('api/[...path].js', api, "const profileType = 'comprador'", 'cadastro público ainda permite autoatribuição de perfil.');
requireTerm('api/[...path].js', api, 'grant_type=refresh_token', 'sessão não renova o token do Supabase.');
requireTerm('api/[...path].js', api, "supabaseAuth('logout'", 'logout local não revoga a sessão no Supabase.');
requireTerm('api/[...path].js', api, 'async function handleAccount', 'rota de dados próprios da conta não existe.');
requireTerm('api/[...path].js', api, 'const session = await requireUser(req)', 'dados da conta não exigem sessão autenticada.');
requireTerm('api/[...path].js', api, 'saved_selections?user_id=eq.', 'seleções da conta não são filtradas pelo proprietário.');
requireTerm('api/[...path].js', api, 'reservations?user_id=eq.', 'reservas da conta não são filtradas pelo proprietário.');
requireTerm('api/[...path].js', api, 'select=public_token,status,items,briefing,created_at,updated_at', 'link público de seleção ainda consulta campos pessoais.');
requireTerm('api/[...path].js', api, 'withoutPersonalBriefingFields', 'briefing público ainda não remove dados pessoais.');
requireTerm('api/[...path].js', api, 'const guard = adminGuard(req)', 'dashboard consolidado não exige token administrativo.');
requireTerm('api/[...path].js', api, 'safeSelectionUrl', 'links enviados em seleções não são validados.');
requireTerm('api/[...path].js', api, 'return await handleAccount', 'erros assíncronos escapam do tratamento JSON da API.');

if (/saved_selections\?public_token[^\n]+select=\*/.test(api)) {
  issues.push('api/[...path].js: seleção pública ainda usa select=* e pode expor dados pessoais.');
}

requireTerm('api/mvp-dashboard.js', mvpApi, 'adminGuard(req)', 'dashboard MVP continua público.');
requireTerm('api/mvp-dashboard.js', mvpApi, 'timingSafeEqual', 'dashboard MVP compara o token administrativo de forma vulnerável a timing.');
requireTerm('api/commercial.js', commercialApi, 'MAX_BODY_BYTES', 'API comercial não limita o corpo da requisição.');
requireTerm('api/commercial.js', commercialApi, 'Acesso administrativo não autorizado', 'API comercial não exige token administrativo.');
requireTerm('api/commercial.js', commercialApi, 'timingSafeEqual', 'API comercial compara o token administrativo de forma vulnerável a timing.');
requireTerm('api/upload.js', uploadApi, 'MAX_BODY_BYTES', 'upload acumula o corpo sem limite prévio.');
requireTerm('api/upload.js', uploadApi, 'Acesso administrativo não autorizado', 'upload não exige token administrativo.');
requireTerm('api/upload.js', uploadApi, 'timingSafeEqual', 'upload compara o token administrativo de forma vulnerável a timing.');
requireTerm('api/[...path].js', api, 'verification_status=eq.valid', 'consulta pública pode retornar certificado ainda não validado.');
requireTerm('api/health.js', health, 'saved_selections?select=id,user_id,public_token', 'health check não detecta migration de propriedade ausente.');
requireTerm('api/health.js', health, 'reservations?select=id,user_id', 'health check não valida propriedade das reservas.');
requireTerm('docs/supabase-schema.sql', schema, 'gen_random_bytes(16)', 'token público de seleção possui menos de 128 bits no schema.');

['leads', 'company_briefs', 'saved_selections', 'reservations'].forEach((table) => {
  requireTerm('docs/supabase-sprint1-auth-ownership.sql', migration, `alter table public.${table}`, `migration não vincula ${table} à conta.`);
});
requireTerm('docs/supabase-sprint1-auth-ownership.sql', migration, 'drop policy if exists selections_public_token_read', 'leitura direta de seleção pública ainda está permitida.');
requireTerm('docs/supabase-sprint1-auth-ownership.sql', migration, 'grant update (full_name, phone)', 'perfil autenticado ainda pode alterar campos de autorização.');
requireTerm('docs/supabase-production.sql', productionSql, '(auth.uid() is not null and auth.uid() = user_id)', 'políticas de inserção não validam a propriedade informada.');

requireTerm('js/auth.js', auth, '/api/account', 'Minha Conta não carrega apenas dados do usuário.');
requireTerm('js/auth.js', auth, 'syncLocalSelectionAfterAuth', 'login/cadastro não migram a seleção local para a conta.');
requireTerm('js/site.js', site, 'syncAuthNavigation', 'navegação pública não reconhece a conta autenticada.');
requireTerm('js/selection-tools.js', selections, 'hydrateSelectionFromAccount', 'Minha Seleção não recupera dados da conta em outro dispositivo.');
requireTerm('js/selection-tools.js', selections, 'syncSelectionWithAccount', 'Minha Seleção não sincroniza alterações autenticadas.');
requireTerm('js/selection-tools.js', selections, "credentials:'include'", 'sincronização não envia o cookie de sessão explicitamente.');
requireTerm('js/reservation.js', reservations, "credentials: 'include'", 'reserva não envia o cookie de sessão explicitamente.');
requireTerm('js/admin-dashboard.js', adminDashboard, 'x-arandu-admin-token', 'painel administrativo não envia o token ao dashboard.');
requireTerm('js/launch-dashboard.js', launchDashboard, "json('/api/dashboard',true)", 'painel de lançamento não autentica o dashboard.');
requireTerm('js/launch-checklist.js', launchChecklist, "json('/api/dashboard',true)", 'checklist de lançamento não autentica o dashboard.');

console.log('Arandu Auth & Security Check');
console.log(`Erros: ${issues.length}`);
if (issues.length) {
  issues.forEach((issue) => console.error(`- ${issue}`));
  process.exit(1);
}
console.log('Cadastro, propriedade dos dados e painéis internos protegidos.');
