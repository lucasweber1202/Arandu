import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile), url = process.argv[2];
assert(['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname), 'disposable loopback only');
const id = n => `d3710000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=id(1), org=id(10), key=id(50);
const query = async (sql,app='provider_intent_test') => (await run('psql',[url,'-X','-qAt','-v','ON_ERROR_STOP=1','-c',sql],{env:{...process.env,PGAPPNAME:app},maxBuffer:1048576})).stdout.trim();
const asUser = sql => `begin;set local role authenticated;select set_config('request.jwt.claim.sub','${actor}',true);${sql};commit;`;
await query(`insert into auth.users(id,email)values('${actor}','provider-race@example.invalid');insert into public.fin_organizations(id,legal_name,kind,created_by)values('${org}','Provider intent race DEMO','BUYER','${actor}');insert into public.fin_members(organization_id,user_id,role)values('${org}','${actor}','admin');`);
const command = (k=key,name='Synthetic counterparty') => `select public.fin_create_provider_intent('${org}','${k}','{"name":"${name}","kind":"bank"}'::jsonb)`;
const parse = s => JSON.parse(s.split('\n').find(v=>v.startsWith('{')));
const results = (await Promise.all(Array.from({length:8},()=>query(asUser(command()))))).map(parse);
assert.equal(new Set(results.map(r=>r.id)).size,1); assert.equal(results.filter(r=>!r.replayed).length,1);
assert.equal(await query(`select count(*) from public.fin_providers where organization_id='${org}'`),'1');
assert.equal(await query(`select count(*) from public.fin_events where organization_id='${org}' and event_type='provider_created'`),'1');
await assert.rejects(()=>query(asUser(command(key,'Changed material'))),e=>/provider intent conflict/.test(e.stderr));
async function waitFor(fn) { for(let n=0;n<150;n++){ if(await fn()) return; await new Promise(r=>setTimeout(r,30)); } throw Error('expected interleaving absent'); }
const pendingKey=id(51);
const holder=spawn('psql',[url,'-X','-qAt','-v','ON_ERROR_STOP=1'],{stdio:['pipe','pipe','pipe']});
let stderr='';holder.stderr.on('data',x=>stderr+=x);holder.stdout.resume();
const done=new Promise((resolve,reject)=>{holder.on('error',reject);holder.on('close',c=>c===0?resolve():reject(Error(stderr)));});
holder.stdin.write(`begin;set application_name='provider_intent_holder';select pg_advisory_xact_lock(hashtextextended('provider-create:${org}:${actor}:${pendingKey}',0));\n`);
try {
 await waitFor(async()=>await query("select exists(select 1 from pg_stat_activity where application_name='provider_intent_holder' and state='idle in transaction')")==='t');
 assert.equal(parse(await query(asUser(`select public.fin_provider_creation_result('${org}','${pendingKey}')`))).state,'pending');
 const waiting=query(asUser(`set application_name='provider_intent_waiter';${command(pendingKey)}`));
 // Attach rejection immediately while the holder is still locked.
 const denied=assert.rejects(waiting,e=>/forbidden/.test(e.stderr));
 await waitFor(async()=>await query("select exists(select 1 from pg_stat_activity where application_name='provider_intent_waiter' and wait_event='advisory')")==='t');
 await query(`delete from public.fin_members where organization_id='${org}' and user_id='${actor}'`);
 holder.stdin.end('commit;\n'); await done; await denied;
 assert.equal(await query(`select count(*) from public.fin_providers where organization_id='${org}'`),'1');
} finally { if(!holder.stdin.writableEnded) holder.stdin.end('rollback;\n'); }
await assert.rejects(()=>run('psql',[url,'-X','-q','-v','ON_ERROR_STOP=1','-f','docs/rollback/supabase-financial-provider-intent-integrity.rollback.sql']),e=>/provider receipt data exists: use forward-fix/.test(e.stderr));
console.log('Provider SQL concurrency: eight retries, one counterparty/audit, material conflict, pending receipt, revocation DURING lock wait, used rollback refused.');
