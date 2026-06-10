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
