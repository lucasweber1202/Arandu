import fs from 'node:fs';

const warnings = [];
const issues = [];

const files = [
  'api/_arandu.js',
  'api/forms.js',
  'api/reservations.js',
  'api/proposals.js',
  'api/certificates.js',
  'api/catalog.js',
  'api/artists.js',
  'css/arandu-visual-polish.css',
  'css/arandu-security.css',
  'css/arandu-flow.css',
  'js/arandu-functions.js',
  'js/arandu-recent.js',
  'js/arandu-journey.js',
  'js/arandu-usability.js',
  'js/arandu-security-guard.js',
  'js/arandu-flow.js',
  'docs/supabase-schema.sql',
  'docs/SUPABASE_OPERACAO.md',
  'scripts/seed-supabase.mjs'
];

files.forEach((file) => {
  if (!fs.existsSync(file)) issues.push(`Arquivo obrigatório ausente: ${file}`);
});

function includes(file, term) {
  return fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes(term);
}

if (!includes('js/forms.js', '/api/forms')) issues.push('js/forms.js não aponta para /api/forms.');
if (!includes('js/reservation.js', '/api/reservations')) issues.push('js/reservation.js não aponta para /api/reservations.');
if (!includes('js/proposal-api.js', '/api/proposals')) issues.push('js/proposal-api.js não aponta para /api/proposals.');
if (!includes('js/certificates.js', '/api/certificates')) issues.push('js/certificates.js não consulta /api/certificates.');
if (!includes('js/catalog-filters.js', '/api/catalog')) issues.push('Catálogo público não consulta /api/catalog.');
if (!includes('js/artwork_page.js', '/api/catalog')) issues.push('Página da obra não consulta /api/catalog.');
if (!includes('js/painel-operacional.js', 'arandu.reservations.v1')) issues.push('Painel não lê reservas locais.');
if (!includes('js/painel-operacional.js', 'arandu.proposals.history.v1')) issues.push('Painel não lê propostas locais.');
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

if (!process.env.SUPABASE_URL) warnings.push('SUPABASE_URL ausente. Endpoints funcionarão em modo demo/local.');
if (!process.env.SUPABASE_ANON_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) warnings.push('Chave Supabase ausente. Endpoints funcionarão em modo demo/local.');
if (process.env.SUPABASE_ANON_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) warnings.push('Apenas SUPABASE_ANON_KEY configurada. Para seed e operações administrativas, use SERVICE_ROLE com cuidado no ambiente servidor.');

console.log('Arandu Backend Check');
console.log(`Erros: ${issues.length}`);
console.log(`Alertas: ${warnings.length}`);

if (issues.length) {
  console.error('\nErros:');
  issues.forEach((issue) => console.error(`- ${issue}`));
}

if (warnings.length) {
  console.warn('\nAlertas:');
  warnings.forEach((warning) => console.warn(`- ${warning}`));
}

if (issues.length) process.exit(1);
