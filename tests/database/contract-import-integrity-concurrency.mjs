import assert from 'node:assert/strict';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile),url=process.argv[2];
assert(['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname),'disposable loopback only');
const id=n=>`b3710000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=id(1),org=id(10),provider=id(30),key=id(50);
const query=async(sql,app='contract_intent_test')=>(await run('psql',[url,'-X','-qAt','-v','ON_ERROR_STOP=1','-c',sql],{env:{...process.env,PGAPPNAME:app},maxBuffer:1048576})).stdout.trim();
const asUser=sql=>`begin;set local role authenticated;select set_config('request.jwt.claim.sub','${actor}',true);${sql};commit;`;
await query(`insert into auth.users(id,email)values('${actor}','contract-race@example.invalid');insert into public.fin_organizations(id,legal_name,kind,created_by)values('${org}','Contract intent race DEMO','BUYER','${actor}');insert into public.fin_members(organization_id,user_id,role)values('${org}','${actor}','admin');insert into public.fin_providers(id,organization_id,name,kind,created_by)values('${provider}','${org}','Contract race provider DEMO','bank','${actor}');`);
const payload=JSON.stringify({provider_id:provider,product:'credit',title:'Synthetic race',starts_on:'2026-01-01',ends_on:'2030-01-01',renewal_notice_days:60,auto_renew:false,currency:'BRL',terms:{},parent_contract_id:null});
const command=(k=key,p=payload)=>`select public.fin_import_contract_intent('${org}',null,'${k}','${p}'::jsonb,null)`;
const receipts=(await Promise.all(Array.from({length:8},()=>query(asUser(command()))))).map(v=>JSON.parse(v.split('\n').find(v=>v.startsWith('{'))));
assert.equal(new Set(receipts.map(r=>r.id)).size,1);assert.equal(receipts.filter(r=>!r.replayed).length,1);
const contract=receipts[0].id;
assert.equal(await query(`select count(*) from public.fin_contracts where organization_id='${org}'`),'1');
assert.equal(await query(`select count(*) from public.fin_tasks where related_id='${contract}'`),'1');
await assert.rejects(()=>query(asUser(command(key,payload.replace('Synthetic race','Other material')))),e=>/duplicate request/.test(e.stderr));
const pendingKey=id(51),holder=spawn('psql',[url,'-X','-qAt','-v','ON_ERROR_STOP=1'],{env:{...process.env,PGAPPNAME:'contract_intent_holder'},stdio:['pipe','pipe','pipe']});
let err='';holder.stderr.on('data',v=>{err+=v;});holder.stdout.resume();
const done=new Promise((resolve,reject)=>{holder.on('error',reject);holder.on('close',c=>c===0?resolve():reject(Error(err)));});
async function waitFor(fn){for(let n=0;n<100;n++){if(await fn())return;await new Promise(r=>setTimeout(r,30));}throw Error('expected interleaving absent');}
holder.stdin.write(`begin;select pg_advisory_xact_lock(hashtextextended('contract-import:${org}:${actor}:${pendingKey}',0));\n`);
try{
 await waitFor(async()=>await query("select exists(select 1 from pg_stat_activity where application_name='contract_intent_holder' and state='idle in transaction')")==='t');
 const result=await query(asUser(`select public.fin_contract_import_result('${org}',null,'${pendingKey}')`));
 assert.equal(JSON.parse(result.split('\n').find(v=>v.startsWith('{'))).state,'pending');
 holder.stdin.end('rollback;\n');await done;
}finally{if(!holder.stdin.writableEnded)holder.stdin.end('rollback;\n');}
await query(`update public.fin_members set role='viewer' where organization_id='${org}' and user_id='${actor}'`);
await assert.rejects(()=>query(asUser(command())),e=>/forbidden/.test(e.stderr));
await assert.rejects(()=>run('psql',[url,'-X','-q','-v','ON_ERROR_STOP=1','-f','docs/pending/contract-import-integrity/rollback.sql']),e=>/contract data exists: use forward-fix/.test(e.stderr));
console.log('Contract intent concurrency: eight retries, single contract/task, material conflict, pending receipt, revoked writer and used rollback refusal passed.');
