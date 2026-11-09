import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { loopbackTarget } from '../lib/recovery-reconciliation.mjs';

// Same synthetic data and same current snapshots in both queries. PostgreSQL
// query timings only: no HTTP, network, Auth/RLS or hosted latency claim.
const connection = loopbackTarget(process.env.ARANDU_DATABASE_TEST_URL || 'postgresql://postgres:postgres@localhost:5432/postgres');
const source = `
create temporary table bench_proposals(id int primary key,current_version int not null);
create temporary table bench_versions(proposal_id int,version int,terms jsonb,primary key(proposal_id,version));
create temporary table bench_results(history_depth int,strategy text,plan jsonb);
do $$ declare depth int; attempt int; before_plan jsonb; after_plan jsonb; baseline jsonb; optimized jsonb; begin
 foreach depth in array array[10,100,1000] loop
  truncate bench_proposals,bench_versions;
  insert into bench_proposals select n,depth from generate_series(1,100)n;
  insert into bench_versions select p.id,v,jsonb_build_object('amount',p.id*1000,'currency','BRL') from bench_proposals p cross join generate_series(1,depth)v;
  analyze bench_proposals; analyze bench_versions;
  with history as materialized(select * from bench_versions where proposal_id<=25)
   select jsonb_agg(to_jsonb(h) order by h.proposal_id) into baseline from history h join bench_proposals p on p.id=h.proposal_id and p.current_version=h.version;
  select jsonb_agg(to_jsonb(v) order by v.proposal_id) into optimized from bench_proposals p join bench_versions v on v.proposal_id=p.id and v.version=p.current_version where p.id<=25;
  if baseline is distinct from optimized or jsonb_array_length(optimized)<>25 then raise exception 'snapshots differ'; end if;
  for attempt in 1..9 loop
   execute 'explain (analyze,buffers,format json) with history as materialized(select * from bench_versions where proposal_id<=25) select h.* from history h join bench_proposals p on p.id=h.proposal_id and p.current_version=h.version' into before_plan;
   execute 'explain (analyze,buffers,format json) select v.* from bench_proposals p join bench_versions v on v.proposal_id=p.id and v.version=p.current_version where p.id<=25' into after_plan;
   if attempt>2 then insert into bench_results values(depth,'historical_scan',before_plan),(depth,'current_snapshot_lookup',after_plan); end if;
  end loop;
 end loop;
end $$;
select jsonb_agg(jsonb_build_object('history_depth',history_depth,'strategy',strategy,'median_execution_ms',median,'min_execution_ms',minimum,'max_execution_ms',maximum,'samples',samples,'example_plan',example_plan) order by history_depth,strategy) from (
 select history_depth,strategy,percentile_cont(.5) within group(order by (plan->0->>'Execution Time')::numeric) as median,min((plan->0->>'Execution Time')::numeric) as minimum,max((plan->0->>'Execution Time')::numeric) as maximum,count(*) as samples,(jsonb_agg(plan)->0) as example_plan from bench_results group by history_depth,strategy
) s;
`;
const run = spawnSync('psql',['-XqAt','-v','ON_ERROR_STOP=1'], { input: source, encoding: 'utf8', env: { ...process.env,...connection }, maxBuffer: 8*1024*1024 });
assert.equal(run.status,0,run.stderr);
const results=JSON.parse(run.stdout.trim());
console.log(JSON.stringify({ scope:'local_postgresql_current_snapshot_queries', equivalent_current_snapshots:true, proposals:100, visible_page:25, history_depths:[10,100,1000], warmup:2, samples:7, limitations:['Complete historical-scan baseline; legacy capped history is incomplete and is not treated as equivalent.','Temporary synthetic tables use the production composite-key pattern; excludes RLS/Auth/HTTP/Storage/network and concurrent clients.','Warm local query timings are not hosted API latency or production capacity.'], results },null,2));
