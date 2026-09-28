-- Reverte docs/supabase-financial-pilot-surface-hardening.sql, devolvendo a
-- superfície ao estado de docs/supabase-financial-final-hardening.sql no
-- Supabase (default privileges concedendo a anon/authenticated). Reabre as
-- exposições que o hardening fechou: use só para destravar uma regressão e
-- reaplique o hardening em seguida.
update public.fin_settings set value = 'financial-final-hardening-1', updated_at = now() where key = 'schema_version';

create or replace function public.fin_accept_member_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_inv public.fin_member_invitations%rowtype; v_email text;
begin
  if auth.uid() is null or coalesce(p_token,'') !~ '^[0-9a-f]{64}$' then raise exception 'invalid invitation'; end if;
  select lower(email) into v_email from auth.users where id = auth.uid();
  select * into v_inv from public.fin_member_invitations
    where token_hash = encode(sha256(convert_to(p_token,'UTF8')),'hex')
      and accepted_at is null and expires_at > now()
    for update;
  if not found or v_inv.email is distinct from v_email then raise exception 'invalid invitation'; end if;
  insert into public.fin_members (organization_id, user_id, role)
    values (v_inv.organization_id, auth.uid(), v_inv.role)
    on conflict (organization_id, user_id) do nothing;
  update public.fin_member_invitations set accepted_at = now() where id = v_inv.id;
  return v_inv.organization_id;
end $$;
revoke all on function public.fin_accept_member_invitation(text) from public, anon;
grant execute on function public.fin_accept_member_invitation(text) to authenticated;

do $$
declare f text;
begin
  if to_regprocedure('public.enqueue_transactional_email_for_user(uuid,text,text,text,text,jsonb,text,text)') is not null then
    alter function public.enqueue_transactional_email_for_user(uuid, text, text, text, text, jsonb, text, text) set search_path = public;
  end if;
  foreach f in array array['public.set_updated_at()','public.operational_transition_allowed(text,text,text)','public.arandu_safe_audit_state(jsonb)'] loop
    if to_regprocedure(f) is not null then execute format('alter function %s reset search_path', f); end if;
  end loop;
  foreach f in array array[
    'public.operational_transition_allowed(text,text,text)','public.arandu_safe_audit_state(jsonb)',
    'public.audit_privileged_mutation()','public.enqueue_order_email_events()','public.handle_new_user_profile()',
    'public.log_operational_status_change()','public.protect_order_history_append_only()',
    'public.protect_order_immutable_fields()','public.set_updated_at()'
  ] loop
    if to_regprocedure(f) is not null then execute format('grant execute on function %s to public, anon, authenticated', f); end if;
  end loop;
end $$;
grant execute on function public.fin_pilot_access_allowed(text), public.fin_comment_object_org(text, uuid),
  public.fin_capture_rfq_revision(), public.fin_log_rfq_revision(), public.fin_seed_rfq_revision(), public.fin_notify_event()
  to authenticated;

do $$
declare v text;
begin
  foreach v in array array[
    'v_artworks_full','v_available_artworks','v_catalog_readiness',
    'v_commercial_pipeline','v_mvp_artist_pipeline','v_mvp_artwork_price_bands',
    'v_mvp_certificate_readiness','v_mvp_commercial_pipeline','v_mvp_operational_dashboard',
    'v_mvp_submission_pipeline','v_mvp_validation_scorecard','v_public_artists','v_public_catalog',
    'v_public_collection_items','v_public_collections','v_quality_issues','v_sales_pipeline'
  ] loop
    if to_regclass('public.' || v) is not null then
      execute format('alter view public.%I reset (security_invoker)', v);
      execute format('grant select on public.%I to anon, authenticated', v);
    end if;
  end loop;
  if to_regclass('public.v_catalog_editorial_readiness') is not null then
    alter view public.v_catalog_editorial_readiness reset (security_invoker);
  end if;
end $$;

do $$
declare t text;
begin
  foreach t in array array['api_rate_limits','crm_notes','media_assets','tasks','artwork_events'] loop
    if to_regclass('public.' || t) is not null then execute format('alter table public.%I disable row level security', t); end if;
  end loop;
  if to_regclass('public.artwork_events') is not null then
    grant select, insert, update, delete on table public.artwork_events to anon, authenticated;
  end if;
end $$;
