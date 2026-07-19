import { existsSync, readFileSync } from 'node:fs';

const warnings = [];

const hasFinalPngLogo = existsSync('assets/logo-arandu.png');
const hasVectorLogo = existsSync('assets/logo-arandu.svg');
if (!hasFinalPngLogo && !hasVectorLogo) warnings.push('Logo ainda não existe em assets/logo-arandu.png ou assets/logo-arandu.svg.');
if (!hasFinalPngLogo && hasVectorLogo) warnings.push('Logo vetorial provisória existe em assets/logo-arandu.svg; substituir por PNG final antes da divulgação ampla.');

if (!existsSync('data/whatsapp-config.js')) {
  warnings.push('Arquivo data/whatsapp-config.js não encontrado.');
}
const whatsappDigits = String(process.env.ARANDU_WHATSAPP_NUMBER || '').replace(/\D/g, '');
const contactEmail = String(process.env.ARANDU_CONTACT_EMAIL || '').trim();
if (whatsappDigits.length < 12 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) warnings.push('Canal real de contato ainda não foi configurado no ambiente.');

if (existsSync('sitemap.xml')) {
  const sitemap = readFileSync('sitemap.xml', 'utf8');
  if (!sitemap.includes('https://') && !process.env.ARANDU_SITE_URL) warnings.push('Sitemap público será gerado no build somente após configurar ARANDU_SITE_URL com domínio próprio.');
  ['admin-preview.html', 'demo.html', 'roadmap.html', 'painel-obras.html'].forEach((internal) => {
    if (sitemap.includes(internal)) warnings.push(`Página interna aparece no sitemap público: ${internal}`);
  });
  ['obra-estudo-de-solo-04.html', 'obra-sertao-silencioso.html', 'obra-equilibrio-suspenso.html', 'empresas-e-arquitetos.html'].forEach((legacy) => {
    if (sitemap.includes(legacy)) warnings.push(`Rota antiga aparece no sitemap público: ${legacy}`);
  });
}

const apiRouter = 'api/[...path].js';
if (!existsSync(apiRouter)) {
  warnings.push('API consolidada ausente: api/[...path].js. O deploy pode voltar a estourar limite de funções na Vercel Hobby.');
} else {
  const apiContent = readFileSync(apiRouter, 'utf8');
  [
    'forms',
    'reservations',
    'proposals',
    'certificates',
    'certificate-document',
    'catalog',
    'artists',
    'public-config',
    'events',
    'pilot',
    'admin',
    'admin-update',
    'operational',
    'media',
    'selections',
    'dashboard',
    'auth/session',
    'auth/login',
    'auth/signup',
    'auth/logout'
  ].forEach((route) => {
    const marker = route.includes('/') ? route.split('/')[0] : route;
    if (!apiContent.includes(marker)) warnings.push(`API consolidada não parece cobrir /api/${route}.`);
  });
  if (!apiContent.includes('ARANDU_ADMIN_TOKEN')) warnings.push('API consolidada não valida ARANDU_ADMIN_TOKEN.');
  if (!apiContent.includes('v_public_catalog')) warnings.push('API consolidada não consulta v_public_catalog.');
  if (!apiContent.includes('v_sales_pipeline')) warnings.push('API consolidada não consulta v_sales_pipeline.');
  if (!apiContent.includes('HttpOnly')) warnings.push('API consolidada não usa cookie HttpOnly para sessão.');
}

if (!existsSync('api/health.js')) warnings.push('Health check ausente: api/health.js.');
if (!existsSync('status.html')) warnings.push('Página de status técnico ausente: status.html.');
if (!existsSync('js/status.js')) warnings.push('Runtime visual de status ausente: js/status.js.');
if (existsSync('js/status.js') && !readFileSync('js/status.js', 'utf8').includes('/api/health')) warnings.push('Página de status não consulta /api/health.');
if (existsSync('vercel.json')) {
  const vercel = readFileSync('vercel.json', 'utf8');
  ['X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'Permissions-Policy'].forEach((header) => {
    if (!vercel.includes(header)) warnings.push(`Header de segurança ausente na Vercel: ${header}.`);
  });
}

