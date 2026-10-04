-- Rollback de docs/supabase-financial-p0-closure.sql.
-- Recusa se já existir aviso dos tipos novos ou preferência por eles (são
-- dados de pessoas; remover = forward-fix decidido). Sem uso, devolve o
-- gatilho de avisos, o teto de 4 MB por conjunto e o marker anterior.
begin;
do $$ begin
  if exists (select 1 from public.fin_notifications where event_type in ('policy_exception_requested','policy_exception_decided'))
     or exists (select 1 from public.fin_notification_preferences where event_type in ('policy_exception_requested','policy_exception_decided')) then
    raise exception 'p0 closure state exists: use forward-fix';
  end if;
  if exists (select 1 from public.fin_data_export_parts where byte_size > 4000000) then
    raise exception 'p0 closure state exists: use forward-fix';
  end if;
end $$;
alter table public.fin_notifications drop constraint if exists fin_notifications_event_type_check;
alter table public.fin_notifications add constraint fin_notifications_event_type_check check (event_type in ('mention','comment','proposal_received','proposal_revised','approval_requested','approval_approved','approval_rejected','approval_changes_requested','renewal_due','task_assigned'));
alter table public.fin_notification_preferences drop constraint if exists fin_notification_preferences_event_type_check;
alter table public.fin_notification_preferences add constraint fin_notification_preferences_event_type_check check (event_type in ('mention','comment','proposal_received','proposal_revised','approval_requested','approval_approved','approval_rejected','approval_changes_requested','renewal_due','task_assigned'));
create or replace function public.fin_notify_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_user uuid;v_type text;v_object text;v_target uuid;v_next uuid;v_policy boolean;
begin
 if new.event_type in ('proposal_submitted','proposal_revised') then
  select r.owner_id,r.id into v_user,v_target from public.fin_proposals p join public.fin_rfqs r on r.id=p.rfq_id where p.id=new.entity_id;
  v_type:=case when new.event_type='proposal_submitted' then 'proposal_received' else 'proposal_revised' end;
  v_object:='rfq';
 elsif new.event_type in ('approval_requested','approval_approved','policy_exception_approved')
   and exists (select 1 from public.fin_approval_requests r where r.id=(new.metadata->>'request_id')::uuid and r.policy_snapshot is not null) then
  select rfq_id,requested_by into v_target,v_user from public.fin_approval_requests where id=(new.metadata->>'request_id')::uuid;
  for v_next in select s.approver_id from public.fin_approval_steps s join public.fin_approval_stages st on st.id=s.stage_id and st.status='active'
                 join public.fin_approval_requests r on r.id=s.request_id and r.status='pending'
                 where s.request_id=(new.metadata->>'request_id')::uuid and s.status='pending' and s.approver_id is distinct from new.actor_id loop
   insert into public.fin_notifications(organization_id,user_id,event_type,object_type,object_id,event_id,title,body)
   values(new.organization_id,v_next,'approval_requested','rfq',v_target,new.id,'Aprovação solicitada',
    'Uma etapa de aprovação aguarda você. Abra o processo para ver a policy e os detalhes.')
   on conflict(user_id,event_type,event_id) do nothing;
  end loop;
  if new.event_type in ('approval_requested','policy_exception_approved') then return new; end if;
  v_type:='approval_approved';v_object:='rfq';
 elsif new.event_type='approval_requested' then
  select s.approver_id,r.rfq_id into v_user,v_target from public.fin_approval_steps s join public.fin_approval_requests r on r.id=s.request_id where s.request_id=(new.metadata->>'request_id')::uuid order by s.position limit 1;
  v_type:='approval_requested';v_object:='rfq';
 elsif new.event_type in ('approval_approved','approval_rejected','approval_changes_requested') then
  select requested_by,rfq_id into v_user,v_target from public.fin_approval_requests where id=(new.metadata->>'request_id')::uuid;
  v_type:=new.event_type;v_object:='rfq';
  -- Etapa aprovada e pedido ainda pendente: a vez passou para o próximo aprovador.
  if new.event_type='approval_approved' then
   select s.approver_id into v_next from public.fin_approval_steps s join public.fin_approval_requests r on r.id=s.request_id
    where s.request_id=(new.metadata->>'request_id')::uuid and s.status='pending' and r.status='pending'
    order by s.position limit 1;
   if v_next is not null and v_next is distinct from new.actor_id then
    insert into public.fin_notifications(organization_id,user_id,event_type,object_type,object_id,event_id,title,body)
    values(new.organization_id,v_next,'approval_requested','rfq',v_target,new.id,'Aprovação solicitada',
     'Chegou a sua vez de aprovar. Abra o processo para ver os detalhes.')
    on conflict(user_id,event_type,event_id) do nothing;
   end if;
  end if;
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
revoke all on function public.fin_notify_event() from public, anon, authenticated;
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
drop function if exists public.fin_governance_build_export(integer);
create or replace function public.fin_governance_build_export(p_max_dataset_bytes integer default 4000000)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  x public.fin_data_exports%rowtype; d record; v_rows jsonb; v_text text; v_count integer; v_bytes integer;
  v_manifest jsonb := '[]'::jsonb; v_total_rows bigint := 0; v_total_bytes bigint := 0; v_sets integer := 0; v_error text;
  v_secret_keys text[] := array['token_hash','secret_ciphertext','verification_token_hash','lease_token','lease_expires_at','storage_path','storage_bucket','request_fingerprint','subject_hash'];
