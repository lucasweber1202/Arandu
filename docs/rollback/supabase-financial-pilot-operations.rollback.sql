-- Reverte docs/supabase-financial-pilot-operations.sql: restaura
-- fin_accept_provider_invite como em docs/supabase-financial-procurement-hardening.sql
-- e as funções de envio de documento como em docs/supabase-financial-pilot-grade.sql
-- e fin_run_renewal_schedule como em docs/supabase-financial-delivery.sql
-- (sem vínculo do convite ao cadastro canônico, sem janela de envio e com o aviso
-- de renovação só quando a agenda cria tarefa nova).
create or replace function public.fin_accept_provider_invite(p_token text, p_provider_org uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_inv public.fin_rfq_invites%rowtype;
begin
  if auth.uid() is null or coalesce(p_token,'') !~ '^[0-9a-f]{64}$' then raise exception 'invalid invitation'; end if;
  if not public.fin_has_role(p_provider_org, array['admin','provider_user']) then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.fin_organizations o where o.id = p_provider_org and o.kind = 'PROVIDER') then
    raise exception 'provider organization required';
  end if;
  select * into v_inv from public.fin_rfq_invites
    where token_hash = encode(sha256(convert_to(p_token,'UTF8')),'hex')
      and status = 'invited' and accepted_at is null and expires_at > now()
    for update;
  if not found then raise exception 'invalid invitation'; end if;
  if v_inv.buyer_organization_id = p_provider_org then raise exception 'invalid invitation'; end if;
  update public.fin_rfq_invites
    set status = 'accepted', accepted_at = now(), provider_organization_id = p_provider_org
    where id = v_inv.id;
  -- O cadastro do comprador passa a apontar para a conta canônica do provedor.
  update public.fin_providers
    set provider_organization_id = p_provider_org, updated_at = now()
    where id = v_inv.provider_id and organization_id = v_inv.buyer_organization_id
      and provider_organization_id is null;
  insert into public.fin_proposals (invite_id, rfq_id, buyer_organization_id, provider_id, provider_organization_id, product)
    select v_inv.id, v_inv.rfq_id, v_inv.buyer_organization_id, v_inv.provider_id, p_provider_org, r.product
    from public.fin_rfqs r where r.id = v_inv.rfq_id
    on conflict (invite_id) do nothing;
  insert into public.fin_events (organization_id, entity_type, entity_id, event_type, actor_id)
    values (v_inv.buyer_organization_id, 'rfq', v_inv.rfq_id, 'invite_accepted', auth.uid());
  return v_inv.id;
end $$;
revoke all on function public.fin_accept_provider_invite(text, uuid) from public, anon;
grant execute on function public.fin_accept_provider_invite(text, uuid) to authenticated;

create or replace function public.fin_document_pending_upload(p_document uuid, p_version integer)
returns table(bucket text, path text, mime_type text, size_bytes bigint)
language sql stable security definer set search_path = '' as $$
  select v.storage_bucket, v.storage_path, v.mime_type, v.size_bytes from public.fin_document_versions v
   where v.document_id = p_document and v.version = p_version and v.status = 'pending' and v.uploaded_by = auth.uid();
$$;
revoke all on function public.fin_document_pending_upload(uuid, integer) from public, anon;
grant execute on function public.fin_document_pending_upload(uuid, integer) to authenticated;

