import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {PRODUCT_E2E} from './e2e-suites.mjs';
const root=path.resolve('lib/api/domains');
const active=new Set(),visited=new Set();
function visit(file){
 if(visited.has(file))return;
 assert(!active.has(file),`Circular domain dependency: ${file}`);active.add(file);
 const source=fs.readFileSync(file,'utf8');
 for(const [,specifier] of source.matchAll(/import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g)){
  if(!specifier.startsWith('.'))continue;
  const target=path.resolve(path.dirname(file),specifier);
  if(target.startsWith(root+path.sep)&&fs.existsSync(target))visit(target);
 }
 active.delete(file);visited.add(file);
}
for(const name of fs.readdirSync(root).filter(n=>n.endsWith('.mjs')))visit(path.join(root,name));
assert.equal(new Set(PRODUCT_E2E).size,PRODUCT_E2E.length);
for(const suite of PRODUCT_E2E){assert(fs.existsSync(suite));assert(!/presentation|demo-workspace/.test(suite));}
for(const name of fs.readdirSync('tests/e2e').filter(n=>/^finance-.*\.spec\.js$/.test(n)))assert(PRODUCT_E2E.includes('tests/e2e/'+name),`Product suite omitted: ${name}`);
const scripts=JSON.parse(fs.readFileSync('package.json')).scripts;
for(const key of ['test:e2e','test:e2e:list','test:e2e:finance'])assert(scripts[key].startsWith('node scripts/run-product-e2e.mjs'));
console.log(`Backend architecture: ${visited.size} domain modules without static import cycles; ${PRODUCT_E2E.length} canonical product suites PASS`);
