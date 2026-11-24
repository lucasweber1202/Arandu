-- Rollback of docs/supabase-financial-invite-integrity.sql.
-- Restores the previous fin_invite_provider body and withdraws the new entry
-- points. No invite, event or e-mail row is deleted; reapply the forward
-- migration to restore idempotent sends and the preview.
begin;
revoke all on function public.fin_send_provider_invite(uuid, uuid) from authenticated;
revoke all on function public.fin_invite_preview(text, uuid) from authenticated;
create or replace function public.fin_invite_provider(p_rfq uuid, p_provider uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_status text; v_token text; v_invite uuid; v_contact text; v_buyer text; v_deadline date; v_product text; v_recipient text;
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
  -- Com contato cadastrado, o convite é daquele e-mail (exact_email); sem
  -- contato, é explicitamente aberto à organização que receber o link.
  v_recipient := nullif(lower(trim(coalesce(v_contact, ''))), '');
  insert into public.fin_rfq_invites (id, buyer_organization_id, rfq_id, provider_id, token_hash, created_by, recipient_mode, recipient_email)
    values (v_invite, v_org, p_rfq, p_provider, encode(sha256(convert_to(v_token,'UTF8')),'hex'), auth.uid(),
            case when v_recipient is null then 'organization_open' else 'exact_email' end, v_recipient);
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
notify pgrst, 'reload schema';
commit;
