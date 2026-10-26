import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
const run=promisify(execFile),url=process.argv[2],target=new URL(url);
assert(['localhost','127.0.0.1','[::1]'].includes(target.hostname),'disposable loopback database only');
const id=n=>`e3710000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=id(1),owner=id(2),org=id(10),provider=id(30),rfq=id(20);
const query=async(sql,app='external_decision_test')=>(await run('psql',[url,'-X','-qAt','-v','ON_ERROR_STOP=1','-c',sql],{env:{...process.env,PGAPPNAME:app},maxBuffer:1024*1024})).stdout.trim();
const asUser=(user,sql)=>`begin;set local role authenticated;select set_config('request.jwt.claim.sub','${user}',true);${sql};commit;`;
const input=JSON.stringify({terms:{offered_amount:100},state:'pending_review',channel:'manual',received_at:null,source_reference:'Fonte sintética de concorrência',rfq_revision:1,currency:'BRL'});
await query(`insert into auth.users(id,email) values('${actor}','decision-race@example.invalid'),('${owner}','decision-owner@example.invalid');
insert into public.fin_organizations(id,legal_name,kind,created_by) values('${org}','External decision race DEMO','BUYER','${owner}');
insert into public.fin_members(organization_id,user_id,role) values('${org}','${actor}','finance_manager'),('${org}','${owner}','admin');
insert into public.fin_providers(id,organization_id,name,kind,created_by) values('${provider}','${org}','Instituição declarada DEMO','bank','${owner}');`);
async function create(n){
 const r=id(n);await query(`insert into public.fin_rfqs(id,organization_id,product,title,status,owner_id,demand) values('${r}','${org}','credit','Decisão concorrente DEMO','open','${owner}','{}')`);
 const out=await query(asUser(actor,`select public.fin_external_proposal_save('${r}','${provider}','race-create-${n}',0,null,'${input}'::jsonb)`));
 const p=JSON.parse(out.split('\n').find(line=>line.startsWith('{'))).id;
 await query(asUser(owner,`select public.fin_external_proposal_review('${p}',1,'confirm','Conferência sintética concorrente',true,false)`));return p;
}
const payload=`'${JSON.stringify({criteria:{weights:{}},rationale:'Decisão humana concorrente'})}'::jsonb`;
const command=(p,k)=>`select public.fin_external_command('${p}',1,1,'${k}','decision',${payload})`;
const p=await create(20);
const same=await Promise.all(Array.from({length:6},()=>query(asUser(actor,command(p,'same-decision-intent')))));
const receipts=same.map(out=>JSON.parse(out.split('\n').find(line=>line.startsWith('{'))));
assert.equal(new Set(receipts.map(row=>row.id)).size,1);
assert.equal(receipts.filter(row=>!row.replayed).length,1);
assert.equal(await query(`select count(*) from public.fin_decisions where rfq_id='${rfq}'`),'1');
const p2=await create(21);
const competing=await Promise.allSettled([query(asUser(actor,command(p2,'actor-decision-intent'))),query(asUser(owner,command(p2,'owner-decision-intent')))]);
assert.equal(competing.filter(row=>row.status==='fulfilled').length,1);
for(const row of competing)if(row.status==='rejected')assert.match(row.reason.stderr,/invalid state|decision already recorded/);
assert.equal(await query(`select count(*) from public.fin_decisions where rfq_id='${id(21)}'`),'1');
const p3=await create(22);
const holder=spawn('psql',[url,'-X','-qAt','-v','ON_ERROR_STOP=1'],{env:{...process.env,PGAPPNAME:'external_decision_holder'},stdio:['pipe','pipe','pipe']});
let err='';holder.stderr.on('data',chunk=>{err+=chunk;});holder.stdout.resume();
const done=new Promise((resolve,reject)=>{holder.on('error',reject);holder.on('close',code=>code===0?resolve():reject(new Error(err)));});
async function waitFor(condition){for(let n=0;n<100;n++){if(await condition())return;await new Promise(resolve=>setTimeout(resolve,30));}throw Error('database interleaving not observed');}
holder.stdin.write(`begin;select id from public.fin_rfqs where id='${id(22)}' for update;\n`);
try{
 await waitFor(async()=>await query("select exists(select 1 from pg_stat_activity where application_name='external_decision_holder' and state='idle in transaction')")==='t');
 const pending=query(asUser(actor,command(p3,'revoked-decision-intent')),'external_decision_revoked').then(()=>({ok:true}),error=>({ok:false,error}));
 await waitFor(async()=>await query("select exists(select 1 from pg_stat_activity where application_name='external_decision_revoked' and wait_event_type='Lock')")==='t');
 await query(`update public.fin_members set role='viewer' where organization_id='${org}' and user_id='${actor}'`);
 holder.stdin.end('rollback;\n');await done;
 const result=await pending;assert.equal(result.ok,false);assert.match(result.error.stderr,/forbidden/);
 assert.equal(await query(`select count(*) from public.fin_decisions where rfq_id='${id(22)}'`),'0');
}finally{if(!holder.stdin.writableEnded)holder.stdin.end('rollback;\n');}
await assert.rejects(()=>run('psql',[url,'-X','-q','-v','ON_ERROR_STOP=1','-f','docs/rollback/supabase-financial-external-decision.rollback.sql']),error=>/external decisions exist: use forward-fix/.test(error.stderr));
console.log('External decision concurrency: same-intent replay, competing human choices, authorization after lock and rollback refusal passed.');
