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
