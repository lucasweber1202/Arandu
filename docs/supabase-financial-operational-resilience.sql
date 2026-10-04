-- P0.10: leases com fencing, execução observável e filas limitadas.
-- Nenhuma alteração de banco hospedado é autorizada por este arquivo.
begin;
alter table public.fin_job_runs add column if not exists failed integer not null default 0 check (failed >= 0);
alter table public.fin_job_runs add column if not exists lease_token uuid;
alter table public.fin_job_runs add column if not exists lease_expires_at timestamptz;
alter table public.fin_job_runs alter column finished_at drop not null;
alter table public.fin_job_runs drop constraint if exists fin_job_runs_status_check;
alter table public.fin_job_runs add constraint fin_job_runs_status_check check (status in ('running','succeeded','failed'));
alter table public.fin_job_runs drop constraint if exists fin_job_runs_job_check;
alter table public.fin_job_runs add constraint fin_job_runs_job_check check(job in ('renewals','contract_milestones','approval_deadlines','webhooks','email_outbox'));
create table if not exists public.fin_job_leases (
  job text primary key check (job in ('renewals','contract_milestones','approval_deadlines','webhooks','email_outbox')),
  run_id uuid not null references public.fin_job_runs(id),
  lease_token uuid not null,
  expires_at timestamptz not null
);
alter table public.fin_job_leases enable row level security;
alter table public.fin_job_leases force row level security;
revoke all on public.fin_job_leases from public, anon, authenticated;
grant all on public.fin_job_leases to service_role;
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
create or replace function public.fin_job_finish(p_run uuid,p_lease uuid,p_status text,p_processed integer,p_failed integer,p_error_code text default null)
returns boolean language plpgsql security definer set search_path = '' set lock_timeout = '1s' as $$
declare r public.fin_job_runs%rowtype;
begin
  if auth.uid() is not null then raise exception 'forbidden'; end if;
  if p_status is null or p_status not in ('succeeded','failed') or p_processed is null or p_processed < 0 or p_failed is null or p_failed < 0
    or p_status='succeeded' and (p_failed <> 0 or p_error_code is not null)
    or p_error_code is not null and p_error_code !~ '^[a-z0-9_]{1,60}$' then raise exception 'invalid job result'; end if;
  select * into r from public.fin_job_runs where id=p_run for update;
  if not found or r.lease_token is distinct from p_lease then raise exception 'stale lease'; end if;
  if r.status <> 'running' then
    if r.status=p_status and r.processed=p_processed and r.failed=p_failed and r.error_code is not distinct from p_error_code then return true; end if;
    raise exception 'job already finished';
  end if;
  if r.lease_expires_at is null or r.lease_expires_at <= clock_timestamp() or not exists(select 1 from public.fin_job_leases where job=r.job and run_id=p_run and lease_token=p_lease and expires_at > clock_timestamp()) then raise exception 'stale lease'; end if;
  update public.fin_job_runs set status=p_status,processed=p_processed,failed=p_failed,error_code=p_error_code,finished_at=clock_timestamp() where id=p_run;
  update public.fin_job_leases set expires_at=clock_timestamp() where job=r.job and run_id=p_run;
  return true;
end $$;
revoke all on function public.fin_job_begin(text,text,timestamptz,integer),public.fin_job_finish(uuid,uuid,text,integer,integer,text) from public,anon,authenticated;
grant execute on function public.fin_job_begin(text,text,timestamptz,integer),public.fin_job_finish(uuid,uuid,text,integer,integer,text) to service_role;
-- Compatibilidade com ferramentas antigas, sem perder finished_at.
create or replace function public.fin_record_job_run(p_job text,p_status text,p_processed integer,p_request_id text,p_error_code text,p_started_at timestamptz)
returns void language sql security definer set search_path = '' as $$
  insert into public.fin_job_runs(job,status,processed,failed,request_id,error_code,started_at,finished_at)
  values(p_job,p_status,greatest(coalesce(p_processed,0),0),case when p_status='failed' then 1 else 0 end,p_request_id,p_error_code,p_started_at,now());
