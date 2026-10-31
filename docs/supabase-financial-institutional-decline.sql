-- Refusal without accepting an invitation or creating a proposal.
begin;
create or replace function public.fin_decline_provider_invite(p_token text,p_provider_org uuid,p_expected text,p_confirmed boolean,p_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.fin_rfq_invites%rowtype; v_email text; v_confirmed timestamptz; e public.fin_events%rowtype;
begin
 if auth.uid() is null or coalesce(p_token,'') !~ '^[0-9a-f]{64}$' or p_expected is distinct from 'invited' or p_confirmed is not true
 or (p_reason is not null and p_reason not in ('not_offered','capacity','deadline','other')) then raise exception 'invalid invitation'; end if;
 perform 1 from public.fin_members where organization_id=p_provider_org and user_id=auth.uid() for share;
 if not public.fin_has_role(p_provider_org,array['admin','provider_user'])
 or not exists(select 1 from public.fin_organizations where id=p_provider_org and kind='PROVIDER')
 or public.fin_governance_org_locked(p_provider_org) then raise exception 'forbidden'; end if;
 select * into i from public.fin_rfq_invites where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
 if i.id is null or i.buyer_organization_id=p_provider_org or public.fin_governance_org_locked(i.buyer_organization_id) then raise exception 'invalid invitation'; end if;
 if i.recipient_mode='exact_email' then
   select lower(trim(u.email)),u.email_confirmed_at into v_email,v_confirmed from auth.users u where u.id=auth.uid() for share;
   if v_confirmed is null or v_email is distinct from i.recipient_email then raise exception 'invalid invitation'; end if;
 end if;
 -- Check canonical binding without granting access to the buyer's private row.
 perform 1 from public.fin_providers where id=i.provider_id and organization_id=i.buyer_organization_id for share;
 if exists(select 1 from public.fin_providers where id=i.provider_id and organization_id=i.buyer_organization_id and provider_organization_id is not null and provider_organization_id<>p_provider_org) then raise exception 'invalid invitation'; end if;
 if i.status='declined' and i.provider_organization_id=p_provider_org then
   select * into e from public.fin_events where organization_id=i.buyer_organization_id and entity_type='rfq' and entity_id=i.rfq_id and event_type='invite_declined' and metadata->>'invite_id'=i.id::text order by happened_at,id limit 1;
   if e.id is null or (e.metadata->>'reason') is distinct from p_reason then raise exception 'invalid invitation'; end if;
   return jsonb_build_object('invite_id',i.id,'status','declined','declined_at',e.happened_at,'replayed',true);
 end if;
 if i.status<>'invited' or i.accepted_at is not null or i.expires_at<=clock_timestamp() then raise exception 'invalid invitation'; end if;
 update public.fin_rfq_invites set status='declined',provider_organization_id=p_provider_org where id=i.id;
 insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,metadata)
 values(i.buyer_organization_id,'rfq',i.rfq_id,'invite_declined',auth.uid(),jsonb_build_object('invite_id',i.id,'provider_id',i.provider_id,'provider_organization_id',p_provider_org,'reason',p_reason)) returning * into e;
 return jsonb_build_object('invite_id',i.id,'status','declined','declined_at',e.happened_at,'replayed',false);
end $$;
revoke all on function public.fin_decline_provider_invite(text,uuid,text,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.fin_decline_provider_invite(text,uuid,text,boolean,text) to authenticated;
insert into public.fin_settings(key,value) values ('schema_version', 'financial-institutional-decline-1')
on conflict(key) do update set value=excluded.value,updated_at=now();
notify pgrst,'reload schema';
commit;
