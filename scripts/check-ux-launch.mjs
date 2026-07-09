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
mustInclude('comprar-arte.html','data-ux-catalog-dimension','filtros por dimensão');
mustInclude('comprar-arte.html','data-ux-catalog-space','filtros por ambiente');
mustInclude('comprar-arte.html','data-ux-gallery-mode','modo galeria');
mustInclude('comprar-arte.html','data-collection','coleções curatoriais');
mustInclude('colecoes.html','comprar-arte.html?colecao=empresa','página de coleções atualizada');
mustInclude('colecao.html','data-collection-page','página individual de coleção');
mustInclude('data/collections.json','Primeira coleção','dados de coleções');
mustInclude('colecoes-admin.html','data-collection-editor','admin de coleções');
mustInclude('trilhas-curatoriais.html','Trilhas curatoriais','trilhas curatoriais');
mustInclude('pesquisa.html','data-intent-search','busca por intenção');
mustInclude('js/intent-search.js','comprar-arte.html','roteamento de intenção');
mustInclude('js/catalog-page.js','dimensionTag','filtro por dimensão');
mustInclude('js/catalog-page.js','quality-seal','selo de qualidade');
mustInclude('artistas.html','data-ux-artist-search','busca de artistas');
mustInclude('artista.html','arandu-artist-detail.css','polimento de artista individual');
mustInclude('js/autor.js','artist-jsonld','SEO dinâmico de artista');
mustInclude('js/artwork_page.js','VisualArtwork','SEO dinâmico de obra');
mustInclude('narrativa.html','Revista Arandu','narrativa estilo revista');
mustInclude('calendario-editorial.html','Calendário de conteúdo','calendário editorial');
mustInclude('narrativa.html','data-narrative-list','hub editorial dinâmico');
mustInclude('artigo.html','data-article-page','página de artigo');
mustInclude('catalogo-intake.html','data-catalog-file','upload de CSV');
mustInclude('catalogo-intake.html','data-catalog-csv','importador de catálogo');
mustInclude('operacao-obras.html','data-artwork-admin-form','formulário admin de obra');
mustInclude('painel-admin.html','obra-editor.html','painel admin com módulos avançados');
mustInclude('obra-editor.html','data-artwork-editor','editor dedicado de obra');
mustInclude('artista-editor.html','data-artist-editor','editor dedicado de artista');
mustInclude('certificados-admin.html','data-certificate-form','painel de certificados');
mustInclude('lead-detalhe.html','data-lead-note','detalhe de lead com notas');
mustInclude('funil-comercial.html','data-funnel-output','métricas de funil');
mustInclude('propostas-admin.html','data-proposals-list','admin de propostas');
mustInclude('historico-obra.html','data-history-output','histórico de obra');
mustInclude('historico-artista.html','data-history-output','histórico de artista');
mustInclude('editor-registro.html','data-record-editor','editor genérico');
mustInclude('upload-imagens.html','data-apply-upload-url','aplicar upload no registro');
mustInclude('api/upload.js','storage/v1/object','endpoint Supabase Storage');
mustInclude('kanban-comercial.html','data-kanban-board','kanban comercial');
mustInclude('proposta-pdf.html','data-save-proposal','salvar proposta');
mustInclude('proposta-publica.html','data-public-proposal','proposta pública');
mustInclude('certificado-imprimivel.html','data-certificate-sheet','certificado imprimível');
mustInclude('checklist-lancamento.html','data-launch-checklist','checklist automatizado');
mustInclude('diagnostico-catalogo.html','data-catalog-quality','diagnóstico de catálogo');
mustInclude('como-funciona.html','Três jornadas','como funciona atualizado');
mustInclude('faq.html','Perguntas frequentes','FAQ atualizado');
mustInclude('termos-artistas.html','Termos operacionais','termos para artistas');
mustInclude('404.html','Página não encontrada','404 personalizada');
mustInclude('lancamento.html','data-launch-dashboard','dashboard de lançamento');
mustInclude('js/arandu-assistant.js','comprar-arte.html','assistente aponta para Comprar');
mustInclude('js/public-breadcrumbs.js','breadcrumb public','breadcrumbs públicos');
mustNotInclude('js/arandu-assistant.js','obras.html?','links antigos de obras com query');
mustNotInclude('js/auth.js','obras.html','auth apontando para páginas antigas');
mustInclude('vite.config.js','arandu-operational-upgrade.css','CSS operacional injetado');
mustInclude('vite.config.js','arandu-next-ops.css','CSS next ops injetado');
mustInclude('vite.config.js','arandu-advanced-features.css','CSS avançado injetado');

console.log('UX Launch Check');
console.log(`Falhas: ${failures.length}`);
failures.forEach((item)=>console.error(`- ${item}`));
console.log(`Alertas: ${warnings.length}`);
warnings.forEach((item)=>console.warn(`- ${item}`));
if(failures.length)process.exit(1);
