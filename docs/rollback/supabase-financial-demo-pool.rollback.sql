-- Rollback técnico de DW-02: volta o gatilho de quota sem trava (DW-01) e
-- remove o lease do controlador. A quota volta a poder ser ultrapassada sob
-- concorrência: use só para desfazer um deploy, nunca como estado final.
begin;
drop function if exists public.fin_demo_pool_release(text);
drop function if exists public.fin_demo_pool_lease(text, integer);
drop table if exists public.fin_demo_pool_leases;
create or replace function public.fin_demo_quota_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare w public.fin_demo_workspaces%rowtype; v_used integer; v_limit integer;
begin
  if tg_table_name = 'fin_organizations' then
    select * into w from public.fin_demo_workspaces where status = 'claimed' and new.created_by = any(user_ids) limit 1;
    if w.id is null then return new; end if;
    select count(*) into v_used from public.fin_organizations o where o.created_by = any(w.user_ids);
    v_limit := 1 + coalesce(array_length(w.provider_organization_ids, 1), 0) + coalesce((w.quotas->>'organizations')::integer, 0);
  else
    -- Cada tabela lê só a própria coluna: NEW de fin_rfqs não tem buyer_organization_id.
    if tg_table_name = 'fin_rfq_invites' then
      select * into w from public.fin_demo_workspaces where status = 'claimed' and buyer_organization_id = new.buyer_organization_id limit 1;
    else
      select * into w from public.fin_demo_workspaces where status = 'claimed' and buyer_organization_id = new.organization_id limit 1;
    end if;
    if w.id is null then return new; end if;
    if tg_table_name = 'fin_rfqs' then
      select count(*) into v_used from public.fin_rfqs where organization_id = w.buyer_organization_id;
      v_limit := coalesce((w.quotas->>'rfqs')::integer, 0);
    elsif tg_table_name = 'fin_private_documents' then
      select count(*) into v_used from public.fin_private_documents where organization_id = w.buyer_organization_id;
      v_limit := coalesce((w.quotas->>'documents')::integer, 0);
    else
      select count(*) into v_used from public.fin_rfq_invites where buyer_organization_id = w.buyer_organization_id;
      v_limit := coalesce((w.quotas->>'invites')::integer, 0);
    end if;
  end if;
  if v_used >= v_limit then raise exception 'demo workspace quota exceeded'; end if;
  return new;
end $$;
revoke all on function public.fin_demo_quota_guard() from public, anon, authenticated;
update public.fin_settings set value='financial-demo-workspaces-1',updated_at=now() where key='schema_version';
commit;
