-- Derived projection only: no duplicate records or owner inheritance.
begin;
create or replace view public.fin_provider_contract_tasks
with (security_invoker = true, security_barrier = true) as
select t.id, t.organization_id, c.provider_id, c.legal_entity_id,
       t.title, t.due_on, t.status, t.related_type, t.related_id,
       t.created_at, t.assignee_id
from public.fin_tasks t
join public.fin_contracts c on c.id=t.related_id and c.organization_id=t.organization_id
join public.fin_organizations o on o.id=t.organization_id and o.kind='BUYER'
where t.related_type='contract';
revoke all on public.fin_provider_contract_tasks from public, anon, authenticated, service_role;
grant select on public.fin_provider_contract_tasks to authenticated;
comment on view public.fin_provider_contract_tasks is 'Authorized projection; fin_tasks and fin_contracts remain systems of record.';
create index if not exists fin_contracts_provider_page_idx
  on public.fin_contracts(organization_id,provider_id,created_at desc,id desc);
create index if not exists fin_tasks_open_contract_page_idx
  on public.fin_tasks(organization_id,due_on asc nulls last,created_at,id)
  where related_type='contract' and status='open';
insert into public.fin_settings(key,value) values ('schema_version', 'financial-relationship-continuity-1')
on conflict(key) do update set value=excluded.value,updated_at=now();
notify pgrst, 'reload schema';
commit;
