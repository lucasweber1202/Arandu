-- Financial CRM 1.0. Generated via CLI 2.122.0, named per repository manifest.
-- Additive; rollback withdraws commands, never deletes business history.
begin;
insert into public.fin_settings(key,value) select 'crm_previous_marker',value from public.fin_settings where key='schema_version' on conflict(key) do nothing;

alter table public.fin_provider_contacts alter column provider_id drop not null;
alter table public.fin_provider_contacts add column if not exists counterparty_organization_id uuid references public.fin_organizations(id);
alter table public.fin_provider_contacts add column if not exists owner_id uuid references auth.users(id);
alter table public.fin_provider_contacts add column if not exists source_reference text check(source_reference is null or (length(trim(source_reference)) between 2 and 500 and source_reference !~ '[<>]'));
alter table public.fin_provider_contacts add column if not exists version integer not null default 1 check(version>0);
alter table public.fin_provider_contacts add column if not exists updated_at timestamptz not null default now();

create table if not exists public.fin_crm_processes (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.fin_organizations(id), legal_entity_id uuid,
 title text not null check(length(trim(title)) between 2 and 200 and title !~ '[<>]'),
 stage text not null check(stage in ('prospect','qualification','engagement','negotiation','won','lost')),
 status text not null default 'active' check(status in ('active','archived')),
 owner_id uuid not null references auth.users(id), due_on date,
 next_action text not null check(length(trim(next_action)) between 2 and 200 and next_action !~ '[<>]'),
 outcome text check(outcome is null or (length(trim(outcome)) between 3 and 4000 and outcome !~ '[<>]')),
 source_reference text not null check(length(trim(source_reference)) between 2 and 500 and source_reference !~ '[<>]'),
 contact_id uuid, related_type text, related_id uuid, version integer not null default 1 check(version>0),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,id), foreign key(organization_id,legal_entity_id) references public.fin_legal_entities(organization_id,id),
 foreign key(organization_id,contact_id) references public.fin_provider_contacts(organization_id,id),
 check((related_type is null)=(related_id is null)), check(related_type is null or related_type in ('provider','rfq','contract','opportunity','proposal','task')),
 check(stage not in ('won','lost') or outcome is not null)
);
create table if not exists public.fin_crm_activities (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.fin_organizations(id), legal_entity_id uuid,
 kind text not null check(kind in ('meeting','call','email_record','note','follow_up','commitment','commercial_interaction')),
 subject text not null check(length(trim(subject)) between 2 and 200 and subject !~ '[<>]'),
 notes text check(notes is null or (length(notes)<=4000 and notes !~ '[<>]')),
 status text not null default 'recorded' check(status in ('planned','recorded','cancelled','archived')),
 occurred_at timestamptz, due_on date, owner_id uuid not null references auth.users(id),
 source_reference text not null check(length(trim(source_reference)) between 2 and 500 and source_reference !~ '[<>]'),
 contact_id uuid, process_id uuid, related_type text, related_id uuid,
 version integer not null default 1 check(version>0), created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,id), foreign key(organization_id,legal_entity_id) references public.fin_legal_entities(organization_id,id),
 foreign key(organization_id,contact_id) references public.fin_provider_contacts(organization_id,id),
 foreign key(organization_id,process_id) references public.fin_crm_processes(organization_id,id),
 check((related_type is null)=(related_id is null)), check(related_type is null or related_type in ('provider','rfq','contract','opportunity','proposal','task')),
 check(status<>'planned' or due_on is not null), check(status<>'recorded' or occurred_at is not null)
);
alter table public.fin_provider_contacts add column if not exists visibility text not null default 'organization_private' check(visibility='organization_private');
alter table public.fin_crm_processes add column if not exists visibility text not null default 'organization_private' check(visibility='organization_private');
alter table public.fin_crm_activities add column if not exists visibility text not null default 'organization_private' check(visibility='organization_private');
create index if not exists fin_crm_contacts_page on public.fin_provider_contacts(organization_id,id);
create index if not exists fin_crm_processes_page on public.fin_crm_processes(organization_id,id);
create index if not exists fin_crm_activities_page on public.fin_crm_activities(organization_id,id);
create index if not exists fin_crm_processes_reference on public.fin_crm_processes(organization_id,related_type,related_id);
create index if not exists fin_crm_activities_reference on public.fin_crm_activities(organization_id,related_type,related_id);
create index if not exists fin_crm_activities_process on public.fin_crm_activities(process_id);
create unique index if not exists fin_crm_command_receipt on public.fin_events(organization_id,actor_id,(metadata->>'request_key')) where event_type='crm_command_recorded';

