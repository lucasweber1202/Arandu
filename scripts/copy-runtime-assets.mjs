import { existsSync, mkdirSync, readdirSync, statSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { assertPresentationModeIsSafe, withPresentationAssets } from '../lib/presentation-mode.mjs';

const root = process.cwd();
const dist = join(root, 'dist');
const presentationMode = assertPresentationModeIsSafe();

const folders = ['js', 'data', 'assets', 'css'];
const rootFiles = ['manifest.webmanifest', 'site.webmanifest', 'favicon.svg'];

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

// Fixtures existem para seed/homologação e para Preview explicitamente
// demonstrativo. O build normal remove o conjunto inteiro do runtime público.
const presentationFixtures = ['artworks.json', 'artists.json', 'certificates.json'];
for (const fixture of presentationFixtures) {
  const target = join(dist, 'data', fixture);
  if (existsSync(target) && !presentationMode) {
    rmSync(target);
    console.log(`Removido do runtime público: data/${fixture}`);
  } else if (existsSync(target)) {
    console.log(`Mantido apenas no preview de apresentação: data/${fixture}`);
  }
}

for (const file of rootFiles) {
  const source = join(root, file);
  if (!existsSync(source)) throw new Error(`Arquivo runtime ausente: ${file}`);
  copyFileSync(source, join(dist, file));
  console.log(`Copiado: ${file} -> dist/${file}`);
}

if (presentationMode) {
  // A cópia estática vence o rewrite do Vercel para /demo.html e
  // /admin-preview.html, então ela precisa sair daqui já marcada como
  // demonstrativa — caso contrário a tela apareceria sem o banner.
  for (const file of ['demo.html', 'admin-preview.html']) {
    writeFileSync(join(dist, file), withPresentationAssets(readFileSync(join(root, file), 'utf8')));
  }
  console.log('Telas internas de apresentação copiadas somente para o Preview explícito.');
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
