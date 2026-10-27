-- Buyer-owned counterparty receipt: no invitation, authenticated identity or bank connection.
begin;
insert into public.fin_settings(key,value)
 select 'provider_intent_previous_marker',value from public.fin_settings where key='schema_version'
 on conflict(key) do nothing;
alter table public.fin_providers add column if not exists creation_request_key uuid;
alter table public.fin_providers add column if not exists creation_request_hash text;
create unique index if not exists fin_providers_creation_intent
 on public.fin_providers(organization_id,created_by,creation_request_key) where creation_request_key is not null;
alter table public.fin_providers drop constraint if exists fin_providers_creation_receipt;
alter table public.fin_providers add constraint fin_providers_creation_receipt check (
 (creation_request_key is null and creation_request_hash is null)
 or (creation_request_key is not null and creation_request_hash is not null and creation_request_hash ~ '^[a-f0-9]{64}$'));

-- Called AFTER waiting for the intent lock, so revocations committed while
-- waiting are observed. Membership/user locks linearize subsequent revocation.
create or replace function public.fin_provider_intent_actor(p_org uuid,p_write boolean)
returns void language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is null then raise exception 'forbidden'; end if;
 perform 1 from public.fin_members where organization_id=p_org and user_id=auth.uid() for share;
 perform 1 from auth.users where id=auth.uid() for share;
 if not public.fin_has_role(p_org,case when p_write then array['admin','finance_manager'] else array['admin','finance_manager','analyst','viewer'] end)
 or not exists(select 1 from public.fin_organizations where id=p_org and kind='BUYER')
 or not exists(select 1 from auth.users where id=auth.uid() and (banned_until is null or banned_until<=now())) then raise exception 'forbidden'; end if;
 if public.fin_governance_org_locked(p_org) then raise exception 'organization offboarding'; end if;
end $$;
revoke all on function public.fin_provider_intent_actor(uuid,boolean) from public,anon,authenticated,service_role;

