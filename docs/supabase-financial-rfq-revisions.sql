-- Published RFQ revisions and proposal-to-RFQ version lineage.
alter table public.fin_rfqs add column if not exists revision integer not null default 1;
create table if not exists public.fin_rfq_revisions (
 rfq_id uuid not null references public.fin_rfqs(id),
 revision integer not null check(revision>0),
 organization_id uuid not null references public.fin_organizations(id),
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
 changed_by uuid references auth.users(id),
 published_at timestamptz not null default now(),
 primary key(rfq_id,revision)
);
create index if not exists fin_rfq_revisions_org on public.fin_rfq_revisions(organization_id,rfq_id,revision desc);
alter table public.fin_rfq_revisions enable row level security;
alter table public.fin_rfq_revisions force row level security;
revoke all on public.fin_rfq_revisions from anon,authenticated;
grant select on public.fin_rfq_revisions to authenticated;
drop policy if exists fin_rfq_revision_read on public.fin_rfq_revisions;
create policy fin_rfq_revision_read on public.fin_rfq_revisions for select to authenticated
 using(public.fin_has_role(organization_id) or public.fin_provider_can_comment('rfq',rfq_id));
insert into public.fin_rfq_revisions(rfq_id,revision,organization_id,snapshot,changed_by,published_at)
select r.id,r.revision,r.organization_id,jsonb_build_object('title',r.title,'description',r.description,
 'demand',r.demand,'response_deadline',r.response_deadline),r.owner_id,r.updated_at
from public.fin_rfqs r on conflict(rfq_id,revision) do nothing;

create or replace function public.fin_seed_rfq_revision()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.fin_rfq_revisions(rfq_id,revision,organization_id,snapshot,changed_by)
 values(new.id,new.revision,new.organization_id,
  jsonb_build_object('title',new.title,'description',new.description,'demand',new.demand,
   'response_deadline',new.response_deadline),auth.uid())
 on conflict(rfq_id,revision) do nothing;
 return new;
end $$;
drop trigger if exists fin_seed_rfq_revision on public.fin_rfqs;
create trigger fin_seed_rfq_revision after insert on public.fin_rfqs
for each row execute function public.fin_seed_rfq_revision();
create or replace function public.fin_capture_rfq_revision()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if (new.title,new.description,new.demand,new.response_deadline) is distinct from
    (old.title,old.description,old.demand,old.response_deadline) then
  new.revision:=old.revision+1;
 end if;
 return new;
end $$;
create or replace function public.fin_log_rfq_revision()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if new.revision<>old.revision then
  insert into public.fin_rfq_revisions(rfq_id,revision,organization_id,snapshot,changed_by)
  values(new.id,new.revision,new.organization_id,
   jsonb_build_object('title',new.title,'description',new.description,'demand',new.demand,
    'response_deadline',new.response_deadline),auth.uid());
  insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,metadata)
  values(new.organization_id,'rfq',new.id,'rfq_revised',auth.uid(),
   jsonb_build_object('revision',new.revision,'previous_revision',old.revision));
 end if;
 return new;
end $$;
drop trigger if exists fin_capture_rfq_revision on public.fin_rfqs;
create trigger fin_capture_rfq_revision before update on public.fin_rfqs
for each row execute function public.fin_capture_rfq_revision();
drop trigger if exists fin_log_rfq_revision on public.fin_rfqs;
create trigger fin_log_rfq_revision after update on public.fin_rfqs
for each row execute function public.fin_log_rfq_revision();

-- The unguarded draft/open mutation is no longer callable by a browser token.
revoke execute on function public.fin_update_rfq_demand(uuid,text,text,jsonb,date) from authenticated;
create or replace function public.fin_revise_rfq(
 p_rfq uuid,p_expected integer,p_title text,p_description text,p_demand jsonb,p_deadline date
) returns integer language plpgsql security definer set search_path = '' as $$
declare v_rfq public.fin_rfqs%rowtype;v_revision integer;
begin
 select * into v_rfq from public.fin_rfqs where id=p_rfq for update;
 if not found then raise exception 'not found'; end if;
 if not public.fin_has_role(v_rfq.organization_id,array['admin','finance_manager']) then raise exception 'forbidden'; end if;
 if v_rfq.status not in ('draft','open','collecting') then raise exception 'invalid state'; end if;
 if p_expected is distinct from v_rfq.revision then raise exception 'rfq revision conflict'; end if;
 if length(trim(coalesce(p_title,''))) not between 3 and 200
 or jsonb_typeof(p_demand)<>'object' then raise exception 'invalid demand'; end if;
 update public.fin_rfqs set title=trim(p_title),description=p_description,demand=p_demand,
   response_deadline=p_deadline,updated_at=now() where id=p_rfq returning revision into v_revision;
 -- Mantém o rastro de auditoria da edição legada: mudança após abertura é nomeada.
 insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,metadata)
 values(v_rfq.organization_id,'rfq',p_rfq,
  case when v_rfq.status='draft' then 'rfq_demand_updated' else 'rfq_demand_updated_after_open' end,
  auth.uid(),jsonb_build_object('status',v_rfq.status,'revision',v_revision));
 return v_revision;
end $$;
revoke all on function public.fin_seed_rfq_revision(),public.fin_capture_rfq_revision(),public.fin_log_rfq_revision(),
 public.fin_revise_rfq(uuid,integer,text,text,jsonb,date) from public,anon;
grant execute on function public.fin_revise_rfq(uuid,integer,text,text,jsonb,date) to authenticated,service_role;

alter table public.fin_proposal_versions add column if not exists rfq_revision integer;
update public.fin_proposal_versions v set rfq_revision=r.revision from public.fin_proposals p
 join public.fin_rfqs r on r.id=p.rfq_id where v.proposal_id=p.id and v.rfq_revision is null;
alter table public.fin_proposal_versions alter column rfq_revision set not null;
create or replace function public.fin_stamp_proposal_rfq_revision()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 select r.revision into new.rfq_revision from public.fin_proposals p
 join public.fin_rfqs r on r.id=p.rfq_id where p.id=new.proposal_id for share of r;
 if new.rfq_revision is null then raise exception 'rfq not found'; end if;
 return new;
end $$;
drop trigger if exists fin_stamp_proposal_rfq_revision on public.fin_proposal_versions;
create trigger fin_stamp_proposal_rfq_revision before insert on public.fin_proposal_versions
for each row execute function public.fin_stamp_proposal_rfq_revision();
revoke all on function public.fin_stamp_proposal_rfq_revision() from public,anon,authenticated;
