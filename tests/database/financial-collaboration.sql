\set ON_ERROR_STOP on
-- Uses the enterprise approval fixture, persisted in this database.
insert into auth.users(id,email) values ('00000000-0000-4000-8000-00000000ba07','collab-provider@example.invalid')
on conflict(id) do nothing;
insert into public.fin_members(organization_id,user_id,role)
values('00000000-0000-4000-8000-00000000bb02','00000000-0000-4000-8000-00000000ba07','provider_user')
on conflict do nothing;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba01',false);
do $$
declare v_org uuid:='00000000-0000-4000-8000-00000000bb01';
 v_rfq uuid:='00000000-0000-4000-8000-00000000bb11';
 v_internal uuid:='00000000-0000-4000-8000-00000000cc01';
 v_shared uuid:='00000000-0000-4000-8000-00000000cc02';
begin
 if has_table_privilege('authenticated','public.fin_comments','INSERT')
 or has_table_privilege('authenticated','public.fin_notifications','UPDATE') then raise exception 'direct collaboration mutation allowed'; end if;
 if public.fin_add_comment('rfq',v_rfq,'internal','Discussão interna',array['00000000-0000-4000-8000-00000000ba04'::uuid],v_internal)<>v_internal then raise exception 'comment ID mismatch'; end if;
 if public.fin_add_comment('rfq',v_rfq,'internal','Discussão interna',array[]::uuid[],v_internal)<>v_internal then raise exception 'idempotency replay failed'; end if;
 begin
  perform public.fin_add_comment('rfq',v_rfq,'internal','Texto alterado',array[]::uuid[],v_internal);
  raise exception 'replay changed comment';
 exception when others then if sqlerrm not like '%comment conflict%' then raise; end if; end;
 perform public.fin_add_comment('rfq',v_rfq,'provider_visible','Mensagem compartilhada',array[]::uuid[],v_shared);
 if (select count(*) from public.fin_comments where organization_id=v_org and object_id=v_rfq)<>2 then raise exception 'duplicate comment'; end if;
 begin
  perform public.fin_add_comment('rfq',v_rfq,'internal','<script>alert(1)</script>',array[]::uuid[],null);
  raise exception 'HTML comment accepted';
 exception when others then if sqlerrm not like '%invalid comment%' then raise; end if; end;
 begin
  perform public.fin_add_comment('rfq',v_rfq,'internal','Mencionar outra organização',array['00000000-0000-4000-8000-00000000ba06'::uuid],null);
  raise exception 'foreign mention accepted';
 exception when others then if sqlerrm not like '%invalid mention%' then raise; end if; end;
 if (select count(*) from public.fin_notifications where user_id='00000000-0000-4000-8000-00000000ba04' and event_type='mention')<>0 then
  -- RLS hides another user's notifications.
  raise exception 'notification leaked to author';
 end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba04',false);
do $$
declare v_id uuid;
begin
 select id into v_id from public.fin_notifications where event_type='mention' and object_id='00000000-0000-4000-8000-00000000bb11';
 if v_id is null then raise exception 'mention did not notify member'; end if;
 if public.fin_mark_notifications('00000000-0000-4000-8000-00000000bb01',array[v_id])<>1 then raise exception 'mark read failed'; end if;
 if public.fin_mark_notifications('00000000-0000-4000-8000-00000000bb01',array[v_id])<>0 then raise exception 'mark read not idempotent'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba07',false);
do $$
declare v_count integer;
begin
 select count(*) into v_count from public.fin_comments where object_id='00000000-0000-4000-8000-00000000bb11';
 if v_count<>1 then raise exception 'provider saw internal comment or missed shared (%)',v_count; end if;
 begin
  perform public.fin_add_comment('rfq','00000000-0000-4000-8000-00000000bb11','internal','Escalação',array[]::uuid[],null);
  raise exception 'provider wrote internal note';
 exception when others then if sqlerrm not like '%forbidden%' then raise; end if; end;
 begin
  perform public.fin_add_comment('rfq','00000000-0000-4000-8000-00000000bb11','provider_visible','Forjado',array['00000000-0000-4000-8000-00000000ba04'::uuid],null);
  raise exception 'provider mentioned buyer';
 exception when others then if sqlerrm not like '%forbidden%' then raise; end if; end;
 if exists(select 1 from public.fin_notifications where organization_id='00000000-0000-4000-8000-00000000bb01') then raise exception 'provider read buyer notifications'; end if;
 begin
  perform public.fin_mark_notifications('00000000-0000-4000-8000-00000000bb01',null);
  raise exception 'provider marked buyer notifications';
 exception when others then if sqlerrm not like '%forbidden%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba06',false);
do $$
declare v_count integer;
begin
 select count(*) into v_count from public.fin_comments where object_id='00000000-0000-4000-8000-00000000bb11';
 if v_count<>0 then raise exception 'foreign org read comments'; end if;
 begin
  perform public.fin_add_comment('rfq','00000000-0000-4000-8000-00000000bb11','provider_visible','Tentativa',array[]::uuid[],null);
  raise exception 'uninvited provider commented';
 exception when others then if sqlerrm not like '%forbidden%' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',false);
\echo 'Contextual collaboration isolation, visibility, idempotency and notification ownership validated.'
