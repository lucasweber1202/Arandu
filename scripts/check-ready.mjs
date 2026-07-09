import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const required = [
  'index.html',
  'comprar-arte.html',
  'artistas.html',
  'confianca.html',
  'pesquisa.html',
  'narrativa.html',
  'login.html',
  'painel-admin.html',
  'upload-imagens.html',
  'dominio-go-live.html',
  'benchmark-conversao.html',
  'status.html',
  'api/health.js',
  'api/[...path].js',
  'robots.txt',
  'sitemap.xml',
  'manifest.webmanifest',
  'css/arandu-ui-rescue.css',
  'css/arandu-deep-clean.css',
  'js/site.js',
  'js/arandu-assistant.js',
  'js/catalog-page.js',
  'js/conversion-benchmark.js',
  'data/conversion-benchmark.json'
];

const publicPages = ['index.html','comprar-arte.html','artistas.html','confianca.html','pesquisa.html','narrativa.html','login.html'];
const issues = [];
const warnings = [];
function exists(file){return fs.existsSync(path.join(root,file));}
function read(file){return fs.readFileSync(path.join(root,file),'utf8');}
function check(condition,message){if(!condition)issues.push(message);}
function warn(condition,message){if(!condition)warnings.push(message);}

required.forEach((file)=>check(exists(file),`Arquivo obrigatório ausente: ${file}`));

if(exists('js')){
  fs.readdirSync(path.join(root,'js')).filter((file)=>file.endsWith('.js')).forEach((file)=>{
    try{execFileSync(process.execPath,['--check',path.join(root,'js',file)],{stdio:'pipe'});}catch(error){issues.push(`Erro de sintaxe: js/${file}`);}
  });
}

publicPages.forEach((page)=>{
  if(!exists(page))return;
  const html=read(page);
  warn(html.includes('site.js'),`${page}: não carrega js/site.js diretamente; dependerá da build Vite.`);
  check(/<header[\s\S]*?<\/header>/i.test(html),`${page}: header ausente.`);
  check(/brand-logo|safe-logo/.test(html),`${page}: logo ausente.`);
  check(/<h1[\s>]/i.test(html),`${page}: h1 ausente.`);
});

if(exists('js/site.js')){
  const site=read('js/site.js');
  ['Home','Comprar','Artistas','Confiança','Pesquisar','Narrativa','Entrar'].forEach((label)=>check(site.includes(label),`Menu público sem ${label}.`));
  check(site.includes('arandu-assistant.js'),'site.js não injeta Assistente Arandu.');
  check(site.includes('ensureHeaderNav'),'site.js não reconstrói navegação.');
  check(site.includes('arandu-deep-clean.css'),'site.js não injeta limpeza profunda no dev.');
}
if(exists('js/catalog-page.js')){
  const catalog=read('js/catalog-page.js');
  check(catalog.includes('Reservar com curadoria'),'Catálogo sem CTA de reserva.');
  check(catalog.includes('data-save-artwork'),'Catálogo sem salvar obra.');
}
if(exists('vite.config.js')){
  const vite=read('vite.config.js');
  check(vite.includes('arandu-ui-rescue.css'),'Vite não injeta arandu-ui-rescue.css.');
  check(vite.includes('arandu-deep-clean.css'),'Vite não injeta arandu-deep-clean.css.');
  check(vite.includes('manifest.webmanifest'),'Vite não injeta manifest.webmanifest.');
}

console.log('Arandu Launch Readiness');
console.log(`Erros: ${issues.length}`);
issues.forEach((item)=>console.error(`- ${item}`));
console.log(`Alertas: ${warnings.length}`);
warnings.forEach((item)=>console.warn(`- ${item}`));
console.log('\nURLs para validar no Codespace:');
publicPages.concat(['colecoes.html','como-funciona.html','faq.html','benchmark-conversao.html','dominio-go-live.html','status.html','painel-admin.html']).forEach((page)=>console.log(`- /${page}`));
console.log('\nDepois do domínio, rode dominio-go-live.html e atualize ARANDU_SITE_URL na Vercel.');
if(issues.length)process.exit(1);
