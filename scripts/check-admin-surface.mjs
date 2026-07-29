import fs from 'node:fs';
import { INTERNAL_PAGES } from '../lib/internal-pages.mjs';

const issues = [];
const read = (file) => fs.readFileSync(file, 'utf8');
const vercel = JSON.parse(read('vercel.json'));
const vite = read('vite.config.js');
const health = read('api/health.js');
const router = read('api/[...path].js');
const privilegedApis = [
  router,
  read('api/commercial.js'),
  read('api/mvp-dashboard.js'),
  read('api/upload.js')
].join('\n');

if (!vite.includes('INTERNAL_PAGE_SET')) issues.push('Vite não exclui as páginas internas do artefato estático.');
if (!read('api/internal-page.js').includes('requireAdmin(req)')) issues.push('Servidor de páginas internas não exige autenticação.');
if (!read('lib/admin-auth.mjs').includes('app_metadata')) issues.push('Papel administrativo não vem de app_metadata.');
if (!read('lib/admin-auth.mjs').includes("aal !== 'aal2'")) issues.push('MFA aal2 não é obrigatório.');
if (!vercel.functions?.['api/internal-page.js']?.includeFiles?.includes('*.html')) issues.push('Função interna não inclui as fontes HTML protegidas.');

const rewriteMap = new Map((vercel.rewrites || []).map((item) => [item.source, item.destination]));
for (const page of INTERNAL_PAGES) {
  if (!fs.existsSync(page)) issues.push(`Página interna declarada não existe: ${page}`);
  if (rewriteMap.get(`/${page}`) !== `/api/internal-page?page=${page}`) {
    issues.push(`Rewrite protegido ausente ou incorreto: /${page}`);
  }
}

if (/SUPABASE|process\.env|routes|missing|checks/i.test(health)) issues.push('Health público ainda contém detalhes internos.');
if (/ARANDU_ADMIN_TOKEN|x-arandu-admin-token/.test(privilegedApis)) issues.push('API privilegiada ainda aceita segredo administrativo compartilhado.');
if (/SUPABASE_SERVICE_KEY\s*\|\|\s*SUPABASE_ANON_KEY/.test(privilegedApis)) issues.push('Service role ainda possui fallback para anon key.');

console.log('Arandu Admin Surface Check');
console.log(`Páginas internas protegidas: ${INTERNAL_PAGES.length}`);
console.log(`Erros: ${issues.length}`);
issues.forEach((issue) => console.error(`- ${issue}`));
if (issues.length) process.exit(1);
