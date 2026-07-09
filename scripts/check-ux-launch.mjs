import { readFileSync, existsSync } from 'node:fs';

const failures=[];
const warnings=[];
function file(path){if(!existsSync(path)){failures.push(`Arquivo ausente: ${path}`);return '';}return readFileSync(path,'utf8');}
function mustInclude(path,needle,label=needle){const text=file(path);if(!text.includes(needle))failures.push(`${path} não contém ${label}.`);}
function mustNotInclude(path,needle,label=needle){const text=file(path);if(text.includes(needle))warnings.push(`${path} ainda contém ${label}.`);}

['index.html','comprar-arte.html','artistas.html','confianca.html','pesquisa.html','narrativa.html','login.html'].forEach((path)=>{
  const text=file(path);
  ['Home','Comprar','Artistas','Confiança','Pesquisar','Narrativa','Entrar'].forEach((label)=>{if(!text.includes(label))warnings.push(`${path} pode não exibir ${label} diretamente; conferir normalização JS.`);});
});

mustInclude('comprar-arte.html','data-ux-catalog-type','filtros por técnica');
mustInclude('comprar-arte.html','data-ux-catalog-axis','filtros por eixo');
mustInclude('comprar-arte.html','data-ux-catalog-sort','ordenação');
mustInclude('comprar-arte.html','data-collection','coleções curatoriais');
mustInclude('js/catalog-page.js','collectionOk','filtro por coleção');
mustInclude('artistas.html','data-ux-artist-search','busca de artistas');
mustInclude('artista.html','arandu-artist-detail.css','polimento de artista individual');
mustInclude('js/autor.js','artist-jsonld','SEO dinâmico de artista');
mustInclude('js/artwork_page.js','VisualArtwork','SEO dinâmico de obra');
mustInclude('narrativa.html','data-narrative-list','hub editorial dinâmico');
mustInclude('artigo.html','data-article-page','página de artigo');
mustInclude('catalogo-intake.html','data-catalog-file','upload de CSV');
mustInclude('catalogo-intake.html','data-catalog-csv','importador de catálogo');
mustInclude('operacao-obras.html','data-artwork-admin-form','formulário admin de obra');
mustInclude('diagnostico-catalogo.html','data-catalog-quality','diagnóstico de catálogo');
mustInclude('404.html','Página não encontrada','404 personalizada');
mustInclude('lancamento.html','data-launch-dashboard','dashboard de lançamento');
mustInclude('js/arandu-assistant.js','comprar-arte.html','assistente aponta para Comprar');
mustNotInclude('js/arandu-assistant.js','obras.html?','links antigos de obras com query');
mustNotInclude('js/auth.js','obras.html','auth apontando para páginas antigas');
mustInclude('vite.config.js','arandu-operational-upgrade.css','CSS operacional injetado');
mustInclude('vite.config.js','arandu-next-ops.css','CSS next ops injetado');

console.log('UX Launch Check');
console.log(`Falhas: ${failures.length}`);
failures.forEach((item)=>console.error(`- ${item}`));
console.log(`Alertas: ${warnings.length}`);
warnings.forEach((item)=>console.warn(`- ${item}`));
if(failures.length)process.exit(1);
