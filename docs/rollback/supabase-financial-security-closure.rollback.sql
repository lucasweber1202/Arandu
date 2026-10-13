-- Rollback de docs/supabase-financial-security-closure.sql: restaura as
-- definições anteriores (reabre as lacunas documentadas na migration). Não
-- apaga dado; domínios SSO assumidos depois da migration ficam com a
-- organização que os assumiu.
begin;

drop policy if exists fin_document_read on public.fin_documents;
create policy fin_document_read on public.fin_documents for select to authenticated
  using (public.fin_has_role(organization_id));
drop policy if exists fin_document_write on public.fin_documents;
create policy fin_document_write on public.fin_documents for insert to authenticated
  with check (public.fin_has_role(organization_id, array['admin','finance_manager','analyst']) and created_by = auth.uid());

create or replace function public.fin_document_remove(p_document uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_doc public.fin_private_documents%rowtype;
begin
  select * into v_doc from public.fin_private_documents where id = p_document for update;
  if not found or v_doc.removed_at is not null then raise exception 'invalid document'; end if;
  if not (public.fin_has_role(v_doc.organization_id, case when v_doc.organization_id = v_doc.buyer_organization_id
            then array['admin','finance_manager'] else array['admin'] end)
          or (v_doc.created_by = auth.uid() and public.fin_has_role(v_doc.organization_id))) then
    raise exception 'forbidden';
  end if;
  update public.fin_private_documents set removed_at = now(), removed_by = auth.uid() where id = p_document;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
  values (v_doc.organization_id, v_doc.entity_type, v_doc.entity_id, 'document_removed', auth.uid(), jsonb_build_object('document_id', v_doc.id));
end $$;
revoke all on function public.fin_document_remove(uuid) from public, anon;
grant execute on function public.fin_document_remove(uuid) to authenticated;

revoke insert, update on public.fin_providers from authenticated;
grant insert, update on public.fin_providers to authenticated;

grant execute on function public.fin_qualification_readiness(uuid) to authenticated;

create or replace function public.fin_api_list_webhooks(p_key_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  v := public.fin_api_context(p_key_hash, 'webhooks:manage');
  return coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'url', e.url, 'description', e.description, 'events', e.events, 'entity_ids', e.entity_ids,
     'status', e.status, 'consecutive_failures', e.consecutive_failures, 'created_at', e.created_at, 'disabled_reason', e.disabled_reason) order by e.created_at, e.id)
     from public.fin_webhook_endpoints e where e.organization_id = (v->>'organization_id')::uuid), '[]'::jsonb);
end $$;
create or replace function public.fin_api_disable_webhook(p_key_hash text, p_endpoint uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v jsonb; e public.fin_webhook_endpoints%rowtype;
begin
  v := public.fin_api_context(p_key_hash, 'webhooks:manage');
  select * into e from public.fin_webhook_endpoints where id = p_endpoint and organization_id = (v->>'organization_id')::uuid for update;
  if not found then raise exception 'api not found'; end if;
  update public.fin_webhook_endpoints set status = 'disabled', disabled_at = coalesce(disabled_at, now()), disabled_reason = 'manual', updated_at = now() where id = p_endpoint;
  update public.fin_webhook_deliveries set status = 'cancelled', lease_token = null, lease_expires_at = null where endpoint_id = p_endpoint and status in ('pending','failed');
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (e.organization_id, 'webhook_endpoint', p_endpoint, 'webhook_endpoint_disabled', null, jsonb_build_object('service_account_id', v->>'service_account_id'));
end $$;
create or replace function public.fin_api_list_deliveries(p_key_hash text, p_endpoint uuid, p_limit integer default 25, p_after_created timestamptz default null, p_after_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb; v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
begin
  v := public.fin_api_context(p_key_hash, 'webhooks:manage');
  if not exists (select 1 from public.fin_webhook_endpoints e where e.id = p_endpoint and e.organization_id = (v->>'organization_id')::uuid) then raise exception 'api not found'; end if;
  if (p_after_created is null) <> (p_after_id is null) then raise exception 'invalid api query'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id desc) from (
    select d.id, d.event_id, w.event_type, d.status, d.attempts, d.next_attempt_at, d.last_attempt_at, d.last_status_code, d.last_error_code, d.delivered_at, d.replay_of, d.created_at
      from public.fin_webhook_deliveries d join public.fin_webhook_events w on w.id = d.event_id
     where d.endpoint_id = p_endpoint and (p_after_created is null or (d.created_at, d.id) < (p_after_created, p_after_id))
     order by d.created_at desc, d.id desc limit v_limit + 1) x), '[]'::jsonb);
end $$;
create or replace function public.fin_api_replay_delivery(p_key_hash text, p_delivery uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v jsonb; d public.fin_webhook_deliveries%rowtype; v_id uuid;
begin
  v := public.fin_api_context(p_key_hash, 'webhooks:manage');
  select * into d from public.fin_webhook_deliveries where id = p_delivery and organization_id = (v->>'organization_id')::uuid;
  if not found then raise exception 'api not found'; end if;
  if d.status not in ('succeeded','failed','dead','cancelled') then raise exception 'delivery not replayable'; end if;
  if not exists (select 1 from public.fin_webhook_endpoints e where e.id = d.endpoint_id and e.status = 'active') then raise exception 'webhook disabled'; end if;
  insert into public.fin_webhook_deliveries(organization_id, endpoint_id, event_id, replay_of, requested_by_service_account)
    values (d.organization_id, d.endpoint_id, d.event_id, d.id, (v->>'service_account_id')::uuid) returning id into v_id;
  return v_id;
end $$;
drop function if exists public.fin_api_endpoint_allowed(jsonb, uuid[]);

create or replace function public.fin_sso_claim_domain(p_org uuid, p_domain text, p_token_hash text)
returns void language plpgsql security definer set search_path = '' as $$
declare d public.fin_sso_domains%rowtype; v_domain text := lower(trim(coalesce(p_domain, '')));
begin
  if not public.fin_has_role(p_org, array['admin']) then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.fin_organizations o where o.id = p_org and o.kind = 'BUYER') then raise exception 'buyer organization required'; end if;
  -- Domínios de e-mail pessoal nunca viram SSO de empresa.
  if v_domain in ('gmail.com','googlemail.com','outlook.com','hotmail.com','live.com','yahoo.com','yahoo.com.br','icloud.com','me.com','proton.me','protonmail.com','uol.com.br','bol.com.br','terra.com.br') then
    raise exception 'invalid sso domain';
  end if;
  select * into d from public.fin_sso_domains where domain = v_domain for update;
  if found and d.organization_id <> p_org then raise exception 'sso domain unavailable'; end if;
  if found and d.status = 'verified' then raise exception 'sso domain already verified'; end if;
  insert into public.fin_sso_domains(domain, organization_id, verification_token_hash, created_by)
    values (v_domain, p_org, p_token_hash, auth.uid())
  on conflict (domain) do update set verification_token_hash = excluded.verification_token_hash, status = 'pending', verified_at = null, created_by = auth.uid(), created_at = now();
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (p_org, 'organization', p_org, 'sso_domain_claimed', auth.uid(), jsonb_build_object('domain', v_domain));
exception when check_violation then raise exception 'invalid sso domain';
end $$;

update public.fin_settings set value = 'financial-demo-pool-1', updated_at = now() where key = 'schema_version';
commit;
