import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
const execute=promisify(execFile), url=process.argv[2], parsed=new URL(url);
assert(['postgres:','postgresql:'].includes(parsed.protocol)&&['127.0.0.1','localhost','[::1]'].includes(parsed.hostname)&&!parsed.search&&!parsed.hash,'disposable loopback database only');
const actor='e3700000-0000-4000-8000-000000000001', owner='e3700000-0000-4000-8000-000000000002',org='e3700000-0000-4000-8000-000000000010',rfq='e3700000-0000-4000-8000-000000000020',provider='e3700000-0000-4000-8000-000000000030';
const query=async(sql,app='external_test')=>(await execute('psql',[url,'-X','-qAt','-v','ON_ERROR_STOP=1','-c',sql],{env:{...process.env,PGAPPNAME:app},maxBuffer:1024*1024})).stdout.trim();
const asActor=sql=>`begin; set local role authenticated; select set_config('request.jwt.claim.sub','${actor}',true); ${sql}; commit;`;
const json=change=>JSON.stringify({terms:{offered_amount:100},state:'pending_review',channel:'manual',received_at:'2026-01-01T12:00:00Z',source_reference:'Fonte sintética concorrente',rfq_revision:1,currency:'BRL',...change}).replaceAll("'","''");
await query(`insert into auth.users(id,email) values('${actor}','external-race@example.invalid'),('${owner}','external-owner@example.invalid');
insert into public.fin_organizations(id,legal_name,kind,created_by) values('${org}','External race synthetic','BUYER','${owner}');
insert into public.fin_members(organization_id,user_id,role) values('${org}','${actor}','finance_manager'),('${org}','${owner}','admin');
insert into public.fin_rfqs(id,organization_id,product,title,status,owner_id,demand) values('${rfq}','${org}','credit','External race synthetic','open','${owner}','{}');
insert into public.fin_providers(id,organization_id,name,kind,created_by) values('${provider}','${org}','Instituição sem conta DEMO','bank','${owner}');`);
const create=`select public.fin_external_proposal_save('${rfq}','${provider}','race-create-key',0,null,'${json({})}'::jsonb)`;
const creation=await Promise.all(Array.from({length:6},()=>query(asActor(create))));
const records=creation.map(out=>JSON.parse(out.split('\n').find(line=>line.startsWith('{'))));
assert.equal(new Set(records.map(row=>row.id)).size,1);assert.equal(records.filter(row=>!row.replayed).length,1);
const id=records[0].id;
assert.equal(await query(`select count(*) from public.fin_external_proposal_versions where proposal_id='${id}'`),'1');
const confirm=()=>query(asActor(`select public.fin_external_proposal_review('${id}',1,'confirm','Conferência concorrente sintética',true,false)`));
const confirmations=await Promise.all(Array.from({length:6},confirm));
assert.equal(new Set(confirmations.map(out=>out.split('\n').at(-1))).size,1);
assert.equal(await query(`select count(*) from public.fin_external_proposal_reviews where proposal_id='${id}'`),'1');
const edits=await Promise.allSettled([1,2].map(n=>query(asActor(`select public.fin_external_proposal_save('${rfq}','${provider}','race-edit-key-${n}',1,'${id}','${json({terms:{offered_amount:100+n},correction_reason:'Correção concorrente sintética'})}'::jsonb)`))));
assert.equal(edits.filter(out=>out.status==='fulfilled').length,1,'one stale edit must conflict');
for(const out of edits) if(out.status==='rejected') assert.match(out.reason.stderr,/external proposal conflict/,'no unexpected race failure may be swallowed');
assert.equal(await query(`select current_version||'|'||state from public.fin_external_proposals where id='${id}'`),'2|pending_review');
assert.equal(await query(`select count(*) from public.fin_external_proposal_versions where proposal_id='${id}'`),'2');
// Revoke authorization while review is waiting on the RFQ. A pre-lock check
// alone would authorize a material write using stale membership.
async function waitFor(condition) { for(let i=0;i<100;i++){if(await condition())return;await new Promise(resolve=>setTimeout(resolve,30));}throw new Error('expected database interleaving not observed'); }
const holder=spawn('psql',[url,'-X','-qAt','-v','ON_ERROR_STOP=1'],{env:{...process.env,PGAPPNAME:'external_holder'},stdio:['pipe','pipe','pipe']});
let holderError='';holder.stderr.on('data',chunk=>{holderError+=chunk;});holder.stdout.resume();
const holderDone=new Promise((resolve,reject)=>{holder.on('error',reject);holder.on('close',code=>code===0?resolve():reject(new Error(holderError)));});
holder.stdin.write(`begin;select id from public.fin_rfqs where id='${rfq}' for update;\n`);
try {
 await waitFor(async()=>await query("select exists(select 1 from pg_stat_activity where application_name='external_holder' and state='idle in transaction')")==='t');
 const pending=query(asActor(`select public.fin_external_proposal_review('${id}',2,'confirm','Conferência concorrente sintética',true,false)`),'external_revoked').then(()=>({ok:true}),error=>({ok:false,error}));
 await waitFor(async()=>await query("select exists(select 1 from pg_stat_activity where application_name='external_revoked' and wait_event_type='Lock')")==='t');
 await query(`update public.fin_members set role='viewer' where organization_id='${org}' and user_id='${actor}'`);
 holder.stdin.end('rollback;\n');
 await holderDone;
 const revoked=await pending;assert.equal(revoked.ok,false);assert.match(revoked.error.stderr,/forbidden/);
 assert.equal(await query(`select state from public.fin_external_proposals where id='${id}'`),'pending_review');
 assert.equal(await query(`select count(*) from public.fin_external_proposal_reviews where proposal_id='${id}'`),'1','failed review cannot leave a partial receipt');
} finally { if(!holder.stdin.writableEnded) holder.stdin.end('rollback;\n'); }
await assert.rejects(()=>execute('psql',[url,'-X','-q','-v','ON_ERROR_STOP=1','-f','docs/rollback/supabase-financial-external-proposals.rollback.sql']),error=>/external proposal data exists: use forward fix/.test(error.stderr));
await execute('psql',[url,'-X','-q','-v','ON_ERROR_STOP=1','-f','docs/supabase-financial-external-proposals.sql']);
assert.equal(await query(`select current_version||'|'||state from public.fin_external_proposals where id='${id}'`),'2|pending_review','rollback refusal/reapply preserve data');
console.log('External concurrency: six creates -> one version; six confirmations -> one receipt; stale edit conflict; post-lock membership revocation rejected without partial write.');
