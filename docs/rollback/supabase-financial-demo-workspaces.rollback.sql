-- Rollback técnico de DW-01. Só remove a infraestrutura de workspaces quando
-- não há workspace registrado: com workspaces, apagar a tabela deixaria contas
-- e organizações sintéticas sem dono para a limpeza (use forward-fix ou limpe
-- os workspaces com scripts/demo/workspaces.mjs antes).
begin;
do $$ begin
  if to_regclass('public.fin_demo_workspaces') is not null and exists(select 1 from public.fin_demo_workspaces) then
    raise exception 'demo workspaces rollback requires no registered workspace';
  end if;
end $$;
drop trigger if exists fin_demo_quota_rfqs on public.fin_rfqs;
drop trigger if exists fin_demo_quota_documents on public.fin_private_documents;
drop trigger if exists fin_demo_quota_invites on public.fin_rfq_invites;
drop trigger if exists fin_demo_quota_organizations on public.fin_organizations;
drop function if exists public.fin_demo_quota_guard();
drop function if exists public.fin_demo_workspace_active(text);
drop function if exists public.fin_demo_workspace_resume(uuid, text, integer);
drop function if exists public.fin_demo_workspace_claim(text, integer, integer, integer);
drop function if exists public.fin_demo_require_environment();
drop table if exists public.fin_demo_workspaces;
update public.fin_settings set value='financial-opportunity-discriminator-1',updated_at=now() where key='schema_version';
commit;
