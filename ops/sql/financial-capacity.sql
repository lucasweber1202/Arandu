-- Read-only, aggregate-only economic observation. No query text, identifiers of
-- people, object paths, job payloads, credentials or per-session details.
-- Capture twice to measure rates; stats_reset must match. No quota is guessed.
begin isolation level repeatable read read only;
set local statement_timeout='15s';
select jsonb_build_object(
 'observed_at',clock_timestamp(),
 'classification','aggregate_capacity_observation_not_billing',
 'database_bytes',pg_database_size(current_database()),
 'public_relation_bytes',(select coalesce(sum(pg_total_relation_size(c.oid)),0) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','m')),
 'public_index_bytes',(select coalesce(sum(pg_relation_size(c.oid)),0) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='i'),
 'database_counters',(select jsonb_build_object('stats_reset',stats_reset,'commits',xact_commit,'rollbacks',xact_rollback,'blocks_read',blks_read,'blocks_hit',blks_hit,'temp_bytes',temp_bytes,'deadlocks',deadlocks) from pg_stat_database where datname=current_database()),
 'public_maintenance',(select jsonb_build_object('live_rows_estimate',coalesce(sum(n_live_tup),0),'dead_rows_estimate',coalesce(sum(n_dead_tup),0),'inserts',coalesce(sum(n_tup_ins),0),'updates',coalesce(sum(n_tup_upd),0),'deletes',coalesce(sum(n_tup_del),0),'vacuum_runs',coalesce(sum(vacuum_count+autovacuum_count),0)) from pg_stat_user_tables where schemaname='public'),
 'connections',(select jsonb_build_object('database_total',count(*),'database_active',count(*) filter(where state='active')) from pg_stat_activity where datname=current_database()),
 'auth_sessions',case when to_regclass('auth.sessions') is null then null else (xpath('/row/n/text()',query_to_xml('select count(*) n from auth.sessions',false,true,'')))[1]::text::bigint end,
 'storage',case when to_regclass('storage.objects') is null then null else (xpath('/row/j/text()',query_to_xml($query$select jsonb_build_object('objects',count(*),'declared_object_bytes',coalesce(sum(case when metadata->>'size' ~ '^[0-9]{1,18}$' then (metadata->>'size')::bigint else 0 end),0),'objects_without_valid_declared_size',count(*) filter(where metadata->>'size' is null or metadata->>'size' !~ '^[0-9]{1,18}$')) j from storage.objects$query$,false,true,'')))[1]::text::jsonb end,
 'jobs',case when to_regclass('public.fin_job_runs') is null then null else (xpath('/row/j/text()',query_to_xml($query$select jsonb_build_object('total',count(*),'running',count(*) filter(where status='running'),'failed',count(*) filter(where status='failed'),'succeeded',count(*) filter(where status='succeeded')) j from public.fin_job_runs$query$,false,true,'')))[1]::text::jsonb end,
 'egress_bytes',null,'provider_billed_usage',null,'quota_headroom',null,
 'limitations',jsonb_build_array('Database counters include other clients and this observation; reset invalidates deltas','Relation and row estimates are not billed storage','Storage bytes are declared metadata, not binary readback','No provider egress, billing, Auth MAU or quota usage inferred','Job totals are cumulative retained rows, not a freshness/readiness proof')
) as capacity;
rollback;
