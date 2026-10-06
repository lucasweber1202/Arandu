-- Reverte docs/supabase-financial-multi-entity.sql.
-- Entidades legais, concessões por entidade e o escopo de entidade gravado em
-- RFQs, contratos, tarefas e eventos são removidos com as colunas/tabelas; faça
-- backup antes (npm run pilot:restore:drill descreve o procedimento seguro).
-- Todo membro volta a ler tudo da organização (comportamento anterior).

-- Funções e gatilhos novos.
drop trigger if exists fin_rfqs_entity_guard on public.fin_rfqs;
drop trigger if exists fin_contracts_entity_guard on public.fin_contracts;
drop trigger if exists fin_decisions_entity_guard on public.fin_decisions;
drop trigger if exists fin_approval_requests_entity_guard on public.fin_approval_requests;
drop trigger if exists fin_rfq_invites_entity_guard on public.fin_rfq_invites;
drop trigger if exists fin_approval_steps_entity_guard on public.fin_approval_steps;
drop trigger if exists fin_tasks_entity_guard on public.fin_tasks;
drop trigger if exists fin_comments_entity_guard on public.fin_comments;
drop trigger if exists fin_private_documents_entity_guard on public.fin_private_documents;
drop trigger if exists fin_events_entity_stamp on public.fin_events;
drop function if exists public.fin_rfq_entity_guard();
drop function if exists public.fin_contract_entity_guard();
drop function if exists public.fin_rfq_child_entity_guard();
drop function if exists public.fin_approval_step_entity_guard();
drop function if exists public.fin_task_entity_guard();
drop function if exists public.fin_comment_entity_guard();
drop function if exists public.fin_document_entity_guard();
drop function if exists public.fin_event_entity_stamp();
drop function if exists public.fin_create_legal_entity(uuid, text, text, text, text, text, text, uuid);
drop function if exists public.fin_update_legal_entity(uuid, text, text, text, text);
drop function if exists public.fin_set_base_currency(uuid, text);
drop function if exists public.fin_set_member_entity_scope(uuid, uuid, text, uuid[]);
drop function if exists public.fin_create_rfq_in_entity(uuid, uuid, text, text, text, jsonb, date, jsonb);
drop function if exists public.fin_set_rfq_entity(uuid, uuid);
drop function if exists public.fin_assign_contract_entity(uuid, uuid);

-- Policies anteriores (texto idêntico ao das migrations de origem).
drop policy if exists fin_rfq_read on public.fin_rfqs;
create policy fin_rfq_read on public.fin_rfqs for select to authenticated
  using (
    public.fin_has_role(organization_id)
    or exists (select 1 from public.fin_rfq_invites i
               where i.rfq_id = fin_rfqs.id and i.status = 'accepted'
                 and i.provider_organization_id is not null
                 and public.fin_has_role(i.provider_organization_id))
  );
drop policy if exists fin_invite_read on public.fin_rfq_invites;
create policy fin_invite_read on public.fin_rfq_invites for select to authenticated
  using (
    public.fin_has_role(buyer_organization_id)
    or (provider_organization_id is not null and public.fin_has_role(provider_organization_id))
  );
drop policy if exists fin_proposal_read on public.fin_proposals;
create policy fin_proposal_read on public.fin_proposals for select to authenticated
  using (public.fin_has_role(buyer_organization_id) or public.fin_has_role(provider_organization_id));
drop policy if exists fin_proposal_version_read on public.fin_proposal_versions;
create policy fin_proposal_version_read on public.fin_proposal_versions for select to authenticated
  using (exists (select 1 from public.fin_proposals p
                 where p.id = fin_proposal_versions.proposal_id
                   and (public.fin_has_role(p.buyer_organization_id) or public.fin_has_role(p.provider_organization_id))));
drop policy if exists fin_decision_read on public.fin_decisions;
create policy fin_decision_read on public.fin_decisions for select to authenticated
  using (public.fin_has_role(organization_id));
drop policy if exists fin_contract_read on public.fin_contracts;
create policy fin_contract_read on public.fin_contracts for select to authenticated
  using (public.fin_has_role(organization_id));
