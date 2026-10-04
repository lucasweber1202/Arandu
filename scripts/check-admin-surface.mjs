import fs from 'node:fs';

// A antiga superfície administrativa da vertical de arte (painéis, editores,
// certificados, servidor de páginas internas com sessão de "operator/curator")
// foi aposentada (docs/LEGACY_ART_RETIREMENT.md). Este gate falha se ela voltar
// ao tree, ao build ou ao roteamento da Vercel. A administração do produto
// financeiro mora em /finance (organização) e no console finance_ops (MFA).

const RETIRED_INTERNAL_PAGES = Object.freeze([
  'admin-preview.html', 'admin.html', 'admin-login.html', 'artista-editor.html', 'benchmark-conversao.html', 'calendario-editorial.html',
  'catalogo-intake.html', 'certificados-admin.html', 'certificado-imprimivel.html', 'checklist-lancamento.html', 'colecoes-admin.html',
  'configuracao.html', 'demo.html', 'diagnostico-catalogo.html', 'dominio-go-live.html', 'editor-registro.html', 'funil-comercial.html',
  'go-live.html', 'historico-artista.html', 'historico-obra.html', 'kanban-comercial.html', 'lancamento.html', 'lead-detalhe.html',
  'mvp-operacional.html', 'obra-editor.html', 'onboarding-artista.html', 'operacao-obras.html', 'operacao.html', 'painel-admin.html',
  'painel-artistas.html', 'painel-briefings.html', 'painel-cadastros.html', 'painel-certificados.html', 'painel-leads.html',
  'painel-mvp.html', 'painel-obras.html', 'painel-pedidos.html', 'painel-piloto.html', 'painel-propostas.html', 'painel-qualidade.html',
  'painel-reservas.html', 'painel-submissoes.html', 'painel-tarefas.html', 'painel.html', 'piloto.html', 'propostas-admin.html',
  'proposta-pdf.html', 'prospeccao-artistas.html', 'revisao-catalogo.html', 'status.html', 'templates-comunicacao.html', 'upload-imagens.html'
]);

const issues = [];
const read = (file) => fs.readFileSync(file, 'utf8');
const vercel = JSON.parse(read('vercel.json'));
const vite = read('vite.config.js');
const health = read('api/health.js');
const router = read('api/[...path].js');

if (!vite.includes('const pages = [') || vite.includes('collectHtmlFiles(')) issues.push('Vite não restringe o artefato a entradas explícitas.');
if (fs.existsSync('api/internal-page.js') || vercel.functions?.['api/internal-page.js']) issues.push('Servidor de páginas internas da vertical de arte reapareceu.');
const rewrites = JSON.stringify(vercel.rewrites || []) + JSON.stringify(vercel.routes || []);
for (const page of RETIRED_INTERNAL_PAGES) {
  if (fs.existsSync(page)) issues.push(`Página administrativa aposentada voltou ao tree: ${page}`);
  if (vite.includes(`'${page}'`)) issues.push(`Página administrativa aposentada no build: /${page}`);
  if (rewrites.includes(`/${page}`)) issues.push(`Página administrativa aposentada exposta por rewrite: /${page}`);
}
if (JSON.stringify(vercel.headers || []).match(/painel|kanban|certificad|obra-editor|artista-editor/)) issues.push('vercel.json ainda declara cabeçalhos para páginas administrativas de arte.');

if (/SUPABASE|process\.env|routes|missing|checks/i.test(health)) issues.push('Health público ainda contém detalhes internos.');
const legacySecret = ['ARANDU', 'ADMIN', 'TOKEN'].join('_');
const legacyHeader = ['x-arandu', 'admin-token'].join('-');
if (router.includes(legacySecret) || router.includes(legacyHeader)) issues.push('API ainda aceita segredo administrativo compartilhado.');
if (/SUPABASE_SERVICE_KEY\s*\|\|\s*SUPABASE_ANON_KEY/.test(router)) issues.push('Service role ainda possui fallback para anon key.');

console.log('Arandu Admin Surface Check');
console.log(`Páginas administrativas de arte verificadas como ausentes: ${RETIRED_INTERNAL_PAGES.length}`);
console.log(`Erros: ${issues.length}`);
issues.forEach((issue) => console.error(`- ${issue}`));
if (issues.length) process.exit(1);
