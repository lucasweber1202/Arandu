-- One server-side editor draft per buyer member and organization.
-- Optimistic revision prevents a stale tab from overwriting another tab.
create table if not exists public.fin_rfq_editor_drafts (
 organization_id uuid not null references public.fin_organizations(id),
 user_id uuid not null references auth.users(id),
 payload jsonb not null default '{}'::jsonb check(jsonb_typeof(payload)='object' and pg_column_size(payload)<=32768),
 revision integer not null default 0 check(revision>=0),
 updated_at timestamptz not null default now(),
 primary key(organization_id,user_id)
);
alter table public.fin_rfq_editor_drafts enable row level security;
alter table public.fin_rfq_editor_drafts force row level security;
revoke all on public.fin_rfq_editor_drafts from anon,authenticated;
grant select on public.fin_rfq_editor_drafts to authenticated;
drop policy if exists fin_rfq_editor_read on public.fin_rfq_editor_drafts;
create policy fin_rfq_editor_read on public.fin_rfq_editor_drafts for select to authenticated
 using(user_id=auth.uid() and public.fin_has_role(organization_id,array['admin','finance_manager']));

create or replace function public.fin_save_rfq_editor(p_org uuid,p_payload jsonb,p_expected integer)
returns table(revision integer,updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_row public.fin_rfq_editor_drafts%rowtype;
begin
 if not public.fin_has_role(p_org,array['admin','finance_manager']) then raise exception 'forbidden'; end if;
 if p_expected is null or p_expected<0 or jsonb_typeof(p_payload)<>'object' or pg_column_size(p_payload)>32768
  or (select count(*) from jsonb_object_keys(p_payload))>4
  or exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('product','title','response_deadline','demand'))
  or (p_payload ? 'demand' and jsonb_typeof(p_payload->'demand')<>'object')
 then raise exception 'invalid editor draft'; end if;
 insert into public.fin_rfq_editor_drafts(organization_id,user_id,payload,revision)
 values(p_org,auth.uid(),p_payload,1)
 on conflict(organization_id,user_id) do update
 set payload=excluded.payload,revision=public.fin_rfq_editor_drafts.revision+1,updated_at=now()
 where public.fin_rfq_editor_drafts.revision=p_expected
 returning * into v_row;
 if not found then raise exception 'rfq draft conflict'; end if;
 return query select v_row.revision,v_row.updated_at;
end $$;
create or replace function public.fin_clear_rfq_editor(p_org uuid,p_expected integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not public.fin_has_role(p_org,array['admin','finance_manager']) then raise exception 'forbidden'; end if;
 delete from public.fin_rfq_editor_drafts where organization_id=p_org and user_id=auth.uid() and revision=p_expected;
 if not found then raise exception 'rfq draft conflict'; end if;
end $$;
revoke all on function public.fin_save_rfq_editor(uuid,jsonb,integer),public.fin_clear_rfq_editor(uuid,integer) from public,anon;
grant execute on function public.fin_save_rfq_editor(uuid,jsonb,integer),public.fin_clear_rfq_editor(uuid,integer) to authenticated,service_role;
