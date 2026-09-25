import { existsSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertPresentationModeIsSafe } from '../lib/presentation-mode.mjs';
import { ownSiteUrl } from '../lib/public-site-url.mjs';

const dist = join(process.cwd(), 'dist');
if (!existsSync(dist)) throw new Error('Build ausente');
for (const file of ['favicon.svg', 'manifest.webmanifest', 'financial-og.png', 'financial-icon-32.png', 'financial-icon-180.png', 'financial-icon-192.png', 'financial-icon-512.png', 'site.webmanifest']) copyFileSync(file, join(dist, file));
if (assertPresentationModeIsSafe()) {
  mkdirSync(join(dist, 'data/finance'), { recursive: true });
  copyFileSync('data/finance/demo.json', join(dist, 'data/finance/demo.json'));
}
const site = ownSiteUrl(process.env.ARANDU_SITE_URL);
const pages = ['/', '/produto.html', '/credito.html', '/adquirencia.html', '/seguranca.html', '/limites.html'];
writeFileSync(join(dist, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + (site ? pages.map(path => '<url><loc>' + site + path + '</loc></url>').join('') : '') + '</urlset>');
writeFileSync(join(dist, 'robots.txt'), site
  ? 'User-agent: *\nAllow: /\nDisallow: /finance/\nDisallow: /provider/\nDisallow: /login.html\nDisallow: /cadastro.html\nSitemap: ' + site + '/sitemap.xml\n'
  : 'User-agent: *\nDisallow: /\n');