drop policy if exists fin_approval_request_read on public.fin_approval_requests;
create policy fin_approval_request_read on public.fin_approval_requests for select to authenticated
  using (public.fin_has_role(organization_id));
drop policy if exists fin_approval_step_read on public.fin_approval_steps;
create policy fin_approval_step_read on public.fin_approval_steps for select to authenticated
  using (exists (select 1 from public.fin_approval_requests r where r.id = request_id and public.fin_has_role(r.organization_id)));
drop policy if exists fin_rfq_revision_read on public.fin_rfq_revisions;
create policy fin_rfq_revision_read on public.fin_rfq_revisions for select to authenticated
 using(public.fin_has_role(organization_id) or public.fin_provider_can_comment('rfq',rfq_id));
drop policy if exists fin_rfq_profile_snapshot_read on public.fin_rfq_profile_snapshots;
create policy fin_rfq_profile_snapshot_read on public.fin_rfq_profile_snapshots for select to authenticated
  using (public.fin_has_role(organization_id));
drop policy if exists fin_renewal_read on public.fin_renewal_milestones;
create policy fin_renewal_read on public.fin_renewal_milestones for select to authenticated using(public.fin_has_role(organization_id));
drop policy if exists fin_task_read on public.fin_tasks;
create policy fin_task_read on public.fin_tasks for select to authenticated
  using (public.fin_has_role(organization_id));
drop policy if exists fin_task_edit on public.fin_tasks;
create policy fin_task_edit on public.fin_tasks for update to authenticated
  using (public.fin_has_role(organization_id, array['admin','finance_manager','analyst']))
  with check (public.fin_has_role(organization_id, array['admin','finance_manager','analyst']));
drop policy if exists fin_event_read on public.fin_events;
create policy fin_event_read on public.fin_events for select to authenticated
  using (public.fin_has_role(organization_id));
drop policy if exists fin_comment_read on public.fin_comments;
create policy fin_comment_read on public.fin_comments for select to authenticated using (
  public.fin_has_role(organization_id)
  or (visibility = 'provider_visible' and public.fin_provider_reads_comment(organization_id, author_id, object_type, object_id))
);

-- Funções substituídas voltam à versão anterior.
create or replace function public.fin_comment_authors(p_type text, p_id uuid)
returns table(author_id uuid, display_name text, organization_name text, organization_kind text)
language sql stable security definer set search_path = '' as $$
  select distinct on (c.author_id) c.author_id, m.display_name, o.legal_name, o.kind
    from public.fin_comments c
    join public.fin_members m on m.user_id = c.author_id
    join public.fin_organizations o on o.id = m.organization_id
   where c.object_type = p_type and c.object_id = p_id
     and (public.fin_has_role(c.organization_id)
          or (c.visibility = 'provider_visible' and public.fin_provider_reads_comment(c.organization_id, c.author_id, c.object_type, c.object_id)))
   order by c.author_id, (m.organization_id = c.organization_id) desc, m.created_at;
$$;
create or replace function public.fin_can_read_document(p_document uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.fin_private_documents d
     where d.id = p_document and d.removed_at is null and (
       public.fin_has_role(d.organization_id)
       or (d.visibility = 'shared' and d.organization_id = d.buyer_organization_id and d.rfq_id is not null
           and public.fin_provider_can_comment('rfq', d.rfq_id))
       or (d.visibility = 'shared' and d.organization_id <> d.buyer_organization_id and public.fin_has_role(d.buyer_organization_id))
     ));
