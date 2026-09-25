-- Server-side provider drafts with optimistic concurrency and tenant isolation.
create table if not exists public.fin_proposal_drafts (
  proposal_id uuid primary key,
  provider_organization_id uuid not null,
  base_version integer not null check(base_version >= 0),
  revision integer not null default 1 check(revision > 0),
  terms jsonb not null check(jsonb_typeof(terms)='object'),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  foreign key(proposal_id,provider_organization_id) references public.fin_proposals(id,provider_organization_id)
);
alter table public.fin_proposal_drafts enable row level security;
alter table public.fin_proposal_drafts force row level security;
revoke all on public.fin_proposal_drafts from anon,authenticated;
grant select on public.fin_proposal_drafts to authenticated;
drop policy if exists fin_proposal_draft_read on public.fin_proposal_drafts;
create policy fin_proposal_draft_read on public.fin_proposal_drafts for select to authenticated
  using(public.fin_has_role(provider_organization_id,array['admin','provider_user']));

create or replace function public.fin_save_proposal_draft(
  p_proposal uuid,p_terms jsonb,p_expected_revision integer,p_base_version integer
) returns integer language plpgsql security definer set search_path = '' as $$
declare v_proposal public.fin_proposals%rowtype; v_revision integer; v_existing public.fin_proposal_drafts%rowtype; v_rfq_status text;
begin
 if jsonb_typeof(coalesce(p_terms,'null'::jsonb)) is distinct from 'object' or pg_column_size(p_terms)>32768 then raise exception 'invalid draft'; end if;
 if p_expected_revision is null or p_expected_revision<0 or p_base_version is null then raise exception 'invalid draft revision'; end if;
 select * into v_proposal from public.fin_proposals where id=p_proposal for update;
 if not found then raise exception 'proposal not found'; end if;
 if not public.fin_has_role(v_proposal.provider_organization_id,array['admin','provider_user']) then raise exception 'forbidden'; end if;
 select status into v_rfq_status from public.fin_rfqs where id=v_proposal.rfq_id;
 if v_proposal.status='withdrawn' or v_rfq_status not in ('open','collecting') then raise exception 'invalid state'; end if;
 if v_proposal.current_version<>p_base_version then raise exception 'draft conflict'; end if;
 select * into v_existing from public.fin_proposal_drafts where proposal_id=p_proposal for update;
 if found then
   if v_existing.revision<>p_expected_revision or v_existing.base_version<>p_base_version then raise exception 'draft conflict'; end if;
   v_revision:=v_existing.revision+1;
   update public.fin_proposal_drafts set terms=p_terms,revision=v_revision,updated_by=auth.uid(),updated_at=now() where proposal_id=p_proposal;
 else
   if p_expected_revision<>0 then raise exception 'draft conflict'; end if;
   v_revision:=1;
   insert into public.fin_proposal_drafts(proposal_id,provider_organization_id,base_version,revision,terms,updated_by)
     values(p_proposal,v_proposal.provider_organization_id,p_base_version,v_revision,p_terms,auth.uid());
 end if;
 return v_revision;
end $$;
revoke all on function public.fin_save_proposal_draft(uuid,jsonb,integer,integer) from public,anon;
grant execute on function public.fin_save_proposal_draft(uuid,jsonb,integer,integer) to authenticated,service_role;

-- A submitted version supersedes its draft. This runs in the same transaction.
create or replace function public.fin_clear_submitted_draft()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 delete from public.fin_proposal_drafts where proposal_id=new.proposal_id;
 return new;
end $$;
drop trigger if exists fin_clear_submitted_draft on public.fin_proposal_versions;
create trigger fin_clear_submitted_draft after insert on public.fin_proposal_versions
for each row execute function public.fin_clear_submitted_draft();
revoke all on function public.fin_clear_submitted_draft() from public,anon,authenticated;
