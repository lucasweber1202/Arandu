-- Financial operational collaboration. All writes are RPC-only; read policies
-- distinguish buyer-internal records from explicitly shared RFQ/proposal notes.
create table if not exists public.fin_comments (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.fin_organizations(id),
 object_type text not null check(object_type in ('rfq','proposal','approval','decision','contract','task')),
 object_id uuid not null,
 author_id uuid not null references auth.users(id),
 visibility text not null check(visibility in ('internal','provider_visible')),
 body text not null check(length(body) between 1 and 4000 and body !~ '[<>]'),
 created_at timestamptz not null default now(),
 unique(organization_id,id)
);
create index if not exists fin_comments_object_recent on public.fin_comments(organization_id,object_type,object_id,created_at desc,id desc);
create table if not exists public.fin_notifications (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.fin_organizations(id),
 user_id uuid not null references auth.users(id),
 event_type text not null check(event_type in ('mention','comment','proposal_received','proposal_revised','approval_requested','approval_approved','approval_rejected','approval_changes_requested','renewal_due','task_assigned')),
 object_type text not null check(object_type in ('rfq','proposal','approval','contract','task')),
 object_id uuid not null,
 event_id uuid not null,
 title text not null check(length(title) between 1 and 120),
 body text not null check(length(body) <= 240),
 created_at timestamptz not null default now(),
 read_at timestamptz,
 unique(user_id,event_type,event_id)
);
create index if not exists fin_notifications_inbox on public.fin_notifications(organization_id,user_id,read_at,created_at desc);
create table if not exists public.fin_notification_preferences (
 organization_id uuid not null references public.fin_organizations(id),
 user_id uuid not null references auth.users(id),
 event_type text not null check(event_type in ('mention','comment','proposal_received','proposal_revised','approval_requested','approval_approved','approval_rejected','approval_changes_requested','renewal_due','task_assigned')),
 in_app boolean not null default true,
 email boolean not null default false,
 primary key(organization_id,user_id,event_type)
);
alter table public.fin_comments enable row level security;
alter table public.fin_comments force row level security;
alter table public.fin_notifications enable row level security;
alter table public.fin_notifications force row level security;
alter table public.fin_notification_preferences enable row level security;
alter table public.fin_notification_preferences force row level security;
revoke all on public.fin_comments,public.fin_notifications,public.fin_notification_preferences from anon,authenticated;
grant select on public.fin_comments,public.fin_notifications,public.fin_notification_preferences to authenticated;

-- Object ownership is resolved in the database, not from caller-supplied org IDs.
create or replace function public.fin_comment_object_org(p_type text,p_id uuid)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid;
begin
 case p_type
 when 'rfq' then select organization_id into v_org from public.fin_rfqs where id=p_id;
 when 'proposal' then select buyer_organization_id into v_org from public.fin_proposals where id=p_id;
 when 'approval' then select organization_id into v_org from public.fin_approval_requests where id=p_id;
 when 'decision' then select organization_id into v_org from public.fin_decisions where id=p_id;
 when 'contract' then select organization_id into v_org from public.fin_contracts where id=p_id;
 when 'task' then select organization_id into v_org from public.fin_tasks where id=p_id;
 else return null;
 end case;
 return v_org;
