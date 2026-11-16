import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
const run=promisify(execFile),url=process.argv[2];
assert(['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname),'disposable loopback only');
const id=n=>`00000000-0000-4000-8000-000000aa${String(n).padStart(4,'0')}`;
const query=async(sql,name='a10_probe')=>(await run('psql',[url,'-X','-qAt','-v','ON_ERROR_STOP=1','-c',sql],{env:{...process.env,PGAPPNAME:name},maxBuffer:4*1024*1024})).stdout.trim();
const user=(actor,sql)=>`begin;set local statement_timeout='15s';set local role authenticated;select set_config('request.jwt.claim.sub','${actor}',true);${sql};commit;`;
const fixture=(await readFile('tests/database/financial-arandu-10.sql','utf8')).replace(/^\\.*$/gm,'').replace('\nrollback;\nselect','\ncommit;\nselect');
await query(fixture);
const target=await query(`select id from public.fin_decision_scenarios where rfq_id='${id(400)}' and name='Copied analysis'`);
const literal=value=>`'${JSON.stringify(value).replaceAll("'","''")}'::jsonb`;
const command=(op,vals,targetId=null,version=null,actor=id(1))=>user(actor,`select public.fin_scenario_command('${id(400)}',${targetId?`'${targetId}'`:'null'},${version??'null'},'${op}',${literal(vals)})`);
async function waitFor(predicate) {
  for (let attempt = 0; attempt < 200; attempt++) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 25)); }
  throw new Error('expected lock interleaving absent');
}
async function contend(name, lockSql, commands, beforeCommit = '') {
  const holder = spawn('psql', [url, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PGAPPNAME: `${name}_holder` } });
  holder.stdout.resume(); let error = '';
  holder.stderr.on('data', value => { error += value; });
  const done = new Promise((resolve, reject) => { holder.on('error', reject); holder.on('close', code => code === 0 ? resolve() : reject(new Error(error))); });
  holder.stdin.write(`begin;set local statement_timeout='15s';${lockSql};\n`);
  try {
    await waitFor(async () => Number(await query(`select count(*) from pg_stat_activity where application_name='${name}_holder' and state='idle in transaction'`)) === 1);
    const pending = commands.map((sql, index) => query(sql, `${name}_writer_${index}`).then(stdout => ({ ok: true, stdout }), failure => ({ ok: false, error: failure.stderr || failure.message })));
    await waitFor(async () => Number(await query(`select count(*) from pg_stat_activity where application_name like '${name}_writer_%' and wait_event_type='Lock'`)) === commands.length);
    holder.stdin.end(`${beforeCommit};commit;\n`); await done;
    return await Promise.all(pending);
  } catch (failure) { holder.stdin.end('rollback;\n'); await done.catch(() => {}); throw failure; }
}

const lock=`select 1 from public.fin_rfqs where id='${id(400)}' for update`;
const edits=await contend('a10_edits',lock,['First edit','Second edit'].map(name=>command('update',{name,weights:{mdr_debit:50}},target,1)));
assert.equal(edits.filter(r=>r.ok).length,1);assert.match(edits.find(r=>!r.ok).error,/scenario version conflict/);
assert.equal(await query(`select version from public.fin_decision_scenarios where id='${target}'`),'2');
const vals={name:'Concurrent creation',weights:{mdr_debit:50},request_key:'a10-concurrent-key'};
const creates=await contend('a10_creates',lock,Array.from({length:8},()=>command('create',vals)));
assert(creates.every(r=>r.ok));
assert.equal(await query(`select count(*) from public.fin_decision_scenarios where rfq_id='${id(400)}' and request_key='a10-concurrent-key'`),'1');
const revoked=await contend('a10_revoke',lock,[command('create',{...vals,request_key:'a10-revoked-key'},null,null,id(2))],`update public.fin_members set role='viewer' where organization_id='${id(100)}' and user_id='${id(2)}'`);
assert.equal(revoked[0].ok,false);assert.match(revoked[0].error,/forbidden/);
assert.equal(await query(`select count(*) from public.fin_decision_scenarios where request_key='a10-revoked-key'`),'0');
console.log('Arandu 10 SQL concurrency: expected-version race, eight identical creates and role revocation during RFQ lock wait PASS.');
