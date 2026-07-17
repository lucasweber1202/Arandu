import fs from 'node:fs';

const issues = [];
const manifest = JSON.parse(fs.readFileSync('data/public-routes.json', 'utf8'));
const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const redirects = new Map((vercel.redirects || []).map((item) => [item.source.replace(/^\//, ''), item.destination.replace(/^\//, '')]));

if (new Set(manifest.canonical).size !== manifest.canonical.length) issues.push('Rotas canônicas duplicadas.');
for (const page of manifest.canonical) {
  if (!fs.existsSync(page)) issues.push(`Página canônica ausente: ${page}.`);
  if (manifest.aliases[page]) issues.push(`Página canônica também foi declarada como alias: ${page}.`);
}
for (const [alias, target] of Object.entries(manifest.aliases)) {
  if (!fs.existsSync(alias)) issues.push(`Alias sem arquivo de compatibilidade: ${alias}.`);
  if (!manifest.canonical.includes(target)) issues.push(`Alias ${alias} aponta para rota não canônica: ${target}.`);
  if (redirects.get(alias) !== target) issues.push(`Redirect da Vercel ausente ou divergente: ${alias} -> ${target}.`);
}

const vite = fs.readFileSync('vite.config.js', 'utf8');
const copy = fs.readFileSync('scripts/copy-runtime-assets.mjs', 'utf8');
if (!vite.includes('data/public-routes.json')) issues.push('Vite não usa o manifesto público para canonical/noindex.');
if (!copy.includes('data/public-routes.json')) issues.push('Build não usa o manifesto público para sitemap/robots.');

console.log('Arandu Public Routes Check');
console.log(`Canônicas: ${manifest.canonical.length}`);
console.log(`Aliases: ${Object.keys(manifest.aliases).length}`);
console.log(`Erros: ${issues.length}`);
issues.forEach((issue) => console.error(`- ${issue}`));
if (issues.length) process.exit(1);