create or replace function public.fin_create_provider_intent(p_org uuid,p_key uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v jsonb; h text; r public.fin_providers%rowtype; products text[]; k text;
begin
 if p_key is not null then
  perform pg_advisory_xact_lock(hashtextextended('provider-create:'||p_org||':'||auth.uid()||':'||p_key,0));
 end if;
 perform public.fin_provider_intent_actor(p_org,true);
 if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>20000
 or exists(select 1 from jsonb_object_keys(p_input) key where key not in
 ('name','kind','website','contact_name','contact_email','contact_phone','region','notes','products')) then raise exception 'invalid provider'; end if;
 if exists(select 1 from jsonb_each(p_input) e where e.key<>'products' and jsonb_typeof(e.value) not in ('string','null')) then raise exception 'invalid provider'; end if;
 v:=jsonb_build_object('name',btrim(p_input->>'name'),'kind',btrim(p_input->>'kind'));
 foreach k in array array['website','contact_name','contact_email','contact_phone','region','notes'] loop
  v:=v||jsonb_build_object(k,nullif(btrim(p_input->>k),''));
 end loop;
 v:=v||jsonb_build_object('contact_email',lower(v->>'contact_email'));
 if jsonb_typeof(coalesce(p_input->'products','[]'::jsonb))<>'array'
 or jsonb_array_length(coalesce(p_input->'products','[]'::jsonb))>10
 or exists(select 1 from jsonb_array_elements(coalesce(p_input->'products','[]'::jsonb)) e where jsonb_typeof(e)<>'string') then raise exception 'invalid provider'; end if;
 select coalesce(array_agg(btrim(x) order by ord),'{}') into products
 from jsonb_array_elements_text(coalesce(p_input->'products','[]'::jsonb)) with ordinality as a(x,ord) where btrim(x)<>'';
 if exists(select 1 from unnest(products) x where length(x)>60)
 or length(v->>'name') not between 2 and 200 or v->>'name' is null
 or coalesce(v->>'kind','') not in ('bank','fintech','acquirer','subacquirer','credit_provider','payment_provider','other')
 or (v->>'website' is not null and v->>'website' !~ '^https://')
 or length(v->>'contact_name')>200 or length(v->>'contact_email')>254
 or (v->>'contact_email' is not null and v->>'contact_email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
 or length(v->>'contact_phone')>40 or length(v->>'region')>120 or length(v->>'notes')>1000 then raise exception 'invalid provider'; end if;
 v:=v||jsonb_build_object('products',to_jsonb(products));
 h:=encode(sha256(convert_to(jsonb_build_object('organization',p_org,'actor',auth.uid(),'input',v)::text,'UTF8')),'hex');
 if p_key is not null then
  select * into r from public.fin_providers where organization_id=p_org and created_by=auth.uid() and creation_request_key=p_key;
  if r.id is not null then
   if r.creation_request_hash is distinct from h then raise exception 'provider intent conflict'; end if;
   return jsonb_build_object('id',r.id,'replayed',true,'state','confirmed','row',to_jsonb(r)-'creation_request_hash'-'creation_request_key');
  end if;
 end if;
 insert into public.fin_providers(organization_id,name,kind,website,contact_name,contact_email,contact_phone,region,notes,products,created_by,creation_request_key,creation_request_hash)
 values(p_org,v->>'name',v->>'kind',v->>'website',v->>'contact_name',v->>'contact_email',v->>'contact_phone',v->>'region',v->>'notes',products,auth.uid(),p_key,case when p_key is null then null else h end) returning * into r;
 insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,metadata)
 values(p_org,'provider',r.id,'provider_created',auth.uid(),jsonb_build_object('has_creation_receipt',p_key is not null));
 return jsonb_build_object('id',r.id,'replayed',false,'state','confirmed','row',to_jsonb(r)-'creation_request_hash'-'creation_request_key');
end $$;
revoke all on function public.fin_create_provider_intent(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.fin_create_provider_intent(uuid,uuid,jsonb) to authenticated;

create or replace function public.fin_provider_creation_result(p_org uuid,p_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.fin_providers%rowtype; available boolean;
begin
 if p_key is null then raise exception 'invalid request key'; end if;
 available:=pg_try_advisory_xact_lock(hashtextextended('provider-create:'||p_org||':'||auth.uid()||':'||p_key,0));
 perform public.fin_provider_intent_actor(p_org,false);
 if not available then return jsonb_build_object('state','pending','id',null); end if;
 select * into r from public.fin_providers where organization_id=p_org and created_by=auth.uid() and creation_request_key=p_key;
 if r.id is null then return jsonb_build_object('state','unconfirmed','id',null); end if;
 return jsonb_build_object('state','confirmed','id',r.id,'row',to_jsonb(r)-'creation_request_hash'-'creation_request_key');
end $$;
revoke all on function public.fin_provider_creation_result(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.fin_provider_creation_result(uuid,uuid) to authenticated;

-- Direct legacy PostgREST clients retain their grants, but cannot manufacture
-- a receipt or rewrite one. The RPC runs as its owner, with explicit actor checks.
create or replace function public.fin_provider_receipt_guard()
returns trigger language plpgsql set search_path='' as $$ begin
 if TG_OP='INSERT' then
  if current_user in ('authenticated','anon','service_role') and new.creation_request_key is not null then raise exception 'immutable provider receipt'; end if;
 elsif (old.creation_request_key is not null and
 (new.creation_request_key,new.creation_request_hash,new.organization_id,new.created_by) is distinct from
 (old.creation_request_key,old.creation_request_hash,old.organization_id,old.created_by))
 or (current_user in ('authenticated','anon','service_role') and
 (new.creation_request_key,new.creation_request_hash) is distinct from (old.creation_request_key,old.creation_request_hash)) then raise exception 'immutable provider receipt'; end if;
 return new;
end $$;
revoke all on function public.fin_provider_receipt_guard() from public,anon,authenticated,service_role;
drop trigger if exists fin_provider_creation_receipt on public.fin_providers;
create trigger fin_provider_creation_receipt before insert or update on public.fin_providers for each row execute function public.fin_provider_receipt_guard();
insert into public.fin_settings(key,value) values('schema_version', 'financial-provider-intent-integrity-1') on conflict(key) do update set value=excluded.value,updated_at=now();
notify pgrst,'reload schema';
commit;
