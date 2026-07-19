#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { renderSeoHead, SEO_MARKER_START, SEO_THEME_COLOR } from './seo-meta.mjs';

const root = process.cwd();
const distMode = process.argv.includes('--dist');
const contentRoot = distMode ? path.join(root, 'dist') : root;
const errors = [];
const routeManifest = JSON.parse(fs.readFileSync(path.join(root, 'data/public-routes.json'), 'utf8'));
const canonicalPages = new Set(routeManifest.canonical);
const ignoredDirs = new Set(['node_modules', '.git', 'dist', 'reports', 'tests', 'test-results', 'playwright-report']);
const validationSiteUrl = distMode
  ? String(process.env.ARANDU_SITE_URL || '').replace(/\/$/, '')
  : 'https://arandu.example';

function collectHtmlFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (!ignoredDirs.has(entry)) files.push(...collectHtmlFiles(fullPath));
    } else if (entry.endsWith('.html')) {
      files.push(fullPath);
    }
  }
  return files;
}

function count(html, pattern) {
  return (html.match(pattern) || []).length;
}

function tagContent(html, selector) {
  const tag = html.match(selector)?.[0] || '';
  return tag.match(/content\s*=\s*["']([^"']*)["']/i)?.[1] || '';
}

function fail(page, message) {
  errors.push(`${page}: ${message}`);
}

