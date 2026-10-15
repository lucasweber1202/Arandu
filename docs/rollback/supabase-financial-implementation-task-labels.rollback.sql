-- Restaura a geração anterior somente sem planos existentes. Os títulos já
-- localizados são conteúdo preservado; rollback não reverte texto de usuário.
begin;
do $$ begin
  if exists(select 1 from public.fin_implementation_plans) then
    raise exception 'implementation data exists: use forward fix';
  end if;
end $$;

create or replace function public.fin_open_implementation(p_contract uuid,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.fin_contracts%rowtype; v_id uuid; v_owner uuid; v_contact uuid; v_kind text; v_i integer:=0; v_prev uuid; v_mid uuid; v_task uuid; v_kinds text[];
begin
 select * into c from public.fin_contracts where id=p_contract for update;
 if c.id is null or auth.uid() is null or not public.fin_entity_allows(c.organization_id,c.legal_entity_id,array['admin','finance_manager']) or not exists(select 1 from public.fin_organizations where id=c.organization_id and kind='BUYER') then raise exception 'forbidden'; end if;
 if public.fin_governance_org_locked(c.organization_id) then raise exception 'organization offboarding'; end if;
 if c.status not in ('active','renewing') then raise exception 'implementation contract inactive'; end if;
 if p_input is null or jsonb_typeof(p_input)<>'object' or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('title','owner_id','provider_owner_contact_id','starts_on','target_go_live','source_reference')) then raise exception 'invalid implementation input'; end if;
 if exists(select 1 from public.fin_implementation_plans where contract_id=c.id) then raise exception 'implementation already exists'; end if;
 v_owner:=coalesce(nullif(p_input->>'owner_id','')::uuid,auth.uid()); v_contact:=nullif(p_input->>'provider_owner_contact_id','')::uuid;
 if not public.fin_implementation_owner_valid(c.organization_id,c.legal_entity_id,v_owner) then raise exception 'invalid implementation owner'; end if;
 if v_contact is not null and not exists(select 1 from public.fin_provider_contacts where id=v_contact and organization_id=c.organization_id and provider_id=c.provider_id and (legal_entity_id is null or legal_entity_id is not distinct from c.legal_entity_id)) then raise exception 'invalid implementation owner'; end if;
 if c.product='credit' then v_kinds:=array['documentation','legal_review','signing','conditions_precedent','collateral','guarantees','facility_setup','availability_confirmation','drawdown_readiness','go_live'];
 elsif c.product='acquiring' then v_kinds:=array['commercial_setup','credentials','integration','establishments','homologation','pricing_activation','settlement_validation','go_live'];
 else v_kinds:=array['kickoff','documentation','configuration','validation','go_live']; end if;
 insert into public.fin_implementation_plans(organization_id,legal_entity_id,provider_id,contract_id,decision_id,product,title,owner_id,provider_owner_contact_id,starts_on,target_go_live,template_version,source_reference,created_by)
 values(c.organization_id,c.legal_entity_id,c.provider_id,c.id,c.decision_id,c.product,trim(p_input->>'title'),v_owner,v_contact,(p_input->>'starts_on')::date,(p_input->>'target_go_live')::date,c.product||':v1',trim(p_input->>'source_reference'),auth.uid()) returning id into v_id;
 foreach v_kind in array v_kinds loop
  v_i:=v_i+1;
  insert into public.fin_tasks(organization_id,title,due_on,related_type,related_id,created_by) values(c.organization_id,'Implantação: '||replace(v_kind,'_',' '),(p_input->>'target_go_live')::date,'contract',c.id,auth.uid()) returning id into v_task;
  insert into public.fin_implementation_milestones(organization_id,plan_id,position,kind,title,owner_id,due_on,task_id) values(c.organization_id,v_id,v_i,v_kind,replace(v_kind,'_',' '),v_owner,(p_input->>'target_go_live')::date,v_task) returning id into v_mid;
  if v_prev is not null then insert into public.fin_implementation_dependencies values(c.organization_id,v_id,v_mid,v_prev); end if; v_prev:=v_mid;
 end loop;
 insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,legal_entity_id,metadata) values(c.organization_id,'contract',c.id,'implementation_opened',auth.uid(),c.legal_entity_id,jsonb_build_object('implementation_id',v_id,'milestones',v_i));
 insert into public.fin_notifications(organization_id,user_id,event_type,object_type,object_id,event_id,title,body) values(c.organization_id,v_owner,'task_assigned','contract',c.id,v_id,'Implantação atribuída','Consulte os marcos e prazos do contrato.');
 return v_id;
end $$;
revoke all on function public.fin_open_implementation(uuid,jsonb) from public,anon;
grant execute on function public.fin_open_implementation(uuid,jsonb) to authenticated;
drop function public.fin_implementation_milestone_label(text);
update public.fin_settings set value='financial-document-upload-authorization-1',updated_at=now()
where key='schema_version' and value='financial-implementation-task-labels-1';
commit;
