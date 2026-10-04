#!/usr/bin/env node
// Gate anti-regressão da vertical de arte aposentada
// (docs/LEGACY_ART_RETIREMENT.md).
//
// Sem argumentos: árvore de trabalho — nenhuma página, asset, dado, script de
// cliente, função serverless, script npm, dependência ou documento da antiga
// vertical volta a existir fora do que é explicitamente permitido (migrations
// históricas, a aposentadoria documentada e os próprios gates de ausência).
// Com --dist: artefato publicado — só as páginas financeiras esperadas, nenhum
// texto, asset, SEO ou manifesto de arte em HTML/JS/CSS/JSON/XML/TXT.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { PUBLIC_PAGES } from './seo-meta.mjs';

const root = process.cwd();
const distMode = process.argv.includes('--dist');
const issues = [];
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});

// Termos de domínio de arte (com fronteira de palavra; "obrigatório" e afins
// não casam). Valem para o que é publicado e para o código de runtime.
const ART_COPY = /\b(comprar arte|arte brasileira|marketplace de arte|obras? de arte|artistas?|curadoria|curador(?:a|es)?|certificado de autenticidade|colecionador(?:a|es)?|galeria|acervo|ateli[eê]|reserva de obra)\b/i;
const ART_ASSET = /(?:^|\/)(?:art-placeholder|artista|artistas|obras?|certificad|colec)[^/]*$/i;

