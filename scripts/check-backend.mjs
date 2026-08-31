import fs from 'node:fs';

const warnings = [];
const issues = [];

const requiredFiles = [
  'api/[...path].js',
  'api/admin-auth.js',
  'api/health.js',
  'api/internal-page.js',
  'api/readiness.js',
  'api/collections.js',
  'api/commercial.js',
  'api/mvp-dashboard.js',
  'api/upload.js',
  'lib/api-core.mjs',
  'lib/api-dtos.mjs',
  'lib/api/domains/auth.mjs',
  'lib/api/domains/pilot.mjs',
  'lib/api/domains/public-content.mjs',
  'lib/api/domains/intake.mjs',
  'lib/api/domains/admin-operations.mjs',
  'lib/api/domains/selections.mjs',
  'lib/api/domains/accounts.mjs',
  'lib/api/domains/privacy.mjs',
  'lib/api/domains/dashboard.mjs',
  'status.html',
  'js/status.js',
  'js/admin-login.js',
  'css/arandu-runtime.css',
  'js/arandu-functions.js',
  'js/arandu-recent.js',
  'js/arandu-journey.js',
  'js/arandu-usability.js',
  'js/arandu-security-guard.js',
  'js/arandu-flow.js',
  'js/painel-edit.js',
  'js/certificate-document-link.js',
  'js/catalog-source.js',
  'js/pilot.js',
  'piloto.html',
  'painel-piloto.html',
  'docs/supabase-schema.sql',
  'docs/supabase-sprint1-auth-ownership.sql',
  'docs/supabase-sprint2-catalog-readiness.sql',
  'docs/arandu-mvp-collections.sql',
  'docs/supabase-sprint5-pilot.sql',
  'docs/supabase-sprint6-12-platform.sql',
  'docs/supabase-migrations.json',
  'docs/SUPABASE_OPERACAO.md',
  'scripts/seed-supabase.mjs',
  'scripts/test-api-core.mjs',
  'scripts/test-api-dtos.mjs'
];

const removedServerlessFiles = [
  'api/_arandu.js',
  'api/forms.js',
  'api/reservations.js',
  'api/proposals.js',
  'api/certificates.js',
  'api/certificate-document.js',
  'api/catalog.js',
  'api/artists.js',
  'api/admin.js',
  'api/admin-update.js',
  'api/operational.js',
  'api/media.js',
  'api/selections.js',
  'api/dashboard.js',
  'api/auth/_auth.js',
  'api/auth/session.js',
  'api/auth/login.js',
  'api/auth/signup.js',
  'api/auth/logout.js'
];

requiredFiles.forEach((file) => { if (!fs.existsSync(file)) issues.push(`Arquivo obrigatório ausente: ${file}`); });
removedServerlessFiles.forEach((file) => { if (fs.existsSync(file)) issues.push(`Função serverless antiga ainda existe e aumenta a contagem no Vercel: ${file}`); });

function includes(file, term) { return fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes(term); }

const api = 'api/[...path].js';
const domainDirectory = 'lib/api/domains';
const domainFiles = fs.existsSync(domainDirectory)
  ? fs.readdirSync(domainDirectory).filter((file) => file.endsWith('.mjs')).map((file) => `${domainDirectory}/${file}`)
  : [];
const apiSourceGraph = [api, ...domainFiles]
  .filter((file) => fs.existsSync(file))
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n');
function apiIncludes(term) { return apiSourceGraph.includes(term); }
if (fs.existsSync(api)) {
  const apiSource = fs.readFileSync(api, 'utf8');
  const apiLines = apiSource.split(/\r?\n/).length;
  if (apiLines > 500) issues.push(`Router da API voltou a exceder o budget de 500 linhas: ${apiLines}.`);
  if (Buffer.byteLength(apiSource, 'utf8') > 25_000) issues.push('Router da API voltou a exceder o budget de 25 KB.');
  if (domainFiles.length < 9) issues.push(`A API deve manter ao menos 9 módulos de domínio; encontrados: ${domainFiles.length}.`);
  if (!apiSource.includes("from '../lib/api-core.mjs'")) issues.push('API consolidada não usa o núcleo HTTP compartilhado.');
  if (!apiSource.includes("from '../lib/api-dtos.mjs'")) issues.push('API consolidada não usa DTOs separados por allowlist.');
  for (const declaration of ['class HttpError', 'function readBody(', 'function normalizeFormPayload(', 'function normalizeSelection(', 'async function handleAuth(', 'async function handleAdmin(']) {
    if (apiSource.includes(declaration)) issues.push(`API consolidada reintroduziu responsabilidade extraída: ${declaration}.`);
  }
}
['forms','reservations','proposals','certificates','certificate-document','catalog','artists','public-config','events','conversion-events','catalog-review','privacy/export','privacy/request','pilot','admin','admin-update','operational','media','selections','account','dashboard','auth/session','auth/login','auth/signup','auth/reset-password','auth/logout'].forEach((route) => {
  if (!apiIncludes(route.split('/')[0])) issues.push(`API consolidada não cobre a rota: /api/${route}`);
});