begin
  if auth.uid() is not null then raise exception 'forbidden'; end if;
  select * into x from public.fin_data_exports where status = 'requested' order by requested_at, id limit 1 for update skip locked;
  if not found then return jsonb_build_object('processed', 0); end if;
  begin
    if public.fin_governance_org_locked(x.organization_id) and x.purpose <> 'offboarding' then raise exception 'organization offboarding'; end if;
    for d in select * from public.fin_governance_export_datasets() loop
      execute format('select coalesce(jsonb_agg(to_jsonb(t) - $2 order by to_jsonb(t)::text), ''[]''::jsonb) from (%s) t', d.query)
        into v_rows using x.organization_id, v_secret_keys;
      v_text := v_rows::text;
      v_count := jsonb_array_length(v_rows);
      v_bytes := octet_length(v_text);
      if v_bytes > least(greatest(coalesce(p_max_dataset_bytes, 4000000), 1), 4000000) then raise exception 'export too large'; end if;
      insert into public.fin_data_export_parts(export_id, organization_id, dataset, row_count, byte_size, sha256, content)
        values (x.id, x.organization_id, d.dataset, v_count, v_bytes, encode(sha256(convert_to(v_text, 'UTF8')), 'hex'), v_text);
      v_manifest := v_manifest || jsonb_build_object('dataset', d.dataset, 'file', 'data/' || d.dataset || '.json', 'rows', v_count, 'bytes', v_bytes,
        'sha256', encode(sha256(convert_to(v_text, 'UTF8')), 'hex'));
      v_total_rows := v_total_rows + v_count; v_total_bytes := v_total_bytes + v_bytes; v_sets := v_sets + 1;
    end loop;
    update public.fin_data_exports set status = 'ready', completed_at = now(), expires_at = now() + interval '7 days',
      schema_version = public.fin_setting('schema_version', 'unknown'), dataset_count = v_sets, row_count = v_total_rows, byte_size = v_total_bytes,
      manifest = jsonb_build_object('format', 'arandu-export', 'format_version', 1, 'export_id', x.id, 'organization_id', x.organization_id,
        'purpose', x.purpose, 'schema_version', public.fin_setting('schema_version', 'unknown'), 'generated_at', now(),
        'checksum_algorithm', 'sha256 over the UTF-8 bytes of each data/<dataset>.json part', 'datasets', v_manifest,
        'excluded', jsonb_build_array('password hashes and auth secrets (not stored by Arandu)', 'API token hashes', 'webhook signing secrets',
          'SSO domain verification hashes', 'internal storage paths', 'job leases', 'notifications and drafts (ephemeral)', 'document binaries (metadata only)'))
     where id = x.id;
    insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
      values (x.organization_id, 'data_export', x.id, 'export_completed', null, jsonb_build_object('datasets', v_sets, 'rows', v_total_rows, 'bytes', v_total_bytes));
    return jsonb_build_object('processed', 1, 'export_id', x.id, 'status', 'ready');
  exception when others then
    v_error := case when sqlerrm = 'export too large' then 'export_too_large' when sqlerrm = 'organization offboarding' then 'organization_offboarding' else 'export_build_failed' end;
  end;
  update public.fin_data_exports set status = 'failed', completed_at = now(), error_code = v_error where id = x.id;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (x.organization_id, 'data_export', x.id, 'export_failed', null, jsonb_build_object('error_code', v_error));
  return jsonb_build_object('processed', 1, 'export_id', x.id, 'status', 'failed', 'error_code', v_error);
end $$;
revoke all on function public.fin_governance_build_export(integer) from public, anon, authenticated;
drop function if exists public.fin_governance_export_part_range(uuid, text, integer, integer);
update public.fin_settings set value = 'financial-legacy-art-decommission-1', updated_at = now()
 where key = 'schema_version' and value = 'financial-p0-closure-1';
commit;
