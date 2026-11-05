#!/usr/bin/env node
// Opt-in SQL laboratory. Creates and drops only its own random loopback DB.
// Fixture loading is operator setup; measured reads/writes keep real RLS/RPCs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { loopbackTarget } from '../lib/recovery-reconciliation.mjs';

const indexKind=process.argv[2]||'none';
if(process.argv.length>3||!['none','--index=facility-page'].includes(indexKind))throw Error('Use no arguments or --index=facility-page, with ARANDU_DATABASE_TEST_URL pointing at a disposable local cluster');
const connection=loopbackTarget(process.env.ARANDU_DATABASE_TEST_URL);
const database=`arandu_operating_bench_${randomBytes(6).toString('hex')}`;
const env={PATH:process.env.PATH,HOME:process.env.HOME,...connection};
const sql=(input,db=database)=>execFileSync('psql',['-XqAt','-v','ON_ERROR_STOP=1'],{env:{...env,PGDATABASE:db},input,encoding:'utf8',maxBuffer:32*1024*1024}).trim();
const uuid=(kind,n)=>`${kind}0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner=uuid('1',1),viewer=uuid('1',2),outsider=uuid('1',3),org=uuid('2',1),entity=uuid('3',1);
const session=actor=>`set role authenticated;set request.jwt.claim.sub='${actor}';`;
const measure=(statement,actor=owner,{write=false}={})=>{
  const execute=()=>JSON.parse(sql(`begin;${session(actor)}explain(analyze,buffers,wal,format json) ${statement};rollback;`))[0];
  execute();
  const plans=Array.from({length:5},execute),samples=plans.map(p=>p['Execution Time']),median=[...samples].sort((a,b)=>a-b)[2];
  return {samples_ms:samples,median_execution_ms:median,median_plan:plans.find(p=>p['Execution Time']===median),...(write?{transaction:'rolled_back_not_commit_latency'}:{})};
};
let created=false;
try {
  sql(`create database ${database}`,connection.PGDATABASE);created=true;
  sql(fs.readFileSync('tests/database/bootstrap.sql','utf8'));
  sql(execFileSync(process.execPath,['scripts/build-supabase-migration-bundle.mjs','--flow=financialBaseline','--stdout'],{encoding:'utf8',maxBuffer:8*1024*1024}));
  sql(`create function pg_temp.fixture_id(kind int,n int) returns uuid language sql immutable as $$select (kind::text||'0000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
    insert into auth.users(id) values('${owner}'),('${viewer}'),('${outsider}');
    insert into public.fin_organizations(id,legal_name,kind,created_by) select pg_temp.fixture_id(2,i),'Operating benchmark '||i,'BUYER','${owner}' from generate_series(1,20)i;
    insert into public.fin_members(organization_id,user_id,role) select id,'${owner}','admin' from public.fin_organizations;
    insert into public.fin_legal_entities(id,organization_id,legal_name,created_by) select pg_temp.fixture_id(3,i),pg_temp.fixture_id(2,1+(i-1)/2),'Entity '||i,'${owner}' from generate_series(1,40)i;
    insert into public.fin_members(organization_id,user_id,role,entity_scope) values('${org}','${viewer}','viewer','entities');
    insert into public.fin_member_entity_grants(organization_id,user_id,entity_id,granted_by) values('${org}','${viewer}','${entity}','${owner}');
    insert into public.fin_providers(id,organization_id,name,kind,created_by) select pg_temp.fixture_id(4,i),pg_temp.fixture_id(2,i),'Institution '||i,'bank','${owner}' from generate_series(1,20)i;
    insert into public.fin_contracts(id,organization_id,legal_entity_id,provider_id,product,title,starts_on,ends_on,owner_id,origin,currency)
      select pg_temp.fixture_id(5,i),pg_temp.fixture_id(2,1+(i-1)/2),pg_temp.fixture_id(3,i),pg_temp.fixture_id(4,1+(i-1)/2),'credit','Synthetic contract '||i,date '2026-01-01',date '2028-01-01','${owner}','imported',case when i%2=1 then 'BRL' else 'USD' end from generate_series(1,40)i;`);
  const scenarios=[];
  for(const size of [1000,10000,100000]) {
    // The append-only history correctly rejects DELETE, including operator
    // fixture deletion. Reset this run's disposable tables between sizes;
    // never disable their immutable triggers or RLS for measured operations.
    sql('drop index if exists public.operating_bench_facility_page;truncate public.fin_facility_balances,public.fin_facilities cascade;');
    sql('vacuum(full,analyze) public.fin_facilities;vacuum(full,analyze) public.fin_facility_balances;');
    sql(`create function pg_temp.fixture_id(kind int,n int) returns uuid language sql immutable as $$select (kind::text||'0000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
      insert into public.fin_facilities(id,organization_id,legal_entity_id,provider_id,contract_id,kind,name,currency,approved_limit,maturity_on,created_by)
        select pg_temp.fixture_id(6,i),pg_temp.fixture_id(2,1+(i-1)%20),pg_temp.fixture_id(3,1+2*((i-1)%20)+((i-1)/20)%2),pg_temp.fixture_id(4,1+(i-1)%20),pg_temp.fixture_id(5,1+2*((i-1)%20)+((i-1)/20)%2),'revolving_credit','Synthetic facility '||i,case when ((i-1)/20)%2=0 then 'BRL' else 'USD' end,10000,case when i%7=0 then null else date '2027-01-01'+i%365 end,'${owner}' from generate_series(1,${size})i;
      insert into public.fin_facility_balances(organization_id,facility_id,as_of,outstanding_amount,used_limit_amount,source,recorded_by)
        select organization_id,id,date '2026-01-01'+snapshot,1000+snapshot,100+snapshot,'declared','${owner}' from public.fin_facilities cross join generate_series(1,2)snapshot;
      analyze public.fin_facilities;analyze public.fin_facility_balances;analyze public.fin_contracts;analyze public.fin_members;`);
    assert.equal(Number(sql(`${session(owner)}select count(*) from public.fin_portfolio_facility_context where organization_id='${org}'`)),size/20);
    assert.equal(Number(sql(`${session(viewer)}select count(*) from public.fin_portfolio_facility_context where organization_id='${org}'`)),size/40);
    assert.equal(sql(`${session(outsider)}select count(*) from public.fin_portfolio_facility_context where organization_id='${org}'`),'0');
    const page=`select id,contract_id,contract_product,contract_status,provider_name,currency,maturity_on from public.fin_portfolio_facility_context where organization_id='${org}' order by maturity_on asc nulls last,id asc limit 51`;
    const ids=sql(`${session(owner)}select string_agg(quote_literal(id),',') from (select id from public.fin_facilities where organization_id='${org}' order by id limit 50)t`);
    assert.equal(Number(sql(`${session(owner)}select count(*) from public.fin_facility_latest_balance where organization_id='${org}' and facility_id in (${ids}) and outstanding_amount=1002`)),50);
    const createFacilities=`select public.fin_save_facility(p_org=>'${org}'::uuid,p_facility=>null,p_entity=>'${entity}'::uuid,p_provider=>'${uuid('4',1)}'::uuid,p_kind=>'revolving_credit',p_name=>'Synthetic write benchmark',p_currency=>'BRL',p_approved_limit=>10000) from generate_series(1,50)`;
    const writesBefore=measure(createFacilities,owner,{write:true});
    let index=null;
    if(indexKind!=='none') {
      const expected=sql(`${session(owner)}select coalesce(jsonb_agg(t),'[]') from (${page})t`);
      sql('create index operating_bench_facility_page on public.fin_facilities(organization_id,maturity_on asc nulls last,id);analyze public.fin_facilities;');
      assert.equal(sql(`${session(owner)}select coalesce(jsonb_agg(t),'[]') from (${page})t`),expected,'Candidate index changed authorized ordered results');
      const vacuumStart=performance.now();sql('vacuum(analyze) public.fin_facilities');
      index={bytes:Number(sql("select pg_relation_size('public.operating_bench_facility_page')")),vacuum_wall_ms:performance.now()-vacuumStart,
        writes_before:writesBefore,writes_after:measure(createFacilities,owner,{write:true})};
    }
    const results={
      context_page:measure(page),
      entity_page:measure(page,viewer),
      explicit_entity_filter:measure(page.replace('order by',`and legal_entity_id='${entity}' order by`)),
      no_membership:measure(page,outsider),
      latest_balance_batch_50:measure(`select id,facility_id,as_of,outstanding_amount,used_limit_amount from public.fin_facility_latest_balance where organization_id='${org}' and facility_id in (${ids}) order by id limit 201`),
      balance_rpc_50:measure(`select public.fin_record_facility_balance(id,current_date,1500,500,'declared','Synthetic benchmark') from public.fin_facilities where organization_id='${org}' and id in (${ids})`,owner,{write:true})
    };
    scenarios.push({facilities:size,tenants:20,facilities_per_tenant:size/20,balance_history:size*2,facility_create_rpc_50:writesBefore,index,results});
    console.log(JSON.stringify({size,medians_ms:Object.fromEntries(Object.entries(results).map(([key,value])=>[key,value.median_execution_ms]))}));
  }
  const report={classification:'synthetic_local_operating_projection_capacity',index_candidate:indexKind,postgres:sql('show server_version'),schema:sql("select value from public.fin_settings where key='schema_version'"),scenarios,
    limitations:['Warm local SQL medians, not HTTP latency or hosted p95.','No index/schema change proposed or adopted.','Measured writes roll back; not commit latency.','Shared executor load may affect timings; repeat before comparing runs.','Operator-only synthetic fixture loading is not the canonical Demo seed.']};
  fs.mkdirSync('reports',{recursive:true});fs.writeFileSync(`reports/financial-operating-context-benchmark${indexKind==='none'?'':'-facility-page'}.json`,JSON.stringify(report,null,2)+'\n');
} finally {if(created)sql(`drop database ${database}`,connection.PGDATABASE);}
