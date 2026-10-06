-- Rollback de docs/supabase-financial-data-governance.sql.
--
-- Só é válido sobre uma instalação de governança SEM USO: se já existe política,
-- hold, export, offboarding, trilha de governança ou execução de job de
-- governança, o rollback recusa e a correção é forward-fix. Motivo: derrubar as
-- tabelas apagaria evidência (holds, trilha de retenção) e o acesso revogado por
-- um offboarding NÃO é restaurado por rollback (vínculos ficam em
-- fin_offboarding_member_archive, que este script também removeria).
begin;
do $$ begin
  if exists (select 1 from public.fin_retention_policies) or exists (select 1 from public.fin_legal_holds)
     or exists (select 1 from public.fin_data_exports) or exists (select 1 from public.fin_offboarding_requests)
     or exists (select 1 from public.fin_governance_log)
     or exists (select 1 from public.fin_job_runs where job in ('retention','data_exports','offboarding'))
     or exists (select 1 from public.fin_webhook_endpoints where disabled_reason = 'tenant_offboarding') then
    raise exception 'governance state exists: use forward-fix';
  end if;
end $$;
drop trigger if exists fin_governance_member_guard on public.fin_members;
drop trigger if exists fin_governance_notification_guard on public.fin_notifications;
drop function if exists public.fin_governance_summary(uuid);
drop function if exists public.fin_governance_offboarding_operator_cancel(uuid);
drop function if exists public.fin_governance_offboarding_close(uuid,text);
drop function if exists public.fin_governance_deletion_preview(uuid);
drop function if exists public.fin_governance_offboarding_advance(integer);
drop function if exists public.fin_governance_offboarding_action(uuid,text,jsonb);
drop function if exists public.fin_governance_revoke_org_access(uuid);
drop function if exists public.fin_governance_offboarding_set(uuid,text,text,uuid);
drop function if exists public.fin_governance_request_offboarding(uuid,text);
drop function if exists public.fin_governance_export_parts(uuid);
drop function if exists public.fin_governance_export_part(uuid,text);
drop function if exists public.fin_governance_export_manifest(uuid);
drop function if exists public.fin_governance_build_export(integer);
drop function if exists public.fin_governance_export_datasets();
drop function if exists public.fin_governance_request_export(uuid,text);
drop function if exists public.fin_governance_retention_run(boolean,integer,uuid,text);
drop function if exists public.fin_governance_release_legal_hold(uuid,text);
drop function if exists public.fin_governance_create_legal_hold(uuid,text,uuid,text,text,text);
drop function if exists public.fin_governance_retire_retention_policy(uuid);
drop function if exists public.fin_governance_activate_retention_policy(uuid);
drop function if exists public.fin_governance_save_retention_policy(uuid,text,integer,text,text);
drop function if exists public.fin_governance_notification_guard();
drop function if exists public.fin_governance_member_guard();
drop function if exists public.fin_governance_hold_blocks(uuid,text);
drop function if exists public.fin_governance_org_locked(uuid);
drop function if exists public.fin_governance_require_admin(uuid);
drop table if exists public.fin_governance_log;
drop table if exists public.fin_offboarding_member_archive;
drop table if exists public.fin_offboarding_requests;
drop table if exists public.fin_data_export_parts;
drop table if exists public.fin_data_exports;
drop table if exists public.fin_legal_holds;
drop table if exists public.fin_retention_policies;
drop function if exists public.fin_retention_class_catalog();
alter table public.fin_webhook_endpoints drop constraint if exists fin_webhook_endpoints_disabled_reason_check;
alter table public.fin_webhook_endpoints add constraint fin_webhook_endpoints_disabled_reason_check check (disabled_reason is null
  or disabled_reason in ('manual','consecutive_failures','service_account_revoked'));
alter table public.fin_job_leases drop constraint if exists fin_job_leases_job_check;
alter table public.fin_job_leases add constraint fin_job_leases_job_check check(job in ('renewals','contract_milestones','approval_deadlines','webhooks','email_outbox'));
alter table public.fin_job_runs drop constraint if exists fin_job_runs_job_check;
alter table public.fin_job_runs add constraint fin_job_runs_job_check check(job in ('renewals','contract_milestones','approval_deadlines','webhooks','email_outbox'));
create or replace function public.fin_job_begin(p_job text, p_request_id text, p_started_at timestamptz, p_lease_seconds integer default 90)
returns jsonb language plpgsql security definer set search_path = '' set lock_timeout = '1s' as $$
declare v_id uuid; v_token uuid := gen_random_uuid(); v_expires timestamptz;
begin
  if auth.uid() is not null then raise exception 'forbidden'; end if;
  if p_job is null or p_job not in ('renewals','contract_milestones','approval_deadlines','webhooks','email_outbox') or p_request_id is null or p_request_id !~ '^[A-Za-z0-9-]{1,80}$'
    or p_started_at is null or abs(extract(epoch from clock_timestamp()-p_started_at)) > 60 then raise exception 'invalid job'; end if;
  if not pg_try_advisory_xact_lock(hashtext('fin_job_begin:'||p_job)) then return null; end if;
  if exists (select 1 from public.fin_job_leases where job=p_job and expires_at > clock_timestamp()) then return null; end if;
  update public.fin_job_runs set status='failed',failed=greatest(failed,1),error_code='lease_expired',finished_at=clock_timestamp()
    where job=p_job and status='running' and lease_expires_at <= clock_timestamp();
  v_expires := clock_timestamp() + make_interval(secs => least(greatest(coalesce(p_lease_seconds,90),30),120));
  insert into public.fin_job_runs(job,status,request_id,started_at,finished_at,lease_token,lease_expires_at)
    values(p_job,'running',p_request_id,p_started_at,null,v_token,v_expires) returning id into v_id;
  insert into public.fin_job_leases(job,run_id,lease_token,expires_at) values(p_job,v_id,v_token,v_expires)
    on conflict(job) do update set run_id=excluded.run_id,lease_token=excluded.lease_token,expires_at=excluded.expires_at;
  return jsonb_build_object('run_id',v_id,'lease_token',v_token);