$$;
create or replace function public.fin_run_renewal_schedule(p_day date default current_date)
returns integer language plpgsql security definer set search_path = '' as $$
declare c record; v_days integer; v_mark text; v_task uuid; v_created integer := 0; v_milestone uuid; v_new boolean;
begin
  if p_day is null or abs(p_day - current_date) > 1 then raise exception 'invalid date'; end if;
  if not pg_try_advisory_xact_lock(hashtext('fin_run_renewal_schedule')) then raise exception using errcode='55P03', message='job busy'; end if;
  for c in select id, organization_id, owner_id, ends_on, renewal_notice_days, status from public.fin_contracts ct
    where status in ('active','renewing') and ends_on <= p_day + greatest(90, renewal_notice_days)
    and not exists (select 1 from public.fin_renewal_milestones rm where rm.contract_id=ct.id and rm.milestone =
      case when ct.ends_on <= p_day then 'expired' else
        (select m.mark from (values ('notice',ct.renewal_notice_days,0),('d30',30,1),('d60',60,1),('d90',90,1)) m(mark,threshold,tiebreak)
          where ct.ends_on-p_day <= m.threshold order by m.threshold,m.tiebreak limit 1) end)
    order by ends_on, id limit 100 for update skip locked
  loop
    v_days := c.ends_on - p_day;
    v_mark := null;
    if v_days <= 0 then v_mark := 'expired';
    else
      -- O menor limite já alcançado é o marco atual; empate favorece o aviso prévio.
      select m.mark into v_mark from (values ('notice', c.renewal_notice_days, 0), ('d30', 30, 1), ('d60', 60, 1), ('d90', 90, 1))
        as m(mark, threshold, tiebreak) where v_days <= m.threshold order by m.threshold, m.tiebreak limit 1;
    end if;
    if v_mark is null then continue; end if;
    if exists (select 1 from public.fin_renewal_milestones where contract_id = c.id and milestone = v_mark) then continue; end if;
    select id into v_task from public.fin_tasks where organization_id = c.organization_id and related_type = 'contract'
      and related_id = c.id and status = 'open' order by created_at limit 1;
    v_new := v_task is null;
    if v_new then
      insert into public.fin_tasks(organization_id, title, due_on, status, related_type, related_id, created_by)
      values (c.organization_id, case when v_days <= 0 then 'Revisar contrato vencido' else 'Revisar renovação de contrato' end,
        least(c.ends_on - c.renewal_notice_days, c.ends_on), 'open', 'contract', c.id, c.owner_id)
      returning id into v_task;
    end if;
    insert into public.fin_renewal_milestones(organization_id, contract_id, milestone, task_id)
    values (c.organization_id, c.id, v_mark, v_task) on conflict (contract_id, milestone) do nothing
    returning id into v_milestone;
    if v_milestone is null then
      if v_new then delete from public.fin_tasks where id = v_task; end if;
      continue;
    end if;
    insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (c.organization_id, 'contract', c.id, 'renewal_milestone_reached', null,
      jsonb_build_object('milestone', v_mark, 'task_id', v_task, 'scheduled', true));
    -- Um aviso por marco novo (chave = marco), com ou sem tarefa nova: o contrato
    -- registrado pelo produto já nasce com a tarefa de revisão aberta.
    insert into public.fin_notifications(organization_id, user_id, event_type, object_type, object_id, event_id, title, body)
    values (c.organization_id, c.owner_id, 'renewal_due', 'contract', c.id, v_milestone, 'Contrato em revisão de renovação',
      case v_mark when 'expired' then 'O contrato chegou ao fim. Registre a decisão de renovação.'
                  when 'notice' then 'O prazo de aviso prévio do contrato chegou.'
                  else 'Faltam ' || substr(v_mark, 2) || ' dias para o fim do contrato.' end)
    on conflict (user_id, event_type, event_id) do nothing;
    if v_new then v_created := v_created + 1; end if;
    if v_days <= c.renewal_notice_days and c.status = 'active' then
      update public.fin_contracts set status = 'renewing', updated_at = now() where id = c.id;
    end if;
  end loop;
  return v_created;
end $$;