$$;
create or replace function public.fin_search(p_org uuid,p_query text,p_kind text default null,p_limit integer default 12,p_offset integer default 0)
returns table(kind text,id uuid,title text,detail text,href text)
language plpgsql stable security definer set search_path = '' as $$
declare v_query text;
begin
 if not public.fin_has_role(p_org,array['admin','finance_manager','analyst','viewer']) then raise exception 'forbidden'; end if;
 v_query:=lower(trim(coalesce(p_query,'')));
 if length(v_query) not between 2 and 100 or p_limit not between 1 and 30 or p_offset not between 0 and 1000
 or (p_kind is not null and p_kind not in ('rfq','proposal','provider','contract','task')) then
  raise exception 'invalid search'; end if;
 return query
 select x.kind,x.id,x.title,x.detail,x.href from (
  select 'rfq'::text kind,r.id,r.title::text,coalesce(r.status,'')::text detail,
    ('/finance/rfq.html?id='||r.id)::text href, 1 priority,r.created_at sorted_at
  from public.fin_rfqs r where r.organization_id=p_org and (p_kind is null or p_kind='rfq')
    and (position(v_query in lower(r.title))>0 or position(v_query in lower(r.id::text))>0)
  union all
  select 'proposal'::text,p.id,coalesce(v.name,'Proposta')::text,r.title::text,
    ('/finance/rfq.html?id='||r.id)::text,2,p.updated_at
  from public.fin_proposals p join public.fin_rfqs r on r.id=p.rfq_id and r.organization_id=p_org
   left join public.fin_providers v on v.id=p.provider_id and v.organization_id=p_org
  where p.buyer_organization_id=p_org and (p_kind is null or p_kind='proposal')
   and (position(v_query in lower(coalesce(v.name,'')))>0 or position(v_query in lower(r.title))>0 or position(v_query in lower(p.id::text))>0)
  union all
  select 'provider'::text,v.id,v.name::text,coalesce(v.region,'')::text,
    '/finance/providers.html'::text,3,v.created_at
  from public.fin_providers v where v.organization_id=p_org and (p_kind is null or p_kind='provider')
   and (position(v_query in lower(v.name))>0 or position(v_query in lower(v.id::text))>0)
  union all
  select 'contract'::text,c.id,coalesce(v.name,'Contrato')::text,c.ends_on::text,
    '/finance/contracts.html'::text,4,c.created_at
  from public.fin_contracts c left join public.fin_providers v on v.id=c.provider_id and v.organization_id=p_org
  where c.organization_id=p_org and (p_kind is null or p_kind='contract')
   and (position(v_query in lower(coalesce(v.name,'')))>0 or position(v_query in lower(c.id::text))>0)
  union all
  select 'task'::text,t.id,t.title::text,coalesce(t.due_on::text,'')::text,
    '/finance/dashboard.html'::text,5,t.created_at
  from public.fin_tasks t where t.organization_id=p_org and (p_kind is null or p_kind='task')
   and (position(v_query in lower(t.title))>0 or position(v_query in lower(t.id::text))>0)
 ) x order by x.priority,x.sorted_at desc,x.id limit p_limit offset p_offset;
end $$;
create or replace function public.fin_process_renewals(p_org uuid,p_day date default current_date)
returns integer language plpgsql security definer set search_path = '' as $$
declare c record;v_days integer;v_mark text;v_due date;v_task uuid;v_count integer:=0;v_inserted integer;
begin
 if not public.fin_has_role(p_org,array['admin','finance_manager']) then raise exception 'forbidden'; end if;
 if p_day is null or abs(p_day-current_date)>1 then raise exception 'invalid date'; end if;
 for c in select id,owner_id,ends_on,renewal_notice_days,status from public.fin_contracts
   where organization_id=p_org and status in ('active','renewing','expired') and ends_on<=p_day+180
   order by ends_on,id for update
 loop
  v_days:=c.ends_on-p_day;
  v_mark:=case when v_days<=0 then 'expired' when v_days<=7 then 'd7'
    when v_days<=30 then 'd30' when v_days<=60 then 'd60'
    when v_days<=90 then 'd90' when v_days<=120 then 'd120' else 'd180' end;
  v_due:=case when v_days<=0 then p_day else c.ends_on end;
  if exists(select 1 from public.fin_renewal_milestones where contract_id=c.id and milestone=v_mark) then continue; end if;
  insert into public.fin_tasks(organization_id,title,due_on,status,related_type,related_id,created_by)
   values(p_org,case when v_days<=0 then 'Revisar contrato vencido' else 'Revisar renovação de contrato' end,
    v_due,'open','contract',c.id,auth.uid()) returning id into v_task;
  insert into public.fin_renewal_milestones(organization_id,contract_id,milestone,task_id)
   values(p_org,c.id,v_mark,v_task) on conflict(contract_id,milestone) do nothing;
  get diagnostics v_inserted=row_count;
  if v_inserted=0 then delete from public.fin_tasks where id=v_task; continue; end if;
  insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,metadata)
   values(p_org,'contract',c.id,'renewal_task_created',auth.uid(),jsonb_build_object('milestone',v_mark,'task_id',v_task));
  if c.owner_id<>auth.uid() then
   insert into public.fin_notifications(organization_id,user_id,event_type,object_type,object_id,event_id,title,body)
    values(p_org,c.owner_id,'renewal_due','contract',c.id,v_task,'Contrato em revisão','Há uma tarefa de renovação para acompanhar.')
    on conflict(user_id,event_type,event_id) do nothing;
  end if;
  if v_days<=c.renewal_notice_days and c.status='active' then
   update public.fin_contracts set status='renewing',updated_at=now() where id=c.id;
  end if;
  v_count:=v_count+1;
 end loop;
 return v_count;