if (!includes('api/health.js', "status: 'alive'")) issues.push('Health público não está limitado à liveness mínima.');
if (includes('api/health.js', 'SUPABASE_URL') || includes('api/health.js', 'process.env')) issues.push('Health público ainda expõe ou consulta configuração interna.');
if (!includes('api/readiness.js', 'productionReady')) issues.push('Readiness protegida não calcula prontidão de produção.');
if (!includes('api/readiness.js', 'SUPABASE_URL')) issues.push('Readiness protegida não valida SUPABASE_URL.');
if (!includes('api/readiness.js', 'v_catalog_readiness')) issues.push('Readiness protegida não consulta a prontidão real do catálogo.');
if (!includes('api/readiness.js', 'v_public_collections')) issues.push('Readiness protegida não consulta as coleções públicas.');
if (!includes('api/readiness.js', 'brandReady')) issues.push('Readiness protegida não valida a aprovação da marca.');
if (!includes('api/readiness.js', 'commercialReady')) issues.push('Readiness protegida não valida a aprovação comercial.');
if (!includes('api/readiness.js', 'pilotApproved')) issues.push('Readiness protegida não exige a conclusão do piloto para lançamento.');
if (!includes('api/readiness.js', 'requireAdmin(req)')) issues.push('Readiness detalhada não exige sessão administrativa.');
if (!includes('js/status.js', '/api/readiness')) issues.push('status.js não consulta /api/readiness.');
if (!includes('status.html', 'data-api-status')) issues.push('status.html não possui área dinâmica de status.');

if (!apiIncludes('requireAdmin(req)')) issues.push('API consolidada não exige identidade administrativa nas rotas privilegiadas.');
const legacySecret = ['ARANDU', 'ADMIN', 'TOKEN'].join('_');
const legacyHeader = ['x-arandu', 'admin-token'].join('-');
if (apiIncludes(legacySecret) || apiIncludes(legacyHeader)) issues.push('API consolidada ainda aceita segredo administrativo compartilhado.');
if (!includes('lib/admin-auth.mjs', 'app_metadata')) issues.push('Papel administrativo não é lido de app_metadata.');
if (!includes('lib/admin-auth.mjs', "aal !== 'aal2'")) issues.push('Operações administrativas não exigem MFA aal2.');
if (!includes('api/internal-page.js', 'requireAdmin(req)')) issues.push('Páginas internas não possuem guarda de sessão.');
if (!apiIncludes('v_artworks_full')) issues.push('API consolidada não usa a view completa de obras.');
if (!apiIncludes('v_sales_pipeline')) issues.push('Dashboard consolidado não consulta o pipeline comercial.');
if (!apiIncludes('grant_type=password')) issues.push('Login consolidado não usa fluxo de senha do Supabase Auth.');
if (!apiIncludes('signup')) issues.push('Cadastro consolidado não usa Supabase Auth signup.');
if (!apiIncludes('HttpOnly')) issues.push('Sessão consolidada não usa cookie HttpOnly.');
if (!apiIncludes('media_assets')) issues.push('API consolidada não grava media_assets.');
if (!apiIncludes('validUrl')) issues.push('API consolidada não valida URLs de mídia.');
if (!apiIncludes('saved_selections')) issues.push('API consolidada não grava em saved_selections.');
if (!apiIncludes('briefing')) issues.push('API consolidada não preserva briefing.');
if (!apiIncludes('crm_notes')) issues.push('API consolidada não grava notas de CRM.');
if (!apiIncludes('tasks')) issues.push('API consolidada não grava tarefas.');
if (!apiIncludes('PATCH')) issues.push('API consolidada não possui rotas de atualização PATCH.');
if (!apiIncludes('catalog_not_verified')) issues.push('API consolidada não bloqueia catálogo não verificado.');
if (!apiIncludes('requireCommercialPolicy')) issues.push('API consolidada não aplica a política comercial central e fail-closed.');
if (!apiIncludes('arandu_pilot')) issues.push('API consolidada não cria sessão protegida do piloto.');
if (!apiIncludes('publicDataRequest')) issues.push('API consolidada não separa leitura pública da service role.');
if (!apiIncludes('handleCatalogReview')) issues.push('API consolidada não oferece workflow editorial.');
if (!apiIncludes('handlePrivacy')) issues.push('API consolidada não oferece solicitações LGPD.');
if (!includes('js/platform-runtime.js', 'data-consent-essential')) issues.push('Runtime global não oferece consentimento granular.');

