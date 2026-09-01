import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const htmlFiles = fs.readdirSync(root).filter((file) => file.endsWith('.html')).sort();
const layerNames = ['arandu-experience.js','arandu-advanced.js','arandu-curation-lab.js','arandu-final-300.js','arandu-visual-governor.js','arandu-public-mode.js'];

function read(file){return fs.readFileSync(path.join(root,file),'utf8')}
function attrValues(text, tag, attr){const re=new RegExp(`<${tag}[^>]*${attr}=["']([^"']+)["'][^>]*>`,'gi');return [...text.matchAll(re)].map(m=>m[1])}
function baseRef(ref){return ref.split('?')[0]}

const rows=htmlFiles.map((file)=>{
  const html=read(file);
  const scripts=attrValues(html,'script','src').map(baseRef);
  const styles=attrValues(html,'link','href').map(baseRef).filter(x=>x.endsWith('.css'));
  const manualLayers=scripts.filter(src=>layerNames.some(name=>src.endsWith(name)));
  const usesSite=scripts.includes('js/site.js');
  const usesLoader=scripts.includes('js/arandu-loader.js');
  const receivesLoader=usesSite||usesLoader;
  return {file,usesSite,usesLoader,receivesLoader,manualLayers,scriptCount:scripts.length,styleCount:styles.length};
});

fs.mkdirSync(path.join(root,'reports'),{recursive:true});
fs.writeFileSync(path.join(root,'reports','page-inventory.json'),JSON.stringify(rows,null,2));

console.log('Inventário de páginas Arandu');
console.log('--------------------------------');
rows.forEach(row=>{
  const status=row.receivesLoader?'OK':'SEM LOADER';
  const manual=row.manualLayers.length?` camadas manuais: ${row.manualLayers.join(', ')}`:'';
  console.log(`${status.padEnd(10)} ${row.file.padEnd(36)} scripts:${String(row.scriptCount).padStart(2)} css:${String(row.styleCount).padStart(2)}${manual}`);
});
console.log('\nRelatório: reports/page-inventory.json');

// Cinco módulos de js/ tinham deixado de ser carregados por qualquer página e
// continuavam no repositório — um deles ainda era o alvo de uma catraca, que
// ficava verde guardando código morto enquanto o código vivo seguia sem guarda.
// Um módulo pode ser carregado por uma tag <script>, por outro módulo (site.js
// injeta os globais por nome) ou pelo servidor/build; o que não aparece em
// nenhum desses lugares não é executado por ninguém.
const jsFiles = fs.readdirSync(path.join(root, 'js')).filter((file) => file.endsWith('.js'));
const htmlText = htmlFiles.map((file) => read(file)).join('\n');
const serverText = [
  ...fs.readdirSync(path.join(root, 'lib')).filter((f) => f.endsWith('.mjs')).map((f) => `lib/${f}`),
  ...fs.readdirSync(path.join(root, 'api')).map((f) => `api/${f}`),
  'vite.config.js'
].map((file) => read(file)).join('\n');

const orphans = jsFiles.filter((file) => {
  if (htmlText.includes(file)) return false;
  if (serverText.includes(file)) return false;
  return !jsFiles.some((other) => other !== file && read(path.join('js', other)).includes(file));
});

if (orphans.length) {
  console.error(`\nMódulos em js/ que nenhuma página, módulo ou servidor carrega: ${orphans.join(', ')}`);
  process.exit(1);
}
