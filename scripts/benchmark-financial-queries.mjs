#!/usr/bin/env node
// Opt-in economic benchmark; only a new loopback database with synthetic data.
// Candidate index is measured and discarded, never applied to hosted schemas.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { loopbackTarget } from '../lib/recovery-reconciliation.mjs';

const connection=loopbackTarget(process.env.ARANDU_DATABASE_TEST_URL||'postgresql://postgres:postgres@localhost:5432/postgres');
const env={PATH:process.env.PATH,HOME:process.env.HOME,...connection};
const db=`arandu_query_bench_${randomBytes(6).toString('hex')}`;
const sql=(query,database=db)=>execFileSync('psql',['-XqAt','-v','ON_ERROR_STOP=1'],{env:{...env,PGDATABASE:database},input:query,encoding:'utf8',maxBuffer:16*1024*1024}).trim();
const owner='00000000-0000-4000-8000-000000000001';
const outsider='00000000-0000-4000-8000-000000000002';
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
  sql(`insert into auth.users(id) values('${owner}'),('${outsider}');
    insert into public.fin_organizations(id,legal_name,kind,created_by)
      select ('10000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'Synthetic benchmark '||i,'BUYER','${owner}' from generate_series(1,20)i;
    insert into public.fin_members(organization_id,user_id,role) select id,'${owner}','admin' from public.fin_organizations;
    insert into public.fin_tasks(id,organization_id,title,status,due_on,created_by,created_at)
      select ('20000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
        ('10000000-0000-4000-8000-'||lpad((1+(i-1)%20)::text,12,'0'))::uuid,
        'Synthetic task '||i,case when i%3=0 then 'done' else 'open' end,
        case when i%11=0 then null else date '2026-01-01'+(i%365) end,'${owner}',
        timestamptz '2026-01-01 00:00:00+00'+i*interval '1 second' from generate_series(1,100000)i;
    analyze public.fin_tasks; analyze public.fin_members; analyze public.fin_organizations;`);
  const rows=()=>sql(`${session(owner)} select jsonb_agg(t.id) from (${query})t;`);
  const expected=rows();
  assert.equal(sql(`${session(outsider)}select count(*) from public.fin_tasks where organization_id='${org}'`),'0');
  const measure=(statement=query,rollback=false)=>{
    const explain=()=>`${rollback?'begin;':''}${session(owner)}explain(analyze,buffers,wal,format json) ${statement};${rollback?'rollback;':''}`;
    // One warmup per phase, followed by five recorded executions.
    sql(explain());
    const plans=Array.from({length:5},()=>JSON.parse(sql(explain()))[0]);
    return {median_execution_ms:median(plans.map(p=>p['Execution Time'])),plans};
  };
  const before=measure();
  const insert=`insert into public.fin_tasks(id,organization_id,title,status,due_on,created_by,created_at)
    select ('30000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
      ('10000000-0000-4000-8000-'||lpad((1+(i-1)%20)::text,12,'0'))::uuid,
      'Synthetic write benchmark '||i,'open',date '2026-01-01'+(i%365),'${owner}',
      timestamptz '2026-01-01 00:00:00+00'+i*interval '1 second' from generate_series(1,1000)i`;
  const writesBefore=measure(insert,true);
  sql('create index arandu_benchmark_task_page_idx on public.fin_tasks(organization_id,status,due_on asc nulls last,created_at,id); analyze public.fin_tasks;');
  const after=measure();
  const writesAfter=measure(insert,true);
  assert.equal(rows(),expected,'Index changed pagination result');
  assert.equal(sql(`${session(outsider)}select count(*) from public.fin_tasks where organization_id='${org}'`),'0','Candidate changed tenant isolation');
  const report={classification:'synthetic_task_page_candidate_index',status:'PASS_LOCAL',hosted:'NOT_RUN',
    postgres:sql('show server_version'),tenants:20,tasks:100000,rows_per_tenant:5000,
    query_source:'lib/api/domains/finance-tasks.mjs: GET status=open, order due_on/created_at/id, sentinel limit=201',
    candidate:'(organization_id,status,due_on ASC NULLS LAST,created_at,id)',
    candidate_bytes:Number(sql("select pg_relation_size('public.arandu_benchmark_task_page_idx')")),
    same_results:true,cross_tenant:'DENIED_BEFORE_AND_AFTER',before,after,
    writes:{rows_per_transaction:1000,committed_rows:0,before:writesBefore,after:writesAfter},
    adoption:'NOT_APPLIED_TO_CANONICAL_SCHEMA: evaluate storage/write cost and representative tenant workload before a separate migration',
    limitations:'Warm synthetic SQL plans and rolled-back authenticated inserts; no network/PostgREST, commit latency, hosted traffic or production p95 claim'};
  fs.mkdirSync('reports',{recursive:true});fs.writeFileSync('reports/financial-query-benchmark.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({...report,before:{median_execution_ms:before.median_execution_ms},after:{median_execution_ms:after.median_execution_ms},writes:{rows_per_transaction:1000,before_ms:writesBefore.median_execution_ms,after_ms:writesAfter.median_execution_ms}}));
} finally {if(created)sql(`drop database ${db} with(force)`,connection.PGDATABASE);}