create or replace function public.fin_process_contract_milestones(p_org uuid default null, p_day date default current_date)
returns integer language plpgsql security definer set search_path = '' as $$
declare m record; v_task uuid; v_count integer := 0; v_inserted integer;
begin
  if p_day is null or abs(p_day - current_date) > 1 then raise exception 'invalid date'; end if;
  -- Sem sessão só chega aqui o job (service role): a RPC não é concedida a
  -- anon e toda chamada autenticada carrega `sub`.
  if auth.uid() is not null and (p_org is null or not public.fin_has_role(p_org, array['admin','finance_manager'])) then
    raise exception 'forbidden';
  end if;
  for m in select ms.*, c.legal_entity_id, c.owner_id contract_owner
             from public.fin_contract_milestones ms
             join public.fin_contracts c on c.id = ms.contract_id
            where ms.status = 'scheduled' and ms.due_on - ms.lead_days <= p_day
              and c.status in ('active','renewing')
              and (p_org is null or ms.organization_id = p_org)
              and (auth.uid() is null or public.fin_entity_visible(ms.organization_id, c.legal_entity_id))
              and not exists (select 1 from public.fin_contract_milestone_runs mr where mr.milestone_id=ms.id and mr.occurrence_due_on=ms.due_on)
            order by ms.due_on, ms.id limit 100 for update of ms skip locked
  loop
    if exists (select 1 from public.fin_contract_milestone_runs r where r.milestone_id = m.id and r.occurrence_due_on = m.due_on) then continue; end if;
    insert into public.fin_tasks(organization_id, title, due_on, status, related_type, related_id, created_by)
      values (m.organization_id, left(m.title, 200), m.due_on, 'open', 'contract', m.contract_id, coalesce(auth.uid(), m.created_by))
      returning id into v_task;
    insert into public.fin_contract_milestone_runs(milestone_id, organization_id, occurrence_due_on, task_id)
      values (m.id, m.organization_id, m.due_on, v_task) on conflict do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted = 0 then delete from public.fin_tasks where id = v_task; continue; end if;
    insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
      values (m.organization_id, 'contract', m.contract_id, 'contract_milestone_due', auth.uid(),
        jsonb_build_object('milestone_id', m.id, 'kind', m.kind, 'occurrence', m.due_on, 'task_id', v_task));
    if coalesce(m.owner_id, m.contract_owner) is distinct from auth.uid() then
      insert into public.fin_notifications(organization_id, user_id, event_type, object_type, object_id, event_id, title, body)
        values (m.organization_id, coalesce(m.owner_id, m.contract_owner), 'renewal_due', 'contract', m.contract_id, v_task,
          'Marco de contrato', 'Há um marco de contrato para acompanhar.')
        on conflict (user_id, event_type, event_id) do nothing;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