const deprecatedApiFiles = [
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

deprecatedApiFiles.forEach((file) => {
  if (existsSync(file)) warnings.push(`Função serverless antiga ainda existe e pode aumentar a contagem na Vercel: ${file}`);
});

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
if (!existsSync('docs/API_CONSOLIDADA_VERCEL.md')) warnings.push('Documentação da API consolidada ausente.');
if (!existsSync('docs/LANCAMENTO_ARANDU.md')) warnings.push('Plano de lançamento ausente.');
if (!existsSync('docs/GO_LIVE_ARANDU.md')) warnings.push('Roteiro go-live ausente.');
if (!existsSync('docs/FLUXO_COMPRA_RESERVA.md')) warnings.push('Fluxo de compra e reserva ausente.');
if (!existsSync('docs/CHECKLIST_PARCEIRA_ARTISTA.md')) warnings.push('Checklist de parceria com artistas ausente.');
if (!existsSync('docs/PROSPECCAO_ARTISTAS_PLAYBOOK.md')) warnings.push('Playbook de prospecção de artistas ausente.');
if (!existsSync('docs/PRIMEIROS_30_DIAS.md')) warnings.push('Plano dos primeiros 30 dias ausente.');
if (!existsSync('docs/SEO_DOMINIO_CHECKLIST.md')) warnings.push('Checklist de SEO e domínio ausente.');
if (!existsSync('docs/REDES_SOCIAIS_ARANDU.md')) warnings.push('Plano de redes sociais ausente.');
if (!existsSync('data/launch-checklist.json')) warnings.push('Checklist estruturado de lançamento ausente.');

if (!process.env.SUPABASE_URL) warnings.push('SUPABASE_URL ainda não está configurado no ambiente de produção.');
if (!process.env.SUPABASE_ANON_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) warnings.push('Chave Supabase ainda não está configurada no ambiente de produção.');
if (!process.env.ARANDU_ADMIN_TOKEN) warnings.push('ARANDU_ADMIN_TOKEN ainda não está configurado no ambiente de produção.');
if (!['1','true','yes','sim'].includes(String(process.env.ARANDU_BRAND_READY || '').toLowerCase())) warnings.push('Identidade final ainda não foi aprovada com ARANDU_BRAND_READY=true.');
if (!['1','true','yes','sim'].includes(String(process.env.ARANDU_COMMERCIAL_READY || '').toLowerCase())) warnings.push('Política comercial ainda não foi aprovada com ARANDU_COMMERCIAL_READY=true.');
if (!['1','true','yes','sim'].includes(String(process.env.ARANDU_DISTRIBUTED_RATE_LIMIT || '').toLowerCase())) warnings.push('Rate limit distribuído ainda não foi confirmado com ARANDU_DISTRIBUTED_RATE_LIMIT=true.');
if (!['1','true','yes','sim'].includes(String(process.env.ARANDU_ERROR_MONITORING_READY || '').toLowerCase())) warnings.push('Monitoramento e alertas ainda não foram confirmados com ARANDU_ERROR_MONITORING_READY=true.');
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(process.env.ARANDU_PRIVACY_CONTACT_EMAIL || '').trim())) warnings.push('Contato LGPD ainda não foi configurado em ARANDU_PRIVACY_CONTACT_EMAIL.');
const backupVerifiedAt = Date.parse(String(process.env.ARANDU_BACKUP_VERIFIED_AT || ''));
if (!Number.isFinite(backupVerifiedAt) || Date.now() - backupVerifiedAt > 30 * 24 * 60 * 60 * 1000) warnings.push('Restauração de backup não foi comprovada nos últimos 30 dias em ARANDU_BACKUP_VERIFIED_AT.');

if (warnings.length) {
  console.warn('Atenções antes de produção:');
  warnings.forEach((item) => console.warn(`- ${item}`));
  process.exitCode = 0;
} else {
  console.log('Sem alertas críticos de pré-produção.');
}