create or replace function public.fin_crm_scope_visible(p_org uuid,p_entity uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and public.fin_has_role(p_org) and public.fin_entity_visible(p_org,p_entity)
 and exists(select 1 from public.fin_organizations where id=p_org and kind in ('BUYER','PROVIDER'));
$$;
create or replace function public.fin_crm_reference_visible(p_org uuid,p_entity uuid,p_type text,p_id uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare k text;
begin
 if p_type is null and p_id is null then return true; end if;
 if p_type is null or p_id is null or not public.fin_crm_scope_visible(p_org,p_entity) then return false; end if;
 select kind into k from public.fin_organizations where id=p_org;
 if k='PROVIDER' then
   -- A provider's CRM points only to its accepted demand or its own proposal.
   -- It never receives a buyer contract, competing proposal or private Radar.
   if p_entity is not null then return false; end if;
   if p_type='rfq' then return exists(select 1 from public.fin_rfq_invites where rfq_id=p_id and provider_organization_id=p_org and status='accepted'); end if;
   if p_type='proposal' then return exists(select 1 from public.fin_proposals p where p.id=p_id and p.provider_organization_id=p_org and exists(select 1 from public.fin_rfq_invites i where i.id=p.invite_id and i.status='accepted' and i.provider_organization_id=p_org)); end if;
   return false;
 end if;
 case p_type
 when 'provider' then return exists(select 1 from public.fin_providers where organization_id=p_org and id=p_id);
 when 'rfq' then return exists(select 1 from public.fin_rfqs where organization_id=p_org and id=p_id and legal_entity_id is not distinct from p_entity) and public.fin_rfq_visible(p_id);
 when 'contract' then return exists(select 1 from public.fin_contracts where organization_id=p_org and id=p_id and legal_entity_id is not distinct from p_entity) and public.fin_contract_visible(p_id);
 when 'proposal' then return exists(select 1 from public.fin_proposals p join public.fin_rfqs r on r.id=p.rfq_id where p.id=p_id and p.buyer_organization_id=p_org and r.legal_entity_id is not distinct from p_entity) and public.fin_object_visible(p_org,'proposal',p_id);
 when 'opportunity' then return exists(select 1 from public.fin_opportunities where organization_id=p_org and id=p_id and legal_entity_id is not distinct from p_entity);
 when 'task' then return exists(select 1 from public.fin_tasks where organization_id=p_org and id=p_id and legal_entity_id is not distinct from p_entity);
 else return false;
 end case;
end $$;

create or replace function public.fin_crm_actor(p_org uuid,p_entity uuid,p_owner uuid)
returns void language plpgsql security definer set search_path='' as $$
declare k text; roles text[];
begin
 if auth.uid() is null then raise exception 'forbidden'; end if;
 -- Serialize membership/grant revocation with the entire command.
 perform 1 from public.fin_members where organization_id=p_org and user_id in(auth.uid(),p_owner) order by user_id for share;
 perform 1 from public.fin_member_entity_grants where organization_id=p_org and user_id in(auth.uid(),p_owner) order by user_id,entity_id for share;
 perform 1 from auth.users where id in(auth.uid(),p_owner) order by id for share;
 if not exists(select 1 from auth.users where id=auth.uid() and (banned_until is null or banned_until<=now())) then raise exception 'forbidden'; end if;
 select kind into k from public.fin_organizations where id=p_org;
 roles:=case when k='PROVIDER' then array['admin','provider_user'] else array['admin','finance_manager','analyst'] end;
 if not public.fin_entity_allows(p_org,p_entity,roles) or public.fin_governance_org_locked(p_org)
 or k not in ('BUYER','PROVIDER') or k='PROVIDER' and p_entity is not null then raise exception 'forbidden'; end if;
 if p_owner is null or not exists(select 1 from public.fin_members m where m.organization_id=p_org and m.user_id=p_owner and m.role=any(roles)
   and (m.entity_scope='group' or p_entity is not null and exists(select 1 from public.fin_member_entity_grants g join public.fin_legal_entities e on e.organization_id=g.organization_id and (e.id=g.entity_id or e.parent_id=g.entity_id) where g.organization_id=p_org and g.user_id=p_owner and e.id=p_entity)))
 or not exists(select 1 from auth.users where id=p_owner and (banned_until is null or banned_until<=now())) then raise exception 'invalid crm owner'; end if;
end $$;

-- Keep old clients' writes visible to optimistic concurrency in the new API.
create or replace function public.fin_crm_contact_version_guard()
returns trigger language plpgsql set search_path='' as $$
begin
 if (new.id,new.organization_id,new.provider_id,new.counterparty_organization_id,new.legal_entity_id,new.created_by,new.created_at)
 is distinct from (old.id,old.organization_id,old.provider_id,old.counterparty_organization_id,old.legal_entity_id,old.created_by,old.created_at) then raise exception 'immutable crm scope'; end if;
 new.version:=old.version+1; new.updated_at:=clock_timestamp(); return new;
end $$;
drop trigger if exists fin_crm_contact_version on public.fin_provider_contacts;
create trigger fin_crm_contact_version before update on public.fin_provider_contacts for each row execute function public.fin_crm_contact_version_guard();

do $$ declare t text; begin
 foreach t in array array['fin_crm_processes','fin_crm_activities'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('alter table public.%I force row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  execute format('grant select on public.%I to authenticated',t);
  -- Existing guarded Demo reset and operational export inventory use the
  -- server role. User-facing CRM reads/writes never use this privilege.
  execute format('grant select,delete on public.%I to service_role',t);
  execute format('drop policy if exists crm_read on public.%I',t);
  execute format('create policy crm_read on public.%I for select to authenticated using(public.fin_crm_scope_visible(organization_id,legal_entity_id))',t);
 end loop;
end $$;
drop policy if exists fin_provider_contact_read on public.fin_provider_contacts;
create policy fin_provider_contact_read on public.fin_provider_contacts for select to authenticated using(
 public.fin_group_or_entity_visible(organization_id,legal_entity_id) or public.fin_crm_scope_visible(organization_id,legal_entity_id));

create or replace function public.fin_crm_command(p_org uuid,p_kind text,p_id uuid,p_expected integer,p_request uuid,p_scope jsonb,p_values jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t text; b jsonb; v jsonb; scope jsonb; entity uuid; v_owner uuid; contact public.fin_provider_contacts%rowtype;
 process public.fin_crm_processes%rowtype; org_kind text; cmd_hash text; receipt public.fin_events%rowtype; result jsonb; record_id uuid; next_version integer; allowed text[];
begin
 if p_request is null or coalesce(p_kind,'') not in ('contact','activity','process') or jsonb_typeof(p_values) is distinct from 'object' or p_values='{}'::jsonb or jsonb_typeof(p_scope) is distinct from 'object' then raise exception 'invalid crm'; end if;
 t:=case p_kind when 'contact' then 'fin_provider_contacts' when 'activity' then 'fin_crm_activities' else 'fin_crm_processes' end;
 if p_id is not null then
  execute format('select to_jsonb(r) from public.%I r where r.id=$1 and r.organization_id=$2 for update',t) into b using p_id,p_org;
  if b is null then raise exception 'crm not found'; end if;
  entity:=(b->>'legal_entity_id')::uuid;
 else
  if p_expected is not null or p_scope-array['legal_entity_id','provider_id','counterparty_organization_id']<>'{}'::jsonb then raise exception 'invalid crm'; end if;
  entity:=(p_scope->>'legal_entity_id')::uuid;
 end if;
 v_owner:=coalesce((p_values->>'owner_id')::uuid,(b->>'owner_id')::uuid,auth.uid());
 perform public.fin_crm_actor(p_org,entity,v_owner);
 cmd_hash:=encode(sha256(convert_to(jsonb_build_object('kind',p_kind,'id',p_id,'expected',p_expected,'scope',p_scope,'values',p_values)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||auth.uid()::text||p_request::text,0));
 select * into receipt from public.fin_events where organization_id=p_org and actor_id=auth.uid() and event_type='crm_command_recorded' and metadata->>'request_key'=p_request::text;
 if receipt.id is not null then
  if receipt.metadata->>'request_hash' is distinct from cmd_hash then raise exception 'crm request conflict'; end if;
  return (receipt.metadata->'result')||jsonb_build_object('replayed',true);
 end if;
 if p_id is not null and (p_expected is null or p_expected<>(b->>'version')::integer or p_scope<>'{}'::jsonb) then raise exception 'crm version conflict'; end if;
 allowed:=case p_kind
 when 'contact' then array['name','title','email','phone','owner_id','source_reference','status']
 when 'activity' then array['kind','subject','notes','occurred_at','due_on','owner_id','source_reference','status','contact_id','process_id','related_type','related_id']
 else array['title','stage','owner_id','due_on','next_action','outcome','source_reference','status','contact_id','related_type','related_id'] end;
 if exists(select 1 from jsonb_each(p_values) where jsonb_typeof(value) not in ('string','null')) then raise exception 'invalid crm'; end if;
 if p_kind<>'contact' and (p_scope->>'provider_id' is not null or p_scope->>'counterparty_organization_id' is not null) then raise exception 'invalid crm scope'; end if;
 if (p_values?'status' and p_values->>'status' is null) or (p_values?'owner_id' and p_values->>'owner_id' is null) then raise exception 'invalid crm'; end if;
 if p_values-allowed<>'{}'::jsonb then raise exception 'invalid crm'; end if;
 record_id:=coalesce(p_id,gen_random_uuid()); next_version:=coalesce((b->>'version')::integer,0)+1;
 v:=coalesce(b,'{}'::jsonb)||p_values||jsonb_build_object('id',record_id,'organization_id',p_org,'legal_entity_id',entity,'owner_id',v_owner,'version',next_version,'visibility','organization_private','updated_at',clock_timestamp());
 if p_id is null then v:=v||jsonb_build_object('created_by',auth.uid(),'created_at',clock_timestamp()); end if;
 if p_id is null and p_kind<>'contact' and not p_values?'status' then v:=v||jsonb_build_object('status',case p_kind when 'activity' then 'recorded' else 'active' end); end if;
 if coalesce(length(trim(v->>'source_reference')),0) not between 2 and 500 or (v->>'source_reference')~'[<>]' then raise exception 'invalid crm source'; end if;
 select kind into org_kind from public.fin_organizations where id=p_org;
 if p_kind='contact' then
  if p_id is null then
   if org_kind='BUYER' and not exists(select 1 from public.fin_providers where organization_id=p_org and id=(p_scope->>'provider_id')::uuid) then raise exception 'invalid crm provider'; end if;
   if org_kind='PROVIDER' and p_scope->>'provider_id' is not null then raise exception 'invalid crm provider'; end if;
   if p_scope->>'counterparty_organization_id' is not null and (org_kind<>'PROVIDER' or not exists(select 1 from public.fin_rfq_invites where provider_organization_id=p_org and buyer_organization_id=(p_scope->>'counterparty_organization_id')::uuid and status='accepted')) then raise exception 'invalid crm counterparty'; end if;
   v:=v||jsonb_build_object('provider_id',(p_scope->>'provider_id')::uuid,'counterparty_organization_id',(p_scope->>'counterparty_organization_id')::uuid,'is_primary',false);
  end if;
  if coalesce(v->>'status','active') not in ('active','archived') then raise exception 'invalid crm status'; end if;
  if p_values?'status' or p_id is null then v:=v||jsonb_build_object('archived_at',case when v->>'status'='archived' then to_jsonb(clock_timestamp()) else 'null'::jsonb end); end if;
  if v->>'archived_at' is not null then v:=v||jsonb_build_object('is_primary',false); end if;
  v:=v-'status';
 else
  if not public.fin_crm_reference_visible(p_org,entity,v->>'related_type',(v->>'related_id')::uuid) then raise exception 'invalid crm reference'; end if;
  if v->>'contact_id' is not null then
   select * into contact from public.fin_provider_contacts where id=(v->>'contact_id')::uuid and organization_id=p_org for share;
   if contact.id is null or contact.archived_at is not null or (contact.legal_entity_id is not null and contact.legal_entity_id is distinct from entity) then raise exception 'invalid crm contact'; end if;
  end if;
  if p_kind='activity' and v->>'process_id' is not null then
   select * into process from public.fin_crm_processes where id=(v->>'process_id')::uuid and organization_id=p_org for share;
   if process.id is null or process.status='archived' or process.legal_entity_id is distinct from entity then raise exception 'invalid crm process'; end if;
  end if;
 end if;
 -- Populate only a compile-time selected table; scope and audit fields were
 -- replaced above and cannot be supplied by the caller.
 if p_id is null then
  execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',t,t) using v;
 elsif p_kind='contact' then
  update public.fin_provider_contacts set name=v->>'name',title=v->>'title',email=v->>'email',phone=v->>'phone',owner_id=v_owner,source_reference=v->>'source_reference',archived_at=(v->>'archived_at')::timestamptz,is_primary=(v->>'is_primary')::boolean where id=p_id;
 elsif p_kind='process' then
  update public.fin_crm_processes set title=v->>'title',stage=v->>'stage',status=v->>'status',owner_id=(v->>'owner_id')::uuid,due_on=(v->>'due_on')::date,next_action=v->>'next_action',outcome=v->>'outcome',source_reference=v->>'source_reference',contact_id=(v->>'contact_id')::uuid,related_type=v->>'related_type',related_id=(v->>'related_id')::uuid,version=next_version,updated_at=clock_timestamp() where id=p_id;
 else
  update public.fin_crm_activities set kind=v->>'kind',subject=v->>'subject',notes=v->>'notes',status=v->>'status',occurred_at=(v->>'occurred_at')::timestamptz,due_on=(v->>'due_on')::date,owner_id=(v->>'owner_id')::uuid,source_reference=v->>'source_reference',contact_id=(v->>'contact_id')::uuid,process_id=(v->>'process_id')::uuid,related_type=v->>'related_type',related_id=(v->>'related_id')::uuid,version=next_version,updated_at=clock_timestamp() where id=p_id;
 end if;
 result:=jsonb_build_object('id',record_id,'object_type',p_kind,'version',next_version);
 -- Creation receipts contain no copy of user content. Updates preserve only
 -- changed fields, so authorized history can explain corrections. This audit
 -- evidence can contain personal data and follows the object's scope/hold.
 insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,legal_entity_id,metadata)
 values(p_org,'crm_'||p_kind,record_id,'crm_command_recorded',auth.uid(),entity,jsonb_build_object('request_key',p_request,'request_hash',cmd_hash,'result',result,'changed_fields',(select jsonb_agg(key) from jsonb_object_keys(p_values) key),
 'changes',case when p_id is null then null else (select jsonb_object_agg(key,jsonb_build_object('before',case when p_kind='contact' and key='status' then to_jsonb(case when b->>'archived_at' is null then 'active'::text else 'archived'::text end) else b->key end,'after',case when p_kind='contact' and key='status' then to_jsonb(case when v->>'archived_at' is null then 'active'::text else 'archived'::text end) else v->key end)) from jsonb_object_keys(p_values) key) end,
 'previous_stage',b->>'stage','stage',v->>'stage','declaration',true));
 return result||jsonb_build_object('replayed',false);
exception when check_violation or not_null_violation or invalid_text_representation or datetime_field_overflow or foreign_key_violation then raise exception 'invalid crm';
end $$;

-- The event trail follows the actual CRM object's scope, not its type name.
create or replace function public.fin_object_visible(p_org uuid,p_type text,p_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select case
 when p_type='crm_contact' then exists(select 1 from public.fin_provider_contacts c where c.organization_id=p_org and c.id=p_id and (public.fin_group_or_entity_visible(c.organization_id,c.legal_entity_id) or public.fin_crm_scope_visible(c.organization_id,c.legal_entity_id)))
 when p_type='crm_activity' then exists(select 1 from public.fin_crm_activities a where a.organization_id=p_org and a.id=p_id and public.fin_crm_scope_visible(a.organization_id,a.legal_entity_id))
 when p_type='crm_process' then exists(select 1 from public.fin_crm_processes p where p.organization_id=p_org and p.id=p_id and public.fin_crm_scope_visible(p.organization_id,p.legal_entity_id))
 when p_type in ('rfq','proposal','decision','approval','contract','task','legal_entity') then public.fin_entity_visible(p_org,public.fin_object_legal_entity(p_type,p_id))
 else public.fin_has_role(p_org) end;
$$;

-- Explicit EXECUTE privileges: helpers are not public mutation endpoints.
revoke all on function public.fin_crm_actor(uuid,uuid,uuid),public.fin_crm_contact_version_guard() from public,anon,authenticated,service_role;
revoke all on function public.fin_crm_scope_visible(uuid,uuid),public.fin_crm_reference_visible(uuid,uuid,text,uuid) from public,anon;
grant execute on function public.fin_crm_scope_visible(uuid,uuid),public.fin_crm_reference_visible(uuid,uuid,text,uuid) to authenticated;
revoke all on function public.fin_crm_command(uuid,text,uuid,integer,uuid,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.fin_crm_command(uuid,text,uuid,integer,uuid,jsonb,jsonb) to authenticated;

-- Canonical export catalog, including the new business records.
create or replace function public.fin_governance_export_datasets()
returns table(dataset text, query text) language sql immutable set search_path = '' as $$
  values
    ('external_proposals', 'select * from public.fin_external_proposals where organization_id = $1'),
    ('external_proposal_versions', 'select * from public.fin_external_proposal_versions where organization_id = $1'),
    ('external_proposal_reviews', 'select * from public.fin_external_proposal_reviews where organization_id = $1'),
    ('organization', 'select * from public.fin_organizations where id = $1'),
    ('legal_entities', 'select * from public.fin_legal_entities where organization_id = $1'),
    ('members', 'select organization_id, user_id, role, entity_scope, display_name, job_title, created_at from public.fin_members where organization_id = $1'),
    ('member_entity_grants', 'select * from public.fin_member_entity_grants where organization_id = $1'),
    ('company_profiles', 'select * from public.fin_company_profiles where organization_id = $1'),
    ('company_profile_history', 'select * from public.fin_company_profile_history where organization_id = $1'),
    ('rfqs', 'select * from public.fin_rfqs where organization_id = $1'),
    ('rfq_revisions', 'select * from public.fin_rfq_revisions where organization_id = $1'),
    ('rfq_profile_snapshots', 'select * from public.fin_rfq_profile_snapshots where organization_id = $1'),
    ('rfq_invites', 'select * from public.fin_rfq_invites where buyer_organization_id = $1'),
    ('proposals', 'select * from public.fin_proposals where buyer_organization_id = $1'),
    ('proposal_versions', 'select v.* from public.fin_proposal_versions v join public.fin_proposals p on p.id = v.proposal_id where p.buyer_organization_id = $1 and p.current_version > 0'),
    ('decisions', 'select * from public.fin_decisions where organization_id = $1'),
    ('contracts', 'select * from public.fin_contracts where organization_id = $1'),
    ('contract_versions', 'select * from public.fin_contract_versions where organization_id = $1'),
    ('contract_amendments', 'select * from public.fin_contract_amendments where organization_id = $1'),
    ('contract_milestones', 'select * from public.fin_contract_milestones where organization_id = $1'),
    ('renewal_milestones', 'select * from public.fin_renewal_milestones where organization_id = $1'),
    ('providers', 'select * from public.fin_providers where organization_id = $1'),
    ('provider_contacts', 'select * from public.fin_provider_contacts where organization_id = $1'),
    ('crm_activities', 'select * from public.fin_crm_activities where organization_id = $1'),
    ('crm_processes', 'select * from public.fin_crm_processes where organization_id = $1'),
    ('provider_relationships', 'select * from public.fin_provider_relationships where organization_id = $1'),
    ('provider_issues', 'select * from public.fin_provider_issues where organization_id = $1'),
    ('provider_reviews', 'select * from public.fin_provider_reviews where organization_id = $1'),
    ('scorecard_templates', 'select * from public.fin_scorecard_templates where organization_id = $1'),
    ('facilities', 'select * from public.fin_facilities where organization_id = $1'),
    ('facility_balances', 'select * from public.fin_facility_balances where organization_id = $1'),
    ('facility_repayments', 'select * from public.fin_facility_repayments where organization_id = $1'),
    ('facility_history', 'select * from public.fin_facility_history where organization_id = $1'),
    ('guarantees', 'select * from public.fin_guarantees where organization_id = $1'),
    ('policies', 'select * from public.fin_policies where organization_id = $1'),
    ('policy_versions', 'select * from public.fin_policy_versions where organization_id = $1'),
    ('policy_flags', 'select * from public.fin_policy_flags where organization_id = $1'),
    ('approval_policies', 'select * from public.fin_approval_policies where organization_id = $1'),
    ('approval_requests', 'select * from public.fin_approval_requests where organization_id = $1'),
    ('approval_stages', 'select * from public.fin_approval_stages where organization_id = $1'),
    ('approval_steps', 'select s.* from public.fin_approval_steps s join public.fin_approval_requests a on a.id = s.request_id where a.organization_id = $1'),
    ('policy_exceptions', 'select * from public.fin_policy_exceptions where organization_id = $1'),
    ('approval_delegations', 'select * from public.fin_approval_delegations where organization_id = $1'),
    ('tasks', 'select * from public.fin_tasks where organization_id = $1'),
    ('comments', 'select * from public.fin_comments where organization_id = $1'),
    ('events', 'select * from public.fin_events where organization_id = $1'),
    ('documents', 'select * from public.fin_documents where organization_id = $1'),
    ('private_documents', 'select * from public.fin_private_documents where buyer_organization_id = $1'),
    ('document_versions', 'select v.document_id, v.version, v.mime_type, v.size_bytes, v.sha256, v.status, v.uploaded_by, v.created_at, v.completed_at from public.fin_document_versions v join public.fin_private_documents d on d.id = v.document_id where d.buyer_organization_id = $1'),
    ('service_accounts', 'select * from public.fin_service_accounts where organization_id = $1'),
    ('webhook_endpoints', 'select * from public.fin_webhook_endpoints where organization_id = $1'),
    ('sso_connections', 'select * from public.fin_sso_connections where organization_id = $1'),
    ('sso_domains', 'select * from public.fin_sso_domains where organization_id = $1'),
    ('retention_policies', 'select * from public.fin_retention_policies where organization_id = $1'),
    ('legal_holds', 'select * from public.fin_legal_holds where organization_id = $1'),
    ('value_methodologies', 'select * from public.fin_value_methodologies where organization_id = $1'),
    ('value_records', 'select * from public.fin_value_records where organization_id = $1'),
    ('value_observations', 'select * from public.fin_value_observations where organization_id = $1'),
    ('fee_schedules', 'select * from public.fin_fee_schedules where organization_id = $1'),
    ('fee_schedule_versions', 'select * from public.fin_fee_schedule_versions where organization_id = $1'),
    ('fee_observations', 'select * from public.fin_fee_observations where organization_id = $1'),
    ('fee_variances', 'select * from public.fin_fee_variances where organization_id = $1'),
    ('fee_reviews', 'select * from public.fin_fee_reviews where organization_id = $1'),
    ('opportunity_rules', 'select * from public.fin_opportunity_rules where organization_id = $1'),
    ('opportunities', 'select * from public.fin_opportunities where organization_id = $1'),
    ('opportunity_events', 'select * from public.fin_opportunity_events where organization_id = $1'),
    ('document_extractions', 'select * from public.fin_document_extractions where organization_id = $1'),
    ('extraction_facts', 'select * from public.fin_extraction_facts where organization_id = $1'),
    ('extraction_reviews', 'select * from public.fin_extraction_reviews where organization_id = $1'),
    ('qualification_requirements', 'select * from public.fin_qualification_requirements where organization_id = $1'),
    ('provider_qualifications', 'select * from public.fin_provider_qualifications where organization_id = $1'),
    ('qualification_evidence', 'select * from public.fin_qualification_evidence where organization_id = $1'),
    ('qualification_exceptions', 'select * from public.fin_qualification_exceptions where organization_id = $1'),
    ('qualification_events', 'select * from public.fin_qualification_events where organization_id = $1'),
    ('implementation_plans', 'select * from public.fin_implementation_plans where organization_id = $1'),
    ('implementation_milestones', 'select * from public.fin_implementation_milestones where organization_id = $1'),
    ('implementation_dependencies', 'select * from public.fin_implementation_dependencies where organization_id = $1'),
    ('implementation_issues', 'select * from public.fin_implementation_issues where organization_id = $1'),
    ('implementation_acceptances', 'select * from public.fin_implementation_acceptances where organization_id = $1'),
    ('obligations', 'select * from public.fin_obligations where organization_id = $1'),
    ('covenants', 'select * from public.fin_covenants where organization_id = $1'),
    ('obligation_periods', 'select * from public.fin_obligation_periods where organization_id = $1'),
    ('covenant_measurements', 'select * from public.fin_covenant_measurements where organization_id = $1'),
    ('obligation_evidence', 'select * from public.fin_obligation_evidence where organization_id = $1'),
    ('obligation_reviews', 'select * from public.fin_obligation_reviews where organization_id = $1'),
    ('covenant_waivers', 'select * from public.fin_covenant_waivers where organization_id = $1'),
    ('performance_dimensions', 'select * from public.fin_provider_performance_dimensions where organization_id = $1'),
    ('performance_periods', 'select * from public.fin_provider_performance_periods where organization_id = $1'),
    ('performance_targets', 'select * from public.fin_provider_performance_targets where organization_id = $1'),
    ('performance_observations', 'select * from public.fin_provider_performance_observations where organization_id = $1'),
    ('performance_reviews', 'select * from public.fin_provider_performance_reviews where organization_id = $1'),
    ('spend_records', 'select * from public.fin_spend_records where organization_id = $1'),
    ('spend_reconciliations', 'select * from public.fin_spend_reconciliations where organization_id = $1');
$$;
revoke all on function public.fin_governance_export_datasets() from public,anon,authenticated;
insert into public.fin_settings(key,value) values ('schema_version', 'financial-crm-1') on conflict(key) do update set value=excluded.value,updated_at=now();
notify pgrst,'reload schema';
commit;
