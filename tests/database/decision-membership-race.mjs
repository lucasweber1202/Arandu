// Independent PostgreSQL sessions force authorization -> wait -> revocation -> write.
import assert from 'node:assert/strict';
import { spawn, execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
const db=process.argv[2];
if(!db) throw new Error('Disposable database URL required');
const prefix=randomUUID().slice(0,8);
const sql=(query)=>execFileSync('psql',[db,'-XAtq','-v','ON_ERROR_STOP=1','-c',query],{encoding:'utf8',timeout:15000}).trim();
const setup=readFileSync(new URL('./financial-decision-integrity.sql',import.meta.url),'utf8').split('-- Versão que o comprador viu')[0].replaceAll('\\set ON_ERROR_STOP on','').replaceAll('00000000-0000-4000-8000-',`${prefix}-0000-4000-8000-`);
const ids=JSON.parse(sql(`${setup}
select set_config('request.jwt.claim.sub','${prefix}-0000-4000-8000-00000000d201',false);

reset role;
select json_object_agg(key,value)::text from dint_ids;`).split('\n').at(-1));
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

const holder=connection();
const deadlocksBefore=Number(sql('select deadlocks from pg_stat_database where datname=current_database()'));
try {
 const actor = `${prefix}-0000-4000-8000-00000000d201`;
 const vote = `set local role authenticated; select set_config('request.jwt.claim.sub','${actor}',true); select public.fin_record_decision_v2('${ids.rfq}','${ids.proposal}',2);`;
 const restoreMember = () => sql(`insert into public.fin_members(organization_id,user_id,role,entity_scope) values('${ids.buyer}','${actor}','admin','group') on conflict(organization_id,user_id) do update set role='admin',entity_scope='group';`);
 for (const [kind, revoke] of [
  ['removed',`delete from public.fin_members where organization_id='${ids.buyer}' and user_id='${actor}'`],
  ['downgraded',`update public.fin_members set role='viewer' where organization_id='${ids.buyer}' and user_id='${actor}'`],
  ['entity_denied',`update public.fin_members set role='finance_manager',entity_scope='entities' where organization_id='${ids.buyer}' and user_id='${actor}'`]
 ]) {
  await holder.query('begin; lock table public.fin_decisions in share mode;');
  const name=`decision-${kind}-${prefix}`;
  const action=worker(`begin; ${vote} commit;`,name).then(result=>({result}),error=>({error}));
  await expectLock(name); sql(revoke); await holder.query('commit;');
  const denied=await action;
  assert(denied.error,`Decision committed after authorization ${kind}`);
  assert.equal(denied.error.code,3); assert.match(denied.error.stderr,/forbidden/);
  assert.equal(sql(`select count(*) from public.fin_decisions where rfq_id='${ids.rfq}'`),'0');
  assert.equal(sql(`select count(*) from public.fin_events where entity_id='${ids.rfq}' and event_type='decision_recorded'`),'0');
  restoreMember();
 }
 // Full v2 including guard, writes and rollback: server-side tail latency on
 // synthetic data only. No network/Supabase/production SLA is inferred.
 const latency = sql(`set role authenticated; select set_config('request.jwt.claim.sub','${actor}',false);
 create temporary table decision_latency(ms double precision);
 do $$ declare started timestamptz; i integer; begin for i in 1..100 loop
  started:=clock_timestamp();
  begin perform public.fin_record_decision_v2('${ids.rfq}','${ids.proposal}',2); raise sqlstate 'Z0001';
  exception when sqlstate 'Z0001' then null; end;
  insert into decision_latency values(extract(epoch from clock_timestamp()-started)*1000);
 end loop; end $$;
 select json_build_object('samples',count(*),'p50_ms',percentile_cont(0.50) within group(order by ms),'p95_ms',percentile_cont(0.95) within group(order by ms),'p99_ms',percentile_cont(0.99) within group(order by ms)) from decision_latency;`).split('\n').at(-1);
 console.log(`Decision v2 synthetic server latency (includes rollback): ${latency}`);
 // Reverse order: authorized decision holds the membership through commit.
 await holder.query(`begin; ${vote}`);
 const removalName=`decision-complete-${prefix}`;
 const removal=worker(`update public.fin_members set role='viewer' where organization_id='${ids.buyer}' and user_id='${actor}';`,removalName).then(result=>({result}),error=>({error}));
 await expectLock(removalName); await holder.query('commit;'); assert(!(await removal).error);
 assert.equal(sql(`select count(*) from public.fin_decisions where rfq_id='${ids.rfq}'`),'1');
 assert.equal(sql(`select count(*) from public.fin_events where entity_id='${ids.rfq}' and event_type='decision_recorded'`),'1');
 const deadlocksAfter=Number(sql('select deadlocks from pg_stat_database where datname=current_database()'));
 assert.equal(deadlocksAfter,deadlocksBefore,'Decision authorization introduced a deadlock in deterministic interleavings');
 console.log('Decision authorization: revocation committed during insert lock wait denies without partial decision/event.');
} finally { holder.close(); for(const child of children) child.kill('SIGTERM'); }