-- Passo do servidor: confere o objeto no Storage e só então publica a versão.
create or replace function public.fin_document_finalize_upload(p_document uuid, p_version integer, p_size bigint, p_mime text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_row public.fin_document_versions%rowtype; v_doc public.fin_private_documents%rowtype; v_event text;
begin
  select * into v_row from public.fin_document_versions where document_id = p_document and version = p_version for update;
  if not found then raise exception 'invalid document'; end if;
  if v_row.status <> 'pending' then return v_row.status; end if;
  if p_size is distinct from v_row.size_bytes or p_mime is distinct from v_row.mime_type then
    update public.fin_document_versions set status = 'failed', completed_at = now() where document_id = p_document and version = p_version;
    return 'failed';
  end if;
  update public.fin_document_versions set status = 'available', completed_at = now() where document_id = p_document and version = p_version;
  update public.fin_private_documents set current_version = greatest(current_version, p_version) where id = p_document
  returning * into v_doc;
  v_event := case when p_version = 1 then 'document_uploaded' else 'document_version_added' end;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
  values (v_doc.organization_id, v_doc.entity_type, v_doc.entity_id, v_event, v_row.uploaded_by,
    jsonb_build_object('document_id', v_doc.id, 'version', p_version, 'mime_type', v_row.mime_type, 'size_bytes', v_row.size_bytes));
  if v_doc.visibility = 'shared' and v_doc.organization_id <> v_doc.buyer_organization_id and v_doc.rfq_id is not null then
    insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (v_doc.buyer_organization_id, 'rfq', v_doc.rfq_id, v_event, v_row.uploaded_by,
      jsonb_build_object('document_id', v_doc.id, 'version', p_version));
  end if;
  return 'available';
end $$;
revoke all on function public.fin_document_finalize_upload(uuid, integer, bigint, text) from public, anon, authenticated;
grant execute on function public.fin_document_finalize_upload(uuid, integer, bigint, text) to service_role;

create or replace function public.fin_run_renewal_schedule(p_day date default current_date)
returns integer language plpgsql security definer set search_path = '' as $$
declare c record; v_days integer; v_mark text; v_task uuid; v_created integer := 0; v_inserted integer; v_new boolean;
begin
  if p_day is null or abs(p_day - current_date) > 1 then raise exception 'invalid date'; end if;
  perform pg_advisory_xact_lock(hashtext('fin_run_renewal_schedule'));
  for c in select id, organization_id, owner_id, ends_on, renewal_notice_days, status from public.fin_contracts
    where status in ('active','renewing') and ends_on <= p_day + greatest(90, renewal_notice_days)
    order by ends_on, id for update
  loop
    v_days := c.ends_on - p_day;
    v_mark := null;
    if v_days <= 0 then v_mark := 'expired';
    else
      -- O menor limite já alcançado é o marco atual; empate favorece o aviso prévio.
      select m.mark into v_mark from (values ('notice', c.renewal_notice_days, 0), ('d30', 30, 1), ('d60', 60, 1), ('d90', 90, 1))
        as m(mark, threshold, tiebreak) where v_days <= m.threshold order by m.threshold, m.tiebreak limit 1;
    end if;
    if v_mark is null then continue; end if;
    if exists (select 1 from public.fin_renewal_milestones where contract_id = c.id and milestone = v_mark) then continue; end if;
    select id into v_task from public.fin_tasks where organization_id = c.organization_id and related_type = 'contract'
      and related_id = c.id and status = 'open' order by created_at limit 1;
    v_new := v_task is null;
    if v_new then
      insert into public.fin_tasks(organization_id, title, due_on, status, related_type, related_id, created_by)
      values (c.organization_id, case when v_days <= 0 then 'Revisar contrato vencido' else 'Revisar renovação de contrato' end,
        least(c.ends_on - c.renewal_notice_days, c.ends_on), 'open', 'contract', c.id, c.owner_id)
      returning id into v_task;
    end if;
    insert into public.fin_renewal_milestones(organization_id, contract_id, milestone, task_id)
    values (c.organization_id, c.id, v_mark, v_task) on conflict (contract_id, milestone) do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted = 0 then
      if v_new then delete from public.fin_tasks where id = v_task; end if;
      continue;
    end if;
    insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (c.organization_id, 'contract', c.id, 'renewal_milestone_reached', null,
      jsonb_build_object('milestone', v_mark, 'task_id', v_task, 'scheduled', true));
    if v_new then
      insert into public.fin_notifications(organization_id, user_id, event_type, object_type, object_id, event_id, title, body)
      values (c.organization_id, c.owner_id, 'renewal_due', 'contract', c.id, v_task, 'Contrato em revisão de renovação',
        'Há um marco de renovação para acompanhar.')
      on conflict (user_id, event_type, event_id) do nothing;
      v_created := v_created + 1;
    end if;
    if v_days <= c.renewal_notice_days and c.status = 'active' then
      update public.fin_contracts set status = 'renewing', updated_at = now() where id = c.id;
    end if;
  end loop;
  return v_created;
end $$;
revoke all on function public.fin_run_renewal_schedule(date) from public, anon, authenticated;
grant execute on function public.fin_run_renewal_schedule(date) to service_role;
