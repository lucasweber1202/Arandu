import { existsSync, readFileSync } from 'node:fs';

const warnings = [];

if (!existsSync('assets/logo-arandu.png')) warnings.push('Logo PNG final ainda não existe em assets/logo-arandu.png.');

if (existsSync('data/whatsapp-config.js')) {
  const content = readFileSync('data/whatsapp-config.js', 'utf8');
  const match = content.match(/ARANDU_WHATSAPP_NUMBER\s*=\s*['"]([^'"]*)['"]/);
  const number = match ? match[1].replace(/\D/g, '') : '';
  if (content.includes('5500000000000')) warnings.push('WhatsApp ainda está com número placeholder.');
  if (!number || number.length < 12) warnings.push('WhatsApp real ainda não está configurado em data/whatsapp-config.js.');
} else {
  warnings.push('Arquivo data/whatsapp-config.js não encontrado.');
}

if (existsSync('sitemap.xml')) {
  const sitemap = readFileSync('sitemap.xml', 'utf8');
  if (!sitemap.includes('https://')) warnings.push('sitemap.xml ainda usa URLs relativas; atualizar com domínio real antes da produção.');
  ['admin-preview.html', 'demo.html', 'roadmap.html', 'painel-obras.html'].forEach((internal) => {
    if (sitemap.includes(internal)) warnings.push(`Página interna aparece no sitemap público: ${internal}`);
  });
  ['obra-estudo-de-solo-04.html', 'obra-sertao-silencioso.html', 'obra-equilibrio-suspenso.html', 'empresas-e-arquitetos.html'].forEach((legacy) => {
    if (sitemap.includes(legacy)) warnings.push(`Rota antiga aparece no sitemap público: ${legacy}`);
  });
}

const requiredApi = [
  'api/forms.js',
  'api/reservations.js',
  'api/proposals.js',
  'api/certificates.js',
  'api/catalog.js',
  'api/artists.js',
  'api/admin.js',
  'api/operational.js',
  'api/selections.js',
  'api/dashboard.js',
  'api/auth/session.js',
  'api/auth/login.js',
  'api/auth/signup.js',
  'api/auth/logout.js',
  'api/_arandu.js'
];
requiredApi.forEach((file) => { if (!existsSync(file)) warnings.push(`Endpoint operacional ausente: ${file}`); });

if (!existsSync('docs/supabase-schema.sql')) {
  warnings.push('Schema Supabase ainda não existe em docs/supabase-schema.sql.');
} else {
  const schema = readFileSync('docs/supabase-schema.sql', 'utf8');
  ['saved_selections', 'crm_notes', 'tasks', 'v_sales_pipeline'].forEach((term) => {
    if (!schema.includes(term)) warnings.push(`Schema Supabase não contém ${term}.`);
  });
}

if (existsSync('js/forms.js') && !readFileSync('js/forms.js', 'utf8').includes('/api/forms')) warnings.push('Formulários ainda não apontam para /api/forms.');
if (existsSync('js/reservation.js') && !readFileSync('js/reservation.js', 'utf8').includes('/api/reservations')) warnings.push('Reservas ainda não apontam para /api/reservations.');
if (existsSync('js/proposal-api.js') && !readFileSync('js/proposal-api.js', 'utf8').includes('/api/proposals')) warnings.push('Propostas ainda não apontam para /api/proposals.');
if (existsSync('js/painel-operacional.js') && !readFileSync('js/painel-operacional.js', 'utf8').includes('/api/admin')) warnings.push('Painel operacional ainda não aponta para /api/admin.');
if (existsSync('js/painel-detalhes.js') && !readFileSync('js/painel-detalhes.js', 'utf8').includes('/api/operational')) warnings.push('Detalhes operacionais ainda não apontam para /api/operational.');
if (existsSync('js/selection-tools.js') && !readFileSync('js/selection-tools.js', 'utf8').includes('/api/selections')) warnings.push('Minha seleção ainda não aponta para /api/selections.');
if (existsSync('verificar-certificado.html') && !readFileSync('verificar-certificado.html', 'utf8').includes('certificate-api.js')) warnings.push('Verificação de certificado ainda não consulta a API pública.');
if (!process.env.SUPABASE_URL) warnings.push('SUPABASE_URL ainda não está configurado no ambiente de produção.');
if (!process.env.SUPABASE_ANON_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) warnings.push('Chave Supabase ainda não está configurada no ambiente de produção.');
if (!process.env.ARANDU_ADMIN_TOKEN) warnings.push('ARANDU_ADMIN_TOKEN ainda não está configurado no ambiente de produção.');

if (warnings.length) {
  console.warn('Atenções antes de produção:');
  warnings.forEach((item) => console.warn(`- ${item}`));
  process.exitCode = 0;
} else {
  console.log('Sem alertas críticos de pré-produção.');
}
