-- Rollback de docs/supabase-financial-followup-hardening.sql: restaura as
-- definições anteriores (fila sem teto por organização, claim em ordem global e
-- evidência de exceção que recusa documento). A coluna organization_id e os
-- índices ficam: são aditivos e as funções anteriores não os usam.
begin;


create or replace function public.fin_enqueue_email(
  p_template text, p_recipient text, p_entity_type text, p_entity_id uuid,
  p_payload jsonb, p_idempotency_key text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_hash text;
begin
  if public.fin_setting('email_enabled', 'false') <> 'true' then return false; end if;
  if coalesce(p_recipient,'') !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then return false; end if;
  if p_template not in (
    'member_invite','provider_invite','rfq_opened','deadline_near',
    'proposal_received','proposal_revised','decision_recorded','renewal_due'
  ) then raise exception 'unknown template'; end if;
  v_hash := encode(sha256(convert_to(lower(trim(p_recipient)), 'UTF8')), 'hex');
  insert into public.transactional_email_outbox (
    event_type, entity_type, entity_id, template, recipient_hash, recipient_address,
    payload, request_id, idempotency_key
  ) values (
    'finance_' || p_template, p_entity_type, p_entity_id::text, 'finance_' || p_template, v_hash, lower(trim(p_recipient)),
    coalesce(p_payload, '{}'::jsonb), 'finance-' || p_entity_id::text, p_idempotency_key
  ) on conflict (idempotency_key) do nothing;
  return true;
end $$;

create or replace function public.fin_enqueue_notification_email()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_email text; v_path text; v_kind text; v_hash text;
begin
  if new.event_type not in ('mention','approval_requested','approval_approved','approval_rejected',
      'approval_changes_requested','proposal_received','proposal_revised','renewal_due') then return new; end if;
  if not exists (select 1 from public.fin_notification_preferences p where p.organization_id = new.organization_id
      and p.user_id = new.user_id and p.event_type = new.event_type and p.email) then return new; end if;
  if public.fin_setting('email_enabled', 'false') <> 'true' then return new; end if;
  select email into v_email from auth.users where id = new.user_id;
  if v_email is null then return new; end if;
  v_hash := encode(sha256(convert_to(lower(trim(v_email)), 'UTF8')), 'hex');
  if (select count(*) from public.transactional_email_outbox o where o.recipient_hash = v_hash
      and o.template = 'finance_notification' and o.created_at > now() - interval '1 hour') >= 20 then return new; end if;
  v_path := case new.object_type
    when 'rfq' then '/finance/rfq.html?id=' || new.object_id::text
    when 'contract' then '/finance/contracts.html#contract-' || new.object_id::text
    else '/finance/notifications.html' end;
  v_kind := case when new.event_type like 'approval_%' then 'approval' when new.event_type like 'proposal_%' then 'proposal' else new.event_type end;
  -- Inserção direta na outbox, sem depender da lista de modelos de
  -- fin_enqueue_email: reaplicar a migration do piloto não quebra este gatilho.
  insert into public.transactional_email_outbox (
    event_type, entity_type, entity_id, template, recipient_hash, recipient_address, payload, request_id, idempotency_key
  ) values (
    'finance_notification', new.object_type, new.object_id::text, 'finance_notification', v_hash, lower(trim(v_email)),
    jsonb_build_object('kind', v_kind, 'event', new.event_type, 'path', v_path), 'finance-notification-' || new.id::text,
    'notification:' || new.id::text
  ) on conflict (idempotency_key) do nothing;
  return new;
end $$;

create or replace function public.claim_transactional_email_batch_v2(
  p_worker_ref text,
  p_limit integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_items jsonb;
begin
  if coalesce(length(trim(p_worker_ref)), 0) < 8 then
    raise exception using message = 'Worker inválido.', errcode = '22023';
  end if;
  with candidates as (
    select id from public.transactional_email_outbox
    where (status in ('pending','retry') and next_attempt_at <= now())
       or (status = 'processing' and lease_expires_at <= now())
    order by created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  ), claimed as (
    update public.transactional_email_outbox o
    set status = 'processing', attempts = attempts + 1, claimed_at = now(),
        worker_ref = left(trim(p_worker_ref), 120), claim_token = gen_random_uuid(),
        lease_expires_at = now() + interval '10 minutes', updated_at = now(),
        last_error_code = null
    from candidates c where o.id = c.id returning o.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'eventType', event_type, 'entityType', entity_type,
    'entityId', entity_id, 'template', template,
    'recipientAddress', recipient_address, 'recipientRef', left(recipient_hash, 16),
    'payload', payload, 'attempts', attempts, 'maxAttempts', max_attempts,
    'requestId', request_id, 'idempotencyKey', idempotency_key,
    'workerRef', worker_ref, 'claimToken', claim_token
  ) order by created_at), '[]'::jsonb) into v_items from claimed;
  return v_items;
