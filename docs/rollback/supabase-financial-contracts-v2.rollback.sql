-- Reverte docs/supabase-financial-contracts-v2.sql.
-- Versões de termos, aditivos e marcos são removidos com as tabelas; faça
-- backup antes (npm run pilot:restore:drill). Contrato importado (sem RFQ) não
-- cabe no schema anterior: o rollback ABORTA se existir algum, para não apagar
-- carteira do cliente em silêncio. Trate esses contratos antes (export) e repita.
do $$
begin
  if exists (select 1 from public.fin_contracts where origin = 'imported' or product not in ('credit','acquiring')) then
    raise exception 'rollback abortado: existem contratos importados; exporte e trate antes';
  end if;
end $$;

drop function if exists public.fin_run_contract_milestones(date);
drop function if exists public.fin_process_contract_milestones(uuid, date);
drop function if exists public.fin_settle_contract_milestone(uuid, text);
drop function if exists public.fin_create_contract_milestone(uuid, text, text, date, integer, text, date, uuid);
drop function if exists public.fin_record_contract_amendment(uuid, text, date, date, text, jsonb, date, integer, uuid, integer);
drop function if exists public.fin_record_contract_terms(uuid, jsonb, integer, text, date);
drop function if exists public.fin_import_contract(uuid, uuid, uuid, text, text, date, date, integer, boolean, text, jsonb, uuid);
drop function if exists public.fin_contract_for_write(uuid);

-- Versão anterior (multi-entity) da nova RFQ a partir do contrato.
-- A renovação a partir do contrato herda a entidade do contrato.
create or replace function public.fin_start_contract_rfq(p_contract uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c record;v_id uuid;
begin
 select ct.organization_id,ct.product,ct.id,ct.legal_entity_id,r.title,r.description,r.demand into c
 from public.fin_contracts ct join public.fin_decisions d on d.id=ct.decision_id
 join public.fin_rfqs r on r.id=d.rfq_id and r.organization_id=ct.organization_id
 where ct.id=p_contract for update of ct;
 if not found then raise exception 'contract not found'; end if;
 if not public.fin_entity_allows(c.organization_id,c.legal_entity_id,array['admin','finance_manager']) then raise exception 'forbidden'; end if;
 insert into public.fin_rfqs(organization_id,product,title,description,demand,owner_id,status,legal_entity_id)
 values(c.organization_id,c.product,left('Renovação: '||c.title,200),c.description,c.demand,auth.uid(),'draft',c.legal_entity_id)
 returning id into v_id;
 insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,metadata)
 values(c.organization_id,'contract',c.id,'renewal_rfq_started',auth.uid(),jsonb_build_object('rfq_id',v_id));
 insert into public.fin_events(organization_id,entity_type,entity_id,event_type,actor_id,metadata)
 values(c.organization_id,'rfq',v_id,'rfq_created_from_contract',auth.uid(),jsonb_build_object('contract_id',c.id));
 return v_id;
end $$;

revoke all on function public.fin_start_contract_rfq(uuid) from public, anon;
grant execute on function public.fin_start_contract_rfq(uuid) to authenticated, service_role;

-- Tarefas geradas por marcos continuam (são tarefas comuns); só o vínculo some.
drop table if exists public.fin_contract_milestone_runs;
drop table if exists public.fin_contract_milestones;
alter table public.fin_contract_versions drop constraint if exists fin_contract_versions_amendment_fk;
drop table if exists public.fin_contract_versions;
drop table if exists public.fin_contract_amendments;
drop function if exists public.fin_valid_contract_terms(jsonb);

drop index if exists public.fin_contracts_parent_idx;
alter table public.fin_contracts drop constraint if exists fin_contracts_not_own_parent;
alter table public.fin_contracts drop constraint if exists fin_contracts_parent_fk;
alter table public.fin_contracts drop constraint if exists fin_contracts_sourcing_origin;
alter table public.fin_contracts drop constraint if exists fin_contracts_product_check;
alter table public.fin_contracts add constraint fin_contracts_product_check check (product in ('credit','acquiring'));
alter table public.fin_contracts alter column decision_id set not null;
alter table public.fin_contracts alter column proposal_id set not null;
alter table public.fin_contracts drop constraint if exists fin_contracts_origin_check;
alter table public.fin_contracts drop constraint if exists fin_contracts_currency_check;
alter table public.fin_contracts drop constraint if exists fin_contracts_title_check;
alter table public.fin_contracts drop constraint if exists fin_contracts_version_check;
alter table public.fin_contracts drop column if exists terms_updated_at;
alter table public.fin_contracts drop column if exists current_version;
alter table public.fin_contracts drop column if exists currency;
alter table public.fin_contracts drop column if exists title;
alter table public.fin_contracts drop column if exists parent_contract_id;
alter table public.fin_contracts drop column if exists origin;

-- Registros operacionais do job de marcos (sem dado de cliente) saem com o job.
delete from public.fin_job_runs where job = 'contract_milestones';
alter table public.fin_job_runs drop constraint if exists fin_job_runs_job_check;
alter table public.fin_job_runs add constraint fin_job_runs_job_check check (job in ('renewals'));

insert into public.fin_settings (key, value) values ('schema_version', 'financial-multi-entity-1')
on conflict (key) do update set value = excluded.value, updated_at = now();
