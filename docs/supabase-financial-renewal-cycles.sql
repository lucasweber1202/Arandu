-- Ciclos de renovação (QA adversarial de 14/10/2026, defeito D1).
--
-- Um aditivo que prorroga o contrato (novo fim) quebrava o ciclo de renovação:
--
-- 1. Os marcos de renovação eram únicos por (contrato, marco). Depois da
--    prorrogação, os marcos d90/d60/d30/aviso/expirado do ciclo anterior já
--    existiam e a agenda diária nunca mais avisava sobre o NOVO vencimento: o
--    contrato prorrogado chegava ao fim sem tarefa nem aviso de renovação.
-- 2. O contrato continuava "em renovação" e a tarefa "Revisar renovação"
--    continuava vencendo na data antiga, com o fim um ano adiante.
--
-- Correção: cada marco pertence a um ciclo (cycle_ends_on = fim do contrato
-- quando o marco foi atingido) e a unicidade passa a ser (contrato, ciclo,
-- marco). Os marcos existentes são evidência imutável (AUDIT_EVIDENCE) e ficam
-- como estão; recebem o ciclo em que foram atingidos (o fim anterior ao
-- primeiro aditivo de datas posterior a eles; sem aditivo, o fim atual). O
-- aditivo que muda fim ou aviso prévio recalcula o status (mesma regra do
-- registro do contrato existente) e move o prazo da tarefa de revisão aberta.
--
-- Aditiva e idempotente; mesmas assinaturas e concessões. Rollback em
-- docs/rollback/supabase-financial-renewal-cycles.rollback.sql (recusado quando
-- algum contrato já tem marcos em mais de um ciclo: o histórico não é apagado).
begin;

alter table public.fin_renewal_milestones add column if not exists cycle_ends_on date;
update public.fin_renewal_milestones m set cycle_ends_on = coalesce(
    (select a.previous_ends_on from public.fin_contract_amendments a
      where a.contract_id = m.contract_id and a.new_ends_on is not null and a.new_ends_on is distinct from a.previous_ends_on
        and a.recorded_at > m.triggered_at
      order by a.recorded_at, a.number limit 1),
    (select c.ends_on from public.fin_contracts c where c.id = m.contract_id))
  where m.cycle_ends_on is null;
alter table public.fin_renewal_milestones alter column cycle_ends_on set not null;

-- Quem grava marco sem informar o ciclo (definição antiga, ferramenta) usa o fim atual.
create or replace function public.fin_renewal_milestone_cycle()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.cycle_ends_on is null then
    select c.ends_on into new.cycle_ends_on from public.fin_contracts c where c.id = new.contract_id;
  end if;
  return new;
end $$;
revoke all on function public.fin_renewal_milestone_cycle() from public, anon, authenticated;
drop trigger if exists fin_renewal_milestones_cycle on public.fin_renewal_milestones;
create trigger fin_renewal_milestones_cycle before insert on public.fin_renewal_milestones
  for each row execute function public.fin_renewal_milestone_cycle();

create unique index if not exists fin_renewal_milestones_cycle_key
  on public.fin_renewal_milestones(contract_id, cycle_ends_on, milestone);
alter table public.fin_renewal_milestones drop constraint if exists fin_renewal_milestones_contract_id_milestone_key;

