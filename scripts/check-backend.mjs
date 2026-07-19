import fs from 'node:fs';

const warnings = [];
const issues = [];

const requiredFiles = [
  'api/[...path].js',
  'api/health.js',
  'api/collections.js',
  'api/commercial.js',
  'api/mvp-dashboard.js',
  'api/upload.js',
  'status.html',
  'js/status.js',
  'css/arandu-visual-polish.css',
  'css/arandu-security.css',
  'css/arandu-flow.css',
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
  'scripts/seed-supabase.mjs'
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
['forms','reservations','proposals','certificates','certificate-document','catalog','artists','public-config','events','conversion-events','catalog-review','privacy/export','privacy/request','pilot','admin','admin-update','operational','media','selections','account','dashboard','auth/session','auth/login','auth/signup','auth/reset-password','auth/logout'].forEach((route) => {
  if (!includes(api, route.split('/')[0])) issues.push(`API consolidada não cobre a rota: /api/${route}`);
});

if (!includes('api/health.js', 'productionReady')) issues.push('Health check não calcula prontidão de produção.');
if (!includes('api/health.js', 'SUPABASE_URL')) issues.push('Health check não valida SUPABASE_URL.');
if (!includes('api/health.js', 'ARANDU_ADMIN_TOKEN')) issues.push('Health check não valida ARANDU_ADMIN_TOKEN.');
if (!includes('api/health.js', 'v_catalog_readiness')) issues.push('Health check não consulta a prontidão real do catálogo.');
if (!includes('api/health.js', 'v_public_collections')) issues.push('Health check não consulta as coleções públicas.');
if (!includes('api/health.js', 'brandReady')) issues.push('Health check não valida a aprovação da marca.');
if (!includes('api/health.js', 'commercialReady')) issues.push('Health check não valida a aprovação comercial.');
if (!includes('api/health.js', 'pilotReady')) issues.push('Health check não valida o piloto fechado.');
if (!includes('api/health.js', 'pilotApproved')) issues.push('Health check não exige a conclusão do piloto para lançamento.');
if (!includes('js/status.js', '/api/health')) issues.push('status.js não consulta /api/health.');
if (!includes('status.html', 'data-api-status')) issues.push('status.html não possui área dinâmica de status.');

if (!includes(api, 'ARANDU_ADMIN_TOKEN')) issues.push('API consolidada não exige ARANDU_ADMIN_TOKEN nas rotas administrativas.');
if (!includes(api, 'v_artworks_full')) issues.push('API consolidada não usa a view completa de obras.');
if (!includes(api, 'v_sales_pipeline')) issues.push('Dashboard consolidado não consulta o pipeline comercial.');
if (!includes(api, 'grant_type=password')) issues.push('Login consolidado não usa fluxo de senha do Supabase Auth.');
if (!includes(api, 'signup')) issues.push('Cadastro consolidado não usa Supabase Auth signup.');
if (!includes(api, 'HttpOnly')) issues.push('Sessão consolidada não usa cookie HttpOnly.');
if (!includes(api, 'media_assets')) issues.push('API consolidada não grava media_assets.');
if (!includes(api, 'validUrl')) issues.push('API consolidada não valida URLs de mídia.');
if (!includes(api, 'saved_selections')) issues.push('API consolidada não grava em saved_selections.');
if (!includes(api, 'briefing')) issues.push('API consolidada não preserva briefing.');
if (!includes(api, 'crm_notes')) issues.push('API consolidada não grava notas de CRM.');
if (!includes(api, 'tasks')) issues.push('API consolidada não grava tarefas.');
if (!includes(api, 'PATCH')) issues.push('API consolidada não possui rotas de atualização PATCH.');
if (!includes(api, 'catalog_not_verified')) issues.push('API consolidada não bloqueia catálogo não verificado.');
if (!includes(api, 'commercial_policy_pending')) issues.push('API consolidada não bloqueia transações antes da aprovação comercial.');
if (!includes(api, 'arandu_pilot')) issues.push('API consolidada não cria sessão protegida do piloto.');
if (!includes(api, 'publicDataRequest')) issues.push('API consolidada não separa leitura pública da service role.');
if (!includes(api, 'handleCatalogReview')) issues.push('API consolidada não oferece workflow editorial.');
if (!includes(api, 'handlePrivacy')) issues.push('API consolidada não oferece solicitações LGPD.');
if (!includes('js/platform-runtime.js', 'data-consent-essential')) issues.push('Runtime global não oferece consentimento granular.');

if (!includes('js/forms.js', '/api/forms')) issues.push('js/forms.js não aponta para /api/forms.');
if (!includes('js/reservation.js', '/api/reservations')) issues.push('js/reservation.js não aponta para /api/reservations.');
if (!includes('js/proposal-api.js', '/api/proposals')) issues.push('js/proposal-api.js não aponta para /api/proposals.');
if (!includes('js/certificates.js', '/api/certificates')) issues.push('js/certificates.js não consulta /api/certificates.');
if (!includes('js/certificate-document-link.js', '/api/certificate-document')) issues.push('Certificados não apontam para documento imprimível.');
if (!includes('js/catalog-source.js', '/api/catalog')) issues.push('Fonte única do catálogo não consulta /api/catalog.');
if (!includes('api/collections.js', 'v_catalog_readiness')) issues.push('Coleções públicas não exigem prontidão do catálogo.');
if (!includes('api/collections.js', 'v_public_collections')) issues.push('Coleções públicas não usam a view segura.');
if (!includes('js/catalog-filters.js', 'AranduCatalogSource')) issues.push('Catálogo público não usa a fonte única verificada.');
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
if (!includes('js/site.js', 'arandu-visual-polish.css')) issues.push('site.js não injeta arandu-visual-polish.css.');
if (!includes('js/arandu-usability.js', 'arandu-security-guard.js')) issues.push('Camada de segurança leve não é carregada pela usabilidade.');
if (!includes('js/arandu-usability.js', 'arandu-flow.js')) issues.push('Fluxo guiado não é carregado pela usabilidade.');
if (!includes('js/arandu-security-guard.js', 'arandu.admin.token')) issues.push('Camada de segurança não protege token administrativo local.');
if (!includes('js/arandu-security-guard.js', 'website')) issues.push('Camada de segurança não adiciona honeypot aos formulários.');
if (!includes('js/arandu-flow.js', 'arandu-flow-map')) issues.push('Fluxo guiado não cria mapa da jornada.');
if (!includes('js/arandu-flow.js', 'Próximo passo')) issues.push('Fluxo guiado não cria próximo passo contextual.');
if (!includes('css/arandu-flow.css', 'arandu-flow-shell')) issues.push('CSS do fluxo guiado não estiliza a jornada.');
if (!includes('js/arandu-functions.js', 'arandu.compare.v1')) issues.push('Camada funcional não cria comparação de obras.');
if (!includes('js/arandu-recent.js', 'arandu.recentlyViewed.v1')) issues.push('Camada de recentes não registra obras vistas.');
if (!includes('js/arandu-journey.js', 'arandu.proposals.history.v1')) issues.push('Assistente de jornada não acompanha propostas locais.');
if (!includes('js/arandu-usability.js', 'arandu-read-progress')) issues.push('Camada de usabilidade não cria progresso de leitura.');
if (!includes('js/arandu-usability.js', 'arandu-help-panel')) issues.push('Camada de usabilidade não cria ajuda rápida.');
if (!includes('css/arandu-visual-polish.css', 'arandu-journey-panel')) issues.push('Camada visual não estiliza assistente de jornada.');
if (!includes('css/arandu-visual-polish.css', 'arandu-help-panel')) issues.push('Camada visual não estiliza ajuda rápida.');
if (!includes('js/selection-tools.js', 'data-share-selection')) issues.push('Minha seleção não possui compartilhamento por link.');
if (!includes('js/selection-tools.js', 'selectionReadiness')) issues.push('Minha seleção não calcula prontidão de compra.');
if (!includes('comparar-obras.html', 'data-compare-runtime')) issues.push('Página de comparação não possui área dinâmica.');

if (!process.env.SUPABASE_URL) warnings.push('SUPABASE_URL ausente. Rotas persistentes e catálogo público responderão como indisponíveis.');
if (!process.env.SUPABASE_ANON_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) warnings.push('Chave Supabase ausente. Rotas de dados permanecerão bloqueadas.');
if (process.env.SUPABASE_ANON_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) warnings.push('Apenas SUPABASE_ANON_KEY configurada. Para seed e operações administrativas, use SERVICE_ROLE com cuidado no ambiente servidor.');
if (!process.env.ARANDU_ADMIN_TOKEN) warnings.push('ARANDU_ADMIN_TOKEN ausente. O painel administrativo permanecerá bloqueado.');

console.log('Arandu Backend Check');
console.log('Arquitetura serverless: 6 funções gerenciadas em api/.');
console.log(`Erros: ${issues.length}`);
console.log(`Alertas: ${warnings.length}`);
if (issues.length) { console.error('\nErros:'); issues.forEach((issue) => console.error(`- ${issue}`)); }
if (warnings.length) { console.warn('\nAlertas:'); warnings.forEach((warning) => console.warn(`- ${warning}`)); }
if (issues.length) process.exit(1);
