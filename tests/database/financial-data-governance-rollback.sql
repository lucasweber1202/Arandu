\set ON_ERROR_STOP on
do $$ begin
  if to_regclass('public.fin_legal_holds') is not null or to_regclass('public.fin_data_exports') is not null
    or to_regclass('public.fin_offboarding_requests') is not null or to_regclass('public.fin_retention_policies') is not null
    or to_regprocedure('public.fin_governance_retention_run(boolean,integer,uuid,text)') is not null
    or exists (select 1 from pg_trigger where tgname in ('fin_governance_member_guard','fin_governance_notification_guard'))
    or (select value from public.fin_settings where key='schema_version') <> 'financial-operational-resilience-1'
    or (select prosrc from pg_proc where oid = to_regprocedure('public.fin_ops_overview()')) like '%governance%'
    or not has_function_privilege('service_role','public.fin_job_begin(text,text,timestamp with time zone,integer)','EXECUTE') then
    raise exception 'data governance rollback incomplete';
  end if;
end $$;