if (!includes('js/forms.js', '/api/forms')) issues.push('js/forms.js não aponta para /api/forms.');
if (!includes('js/reservation.js', '/api/reservations')) issues.push('js/reservation.js não aponta para /api/reservations.');
if (!includes('js/proposal-api.js', '/api/proposals')) issues.push('js/proposal-api.js não aponta para /api/proposals.');
if (!includes('js/certificates.js', '/api/certificates')) issues.push('js/certificates.js não consulta /api/certificates.');
if (!includes('js/certificate-document-link.js', '/api/certificate-document')) issues.push('Certificados não apontam para documento imprimível.');
if (!includes('js/catalog-source.js', '/api/catalog')) issues.push('Fonte única do catálogo não consulta /api/catalog.');
if (!includes('api/collections.js', 'v_catalog_readiness')) issues.push('Coleções públicas não exigem prontidão do catálogo.');
if (!includes('api/collections.js', 'v_public_collections')) issues.push('Coleções públicas não usam a view segura.');
if (!includes('js/catalog-page.js', 'AranduCatalogSource')) issues.push('Catálogo público não usa a fonte única verificada.');
if (!includes('js/artwork_page.js', 'AranduCatalogSource')) issues.push('Página da obra não usa a fonte única verificada.');
if (!includes('js/artists-page.js', 'AranduCatalogSource')) issues.push('Página de artistas não usa a fonte única verificada.');
if (!includes('js/painel-operacional.js', '/api/admin')) issues.push('Painel operacional não consulta /api/admin.');
if (!includes('js/painel-detalhes.js', '/api/operational')) issues.push('Drawer de detalhes não consulta /api/operational.');
if (!includes('js/painel-detalhes.js', '/api/media')) issues.push('Drawer de detalhes não consulta /api/media.');
if (!includes('js/admin-cadastros.js', '/api/admin')) issues.push('Cadastros administrativos não usam /api/admin unificado.');
if (!includes('js/painel-edit.js', '/api/admin-update')) issues.push('Editor inline não salva via /api/admin-update.');
if (!includes('js/auth.js', '/api/auth/session')) issues.push('Front de autenticação não consulta sessão.');
if (!includes('js/auth.js', '/api/account')) issues.push('Minha Conta não consulta dados vinculados ao usuário.');
if (!includes('js/auth.js', 'pipelineCards')) issues.push('Dashboard visual não renderiza pipeline recente.');
if (!includes('js/selection-tools.js', '/api/selections')) issues.push('Minha seleção não tenta salvar compartilhamento via /api/selections.');
if (!includes('js/selection-tools.js', 'selection_token')) issues.push('Minha seleção não importa link por token curto.');