function validatePage(html, pageName) {
  const isCanonical = canonicalPages.has(pageName);
  const expectedCanonical = isCanonical ? `${validationSiteUrl}${pageName === 'index.html' ? '/' : `/${pageName}`}` : '';
  const checks = [
    [/name=["']robots["']/gi, 1, 'meta robots'],
    [/name=["']theme-color["']/gi, 1, 'theme-color'],
    [/rel=["']manifest["']/gi, 1, 'manifest'],
    [/rel=["']apple-touch-icon["']/gi, 1, 'apple-touch-icon'],
    [/property=["']og:title["']/gi, 1, 'og:title'],
    [/property=["']og:description["']/gi, 1, 'og:description'],
    [/property=["']og:type["']/gi, 1, 'og:type'],
    [/property=["']og:url["']/gi, 1, 'og:url'],
    [/property=["']og:image["']/gi, 1, 'og:image'],
    [/name=["']twitter:card["']/gi, 1, 'twitter:card'],
    [new RegExp(SEO_MARKER_START, 'g'), 1, 'bloco SEO']
  ];
  for (const [pattern, expected, label] of checks) {
    const actual = count(html, pattern);
    if (actual !== expected) fail(pageName, `${label}: esperado ${expected}, encontrado ${actual}`);
  }

  const canonicalCount = count(html, /rel=["']canonical["']/gi);
  if (canonicalCount !== (isCanonical ? 1 : 0)) {
    fail(pageName, `canonical: esperado ${isCanonical ? 1 : 0}, encontrado ${canonicalCount}`);
  }
  if (expectedCanonical && !html.includes(`href="${expectedCanonical}"`)) {
    fail(pageName, `canonical não corresponde à rota pública: ${expectedCanonical}`);
  }

  const robots = tagContent(html, /<meta[^>]+name=["']robots["'][^>]*>/i);
  if (isCanonical && robots !== 'index,follow') fail(pageName, `robots público inválido: ${robots}`);
  if (!isCanonical && robots !== 'noindex,nofollow') fail(pageName, `página interna indexável: ${robots}`);

  const theme = tagContent(html, /<meta[^>]+name=["']theme-color["'][^>]*>/i);
  if (theme !== SEO_THEME_COLOR) fail(pageName, `theme-color divergente: ${theme}`);

  const image = tagContent(html, /<meta[^>]+property=["']og:image["'][^>]*>/i);
  if (!/^https:\/\//.test(image)) fail(pageName, `og:image não é absoluta: ${image}`);
}

function pngDimensions(file) {
  const buffer = fs.readFileSync(file);
  if (buffer.toString('ascii', 1, 4) !== 'PNG') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function validateAssets() {
  const expectedPngs = new Map([
    ['assets/social/arandu-og.png', [1200, 630]],
    ['assets/icon-192.png', [192, 192]],
    ['assets/icon-512.png', [512, 512]],
    ['assets/apple-touch-icon.png', [180, 180]],
    ['assets/favicon-32.png', [32, 32]]
  ]);
  for (const [relativePath, dimensions] of expectedPngs) {
    const source = path.join(contentRoot, relativePath);
    if (!fs.existsSync(source)) {
      fail(relativePath, 'asset ausente');
      continue;
    }
    const actual = pngDimensions(source);
    if (!actual || actual.width !== dimensions[0] || actual.height !== dimensions[1]) {
      fail(relativePath, `dimensão inválida: ${actual ? `${actual.width}x${actual.height}` : 'não é PNG'}`);
    }
  }
  for (const rootFile of ['manifest.webmanifest', 'site.webmanifest', 'favicon.svg']) {
    if (!fs.existsSync(path.join(contentRoot, rootFile))) fail(rootFile, 'arquivo runtime ausente');
  }
}

function validateManifests() {
  const manifests = ['manifest.webmanifest', 'site.webmanifest'].map((file) => {
    const source = path.join(contentRoot, file);
    if (!fs.existsSync(source)) return null;
    try {
      return JSON.parse(fs.readFileSync(source, 'utf8'));
    } catch (error) {
      fail(file, `JSON inválido: ${error.message}`);
      return null;
    }
  });
  for (const [index, manifest] of manifests.entries()) {
    if (!manifest) continue;
    const file = index === 0 ? 'manifest.webmanifest' : 'site.webmanifest';
    if (manifest.start_url !== '/' || manifest.scope !== '/' || manifest.display !== 'standalone') {
      fail(file, 'start_url, scope ou display inválido');
    }
    if (manifest.theme_color !== SEO_THEME_COLOR) fail(file, `theme_color divergente: ${manifest.theme_color}`);
    for (const icon of manifest.icons || []) {
      const relativePath = String(icon.src || '').replace(/^\//, '');
      if (!relativePath || !fs.existsSync(path.join(contentRoot, relativePath))) {
        fail(file, `ícone inexistente: ${icon.src || '(vazio)'}`);
      }
    }
  }
  if (manifests.every(Boolean) && JSON.stringify(manifests[0]) !== JSON.stringify(manifests[1])) {
    fail('manifests', 'manifest.webmanifest e site.webmanifest divergem');
  }
}

if (!fs.existsSync(contentRoot)) {
  console.error(`Diretório ausente: ${contentRoot}`);
  process.exit(1);
}
if (distMode && !/^https:\/\//.test(validationSiteUrl)) {
  console.error('ARANDU_SITE_URL HTTPS é obrigatório para validar dist.');
  process.exit(1);
}

const files = collectHtmlFiles(contentRoot).sort();
let homeHtml = '';
for (const file of files) {
  const pageName = path.relative(contentRoot, file).split(path.sep).join('/');
  const source = fs.readFileSync(file, 'utf8');
  const html = distMode
    ? source
    : renderSeoHead(source, {
        pageName,
        siteUrl: validationSiteUrl,
        shareBaseUrl: validationSiteUrl,
        isCanonical: canonicalPages.has(pageName)
      });
  validatePage(html, pageName);
  if (!distMode) {
    const secondPass = renderSeoHead(html, {
      pageName,
      siteUrl: validationSiteUrl,
      shareBaseUrl: validationSiteUrl,
      isCanonical: canonicalPages.has(pageName)
    });
    if (secondPass !== html) fail(pageName, 'geração de SEO não é idempotente');
  }
  if (pageName === 'index.html') homeHtml = html;
}

const jsonLd = homeHtml.match(/<script type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/i)?.[1];
if (!jsonLd) {
  fail('index.html', 'JSON-LD ausente');
} else {
  try { JSON.parse(jsonLd); } catch (error) { fail('index.html', `JSON-LD inválido: ${error.message}`); }
}

if (!distMode) {
  const sourceHome = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const preview = renderSeoHead(sourceHome, {
    pageName: 'index.html',
    siteUrl: '',
    shareBaseUrl: 'https://arandu-preview.vercel.app',
    isCanonical: true
  });
  if (/rel=["']canonical["']/i.test(preview)) fail('preview', 'canonical não pode existir sem domínio próprio');
  if (tagContent(preview, /<meta[^>]+name=["']robots["'][^>]*>/i) !== 'noindex,nofollow') {
    fail('preview', 'preview sem domínio próprio precisa ser noindex,nofollow');
  }
}

validateAssets();
validateManifests();

console.log('Arandu SEO, Social & PWA Check');
console.log(`Modo: ${distMode ? 'dist' : 'fonte simulada'}`);
console.log(`Páginas verificadas: ${files.length}`);
console.log(`Rotas indexáveis: ${canonicalPages.size}`);
console.log(`Erros: ${errors.length}`);
errors.forEach((error) => console.error(`- ${error}`));
if (errors.length) process.exit(1);
console.log('SEO, compartilhamento social, dados estruturados e base PWA validados.');
