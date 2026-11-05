#!/usr/bin/env node
// Opt-in economic benchmark; only a new loopback database with synthetic data.
// Candidate index is measured and discarded, never applied to hosted schemas.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { execFile, execFileSync } from 'node:child_process';
import { loopbackTarget } from '../lib/recovery-reconciliation.mjs';

const indexDefinitions = Object.freeze({
  full: '(organization_id,status,due_on asc nulls last,created_at,id)',
  'partial-open': "(organization_id,due_on asc nulls last,created_at,id) where status='open'"
});
const indexKind = process.argv[2]?.replace(/^--index=/, '') || 'full';
if (process.argv.length > 3 || (process.argv[2] && !process.argv[2].startsWith('--index=')) || !Object.hasOwn(indexDefinitions, indexKind)) {
  throw Error('Use --index=full or --index=partial-open');
}

const connection=loopbackTarget(process.env.ARANDU_DATABASE_TEST_URL||'postgresql://postgres:postgres@localhost:5432/postgres');
const env={PATH:process.env.PATH,HOME:process.env.HOME,...connection};
const db=`arandu_matrix_bench_${randomBytes(6).toString('hex')}`;
const sql=(query,database=db)=>execFileSync('psql',['-XqAt','-v','ON_ERROR_STOP=1'],{env:{...env,PGDATABASE:database},input:query,encoding:'utf8',maxBuffer:16*1024*1024}).trim();
const owner='00000000-0000-4000-8000-000000000001';
const outsider='00000000-0000-4000-8000-000000000002';
const scoped='00000000-0000-4000-8000-000000000003';
const entity='40000000-0000-4000-8000-000000000001';
const org='10000000-0000-4000-8000-000000000001';
const session=user=>`set role authenticated; set request.jwt.claim.sub='${user}';`;
// Exact ordering/filter/limit used by finance-tasks GET; normal PostgreSQL
// planner, unchanged RLS and real authorization functions, no seqscan override.
const query=`select id,title,due_on,status,related_type,related_id,created_at,assignee_id
from public.fin_tasks where organization_id='${org}' and status='open'
order by due_on asc nulls last,created_at asc,id asc limit 201`;
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
let created=false;
try {
  sql(`create database ${db}`,connection.PGDATABASE);created=true;
  sql(fs.readFileSync('tests/database/bootstrap.sql','utf8'));
  sql(execFileSync(process.execPath,['scripts/build-supabase-migration-bundle.mjs','--flow=financialBaseline','--stdout'],{encoding:'utf8',maxBuffer:8*1024*1024}));
  sql(`insert into auth.users(id) values('${owner}'),('${outsider}'),('${scoped}');
    insert into public.fin_organizations(id,legal_name,kind,created_by)
      select ('10000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'Synthetic benchmark '||i,'BUYER','${owner}' from generate_series(1,20)i;
    insert into public.fin_members(organization_id,user_id,role) select id,'${owner}','admin' from public.fin_organizations;
    insert into public.fin_legal_entities(id,organization_id,legal_name,created_by) values
      ('${entity}','${org}','Synthetic entity A','${owner}'),('40000000-0000-4000-8000-000000000002','${org}','Synthetic entity B','${owner}');
    insert into public.fin_members(organization_id,user_id,role,entity_scope) values('${org}','${scoped}','viewer','entities');
    insert into public.fin_member_entity_grants(organization_id,user_id,entity_id,granted_by) values('${org}','${scoped}','${entity}','${owner}');
    insert into public.fin_rfqs(id,organization_id,legal_entity_id,product,title,owner_id) values
      ('50000000-0000-4000-8000-000000000001','${org}','${entity}','credit','Synthetic benchmark RFQ A','${owner}'),
      ('50000000-0000-4000-8000-000000000002','${org}','40000000-0000-4000-8000-000000000002','credit','Synthetic benchmark RFQ B','${owner}');
    `);
  const scenarios=[];
  for(const size of [1000,10000,100000]) {
  // Preserve every FK: clear only this synthetic fixture, then reset heap bloat
  // between independent sizes. VACUUM FULL setup is outside measured phases.
  sql('delete from public.fin_tasks;');
  sql('vacuum(full,analyze) public.fin_tasks;');
  sql(`    insert into public.fin_tasks(id,organization_id,title,status,due_on,created_by,created_at)
      select ('20000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
        ('10000000-0000-4000-8000-'||lpad((1+(i-1)%20)::text,12,'0'))::uuid,
        'Synthetic task '||i,case when i%3=0 then 'done' else 'open' end,
        case when i%11=0 then null else date '2026-01-01'+(i%365) end,'${owner}',
        timestamptz '2026-01-01 00:00:00+00'+i*interval '1 second' from generate_series(1,${size})i;
    analyze public.fin_tasks; analyze public.fin_members; analyze public.fin_organizations;`);
  sql(`update public.fin_tasks set related_type='rfq',related_id=case when substring(id::text,25)::bigint%40=1 then '50000000-0000-4000-8000-000000000001'::uuid else '50000000-0000-4000-8000-000000000002'::uuid end where organization_id='${org}'; analyze public.fin_tasks;`);
  assert.equal(Number(sql(`${session(scoped)}select count(*) from public.fin_tasks where organization_id='${org}'`)),size/40,'Entity scope mismatch');
  const rows=()=>sql(`${session(owner)} select jsonb_agg(t.id) from (${query})t;`);
  const expected=rows();
  assert.equal(sql(`${session(outsider)}select count(*) from public.fin_tasks where organization_id='${org}'`),'0');
  const measure=(statement=query,rollback=false,actor=owner)=>{
    const explain=()=>`${rollback?'begin;':''}${session(actor)}explain(analyze,buffers,wal,format json) ${statement};${rollback?'rollback;':''}`;
    // One warmup per phase, followed by five recorded executions.
    sql(explain());
    const plans=Array.from({length:5},()=>JSON.parse(sql(explain()))[0]);
    const medianMs=median(plans.map(p=>p['Execution Time']));
    return {median_execution_ms:medianMs,execution_samples_ms:plans.map(p=>p['Execution Time']),median_plan:plans.find(p=>p['Execution Time']===medianMs)};
  };
  const pivot=JSON.parse(sql(`${session(owner)} select row_to_json(p) from (${query.replace('limit 201','offset 10 limit 1')})p`));
  const cursorPredicate=pivot.due_on===null
    ? `(due_on is null and (created_at>'${pivot.created_at}' or (created_at='${pivot.created_at}' and id>'${pivot.id}')))`
    : `(due_on>'${pivot.due_on}' or (due_on='${pivot.due_on}' and created_at>'${pivot.created_at}') or (due_on='${pivot.due_on}' and created_at='${pivot.created_at}' and id>'${pivot.id}') or due_on is null)`;
  const variants={
    open_page:query,
    done_page:query.replace("status='open'","status='done'"),
    due_filter:query.replace("status='open'","status='open' and due_on>=date '2026-06-01'"),
    cursor_page:query.replace("status='open'", "status='open' and "+cursorPredicate),
    entity_scoped:query,
    entity_filter:query.replace("status='open'","status='open' and legal_entity_id='"+entity+"'"),
    no_membership:query
  };
  const actorFor=name=>name==='no_membership'?outsider:name==='entity_scoped'?scoped:owner;
  const results=()=>Object.fromEntries(Object.entries(variants).map(([name,q])=>[name,sql(`${session(actorFor(name))} select coalesce(jsonb_agg(t.id),'[]'::jsonb) from (${q})t;`)]));
  const expectedVariants=results();
  const measureAll=()=>Object.fromEntries(Object.entries(variants).map(([name,q])=>[name,measure(q,false,actorFor(name))]));
  const concurrent=async()=>{
    const start=performance.now();
    const reads=await Promise.all(Array.from({length:4},()=>new Promise((resolve,reject)=>{
      execFile('psql',['-XqAt','-v','ON_ERROR_STOP=1','-c',`${session(owner)} select coalesce(jsonb_agg(t.id),'[]'::jsonb) from (${query})t;`],{env:{...env,PGDATABASE:db},encoding:'utf8'},(error,stdout)=>error?reject(error):resolve(stdout.trim()));
    })));
    assert(reads.every(value=>value===expected));
    return {readers:4,wall_ms:performance.now()-start,same_results:true};
  };
  const vacuum=()=>{const start=performance.now();sql('vacuum(analyze) public.fin_tasks');return {wall_ms:performance.now()-start};};
  sql('vacuum(analyze) public.fin_tasks'); // identical clean starting heap
  const concurrentBefore=await concurrent();
  const before=measureAll();
  const insert=`insert into public.fin_tasks(id,organization_id,title,status,due_on,created_by,created_at)
    select ('30000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
      ('10000000-0000-4000-8000-'||lpad((1+(i-1)%20)::text,12,'0'))::uuid,
      'Synthetic write benchmark '||i,'open',date '2026-01-01'+(i%365),'${owner}',
      timestamptz '2026-01-01 00:00:00+00'+i*interval '1 second' from generate_series(1,1000)i`;
  const writesBefore=measure(insert,true);
  const vacuumBefore=vacuum();
  sql(`create index arandu_benchmark_task_page_idx on public.fin_tasks${indexDefinitions[indexKind]}; analyze public.fin_tasks;`);
  const concurrentAfter=await concurrent();
  const after=measureAll();
  assert.deepEqual(results(),expectedVariants,'Candidate changed filtered/cursor/entity results');
  const writesAfter=measure(insert,true);
  const vacuumAfter=vacuum();
  assert.equal(rows(),expected,'Index changed pagination result');
  assert.equal(sql(`${session(outsider)}select count(*) from public.fin_tasks where organization_id='${org}'`),'0','Candidate changed tenant isolation');
  scenarios.push({tasks:size,tenants:20,rows_per_tenant:size/20,candidate_bytes:Number(sql("select pg_relation_size('public.arandu_benchmark_task_page_idx')")),before,after,writes:{rows:1000,before:writesBefore,after:writesAfter},same_results:true,outsider:'DENIED',entity_scope:'ENFORCED',concurrent:{before:concurrentBefore,after:concurrentAfter},vacuum:{workload:'6000 rolled-back inserts in each phase',before:vacuumBefore,after:vacuumAfter}});
  sql('drop index public.arandu_benchmark_task_page_idx');
  }
  const report={classification:'synthetic_task_workload_matrix',index_kind:indexKind,index_definition:indexDefinitions[indexKind],status:'PASS_LOCAL',hosted:'NOT_RUN',postgres:sql('show server_version'),scenarios,
    adoption:'NOT_APPLIED: planner experiments do not establish hosted workload frequency or Free storage headroom',
    limitations:['Warm local PostgreSQL SQL plans; no PostgREST/network or hosted p95','Rolled-back writes include triggers/RLS and WAL but not commit latency','Four concurrent SQL readers include psql startup; VACUUM is warm synthetic maintenance, not long-term bloat prediction']};
  fs.mkdirSync('reports',{recursive:true});fs.writeFileSync(indexKind==='full'?'reports/financial-query-matrix.json':`reports/financial-query-matrix-${indexKind}.json`,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({...report,scenarios:scenarios.map(s=>({tasks:s.tasks,candidate_bytes:s.candidate_bytes,before:Object.fromEntries(Object.entries(s.before).map(([k,v])=>[k,v.median_execution_ms])),after:Object.fromEntries(Object.entries(s.after).map(([k,v])=>[k,v.median_execution_ms])),writes:{before_ms:s.writes.before.median_execution_ms,after_ms:s.writes.after.median_execution_ms}}))}));
} finally {if(created)sql(`drop database ${db} with(force)`,connection.PGDATABASE);}