if (!includes('docs/supabase-schema.sql', 'set_updated_at')) issues.push('Schema não possui trigger de updated_at.');
if (!includes('docs/supabase-schema.sql', 'idx_saved_selections_public_token')) issues.push('Schema não indexa token público das seleções.');
if (!includes('docs/supabase-schema.sql', "select 'selection' as source")) issues.push('Pipeline comercial não inclui seleções salvas.');
if (!includes('js/site.js', 'proposal-api.js')) warnings.push('site.js não injeta proposal-api.js automaticamente.');
if (!includes('js/site.js', 'arandu-functions.js')) issues.push('site.js não injeta arandu-functions.js.');
if (!includes('js/site.js', 'arandu-recent.js')) issues.push('site.js não injeta arandu-recent.js.');
if (!includes('js/site.js', 'arandu-journey.js')) issues.push('site.js não injeta arandu-journey.js.');
if (!includes('js/site.js', 'arandu-usability.js')) issues.push('site.js não injeta arandu-usability.js.');
if (includes('js/site.js', 'createElement(\'link\')')) issues.push('site.js voltou a injetar folhas CSS em runtime.');
if (!includes('js/arandu-usability.js', 'arandu-security-guard.js')) issues.push('Camada de segurança leve não é carregada pela usabilidade.');
if (!includes('js/arandu-usability.js', 'arandu-flow.js')) issues.push('Fluxo guiado não é carregado pela usabilidade.');
if (!includes('js/arandu-security-guard.js', 'website')) issues.push('Camada de segurança não adiciona honeypot aos formulários.');
if (!includes('js/arandu-flow.js', 'arandu-flow-map')) issues.push('Fluxo guiado não cria mapa da jornada.');
if (!includes('js/arandu-flow.js', 'Próximo passo')) issues.push('Fluxo guiado não cria próximo passo contextual.');
if (!includes('css/arandu-runtime.css', 'arandu-flow-shell')) issues.push('Bundle CSS canônico não estiliza a jornada.');
if (!includes('js/arandu-functions.js', 'arandu.compare.v1')) issues.push('Camada funcional não cria comparação de obras.');
if (!includes('js/arandu-recent.js', 'arandu.recentlyViewed.v1')) issues.push('Camada de recentes não registra obras vistas.');
if (!includes('js/arandu-journey.js', 'arandu.proposals.history.v1')) issues.push('Assistente de jornada não acompanha propostas locais.');
if (!includes('js/arandu-usability.js', 'arandu-read-progress')) issues.push('Camada de usabilidade não cria progresso de leitura.');
if (!includes('js/arandu-usability.js', 'arandu-help-panel')) issues.push('Camada de usabilidade não cria ajuda rápida.');
if (!includes('css/arandu-runtime.css', 'arandu-journey-panel')) issues.push('Camada visual não estiliza assistente de jornada.');
if (!includes('css/arandu-runtime.css', 'arandu-help-panel')) issues.push('Camada visual não estiliza ajuda rápida.');
if (!includes('js/selection-tools.js', 'data-share-selection')) issues.push('Minha seleção não possui compartilhamento por link.');
if (!includes('js/selection-tools.js', 'selectionReadiness')) issues.push('Minha seleção não calcula prontidão de compra.');
if (!includes('comparar-obras.html', 'data-compare-runtime')) issues.push('Página de comparação não possui área dinâmica.');

if (!process.env.SUPABASE_URL) warnings.push('SUPABASE_URL ausente. Rotas persistentes e catálogo público responderão como indisponíveis.');
if (!process.env.SUPABASE_ANON_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) warnings.push('Chave Supabase ausente. Rotas de dados permanecerão bloqueadas.');
if (process.env.SUPABASE_ANON_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) warnings.push('Apenas SUPABASE_ANON_KEY configurada. Para seed e operações administrativas, use SERVICE_ROLE com cuidado no ambiente servidor.');
if (!process.env.SUPABASE_ANON_KEY) warnings.push('SUPABASE_ANON_KEY ausente. Login administrativo permanecerá bloqueado.');

console.log('Arandu Backend Check');
console.log(`Arquitetura serverless: ${fs.readdirSync('api').filter((name) => name.endsWith('.js')).length} funções gerenciadas em api/.`);
console.log(`Erros: ${issues.length}`);
console.log(`Alertas: ${warnings.length}`);
if (issues.length) { console.error('\nErros:'); issues.forEach((issue) => console.error(`- ${issue}`)); }
if (warnings.length) { console.warn('\nAlertas:'); warnings.forEach((warning) => console.warn(`- ${warning}`)); }
if (issues.length) process.exit(1);
