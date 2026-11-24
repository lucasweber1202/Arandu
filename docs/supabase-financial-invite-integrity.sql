-- Arandu 12: idempotent provider invites and a minimised invite preview.
--
-- Defect fixed: fin_rfq_invites has unique(rfq_id, provider_id), so a retry of
-- fin_invite_provider after an uncertain response (timeout, dropped
-- connection) failed with a raw unique violation (HTTP 500) instead of
-- returning the invite that already existed. Re-inviting after registering a
-- contact e-mail failed the same way.
--
-- fin_send_provider_invite is the canonical command:
--   * open invite, same recipient   -> replay: same token, no new e-mail/event;
--   * open invite, contact changed  -> retarget in place (narrowing to the new
--                                      e-mail), one e-mail to the new contact;
--   * accepted/declined/expired/revoked -> explicit error, nothing changes.
-- The token is derived from the invite id and the server secret, so a replay
-- returns exactly the link already issued; a rotated secret is reported, not
-- silently replaced.
--
-- fin_invite_preview lets a provider member see, before accepting or
-- declining, only what the invite e-mail already reveals.
begin;

create or replace function public.fin_send_provider_invite(p_rfq uuid, p_provider uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_status text; v_deadline date; v_product text; v_contact text; v_buyer text;
        v_recipient text; v_mode text; i public.fin_rfq_invites%rowtype; v_token text;
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  -- Serialise concurrent sends for the same RFQ (double click, two tabs, retry).
  select organization_id, status, response_deadline, product into v_org, v_status, v_deadline, v_product
    from public.fin_rfqs where id = p_rfq for update;
  if v_org is null then raise exception 'rfq not found'; end if;
  if not public.fin_has_role(v_org, array['admin','finance_manager'])
     or public.fin_governance_org_locked(v_org) then raise exception 'forbidden'; end if;
  if v_status not in ('draft','open','collecting') then raise exception 'invalid state'; end if;
  select contact_email into v_contact from public.fin_providers p
    where p.id = p_provider and p.organization_id = v_org and p.status = 'active';
  if not found then raise exception 'provider not found'; end if;
  select legal_name into v_buyer from public.fin_organizations where id = v_org;
  v_recipient := nullif(lower(trim(coalesce(v_contact, ''))), '');
  v_mode := case when v_recipient is null then 'organization_open' else 'exact_email' end;

  select * into i from public.fin_rfq_invites where rfq_id = p_rfq and provider_id = p_provider for update;
  if i.id is null then
    i.id := gen_random_uuid();
    v_token := encode(sha256(convert_to(public.fin_setting('invite_secret') || ':' || i.id::text, 'UTF8')), 'hex');
    insert into public.fin_rfq_invites (id, buyer_organization_id, rfq_id, provider_id, token_hash, created_by, recipient_mode, recipient_email)
      values (i.id, v_org, p_rfq, p_provider, encode(sha256(convert_to(v_token,'UTF8')),'hex'), auth.uid(), v_mode, v_recipient);
    insert into public.fin_events (organization_id, entity_type, entity_id, event_type, actor_id, metadata)
      values (v_org, 'rfq', p_rfq, 'provider_invited', auth.uid(), jsonb_build_object('invite_id', i.id, 'provider_id', p_provider));
    if v_recipient is not null then
      perform public.fin_enqueue_email('provider_invite', v_contact, 'rfq', p_rfq,
        jsonb_build_object('buyer', v_buyer, 'product', v_product, 'deadline', v_deadline, 'invite_ref', i.id),
        'provider_invite:' || i.id::text);
    end if;
    return jsonb_build_object('invite_id', i.id, 'token', v_token, 'recipient_mode', v_mode, 'outcome', 'created');
  end if;

  if i.status = 'accepted' or i.accepted_at is not null then raise exception 'invite already accepted'; end if;
  if i.status = 'declined' then raise exception 'invite already declined'; end if;
  if i.status <> 'invited' or i.expires_at <= clock_timestamp() then raise exception 'invite closed'; end if;
  v_token := encode(sha256(convert_to(public.fin_setting('invite_secret') || ':' || i.id::text, 'UTF8')), 'hex');
  if encode(sha256(convert_to(v_token,'UTF8')),'hex') is distinct from i.token_hash then raise exception 'invite secret unavailable'; end if;

  if i.recipient_mode is not distinct from v_mode and i.recipient_email is not distinct from v_recipient then
    return jsonb_build_object('invite_id', i.id, 'token', v_token, 'recipient_mode', v_mode, 'outcome', 'replayed');
  end if;
  -- Contact changed while the invite is still open: the link now belongs to
  -- the current contact only. Never widens an exact invite to an open one.
  if v_recipient is null then raise exception 'invite recipient required'; end if;
  update public.fin_rfq_invites set recipient_mode = v_mode, recipient_email = v_recipient where id = i.id;
  insert into public.fin_events (organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (v_org, 'rfq', p_rfq, 'provider_invite_retargeted', auth.uid(), jsonb_build_object('invite_id', i.id, 'provider_id', p_provider));
  perform public.fin_enqueue_email('provider_invite', v_contact, 'rfq', p_rfq,
    jsonb_build_object('buyer', v_buyer, 'product', v_product, 'deadline', v_deadline, 'invite_ref', i.id),
    'provider_invite:' || i.id::text || ':' || encode(sha256(convert_to(v_recipient,'UTF8')),'hex'));
  return jsonb_build_object('invite_id', i.id, 'token', v_token, 'recipient_mode', v_mode, 'outcome', 'retargeted');
end $$;
revoke all on function public.fin_send_provider_invite(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.fin_send_provider_invite(uuid, uuid) to authenticated;

-- Legacy entry point keeps its signature and now shares the idempotent path.
create or replace function public.fin_invite_provider(p_rfq uuid, p_provider uuid)
returns text language sql security definer set search_path = '' as $$
  select public.fin_send_provider_invite(p_rfq, p_provider)->>'token'
$$;
revoke all on function public.fin_invite_provider(uuid, uuid) from public, anon, service_role;
grant execute on function public.fin_invite_provider(uuid, uuid) to authenticated;

-- Read-only preview: same gate as fin_decline_provider_invite (provider
-- member, confirmed recipient e-mail, canonical binding). Returns only what
-- the invite e-mail already disclosed; every refusal is the same error.
create or replace function public.fin_invite_preview(p_token text, p_provider_org uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare i public.fin_rfq_invites%rowtype; v_email text; v_confirmed timestamptz; v_buyer text; v_product text; v_deadline date; v_rfq_status text;
begin
  if auth.uid() is null or coalesce(p_token,'') !~ '^[0-9a-f]{64}$' then raise exception 'invalid invitation'; end if;
  if not public.fin_has_role(p_provider_org, array['admin','provider_user'])
     or not exists (select 1 from public.fin_organizations where id = p_provider_org and kind = 'PROVIDER')
     or public.fin_governance_org_locked(p_provider_org) then raise exception 'invalid invitation'; end if;
  select * into i from public.fin_rfq_invites where token_hash = encode(sha256(convert_to(p_token,'UTF8')),'hex');
  if i.id is null or i.buyer_organization_id = p_provider_org or public.fin_governance_org_locked(i.buyer_organization_id) then raise exception 'invalid invitation'; end if;
  if i.recipient_mode = 'exact_email' then
    select lower(trim(u.email)), u.email_confirmed_at into v_email, v_confirmed from auth.users u where u.id = auth.uid();
    if v_confirmed is null or v_email is distinct from i.recipient_email then raise exception 'invalid invitation'; end if;
  end if;
  if exists (select 1 from public.fin_providers where id = i.provider_id and organization_id = i.buyer_organization_id
             and provider_organization_id is not null and provider_organization_id <> p_provider_org) then raise exception 'invalid invitation'; end if;
  -- Closed invites answered by another organisation are indistinguishable from unknown tokens.
  if i.provider_organization_id is not null and i.provider_organization_id <> p_provider_org then raise exception 'invalid invitation'; end if;
  select o.legal_name into v_buyer from public.fin_organizations o where o.id = i.buyer_organization_id;
  select r.product, r.response_deadline, r.status into v_product, v_deadline, v_rfq_status from public.fin_rfqs r where r.id = i.rfq_id;
  return jsonb_build_object(
    'buyer', v_buyer, 'product', v_product, 'response_deadline', v_deadline, 'expires_at', i.expires_at,
    'state', case when i.status = 'accepted' then 'accepted'
                  when i.status = 'declined' then 'declined'
                  when i.status <> 'invited' or i.expires_at <= clock_timestamp() then 'expired'
                  when v_rfq_status not in ('draft','open','collecting') then 'closed'
                  else 'open' end);
end $$;
revoke all on function public.fin_invite_preview(text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.fin_invite_preview(text, uuid) to authenticated;

insert into public.fin_settings(key,value) values ('schema_version', 'financial-invite-integrity-1')
  on conflict(key) do update set value = excluded.value, updated_at = now();
notify pgrst, 'reload schema';
commit;