end $$;
create or replace function public.fin_provider_can_comment(p_type text,p_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
 if p_type='rfq' then
  return exists(select 1 from public.fin_rfq_invites i where i.rfq_id=p_id and i.status='accepted'
   and i.provider_organization_id is not null and public.fin_has_role(i.provider_organization_id,array['admin','provider_user']));
 elsif p_type='proposal' then
  return exists(select 1 from public.fin_proposals p where p.id=p_id and public.fin_has_role(p.provider_organization_id,array['admin','provider_user']));
 end if;
 return false;
end $$;
drop policy if exists fin_comment_read on public.fin_comments;
create policy fin_comment_read on public.fin_comments for select to authenticated using(
 public.fin_has_role(organization_id)
 or (visibility='provider_visible' and public.fin_provider_can_comment(object_type,object_id))
);
drop policy if exists fin_notification_read on public.fin_notifications;
create policy fin_notification_read on public.fin_notifications for select to authenticated
 using(user_id=auth.uid() and public.fin_has_role(organization_id));
drop policy if exists fin_notification_preference_read on public.fin_notification_preferences;
create policy fin_notification_preference_read on public.fin_notification_preferences for select to authenticated
 using(user_id=auth.uid() and public.fin_has_role(organization_id));

create or replace function public.fin_add_comment(
 p_type text,p_id uuid,p_visibility text,p_body text,p_mention_ids uuid[] default '{}'::uuid[],p_client_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid;v_id uuid;v_user uuid;v_owner uuid;v_provider_org uuid;v_text text;
begin
 v_org:=public.fin_comment_object_org(p_type,p_id);
 if v_org is null then raise exception 'object not found'; end if;
 if p_visibility not in ('internal','provider_visible') or p_type not in ('rfq','proposal','approval','decision','contract','task') then raise exception 'invalid visibility'; end if;
 v_text:=trim(coalesce(p_body,''));
 if length(v_text) not between 1 and 4000 or v_text ~ '[<>]' then raise exception 'invalid comment'; end if;
 if coalesce(array_length(p_mention_ids,1),0)>10 then raise exception 'invalid mentions'; end if;
 if public.fin_has_role(v_org,array['admin','finance_manager','analyst']) then
  if p_visibility='provider_visible' and p_type not in ('rfq','proposal') then raise exception 'invalid visibility'; end if;
 elsif public.fin_provider_can_comment(p_type,p_id) then
  if p_visibility<>'provider_visible' then raise exception 'forbidden'; end if;
 else raise exception 'forbidden'; end if;
 if p_client_id is not null then
  select id into v_id from public.fin_comments where id=p_client_id;
  if v_id is not null then
   if exists(select 1 from public.fin_comments where id=v_id and author_id=auth.uid() and object_type=p_type and object_id=p_id and organization_id=v_org) then return v_id; end if;
   raise exception 'comment conflict';
  end if;
 end if;
 v_id:=coalesce(p_client_id,gen_random_uuid());
 insert into public.fin_comments(id,organization_id,object_type,object_id,author_id,visibility,body)
 values(v_id,v_org,p_type,p_id,auth.uid(),p_visibility,v_text);
 insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,metadata)
 values(v_org,p_type,p_id,'comment_added',auth.uid(),jsonb_build_object('comment_id',v_id,'visibility',p_visibility));
 if p_visibility='internal' then
  foreach v_user in array coalesce(p_mention_ids,'{}'::uuid[]) loop
   if not exists(select 1 from public.fin_members where organization_id=v_org and user_id=v_user) then raise exception 'invalid mention'; end if;
   if v_user<>auth.uid() then
    insert into public.fin_notifications(organization_id,user_id,event_type,object_type,object_id,event_id,title,body)
    values(v_org,v_user,'mention',p_type,p_id,v_id,'Você foi mencionado','Há um comentário para revisar.')
    on conflict(user_id,event_type,event_id) do nothing;
   end if;
  end loop;
 end if;
 if p_type='rfq' then select owner_id into v_owner from public.fin_rfqs where id=p_id;
 elsif p_type='contract' then select owner_id into v_owner from public.fin_contracts where id=p_id;
 end if;
 if v_owner is not null and v_owner<>auth.uid() then
  insert into public.fin_notifications(organization_id,user_id,event_type,object_type,object_id,event_id,title,body)
  values(v_org,v_owner,'comment',p_type,p_id,v_id,'Novo comentário','Há uma atualização no processo.')
  on conflict(user_id,event_type,event_id) do nothing;
 end if;
 return v_id;
end $$;
create or replace function public.fin_mark_notifications(p_org uuid,p_ids uuid[] default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
 if not public.fin_has_role(p_org) then raise exception 'forbidden'; end if;
 if p_ids is not null and cardinality(p_ids)>100 then raise exception 'invalid notification selection'; end if;
 update public.fin_notifications set read_at=now()
 where organization_id=p_org and user_id=auth.uid() and read_at is null
 and (p_ids is null or id=any(p_ids));
 get diagnostics v_count=row_count;
 return v_count;
end $$;
create or replace function public.fin_set_notification_preference(p_org uuid,p_event text,p_in_app boolean,p_email boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not public.fin_has_role(p_org) then raise exception 'forbidden'; end if;
 if p_event not in ('mention','comment','proposal_received','proposal_revised','approval_requested','approval_approved','approval_rejected','approval_changes_requested','renewal_due','task_assigned')
 or p_in_app is null or p_email is null then raise exception 'invalid preference'; end if;
 insert into public.fin_notification_preferences(organization_id,user_id,event_type,in_app,email)
 values(p_org,auth.uid(),p_event,p_in_app,p_email)
 on conflict(organization_id,user_id,event_type) do update set in_app=excluded.in_app,email=excluded.email;
end $$;
-- Event-triggered notifications use IDs only. No financial terms or tokens.
create or replace function public.fin_notify_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_user uuid;v_type text;v_object text;v_target uuid;
begin
 if new.event_type in ('proposal_submitted','proposal_revised') then
  select r.owner_id,r.id into v_user,v_target from public.fin_proposals p join public.fin_rfqs r on r.id=p.rfq_id where p.id=new.entity_id;
  v_type:=case when new.event_type='proposal_submitted' then 'proposal_received' else 'proposal_revised' end;
  v_object:='rfq';
 elsif new.event_type='approval_requested' then
  select s.approver_id,r.rfq_id into v_user,v_target from public.fin_approval_steps s join public.fin_approval_requests r on r.id=s.request_id where s.request_id=(new.metadata->>'request_id')::uuid order by s.position limit 1;
  v_type:='approval_requested';v_object:='rfq';
 elsif new.event_type in ('approval_approved','approval_rejected','approval_changes_requested') then
  select requested_by,rfq_id into v_user,v_target from public.fin_approval_requests where id=(new.metadata->>'request_id')::uuid;
  v_type:=new.event_type;v_object:='rfq';
 else return new;
 end if;
 if v_user is not null and v_user is distinct from new.actor_id then
  insert into public.fin_notifications(organization_id,user_id,event_type,object_type,object_id,event_id,title,body)
  values(new.organization_id,v_user,v_type,v_object,v_target,new.id,
   case v_type when 'proposal_received' then 'Proposta recebida' when 'proposal_revised' then 'Proposta revisada'
    when 'approval_requested' then 'Aprovação solicitada' when 'approval_approved' then 'Aprovação registrada'
    when 'approval_rejected' then 'Aprovação rejeitada' else 'Alterações solicitadas' end,
   'Abra o processo para ver os detalhes.')
  on conflict(user_id,event_type,event_id) do nothing;
 end if;
 return new;
end $$;
drop trigger if exists fin_notify_event on public.fin_events;
create trigger fin_notify_event after insert on public.fin_events for each row execute function public.fin_notify_event();
revoke all on function public.fin_comment_object_org(text,uuid),public.fin_provider_can_comment(text,uuid),
 public.fin_add_comment(text,uuid,text,text,uuid[],uuid),public.fin_mark_notifications(uuid,uuid[]),
 public.fin_set_notification_preference(uuid,text,boolean,boolean),public.fin_notify_event() from public,anon;
grant execute on function public.fin_add_comment(text,uuid,text,text,uuid[],uuid),
 public.fin_mark_notifications(uuid,uuid[]),public.fin_set_notification_preference(uuid,text,boolean,boolean)
 to authenticated,service_role;
grant execute on function public.fin_provider_can_comment(text,uuid) to authenticated,service_role;

-- Preferences suppress in-app delivery atomically; email preferences are stored
-- but dispatch remains disabled until an explicit, reviewed outbox integration.
create or replace function public.fin_apply_notification_preference()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if exists(select 1 from public.fin_notification_preferences p
   where p.organization_id=new.organization_id and p.user_id=new.user_id
   and p.event_type=new.event_type and not p.in_app) then return null; end if;
 return new;
end $$;
drop trigger if exists fin_apply_notification_preference on public.fin_notifications;
create trigger fin_apply_notification_preference before insert on public.fin_notifications
for each row execute function public.fin_apply_notification_preference();
revoke all on function public.fin_apply_notification_preference() from public,anon,authenticated;