end $$;
revoke all on function public.fin_job_begin(text,text,timestamptz,integer) from public,anon,authenticated;
grant execute on function public.fin_job_begin(text,text,timestamptz,integer) to service_role;
create or replace function public.fin_ops_overview()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  perform public.fin_require_operator();
  insert into public.fin_ops_access_log (user_id, action) values (auth.uid(), 'overview');
  select jsonb_build_object(
    'schema_version', public.fin_setting('schema_version', 'financial-pilot-grade-1'),
    'generated_at', now(),
    'email_enabled', public.fin_setting('email_enabled', 'false') = 'true',
    'jobs', coalesce((select jsonb_agg(jsonb_build_object('job', j.job, 'status', j.status, 'processed', j.processed, 'request_id', j.request_id,
        'failed', j.failed, 'duration_ms', floor(extract(epoch from coalesce(j.finished_at,now()) - j.started_at)*1000), 'error_code', j.error_code, 'started_at', j.started_at, 'finished_at', j.finished_at) order by j.finished_at desc)
      from (select * from public.fin_job_runs order by started_at desc limit 20) j), '[]'::jsonb),
    'webhooks', jsonb_build_object(
      'by_status', coalesce((select jsonb_object_agg(status,total) from (select status,count(*) total from public.fin_webhook_deliveries group by status) x),'{}'::jsonb),
      'oldest_pending_minutes', (select floor(extract(epoch from now()-min(created_at))/60) from public.fin_webhook_deliveries where status in ('pending','failed')),
      'recent_failures', coalesce((select jsonb_agg(jsonb_build_object('id',id,'status',status,'attempts',attempts,'error_code',last_error_code,'created_at',created_at)) from
        (select id,status,attempts,last_error_code,created_at from public.fin_webhook_deliveries where status in ('failed','dead') order by created_at desc limit 20) w),'[]'::jsonb)),
    'sso', jsonb_build_object('connections_by_status',coalesce((select jsonb_object_agg(status,total) from (select status,count(*) total from public.fin_sso_connections group by status) s),'{}'::jsonb),
      'failures_24h',(select count(*) from public.fin_sso_events where happened_at > now()-interval '24 hours' and outcome <> 'success')),
    'expired_job_leases', (select count(*) from public.fin_job_runs where status='running' and lease_expires_at <= now()),
    'last_renewal_success', (select max(finished_at) from public.fin_job_runs where job = 'renewals' and status = 'succeeded'),
    'renewal_milestones_24h', (select count(*) from public.fin_renewal_milestones where triggered_at > now() - interval '24 hours'),
    'outbox', jsonb_build_object(
      'by_status', coalesce((select jsonb_object_agg(status, total) from (select status, count(*) total from public.transactional_email_outbox
          where template = 'finance_notification' group by status) s), '{}'::jsonb),
      'oldest_pending_minutes', (select floor(extract(epoch from now() - min(created_at)) / 60) from public.transactional_email_outbox
          where template = 'finance_notification' and status in ('pending','retry')),
      'recent_failures', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'status', o.status, 'attempts', o.attempts,
          'error_code', o.last_error_code, 'created_at', o.created_at) order by o.created_at desc)
        from (select * from public.transactional_email_outbox where template = 'finance_notification' and status in ('retry','dead')
              order by created_at desc limit 10) o), '[]'::jsonb)),
    'documents', jsonb_build_object(
      'pending_over_1h', (select count(*) from public.fin_document_versions where status = 'pending' and created_at < now() - interval '1 hour'),
      'failed_24h', (select count(*) from public.fin_document_versions where status = 'failed' and completed_at > now() - interval '24 hours'),
      'available_total', (select count(*) from public.fin_document_versions where status = 'available')),
    'notifications_24h', (select count(*) from public.fin_notifications where created_at > now() - interval '24 hours'),
    'invite_denials_24h', coalesce((select jsonb_object_agg(reason, total) from (select reason, count(*) total
      from public.fin_invite_acceptance_denials where happened_at > now() - interval '24 hours' group by reason) d), '{}'::jsonb)
  ) into v_result;
  return v_result;
end $$;
revoke all on function public.fin_ops_overview() from public, anon;
grant execute on function public.fin_ops_overview() to authenticated;
update public.fin_settings set value = 'financial-operational-resilience-1', updated_at = now() where key = 'schema_version';
notify pgrst, 'reload schema';
commit;