end;
$$;

create or replace function public.fin_request_policy_exception(
  p_request uuid, p_policy_version uuid, p_rule text, p_reason_code text, p_reason text, p_evidence jsonb default '[]'::jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_request public.fin_approval_requests%rowtype; v_id uuid; x jsonb;
begin
  select * into v_request from public.fin_approval_requests where id = p_request;
  if not found then raise exception 'approval not found'; end if;
  perform 1 from public.fin_rfqs where id = v_request.rfq_id for update;
  select * into v_request from public.fin_approval_requests where id = p_request for update;
  if not public.fin_has_role(v_request.organization_id, array['admin','finance_manager']) or not public.fin_rfq_visible(v_request.rfq_id) then raise exception 'forbidden'; end if;
  if v_request.status <> 'pending' or v_request.policy_snapshot is null then raise exception 'approval not pending'; end if;
  if not exists (select 1 from jsonb_array_elements(v_request.policy_snapshot->'matched') m
                  where m->>'policy_version_id' = p_policy_version::text and m->>'rule_id' = p_rule) then
    raise exception 'invalid policy exception';
  end if;
  if jsonb_typeof(coalesce(p_evidence, '[]'::jsonb)) <> 'array' then raise exception 'invalid policy exception'; end if;
  for x in select * from jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb)) loop
    if jsonb_typeof(x) <> 'object' or exists (select 1 from jsonb_object_keys(x) k where k not in ('label','document_id','reference'))
       or length(trim(coalesce(x->>'label',''))) not between 2 and 160
       or (x ? 'reference' and length(coalesce(x->>'reference','')) not between 3 and 300)
       or (x ? 'document_id' and not exists (select 1 from public.fin_documents d where d.id::text = x->>'document_id'
                                               and d.organization_id = v_request.organization_id and public.fin_can_read_document(d.id))) then
      raise exception 'invalid policy exception';
    end if;
  end loop;
  insert into public.fin_policy_exceptions(organization_id, request_id, policy_version_id, rule_id, requested_by, reason_code, reason, evidence)
    values (v_request.organization_id, p_request, p_policy_version, p_rule, auth.uid(), p_reason_code, trim(p_reason), coalesce(p_evidence, '[]'::jsonb))
    returning id into v_id;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (v_request.organization_id, 'rfq', v_request.rfq_id, 'policy_exception_requested', auth.uid(),
            jsonb_build_object('request_id', p_request, 'exception_id', v_id, 'rule_id', p_rule, 'reason_code', p_reason_code));
  return v_id;
exception
  when unique_violation then raise exception 'policy exception already open';
  when check_violation then raise exception 'invalid policy exception';
end $$;

drop function if exists public.fin_policy_evidence_document_allowed(uuid, text);
drop function if exists public.fin_email_limit(text, integer, integer, integer);
update public.fin_settings set value = 'financial-request-receipts-1', updated_at = now() where key = 'schema_version';
commit;
