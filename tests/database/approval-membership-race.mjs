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
insert into dint_ids select 'approval',public.fin_request_approval((select value::uuid from dint_ids where key='rfq'),(select value::uuid from dint_ids where key='proposal'),array['${prefix}-0000-4000-8000-00000000d203']::uuid[],'Synthetic approval');
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
try {
 // Freeze the step after the RPC's initial authorization, then commit removal
 // in a third session before allowing its final write. No sleep-based race.
 await holder.query(`begin; select id from public.fin_approval_steps where request_id='${ids.approval}' for update;`);
 const name=`approval-revoke-${prefix}`;
 const action=worker(`set role authenticated; select set_config('request.jwt.claim.sub','${prefix}-0000-4000-8000-00000000d203',false); select public.fin_act_on_approval_v2('${ids.approval}','approved');`,name).then(result=>({result}),error=>({error}));
 await expectLock(name);
 sql(`delete from public.fin_members where organization_id='${ids.buyer}' and user_id='${prefix}-0000-4000-8000-00000000d203';`);
 await holder.query('commit;');
 const denied=await action;
 assert(denied.error,'Approval committed after membership revocation');
 assert.equal(denied.error.code,3); assert.equal(denied.error.signal,null);
 assert.match(denied.error.stderr,/forbidden/);
 assert.equal(sql(`select status from public.fin_approval_requests where id='${ids.approval}'`),'pending');
 assert.equal(sql(`select count(*) from public.fin_approval_steps where request_id='${ids.approval}' and status='approved'`),'0');
 assert.equal(sql(`select count(*) from public.fin_events where event_type='approval_approved' and metadata->>'request_id'='${ids.approval}'`),'0');
 // Successful actor retains membership until commit; removal must wait.
 sql(`insert into public.fin_members(organization_id,user_id,role) values('${ids.buyer}','${prefix}-0000-4000-8000-00000000d203','analyst');`);
 await holder.query(`begin; set local role authenticated; select set_config('request.jwt.claim.sub','${prefix}-0000-4000-8000-00000000d203',true); select public.fin_act_on_approval_v2('${ids.approval}','approved');`);
 const removalName=`approval-finish-${prefix}`;
 const removal=worker(`delete from public.fin_members where organization_id='${ids.buyer}' and user_id='${prefix}-0000-4000-8000-00000000d203';`,removalName).then(result=>({result}),error=>({error}));
 await expectLock(removalName); await holder.query('commit;');
 assert(!(await removal).error);
 assert.equal(sql(`select status from public.fin_approval_requests where id='${ids.approval}'`),'approved');
 assert.equal(sql(`select count(*) from public.fin_events where event_type='approval_approved' and metadata->>'request_id'='${ids.approval}'`),'1');
 console.log('Approval authorization: removal between check/write denied; successful vote holds membership through commit.');
} finally { holder.close(); for(const child of children) child.kill('SIGTERM'); }
