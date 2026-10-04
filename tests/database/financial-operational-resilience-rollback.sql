\set ON_ERROR_STOP on
do $$ begin
  if to_regclass('public.fin_job_leases') is not null or to_regprocedure('public.fin_job_begin(text,text,timestamptz,integer)') is not null
    or exists(select 1 from information_schema.columns where table_schema='public' and table_name='fin_job_runs' and column_name in ('failed','lease_token','lease_expires_at'))
    or (select value from public.fin_settings where key='schema_version') <> 'financial-sso-1'
    or not has_function_privilege('service_role','public.fin_record_job_run(text,text,integer,text,text,timestamptz)','EXECUTE') then raise exception 'resilience rollback incomplete'; end if;
end $$;