create or replace function public.fin_process_approval_deadlines(p_org uuid default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare s record; r record; v_task uuid; v_count integer := 0; v_target uuid;
begin
  if auth.uid() is not null and (p_org is null or not public.fin_has_role(p_org, array['admin','finance_manager'])) then raise exception 'forbidden'; end if;
  for r in select a.id, a.organization_id, a.rfq_id from public.fin_approval_requests a join public.fin_rfqs f on f.id = a.rfq_id
            where a.status = 'pending' and a.expires_at is not null and a.expires_at < now()
              and (p_org is null or a.organization_id = p_org)
              and (auth.uid() is null or public.fin_entity_visible(a.organization_id, f.legal_entity_id))
            order by a.expires_at, a.id limit 100 for update of a skip locked
  loop
    update public.fin_approval_requests set status = 'expired', resolved_at = now() where id = r.id;
    perform public.fin_approval_close_open(r.id, 'expired');
    update public.fin_policy_exceptions set status = 'cancelled' where request_id = r.id and status = 'requested';
    insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
      values (r.organization_id, 'rfq', r.rfq_id, 'approval_expired', auth.uid(), jsonb_build_object('request_id', r.id));
    v_count := v_count + 1;
  end loop;
  for s in select st.id, st.request_id, st.stage_key, a.organization_id, a.rfq_id, a.requested_by, a.policy_snapshot, f.legal_entity_id
             from public.fin_approval_stages st
             join public.fin_approval_requests a on a.id = st.request_id and a.status = 'pending'
             join public.fin_rfqs f on f.id = a.rfq_id
            where st.status = 'active' and st.escalated_at is null and st.due_at is not null and st.due_at < now()
              and (p_org is null or a.organization_id = p_org)
              and (auth.uid() is null or public.fin_entity_visible(a.organization_id, f.legal_entity_id))
            order by st.due_at, st.id limit 100 for update of st skip locked
  loop
    insert into public.fin_tasks(organization_id, title, due_on, status, related_type, related_id, created_by)
      values (s.organization_id, 'Aprovação em atraso: acompanhar a etapa pendente', current_date, 'open', 'rfq', s.rfq_id, coalesce(auth.uid(), s.requested_by))
      returning id into v_task;
    update public.fin_approval_stages set escalated_at = now() where id = s.id;
    for v_target in select m.user_id from public.fin_members m
                     where m.organization_id = s.organization_id and m.user_id <> s.requested_by
                       and m.role in (select jsonb_array_elements_text(coalesce(s.policy_snapshot->'escalation_roles', '["admin"]'::jsonb)))
                       and public.fin_approval_member_eligible(s.organization_id, s.legal_entity_id, m.user_id, array[m.role], 'any')
                     order by m.created_at, m.user_id limit 5
    loop
      insert into public.fin_notifications(organization_id, user_id, event_type, object_type, object_id, event_id, title, body)
        values (s.organization_id, v_target, 'approval_requested', 'rfq', s.rfq_id, v_task, 'Aprovação em atraso',
                'Uma etapa de aprovação passou do prazo definido pela policy da empresa.')
        on conflict (user_id, event_type, event_id) do nothing;
    end loop;
    insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
      values (s.organization_id, 'rfq', s.rfq_id, 'approval_stage_escalated', auth.uid(), jsonb_build_object('request_id', s.request_id, 'stage', s.stage_key, 'task_id', v_task));
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

create or replace function public.fin_webhook_complete(p_delivery uuid, p_lease uuid, p_success boolean, p_status_code integer, p_error_code text)
returns text language plpgsql security definer set search_path = '' as $$
declare d public.fin_webhook_deliveries%rowtype; v_status text; v_delays integer[] := array[60, 300, 1800, 7200, 21600, 43200, 86400];
begin
  if auth.uid() is not null then raise exception 'forbidden'; end if;
  select * into d from public.fin_webhook_deliveries where id = p_delivery for update;
  if not found or d.status <> 'delivering' or d.lease_token is distinct from p_lease or d.lease_expires_at is null or d.lease_expires_at <= clock_timestamp() then raise exception 'stale lease'; end if;
  if p_success then
    update public.fin_webhook_deliveries set status = 'succeeded', lease_token = null, lease_expires_at = null, last_status_code = p_status_code,
           last_error_code = null, delivered_at = now() where id = p_delivery;
    update public.fin_webhook_endpoints set consecutive_failures = 0 where id = d.endpoint_id and consecutive_failures <> 0;
    return 'succeeded';
  end if;
  v_status := case when d.attempts >= 8 or p_status_code between 400 and 499 and p_status_code not in (408,429) then 'dead' else 'failed' end;
  update public.fin_webhook_deliveries set status = v_status, lease_token = null, lease_expires_at = null,
         last_status_code = case when p_status_code between 100 and 599 then p_status_code end,
         last_error_code = case when coalesce(p_error_code, '') ~ '^[a-z0-9_]{1,60}$' then p_error_code else 'delivery_failed' end,
         next_attempt_at = now() + make_interval(secs => v_delays[least(d.attempts, 7)] + floor(random() * greatest(1, v_delays[least(d.attempts, 7)] / 5))::integer)
   where id = p_delivery;
  update public.fin_webhook_endpoints set consecutive_failures = consecutive_failures + 1, updated_at = now() where id = d.endpoint_id;
  if (select consecutive_failures from public.fin_webhook_endpoints where id = d.endpoint_id) >= 20 then
    update public.fin_webhook_endpoints set status = 'disabled_failing', disabled_at = now(), disabled_reason = 'consecutive_failures', updated_at = now()
     where id = d.endpoint_id and status = 'active';
    update public.fin_webhook_deliveries set status = 'cancelled' where endpoint_id = d.endpoint_id and status in ('pending','failed');
    insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
      values (d.organization_id, 'webhook_endpoint', d.endpoint_id, 'webhook_endpoint_auto_disabled', null, '{}'::jsonb);
  end if;
  return v_status;
end $$;

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
create or replace function public.fail_transactional_email_v2(
  p_id uuid, p_claim_token uuid, p_error_code text, p_retry_after_seconds integer default 60
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.transactional_email_outbox%rowtype; v_dead boolean; v_delay integer;
begin
  select * into v_row from public.transactional_email_outbox
  where id = p_id and status = 'processing' and claim_token = p_claim_token
    and lease_expires_at > now() for update;
  if not found then raise exception using message = 'Lease da outbox inválida ou expirada.', errcode = 'P0001'; end if;
  v_dead := v_row.attempts >= v_row.max_attempts or (p_error_code ~ '^http_4[0-9]{2}$' and p_error_code not in ('http_408','http_429'));
  v_delay := greatest(30, least(coalesce(p_retry_after_seconds, 60), 86400));
  update public.transactional_email_outbox
  set status = case when v_dead then 'dead' else 'retry' end,
      next_attempt_at = case when v_dead then next_attempt_at else now() + make_interval(secs => v_delay) end,
      claimed_at = null, worker_ref = null, claim_token = null, lease_expires_at = null,
      recipient_address = case when v_dead then null else recipient_address end,
      last_error_code = left(coalesce(nullif(trim(p_error_code), ''), 'delivery_failed'), 120), updated_at = now()
  where id = p_id returning * into v_row;
  return jsonb_build_object('ok', true, 'id', v_row.id, 'status', v_row.status, 'attempts', v_row.attempts);
end;
$$;
insert into public.fin_settings(key,value) values('schema_version', 'financial-operational-resilience-1') on conflict(key) do update set value=excluded.value,updated_at=now();
notify pgrst, 'reload schema';
commit;