-- Agenda diária (job): o marco é do ciclo atual do contrato.
create or replace function public.fin_run_renewal_schedule(p_day date default current_date)
returns integer language plpgsql security definer set search_path = '' as $$
declare c record; v_days integer; v_mark text; v_task uuid; v_created integer := 0; v_milestone uuid; v_new boolean;
begin
  if p_day is null or abs(p_day - current_date) > 1 then raise exception 'invalid date'; end if;
  if not pg_try_advisory_xact_lock(hashtext('fin_run_renewal_schedule')) then raise exception using errcode='55P03', message='job busy'; end if;
  for c in select id, organization_id, owner_id, ends_on, renewal_notice_days, status from public.fin_contracts ct
    where status in ('active','renewing') and ends_on <= p_day + greatest(90, renewal_notice_days)
    and not exists (select 1 from public.fin_renewal_milestones rm where rm.contract_id=ct.id and rm.cycle_ends_on=ct.ends_on and rm.milestone =
      case when ct.ends_on <= p_day then 'expired' else
        (select m.mark from (values ('notice',ct.renewal_notice_days,0),('d30',30,1),('d60',60,1),('d90',90,1)) m(mark,threshold,tiebreak)
          where ct.ends_on-p_day <= m.threshold order by m.threshold,m.tiebreak limit 1) end)
    order by ends_on, id limit 100 for update skip locked
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
    if exists (select 1 from public.fin_renewal_milestones where contract_id = c.id and cycle_ends_on = c.ends_on and milestone = v_mark) then continue; end if;
    select id into v_task from public.fin_tasks where organization_id = c.organization_id and related_type = 'contract'
      and related_id = c.id and status = 'open' order by created_at limit 1;
    v_new := v_task is null;
    if v_new then
      insert into public.fin_tasks(organization_id, title, due_on, status, related_type, related_id, created_by)
      values (c.organization_id, case when v_days <= 0 then 'Revisar contrato vencido' else 'Revisar renovação de contrato' end,
        least(c.ends_on - c.renewal_notice_days, c.ends_on), 'open', 'contract', c.id, c.owner_id)
      returning id into v_task;
    end if;
    insert into public.fin_renewal_milestones(organization_id, contract_id, milestone, task_id, cycle_ends_on)
    values (c.organization_id, c.id, v_mark, v_task, c.ends_on) on conflict (contract_id, cycle_ends_on, milestone) do nothing
    returning id into v_milestone;
    if v_milestone is null then
      if v_new then delete from public.fin_tasks where id = v_task; end if;
      continue;
    end if;
    insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (c.organization_id, 'contract', c.id, 'renewal_milestone_reached', null,
      jsonb_build_object('milestone', v_mark, 'task_id', v_task, 'scheduled', true));
    -- Um aviso por marco novo (chave = marco), com ou sem tarefa nova: o contrato
    -- registrado pelo produto já nasce com a tarefa de revisão aberta.
    insert into public.fin_notifications(organization_id, user_id, event_type, object_type, object_id, event_id, title, body)
    values (c.organization_id, c.owner_id, 'renewal_due', 'contract', c.id, v_milestone, 'Contrato em revisão de renovação',
      case v_mark when 'expired' then 'O contrato chegou ao fim. Registre a decisão de renovação.'
                  when 'notice' then 'O prazo de aviso prévio do contrato chegou.'
                  else 'Faltam ' || substr(v_mark, 2) || ' dias para o fim do contrato.' end)
    on conflict (user_id, event_type, event_id) do nothing;
    if v_new then v_created := v_created + 1; end if;
    if v_days <= c.renewal_notice_days and c.status = 'active' then
      update public.fin_contracts set status = 'renewing', updated_at = now() where id = c.id;
    end if;
  end loop;
  return v_created;
end $$;

-- Processamento pela organização: mesma regra de ciclo.
create or replace function public.fin_process_renewals(p_org uuid,p_day date default current_date)
returns integer language plpgsql security definer set search_path = '' as $$
declare c record;v_days integer;v_mark text;v_due date;v_task uuid;v_count integer:=0;v_inserted integer;
begin
 if not public.fin_has_role(p_org,array['admin','finance_manager']) then raise exception 'forbidden'; end if;
 if p_day is null or abs(p_day-current_date)>1 then raise exception 'invalid date'; end if;
 for c in select id,owner_id,ends_on,renewal_notice_days,status from public.fin_contracts
   where organization_id=p_org and status in ('active','renewing','expired') and ends_on<=p_day+180
     and public.fin_entity_visible(p_org,legal_entity_id)
   order by ends_on,id for update
 loop
  v_days:=c.ends_on-p_day;
  v_mark:=case when v_days<=0 then 'expired' when v_days<=7 then 'd7'
    when v_days<=30 then 'd30' when v_days<=60 then 'd60'
    when v_days<=90 then 'd90' when v_days<=120 then 'd120' else 'd180' end;
  v_due:=case when v_days<=0 then p_day else c.ends_on end;
  if exists(select 1 from public.fin_renewal_milestones where contract_id=c.id and cycle_ends_on=c.ends_on and milestone=v_mark) then continue; end if;
  insert into public.fin_tasks(organization_id,title,due_on,status,related_type,related_id,created_by)
   values(p_org,case when v_days<=0 then 'Revisar contrato vencido' else 'Revisar renovação de contrato' end,
    v_due,'open','contract',c.id,auth.uid()) returning id into v_task;
  insert into public.fin_renewal_milestones(organization_id,contract_id,milestone,task_id,cycle_ends_on)
   values(p_org,c.id,v_mark,v_task,c.ends_on) on conflict(contract_id,cycle_ends_on,milestone) do nothing;
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

