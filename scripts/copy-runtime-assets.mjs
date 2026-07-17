import { existsSync, mkdirSync, readdirSync, statSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const dist = join(root, 'dist');

const folders = ['js', 'data', 'assets', 'css'];
const rootFiles = ['manifest.webmanifest'];

function copyDir(source, target) {
  if (!existsSync(source)) return;
  mkdirSync(target, { recursive: true });

  for (const entry of readdirSync(source)) {
    const sourcePath = join(source, entry);
    const targetPath = join(target, entry);
    const stat = statSync(sourcePath);

    if (stat.isDirectory()) {
      copyDir(sourcePath, targetPath);
    } else {
      copyFileSync(sourcePath, targetPath);
    }
  }
}

if (!existsSync(dist)) {
  throw new Error('Pasta dist não encontrada. Rode vite build antes de copiar assets.');
}

for (const folder of folders) {
  copyDir(join(root, folder), join(dist, folder));
  console.log(`Copiado: ${folder} -> dist/${folder}`);
}

for (const file of rootFiles) {
  const source = join(root, file);
  if (!existsSync(source)) throw new Error(`Arquivo runtime ausente: ${file}`);
  copyFileSync(source, join(dist, file));
  console.log(`Copiado: ${file} -> dist/${file}`);
}

const routeManifest = JSON.parse(readFileSync(join(root, 'data/public-routes.json'), 'utf8'));
let siteUrl = '';
try {
  const parsed = new URL(process.env.ARANDU_SITE_URL);
  if (parsed.protocol === 'https:' && !parsed.hostname.endsWith('.vercel.app') && parsed.hostname !== 'localhost') {
    siteUrl = parsed.toString().replace(/\/$/, '');
  }
} catch {}

if (siteUrl) {
  const urls = routeManifest.canonical.map((page) => {
    const suffix = page === 'index.html' ? '/' : `/${page}`;
    return `  <url><loc>${siteUrl}${suffix}</loc></url>`;
  }).join('\n');
  writeFileSync(join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
  writeFileSync(join(dist, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /painel\nDisallow: /status.html\nDisallow: /login.html\nDisallow: /cadastro.html\nDisallow: /minha-conta.html\nSitemap: ${siteUrl}/sitemap.xml\n`);
  console.log(`Metadados públicos gerados para ${siteUrl}.`);
} else {
  writeFileSync(join(dist, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>\n');
  writeFileSync(join(dist, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  console.log('Domínio próprio ausente: preview marcado para não indexar.');
}
