-- Reverte docs/supabase-financial-final-hardening.sql: console volta a aceitar
-- qualquer registro em fin_platform_operators com aal2 (sem finance_ops), convites
-- voltam a depender só do token + regras da #73, e a trilha de recusas é removida
-- (exporte fin_invite_acceptance_denials antes, se precisar dela).
delete from public.fin_settings where key = 'schema_version';

create or replace function public.fin_invite_provider(p_rfq uuid, p_provider uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_status text; v_token text; v_invite uuid; v_contact text; v_buyer text; v_deadline date; v_product text;
begin
  select organization_id, status, response_deadline, product into v_org, v_status, v_deadline, v_product
    from public.fin_rfqs where id = p_rfq;
  if v_org is null then raise exception 'rfq not found'; end if;
  if not public.fin_has_role(v_org, array['admin','finance_manager']) then raise exception 'forbidden'; end if;
  if v_status not in ('draft','open','collecting') then raise exception 'invalid state'; end if;
  select contact_email into v_contact from public.fin_providers p
    where p.id = p_provider and p.organization_id = v_org and p.status = 'active';
  if not found then raise exception 'provider not found'; end if;
  select legal_name into v_buyer from public.fin_organizations where id = v_org;
  v_invite := gen_random_uuid();
  v_token := encode(sha256(convert_to(public.fin_setting('invite_secret') || ':' || v_invite::text, 'UTF8')), 'hex');
  insert into public.fin_rfq_invites (id, buyer_organization_id, rfq_id, provider_id, token_hash, created_by)
    values (v_invite, v_org, p_rfq, p_provider, encode(sha256(convert_to(v_token,'UTF8')),'hex'), auth.uid());
  insert into public.fin_events (organization_id, entity_type, entity_id, event_type, actor_id)
    values (v_org, 'rfq', p_rfq, 'provider_invited', auth.uid());
  if v_contact is not null then
    perform public.fin_enqueue_email(
      'provider_invite', v_contact, 'rfq', p_rfq,
      jsonb_build_object('buyer', v_buyer, 'product', v_product, 'deadline', v_deadline, 'invite_ref', v_invite),
      'provider_invite:' || v_invite::text);
  end if;
  return v_token;
end $$;
revoke all on function public.fin_invite_provider(uuid, uuid) from public, anon;
grant execute on function public.fin_invite_provider(uuid, uuid) to authenticated;

create or replace function public.fin_accept_provider_invite(p_token text, p_provider_org uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_inv public.fin_rfq_invites%rowtype;
begin
  if auth.uid() is null or coalesce(p_token,'') !~ '^[0-9a-f]{64}$' then raise exception 'invalid invitation'; end if;
  if not public.fin_has_role(p_provider_org, array['admin','provider_user']) then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.fin_organizations o where o.id = p_provider_org and o.kind = 'PROVIDER') then
    raise exception 'provider organization required';
  end if;
  select * into v_inv from public.fin_rfq_invites
    where token_hash = encode(sha256(convert_to(p_token,'UTF8')),'hex')
      and status = 'invited' and accepted_at is null and expires_at > now()
    for update;
  if not found then raise exception 'invalid invitation'; end if;
  if v_inv.buyer_organization_id = p_provider_org then raise exception 'invalid invitation'; end if;
  -- (1) cadastro já vinculado a outra conta provedora.
  if exists (
    select 1 from public.fin_providers p
    where p.id = v_inv.provider_id and p.organization_id = v_inv.buyer_organization_id
      and p.provider_organization_id is not null and p.provider_organization_id <> p_provider_org
  ) then raise exception 'invalid invitation'; end if;
  -- (2) a mesma conta já ocupa outra vaga aceita nesta RFQ.
  if exists (
    select 1 from public.fin_rfq_invites i
    where i.rfq_id = v_inv.rfq_id and i.id <> v_inv.id
      and i.status = 'accepted' and i.provider_organization_id = p_provider_org
  ) then raise exception 'invalid invitation'; end if;
  update public.fin_rfq_invites
    set status = 'accepted', accepted_at = now(), provider_organization_id = p_provider_org
    where id = v_inv.id;
  -- O cadastro do comprador passa a apontar para a conta canônica do provedor.
  update public.fin_providers
    set provider_organization_id = p_provider_org, updated_at = now()
    where id = v_inv.provider_id and organization_id = v_inv.buyer_organization_id
      and provider_organization_id is null;
  insert into public.fin_proposals (invite_id, rfq_id, buyer_organization_id, provider_id, provider_organization_id, product)
    select v_inv.id, v_inv.rfq_id, v_inv.buyer_organization_id, v_inv.provider_id, p_provider_org, r.product
    from public.fin_rfqs r where r.id = v_inv.rfq_id
    on conflict (invite_id) do nothing;
  insert into public.fin_events (organization_id, entity_type, entity_id, event_type, actor_id)
    values (v_inv.buyer_organization_id, 'rfq', v_inv.rfq_id, 'invite_accepted', auth.uid());
  return v_inv.id;
end $$;
revoke all on function public.fin_accept_provider_invite(text, uuid) from public, anon;
grant execute on function public.fin_accept_provider_invite(text, uuid) to authenticated;

create or replace function public.fin_ops_overview()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  perform public.fin_require_operator();
  insert into public.fin_ops_access_log (user_id, action) values (auth.uid(), 'overview');
  select jsonb_build_object(
    'schema_version', 'financial-pilot-grade-1',
    'generated_at', now(),
    'email_enabled', public.fin_setting('email_enabled', 'false') = 'true',
    'jobs', coalesce((select jsonb_agg(jsonb_build_object('job', j.job, 'status', j.status, 'processed', j.processed, 'request_id', j.request_id,
        'error_code', j.error_code, 'started_at', j.started_at, 'finished_at', j.finished_at) order by j.finished_at desc)
      from (select * from public.fin_job_runs order by finished_at desc limit 10) j), '[]'::jsonb),
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
    'notifications_24h', (select count(*) from public.fin_notifications where created_at > now() - interval '24 hours')
  ) into v_result;
  return v_result;
end $$;
revoke all on function public.fin_ops_overview() from public, anon;
grant execute on function public.fin_ops_overview() to authenticated;

create or replace function public.fin_ops_trace(p_request_id text default null, p_entity_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.fin_require_operator();
  if p_request_id is null and p_entity_id is null then raise exception 'lookup required'; end if;
  if p_request_id is not null and p_request_id !~ '^[A-Za-z0-9-]{1,80}$' then raise exception 'invalid lookup'; end if;
  insert into public.fin_ops_access_log (user_id, action, lookup) values (auth.uid(), 'trace', coalesce(p_request_id, p_entity_id::text));
  return jsonb_build_object(
    'jobs', coalesce((select jsonb_agg(jsonb_build_object('job', job, 'status', status, 'processed', processed, 'error_code', error_code, 'finished_at', finished_at))
      from public.fin_job_runs where p_request_id is not null and request_id = p_request_id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('organization_id', e.organization_id, 'entity_type', e.entity_type, 'entity_id', e.entity_id,
        'event_type', e.event_type, 'happened_at', e.happened_at) order by e.happened_at desc)
      from (select * from public.fin_events where p_entity_id is not null and (entity_id = p_entity_id or organization_id = p_entity_id)
            order by happened_at desc limit 50) e), '[]'::jsonb));
end $$;
revoke all on function public.fin_ops_trace(text, uuid) from public, anon;
grant execute on function public.fin_ops_trace(text, uuid) to authenticated;

create or replace function public.fin_require_operator()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (select 1 from public.fin_platform_operators o where o.user_id = auth.uid()) then
    raise exception 'forbidden';
  end if;
  if public.fin_jwt_aal() <> 'aal2' then raise exception 'mfa required'; end if;
end $$;
revoke all on function public.fin_require_operator() from public, anon, authenticated;

create or replace function public.fin_is_operator()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (select 1 from public.fin_platform_operators o where o.user_id = auth.uid());
$$;
revoke all on function public.fin_is_operator() from public, anon;
grant execute on function public.fin_is_operator() to authenticated;

drop table if exists public.fin_invite_acceptance_denials;
alter table public.fin_rfq_invites drop constraint if exists fin_rfq_invites_recipient_check;
alter table public.fin_rfq_invites drop column if exists recipient_email;
alter table public.fin_rfq_invites drop column if exists recipient_mode;
drop function if exists public.fin_platform_role();
