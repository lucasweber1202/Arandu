import { existsSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertPresentationModeIsSafe } from '../lib/presentation-mode.mjs';
import { ownSiteUrl } from '../lib/public-site-url.mjs';
import { PUBLIC_PAGES } from './seo-meta.mjs';
import { assertDemoModeIsSafe, standaloneDemo } from '../lib/demo-mode.mjs';

const dist = join(process.cwd(), 'dist');
if (!existsSync(dist)) throw new Error('Build ausente');
for (const file of ['favicon.svg', 'manifest.webmanifest', 'financial-og.png', 'financial-icon-32.png', 'financial-icon-180.png', 'financial-icon-192.png', 'financial-icon-512.png', 'site.webmanifest']) copyFileSync(file, join(dist, file));
// A demonstração interativa vive em /demo e carrega o conjunto fictício dentro
// do próprio pacote; nenhum arquivo de dados é publicado à parte. A checagem
// abaixo continua falhando o build se a apresentação for pedida em produção.
assertPresentationModeIsSafe();
const site = ownSiteUrl(process.env.ARANDU_SITE_URL);
const pages = PUBLIC_PAGES.map((page) => (page === 'index.html' ? '/' : `/${page}`));
writeFileSync(join(dist, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + (site ? pages.map(path => '<url><loc>' + site + path + '</loc></url>').join('') : '') + '</urlset>');
writeFileSync(join(dist, 'robots.txt'), site
  ? 'User-agent: *\nAllow: /\nDisallow: /finance/\nDisallow: /provider/\nDisallow: /login.html\nDisallow: /cadastro.html\nSitemap: ' + site + '/sitemap.xml\n'
  : 'User-agent: *\nDisallow: /\n');

// Projeto demonstrativo independente (`npm run build:demo`, projeto Vercel
// arandu-demo): a raiz abre direto a entrada da demonstração, para que o link
// enviado a alguém não passe por /demo/index.html nem pelo site institucional.
// A decisão é de build: piloto e produção nunca chegam aqui, porque
// assertDemoModeIsSafe falha o build quando ARANDU_ENV é pilot|production.
if (standaloneDemo() && assertDemoModeIsSafe()) {
  const entry = join(dist, 'demo', 'index.html');
  if (!existsSync(entry)) throw new Error('Build demonstrativo sem dist/demo/index.html');
  const html = readFileSync(entry, 'utf8').replace('href="/">Site institucional</a>', 'href="/produto.html">Site institucional</a>');
  if (!html.includes('href="/produto.html">Site institucional</a>')) throw new Error('Entrada da demonstração sem link institucional reconhecível');
  writeFileSync(join(dist, 'index.html'), html);
}