if (distMode) {
  const dist = join(root, 'dist');
  assert.ok(existsSync(dist), 'Execute npm run build antes do gate de legado.');
  const output = walk(dist).map((path) => relative(dist, path).split('\\').join('/'));
  const allowedTopHtml = new Set([...PUBLIC_PAGES, 'login.html', 'cadastro.html', '404.html']);
  for (const file of output) {
    if (file.endsWith('.html') && !file.includes('/') && !allowedTopHtml.has(file)) issues.push(`página fora da superfície financeira publicada: ${file}`);
    if (file.endsWith('.html') && file.includes('/') && !/^(finance|provider|demo)\//.test(file)) issues.push(`página fora dos espaços financeiros: ${file}`);
    if (/^(js|css|data|content|templates)\//.test(file)) issues.push(`diretório legado publicado: ${file}`);
    if (ART_ASSET.test(file)) issues.push(`asset de arte publicado: ${file}`);
    if (/\.(html|js|css|json|webmanifest|xml|txt|svg)$/.test(file)) {
      const match = readFileSync(join(dist, file), 'utf8').match(ART_COPY);
      if (match) issues.push(`texto de arte publicado em ${file}: "${match[0]}"`);
    }
  }
  const sitemap = existsSync(join(dist, 'sitemap.xml')) ? readFileSync(join(dist, 'sitemap.xml'), 'utf8') : '';
  for (const loc of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const path = new URL(loc[1]).pathname.replace(/^\//, '') || 'index.html';
    if (!PUBLIC_PAGES.includes(path)) issues.push(`sitemap publica rota fora da superfície financeira: ${loc[1]}`);
  }
} else {
  // 1. Páginas na raiz: só a superfície financeira.
  const allowedRootHtml = new Set([...PUBLIC_PAGES, 'login.html', 'cadastro.html', '404.html']);
  for (const file of readdirSync(root).filter((name) => name.endsWith('.html'))) {
    if (!allowedRootHtml.has(file)) issues.push(`página HTML fora da superfície financeira na raiz: ${file}`);
  }
  // 2. Diretórios e arquivos da antiga vertical.
  for (const path of ['js', 'css', 'assets', 'data', 'content', 'types', 'supabase', 'templates', 'planning', 'tsconfig.json', 'next.config.ts', 'next-env.d.ts',
    'tailwind.config.ts', 'playwright.commerce.config.js', 'sitemap-interno.xml', 'lib/recommend.ts', 'lib/internal-pages.mjs', 'lib/owner-console.mjs', 'lib/owner-docs.mjs',
    'lib/public-shell.mjs', 'api/internal-page.js', 'api/admin-auth.js', 'api/readiness.js', 'api/collections.js', 'api/commercial.js', 'api/mvp-dashboard.js',
    'api/upload.js', 'api/orders.js', 'api/account-orders.js', 'ops/pilot-evidence.json']) {
    if (existsSync(join(root, path))) issues.push(`artefato da vertical de arte voltou: ${path}`);
  }
  for (const file of readdirSync(join(root, 'src'))) if (file !== 'vercel-speed-insights.js') issues.push(`fonte de cliente legado em src/: ${file}`);
  // 3. Scripts npm e dependências.
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  for (const name of Object.keys(pkg.scripts)) {
    if (/(^|:)(catalog|commerce|commercial|art|artists?|artworks?|seed:supabase|curat)/i.test(name)) issues.push(`script npm da vertical de arte: ${name}`);
  }
  for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
    if (['typescript', 'next', 'react', 'react-dom', 'tailwindcss'].includes(name)) issues.push(`dependência da antiga stack de arte: ${name}`);
  }
  // 4. Documentos: o histórico de arte vive no Git, não no tree.
  const allowedLegacyDocs = new Set(['LEGACY_ART_RETIREMENT.md']);
  for (const file of readdirSync(join(root, 'docs')).filter((name) => name.endsWith('.md'))) {
    const head = readFileSync(join(root, 'docs', file), 'utf8').slice(0, 600);
    if (!allowedLegacyDocs.has(file) && /Legado — vertical de arte/i.test(head)) issues.push(`documento histórico de arte voltou ao tree: docs/${file}`);
  }
  // 5. Código financeiro não importa nada da antiga vertical.
  const financialRuntime = [...walk(join(root, 'finance')), ...walk(join(root, 'provider')), ...walk(join(root, 'lib/finance'))].filter((path) => /\.(m?js|html|css)$/.test(path));
  for (const path of financialRuntime) {
    const source = readFileSync(path, 'utf8');
    const match = source.match(ART_COPY);
    if (match) issues.push(`texto de arte em código financeiro (${relative(root, path)}): "${match[0]}"`);
    if (/from ['"][^'"]*(?:internal-pages|owner-console|commercial-policy|profile-access|api-dtos)\.mjs['"]/.test(source)) issues.push(`código financeiro importa módulo da vertical de arte: ${relative(root, path)}`);
  }
  // 6. Vercel: nenhuma rota, função ou cabeçalho de página de arte.
  const vercel = readFileSync(join(root, 'vercel.json'), 'utf8');
  for (const term of ['internal-page', 'painel', 'artista', 'obra-editor', 'certificad', 'colecoes', '/js/', '/css/']) {
    if (vercel.includes(term)) issues.push(`vercel.json referencia superfície de arte: ${term}`);
  }

  // 7. Módulos de runtime aposentados: nem o arquivo (em qualquer pasta, para
  // pegar cópia) nem import deles em código executável.
  const RETIRED_MODULES = ['accounts', 'admin-operations', 'dashboard', 'intake', 'pilot', 'privacy', 'public-content', 'selections',
    'admin-auth', 'admin-rbac', 'rate-limit', 'api-dtos', 'commercial-policy', 'operational-status', 'profile-access'];
  const runtimeRoots = ['api', 'lib', 'scripts', 'finance', 'provider', 'src', 'tests/e2e'].filter((dir) => existsSync(join(root, dir)));
  const runtimeFiles = runtimeRoots.flatMap((dir) => walk(join(root, dir))).filter((path) => /\.(m?js|html)$/.test(path));
  // O próprio gate e a sua prova negativa citam os termos proibidos de propósito.
  const gateFiles = new Set([join(root, 'scripts/check-legacy-art.mjs'), join(root, 'scripts/test-legacy-art-gate.mjs')]);
  for (const path of runtimeFiles) {
    const name = relative(root, path).split('\\').join('/');
    const base = name.split('/').pop().replace(/\.m?js$/, '');
    if (/^(lib|api)\//.test(name) && RETIRED_MODULES.includes(base)) issues.push(`módulo de runtime da vertical de arte voltou: ${name}`);
    if (gateFiles.has(path)) continue;
    const source = readFileSync(path, 'utf8');
    const imported = source.match(new RegExp(`from ['"][^'"]*/(?:${RETIRED_MODULES.join('|')})\\.mjs['"]`));
    if (imported) issues.push(`import de módulo aposentado em ${name}: ${imported[0]}`);
  }

  // 8. Roteador: só as rotas financeiras. Qualquer `route === '...'` ou
  // `route.startsWith('...')` fora da lista é handler novo a justificar aqui.
  const router = readFileSync(join(root, 'api/[...path].js'), 'utf8');
  const ROUTES = new Set(['security-contact', 'jobs/renewals', 'jobs/webhooks', 'jobs/governance', 'v1', 'v1/', 'finance/', 'auth/', 'auth/login', 'auth/signup']);
  for (const match of router.matchAll(/route(?:\.startsWith\(|\s*===\s*)'([^']+)'/g)) {
    if (!ROUTES.has(match[1])) issues.push(`roteador atende rota fora da superfície financeira: ${match[1]}`);
  }

  // 9. Variáveis de ambiente que só existiam para a vertical de arte.
  const RETIRED_ENV = /\bARANDU_(?:WHATSAPP_NUMBER|CONTACT_EMAIL|BRAND_READY|CONSENT_VERSION|PLATFORM_FEE_RATE|RESERVATION_HOURS|PRIVACY_CONTACT_EMAIL|COMMERCIAL_[A-Z_]+|[A-Z]+_POLICY_REFERENCE|FISCAL_MODEL_REFERENCE|PILOT_(?:ENABLED|APPROVED|ACCESS_CODE|SECRET))\b/;
  for (const path of [join(root, '.env.example'), join(root, 'vercel.json'), ...runtimeFiles]) {
    if (gateFiles.has(path) || !existsSync(path)) continue;
    const match = readFileSync(path, 'utf8').match(RETIRED_ENV);
    if (match) issues.push(`variável de ambiente da vertical de arte em ${relative(root, path)}: ${match[0]}`);
  }

  // 10. Modelos de e-mail da antiga operação comercial.
  const email = readFileSync(join(root, 'lib/email.mjs'), 'utf8');
  const template = email.match(/\b(reservation_(?:received|confirmed|expired)|order_(?:created|confirmed|shipped|delivered|completed|cancelled|refunded)|payment_confirmed|contact_received)\b/);
  if (template) issues.push(`modelo de e-mail da vertical de arte em lib/email.mjs: ${template[0]}`);
}

console.log(`Arandu Legacy Art Gate (${distMode ? 'dist' : 'tree'})`);
console.log(`Erros: ${issues.length}`);
issues.forEach((issue) => console.error(`- ${issue}`));
if (issues.length) process.exit(1);
console.log(distMode ? 'Nenhuma página, texto, asset, SEO ou manifesto de arte no artefato publicado.' : 'Nenhuma página, asset, dado, script, dependência, documento ou rota da vertical de arte no tree.');
