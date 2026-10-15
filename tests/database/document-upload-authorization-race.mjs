// Duas sessões reais: commit de revogação antes da publicação recusa; publicação
// antes da revogação mantém sua autorização até commit. Fixtures sintéticas
// ficam somente no banco descartável da suíte, como as demais fixtures SQL.
import assert from 'node:assert/strict';
import { spawn, execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
const db = process.argv[2];
if (!db) throw new Error('Disposable database URL required');
const prefix = randomUUID().slice(0,8);
const actor = `${prefix}-0000-4000-8000-000000000002`;
const org = `${prefix}-0000-4000-8000-000000000010`;
const sql = (query) => execFileSync('psql',[db,'-XAtq','-v','ON_ERROR_STOP=1','-c',query],{encoding:'utf8',timeout:10000}).trim();
const setup=readFileSync(new URL('./financial-document-upload-authorization.sql',import.meta.url),'utf8').split('create temp table ua_slots')[0].replace('\\set ON_ERROR_STOP on','').replaceAll('a1200000',prefix);
const document=sql(`${setup}
select set_config('request.jwt.claim.sub','${actor}',true);
select document_id from public.fin_document_begin_upload('${org}','rfq','${prefix}-0000-4000-8000-000000000030','Race synthetic upload','internal','application/pdf',100);
commit;`).split('\n').at(-1);
assert.match(document,/^[a-f0-9-]{36}$/);
const children = new Set();
function connection() {
 const child=spawn('psql',[db,'-XAtq','-v','ON_ERROR_STOP=1'],{stdio:['pipe','pipe','pipe']});
 children.add(child);
 const lines=[]; let pending=null; let stderr='';
 child.stderr.on('data',chunk=>stderr+=chunk);
 createInterface({input:child.stdout}).on('line',line=>{
  if(pending && line===pending.marker){ const p=pending;pending=null;clearTimeout(p.timer);p.resolve(lines.splice(0)); } else lines.push(line);
 });
 const rejectPending=(error)=>{if(pending){const p=pending;pending=null;clearTimeout(p.timer);p.reject(error);}};
 child.on('error',rejectPending);
 child.stdin.on('error',rejectPending);
 child.on('exit',(code,signal)=>{children.delete(child);rejectPending(new Error(`psql exit ${code}, signal ${signal}: ${stderr}`));});
 return {query(query){assert.equal(pending,null);return new Promise((resolve,reject)=>{ const marker=randomUUID();const timer=setTimeout(()=>{rejectPending(new Error('psql query deadline exceeded'));child.kill('SIGTERM');},10000);pending={marker,resolve,reject,timer};child.stdin.write(`${query}\nselect '${marker}';\n`);});}, close(){if(!child.stdin.destroyed)child.stdin.end('rollback;\n');}};
}
async function worker(query,name){
 const result=promisify(execFile)('psql',[db,'-XAtq','-v','ON_ERROR_STOP=1','-f','-'],{env:{...process.env,PGAPPNAME:name},timeout:10000,killSignal:'SIGTERM'});
 children.add(result.child);
 result.child.stdin.end(query);
 try { return await result; } finally { children.delete(result.child); }
}
async function expectLock(name){
 const deadline=Date.now()+10000;
 while(Date.now()<deadline){
  const observed=await promisify(execFile)('psql',[db,'-XAtq','-v','ON_ERROR_STOP=1','-c',`select exists(select 1 from pg_stat_activity where application_name='${name}' and wait_event_type='Lock')`],{timeout:10000});
  if(observed.stdout.trim()==='t') return;
 }
 throw new Error(`No deterministic lock wait observed for ${name}`);
}
const finalize=`set role service_role; select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claims','{"role":"service_role"}',false); select public.fin_document_finalize_upload('${document}',1,100,'application/pdf');`;
const remove=`delete from public.fin_members where organization_id='${org}' and user_id='${actor}';`;
const holder=connection();
try {
 // Revogação primeiro: o publicador espera o vínculo e recusa depois do commit.
 await holder.query(`begin; ${remove}`);
 const firstName=`upload-revoke-${prefix}`;
 const first=worker(finalize,firstName).then(result=>({result}),error=>({error}));
 await expectLock(firstName);
 await holder.query('commit;');
 const denied=await first;
 assert(denied.error,'Revoked uploader unexpectedly published');
 assert.equal(denied.error.code,3,'Expected PostgreSQL statement failure');
 assert.equal(denied.error.signal,null,'SQL denial must not be process termination');
 assert.match(denied.error.stderr,/forbidden/);
 assert.equal(sql(`select status from public.fin_document_versions where document_id='${document}'`),'pending');
 assert.equal(sql(`select count(*) from public.fin_events where event_type='document_uploaded' and metadata->>'document_id'='${document}'`),'0');
 sql(`insert into public.fin_members(organization_id,user_id,role) values('${org}','${actor}','analyst');`);
 // Publicação primeiro: DELETE espera o lock de membro até publicação commitada.
 await holder.query(`begin; ${finalize}`);
 const secondName=`upload-publish-${prefix}`;
 const second=worker(remove,secondName).then(result=>({result}),error=>({error}));
 await expectLock(secondName);
 await holder.query('commit;');
 const removed=await second;
 assert(!removed.error,removed.error?.stderr);
 assert.equal(sql(`select status from public.fin_document_versions where document_id='${document}'`),'available');
 assert.equal(sql(`select count(*) from public.fin_members where organization_id='${org}' and user_id='${actor}'`),'0');
 assert.equal(sql(`select count(*) from public.fin_events where event_type='document_uploaded' and metadata->>'document_id'='${document}'`),'1');
 console.log('Upload authorization race: revocation/publication serialized in both orders; no partial write.');
} finally {
 holder.close();
 for (const child of children) child.kill('SIGTERM');
}
