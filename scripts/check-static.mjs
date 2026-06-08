import { existsSync, readFileSync } from 'node:fs';

const requiredFiles = [
  'index.html',
  'encontrar-arte.html',
  'obras.html',
  'colecoes.html',
  'artistas.html',
  'empresas-e-arquitetos.html',
  'para-artistas.html',
  'minha-selecao.html',
  'autenticidade.html',
  'sobre.html',
  'contato.html',
  'como-funciona.html',
  'obrigado.html',
  'css/arandu-system.css',
  'js/selection.js',
  'js/forms.js',
  'sitemap.xml',
  'robots.txt'
];

const missing = requiredFiles.filter((file) => !existsSync(file));

if (missing.length) {
  console.error('Arquivos ausentes:');
  missing.forEach((file) => console.error(`- ${file}`));
  process.exit(1);
}

const htmlFiles = requiredFiles.filter((file) => file.endsWith('.html'));
const broken = [];

for (const file of htmlFiles) {
  const content = readFileSync(file, 'utf8');
  if (!content.includes('<title>')) broken.push(`${file}: sem title`);
  if (!content.includes('Arandu')) broken.push(`${file}: sem marca Arandu`);
}

if (broken.length) {
  console.error('Problemas encontrados:');
  broken.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log('Checklist estático aprovado para o MVP Arandu.');