end $$;

create or replace function public.fin_start_contract_rfq(p_contract uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c record;v_id uuid;
begin
 select ct.organization_id,ct.product,ct.id,r.title,r.description,r.demand into c
 from public.fin_contracts ct join public.fin_decisions d on d.id=ct.decision_id
 join public.fin_rfqs r on r.id=d.rfq_id and r.organization_id=ct.organization_id
 where ct.id=p_contract for update of ct;
 if not found then raise exception 'contract not found'; end if;
 if not public.fin_has_role(c.organization_id,array['admin','finance_manager']) then raise exception 'forbidden'; end if;
 insert into public.fin_rfqs(organization_id,product,title,description,demand,owner_id,status)
 values(c.organization_id,c.product,left('Renovação: '||c.title,200),c.description,c.demand,auth.uid(),'draft')
 returning id into v_id;
 insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,metadata)
 values(c.organization_id,'contract',c.id,'renewal_rfq_started',auth.uid(),jsonb_build_object('rfq_id',v_id));
 insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,metadata)
 values(c.organization_id,'rfq',v_id,'rfq_created_from_contract',auth.uid(),jsonb_build_object('contract_id',c.id));
 return v_id;
end $$;
revoke all on function public.fin_process_renewals(uuid,date),public.fin_start_contract_rfq(uuid) from public,anon;
grant execute on function public.fin_process_renewals(uuid,date),public.fin_start_contract_rfq(uuid) to authenticated,service_role;

-- Colunas e tabelas.
drop index if exists public.fin_rfqs_entity_idx;
drop index if exists public.fin_contracts_entity_idx;
drop index if exists public.fin_tasks_entity_idx;
drop index if exists public.fin_events_entity_idx;
alter table public.fin_rfqs drop constraint if exists fin_rfqs_legal_entity_fk;
alter table public.fin_contracts drop constraint if exists fin_contracts_legal_entity_fk;
alter table public.fin_tasks drop constraint if exists fin_tasks_legal_entity_fk;
alter table public.fin_rfqs drop column if exists legal_entity_id;
alter table public.fin_contracts drop column if exists legal_entity_id;
alter table public.fin_tasks drop column if exists legal_entity_id;
alter table public.fin_events drop column if exists legal_entity_id;
drop table if exists public.fin_member_entity_grants;
drop table if exists public.fin_legal_entities;
alter table public.fin_members drop constraint if exists fin_members_admin_group_scope;
alter table public.fin_members drop constraint if exists fin_members_entity_scope_check;
alter table public.fin_members drop column if exists entity_scope;
alter table public.fin_organizations drop constraint if exists fin_organizations_base_currency_check;
alter table public.fin_organizations drop column if exists base_currency;

-- Auxiliares de escopo (sem dependentes agora).
drop function if exists public.fin_rfq_visible(uuid);
drop function if exists public.fin_contract_visible(uuid);
drop function if exists public.fin_object_visible(uuid, text, uuid);
drop function if exists public.fin_object_legal_entity(text, uuid);
drop function if exists public.fin_assert_entity_write(uuid, uuid);
drop function if exists public.fin_entity_visible(uuid, uuid);
drop function if exists public.fin_entity_allows(uuid, uuid, text[]);
drop function if exists public.fin_entity_scope(uuid);

insert into public.fin_settings (key, value) values ('schema_version', 'financial-passport-1')
on conflict (key) do update set value = excluded.value, updated_at = now();
