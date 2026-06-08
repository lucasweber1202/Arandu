import { existsSync, readFileSync } from 'node:fs';

const requiredFiles = [
  'index.html','encontrar-arte.html','obras.html','obra-estudo-de-solo-04.html','obra-sertao-silencioso.html','obra-equilibrio-suspenso.html','colecoes.html','colecao-primeira-obra.html','arte-para-escritorio.html','artistas.html','artista-marina-silveira.html','artista-camila-reboucas.html','artista-arthur-davila.html','artistas-convite.html','empresas-e-arquitetos.html','para-arquitetos.html','para-empresas.html','para-artistas.html','minha-selecao.html','autenticidade.html','certificado-arandu.html','verificar-certificado.html','curadoria.html','manifesto.html','faq.html','politica-comercial.html','politica-de-entrega.html','politica-de-devolucao.html','privacidade.html','termos-de-uso.html','cookies.html','press-kit.html','newsletter.html','demo.html','sobre.html','contato.html','como-funciona.html','obrigado.html','admin-preview.html','painel-obras.html','painel-artistas.html','painel-leads.html','painel-certificados.html','roadmap.html','mapa-do-site.html','configuracao.html','certificado-template.html','proposta-curatorial-template.html','selecao-curatorial-template.html','css/arandu-system.css','js/site.js','js/selection.js','js/forms.js','js/catalog-filters.js','js/whatsapp.js','data/site.json','data/catalog.json','data/whatsapp-config.js','data/crm-template.csv','data/artists-template.csv','data/artworks-template.csv','sitemap.xml','sitemap-interno.xml','robots.txt','site.webmanifest','favicon.svg','supabase/schema.sql'
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
  if (!content.includes('meta name="viewport"')) broken.push(`${file}: sem viewport`);
}

if (broken.length) {
  console.error('Problemas encontrados:');
  broken.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log('Checklist estático aprovado para o MVP Arandu.');
