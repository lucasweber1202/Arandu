import { existsSync, readFileSync } from 'node:fs';

const requiredFiles = [
  'index.html','comece-aqui.html','como-comprar-na-arandu.html','colecionadores-iniciantes.html','prova-de-confianca.html','prospeccao-artistas.html','proposta-empresas.html','media-kit.html','arandu-para-instagram.html','analytics-conceitual.html','encontrar-arte.html','obras.html','obra-estudo-de-solo-04.html','obra-sertao-silencioso.html','obra-equilibrio-suspenso.html','artistas.html','empresas-e-arquitetos.html','para-artistas.html','minha-selecao.html','autenticidade.html','certificado-arandu.html','verificar-certificado.html','curadoria.html','narrativas.html','manifesto.html','faq.html','politica-comercial.html','politica-de-entrega.html','politica-de-devolucao.html','privacidade.html','termos-de-uso.html','cookies.html','press-kit.html','newsletter.html','sobre.html','contato.html','como-funciona.html','obrigado.html','guia-primeira-obra.html','comparar-obras.html','arte-para-casa.html','arte-para-apartamento.html','arte-para-empresa.html','arte-para-hotelaria.html','fotografia-brasileira.html','pintura-contemporanea-brasileira.html','escultura-brasileira.html','obras-ate-3000.html','como-selecionamos-artistas.html','como-precificamos-obras.html','como-funciona-reserva.html','checklist-portfolio-artista.html','arte-para-escritorios.html','arte-para-hoteis.html','arte-para-restaurantes.html','arte-para-clinicas.html','arte-para-recepcoes.html','narrativa-primeira-obra.html','narrativa-empresas-arte.html','narrativa-certificado.html','narrativa-fotografia-primeira-compra.html','narrativa-obra-ambiente.html','narrativa-comprar-pintura.html','cadastro.html','login.html','minha-conta.html','painel.html','painel-cadastros.html','painel-submissoes.html','painel-briefings.html','painel-propostas.html','painel-reservas.html','painel-tarefas.html','painel-qualidade.html','mapa-do-site.html','configuracao.html','certificado-template.html','proposta-curatorial-template.html','selecao-curatorial-template.html','demo.html','roadmap.html','admin-preview.html','painel-obras.html','painel-artistas.html','painel-leads.html','painel-certificados.html','css/arandu-system.css','css/arandu-product.css','js/site.js','js/selection.js','js/selection-tools.js','js/forms.js','js/admin-cadastros.js','js/painel-operacional.js','js/painel-detalhes.js','js/painel-qualidade.js','js/proposta-builder.js','js/reserva-builder.js','js/auth.js','js/catalog-filters.js','js/whatsapp.js','js/certificates.js','js/curadoria-contexto.js','js/quiz-curatorial.js','api/health.js','data/site.json','data/catalog.json','data/form-standards.json','data/whatsapp-config.js','data/crm-template.csv','data/artists-template.csv','data/artworks-template.csv','sitemap.xml','sitemap-interno.xml','robots.txt','site.webmanifest','favicon.svg','supabase/schema.sql','supabase/seed.sql','supabase/2026_06_operational_expansion.sql','supabase/2026_06_robustness.sql'
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

console.log('Checklist estático aprovado para o MVP Arandu. API consolidada para limite Hobby da Vercel.');