-- Aditivo: novo fim ou novo aviso prévio recalcula status e próxima ação.
create or replace function public.fin_record_contract_amendment(
  p_contract uuid, p_title text, p_effective_from date, p_signed_on date default null, p_summary text default null,
  p_terms jsonb default null, p_new_ends_on date default null, p_new_notice_days integer default null,
  p_document uuid default null, p_expected integer default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v public.fin_contracts%rowtype; v_id uuid; v_number integer; v_version integer;
  v_ends date; v_notice integer; v_review date; v_status text;
begin
  v := public.fin_contract_for_write(p_contract);
  if v.status not in ('active','renewing') then raise exception 'invalid state'; end if;
  if p_effective_from is null or p_effective_from < v.starts_on then raise exception 'invalid period'; end if;
  if p_new_ends_on is not null and p_new_ends_on < v.starts_on then raise exception 'invalid period'; end if;
  if p_new_notice_days is not null and p_new_notice_days not between 0 and 3650 then raise exception 'invalid period'; end if;
  if p_terms is not null and p_expected is distinct from v.current_version then raise exception 'contract version conflict'; end if;
  if p_terms is not null and not public.fin_valid_contract_terms(p_terms) then raise exception 'invalid contract terms'; end if;
  if p_terms is null and p_new_ends_on is null and p_new_notice_days is null and length(trim(coalesce(p_summary,''))) < 3 then
    raise exception 'empty amendment';
  end if;
  if p_document is not null and not exists (select 1 from public.fin_private_documents d where d.id = p_document
       and d.organization_id = v.organization_id and d.entity_type = 'contract' and d.entity_id = v.id and d.removed_at is null) then
    raise exception 'invalid document';
  end if;
  select coalesce(max(number), 0) + 1 into v_number from public.fin_contract_amendments where contract_id = v.id;
  insert into public.fin_contract_amendments(organization_id, contract_id, number, title, signed_on, effective_from, summary,
      previous_ends_on, new_ends_on, previous_notice_days, new_notice_days, document_id, recorded_by)
    values (v.organization_id, v.id, v_number, trim(p_title), p_signed_on, p_effective_from, nullif(trim(coalesce(p_summary,'')),''),
      v.ends_on, p_new_ends_on, v.renewal_notice_days, p_new_notice_days, p_document, auth.uid())
    returning id into v_id;
  if p_terms is not null then
    v_version := v.current_version + 1;
    insert into public.fin_contract_versions(contract_id, organization_id, version, effective_from, source, amendment_id, terms, recorded_by)
      values (v.id, v.organization_id, v_version, p_effective_from, 'amendment', v_id, p_terms, auth.uid());
  end if;
  update public.fin_contracts set
      ends_on = coalesce(p_new_ends_on, ends_on),
      renewal_notice_days = coalesce(p_new_notice_days, renewal_notice_days),
      current_version = coalesce(v_version, current_version),
      terms_updated_at = case when v_version is null then terms_updated_at else now() end,
      currency = coalesce(p_terms->>'currency', currency),
      updated_at = now()
    where id = v.id;
  -- Novo fim ou novo aviso prévio: o status e a próxima ação acompanham o novo
  -- ciclo, como no registro do contrato existente. Os marcos do ciclo anterior
  -- ficam como histórico; os do novo ciclo voltam a disparar (cycle_ends_on).
  v_ends := coalesce(p_new_ends_on, v.ends_on);
  v_notice := coalesce(p_new_notice_days, v.renewal_notice_days);
  v_status := v.status;
  if v_ends is distinct from v.ends_on or v_notice is distinct from v.renewal_notice_days then
    v_review := v_ends - v_notice;
    v_status := case when v_ends >= current_date and v_review <= current_date then 'renewing'
                     when v_review > current_date then 'active' else v.status end;
    if v_status is distinct from v.status then
      update public.fin_contracts set status = v_status, updated_at = now() where id = v.id;
    end if;
    update public.fin_tasks t set due_on = greatest(v_review, current_date),
        title = case when t.title = 'Revisar contrato vencido' and v_ends >= current_date then 'Revisar renovação de contrato' else t.title end
      where t.organization_id = v.organization_id and t.related_type = 'contract' and t.related_id = v.id and t.status = 'open'
        and (t.title in ('Revisar renovação do contrato antes do aviso prévio', 'Revisar renovação de contrato', 'Revisar contrato vencido')
             or t.id in (select m.task_id from public.fin_renewal_milestones m where m.contract_id = v.id));
  end if;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (v.organization_id, 'contract', v.id, 'contract_amended', auth.uid(),
      jsonb_build_object('amendment', v_number, 'terms_version', v_version, 'dates_changed', p_new_ends_on is not null or p_new_notice_days is not null,
        'status_before', v.status, 'status_after', v_status));
  return v_id;
exception when check_violation then raise exception 'invalid amendment';
end $$;

revoke all on function public.fin_run_renewal_schedule(date) from public, anon, authenticated;
grant execute on function public.fin_run_renewal_schedule(date) to service_role;
revoke all on function public.fin_process_renewals(uuid, date) from public, anon;
grant execute on function public.fin_process_renewals(uuid, date) to authenticated, service_role;
revoke all on function public.fin_record_contract_amendment(uuid, text, date, date, text, jsonb, date, integer, uuid, integer) from public, anon;
grant execute on function public.fin_record_contract_amendment(uuid, text, date, date, text, jsonb, date, integer, uuid, integer) to authenticated, service_role;

insert into public.fin_settings (key, value) values ('schema_version', 'financial-renewal-cycles-1')
on conflict (key) do update set value = excluded.value, updated_at = now();

commit;
