-- Revert application first. Existing outbox payloads remain immutable.
begin;
do $$ begin
 if (select value from public.fin_settings where key='schema_version') is distinct from 'financial-contract-email-links-1' then raise exception 'contract email links rollback marker mismatch'; end if;
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
  if (select count(*) from public.transactional_email_outbox o where o.organization_id = new.organization_id
      and o.status in ('pending','retry','processing')) >= public.fin_email_limit('email_org_pending_limit', 200, 20, 2000) then return new; end if;
  v_path := case new.object_type
    when 'rfq' then '/finance/rfq.html?id=' || new.object_id::text
    when 'contract' then '/finance/contracts.html#contract-' || new.object_id::text
    else '/finance/notifications.html' end;
  v_kind := case when new.event_type like 'approval_%' then 'approval' when new.event_type like 'proposal_%' then 'proposal' else new.event_type end;
  insert into public.transactional_email_outbox (
    event_type, entity_type, entity_id, template, recipient_hash, recipient_address, payload, request_id, idempotency_key, organization_id
  ) values (
    'finance_notification', new.object_type, new.object_id::text, 'finance_notification', v_hash, lower(trim(v_email)),
    jsonb_build_object('kind', v_kind, 'event', new.event_type, 'path', v_path), 'finance-notification-' || new.id::text,
    'notification:' || new.id::text, new.organization_id
  ) on conflict (idempotency_key) do nothing;
  return new;
end $$;
revoke all on function public.fin_enqueue_notification_email() from public, anon, authenticated;
update public.fin_settings set value='financial-operating-context-1',updated_at=now() where key='schema_version';
notify pgrst,'reload schema';
commit;
