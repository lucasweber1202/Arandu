-- Reverte docs/supabase-financial-relationships-portfolio.sql.
-- Contatos, relações, issues, scorecards, avaliações, facilities, saldos,
-- cronogramas e garantias são removidos com as tabelas; faça backup antes
-- (npm run pilot:restore:drill). Eventos já gravados na trilha permanecem.
do $$
declare f text;
begin
  foreach f in array array[
    'public.fin_add_provider_contact(uuid,uuid,text,text,text,text,uuid,boolean)',
    'public.fin_archive_provider_contact(uuid)',
    'public.fin_set_provider_relationship(uuid,uuid,uuid,text,uuid,text[],date,text)',
    'public.fin_open_provider_issue(uuid,uuid,text,text,text,text,uuid,uuid,date,uuid)',
    'public.fin_update_provider_issue(uuid,text,text)',
    'public.fin_create_scorecard_template(uuid,text,text,jsonb)',
    'public.fin_record_provider_review(uuid,uuid,uuid,date,date,jsonb,uuid,text)',
    'public.fin_save_facility(uuid,uuid,uuid,uuid,text,text,text,numeric,numeric,text,numeric,numeric,text,date,date,text,uuid,text,text,integer,text,uuid)',
    'public.fin_confirm_facility(uuid)',
    'public.fin_record_facility_balance(uuid,date,numeric,numeric,text,text)',
    'public.fin_record_facility_schedule(uuid,jsonb,integer)',
    'public.fin_save_guarantee(uuid,uuid,uuid,text,text,text,numeric,uuid,uuid,uuid,date,date,text,text)',
    'public.fin_assert_portfolio_write(uuid,uuid)'
  ] loop
    execute format('drop function if exists %s', f);
  end loop;
end $$;

drop table if exists public.fin_guarantees;
drop table if exists public.fin_facility_repayments;
drop table if exists public.fin_facility_balances;
drop table if exists public.fin_facility_history;
drop trigger if exists fin_facilities_history on public.fin_facilities;
drop table if exists public.fin_facilities;
drop table if exists public.fin_provider_reviews;
drop table if exists public.fin_scorecard_templates;
drop table if exists public.fin_provider_issues;
drop table if exists public.fin_provider_relationships;
drop table if exists public.fin_provider_contacts;
drop function if exists public.fin_facility_history_trigger();
drop function if exists public.fin_scorecard_template_guard();
drop function if exists public.fin_facility_visible(uuid);
drop function if exists public.fin_group_or_entity_visible(uuid, uuid);

-- Versão anterior (multi-entity) da resolução de entidade por objeto.
create or replace function public.fin_object_legal_entity(p_type text, p_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select case p_type
    when 'rfq' then (select r.legal_entity_id from public.fin_rfqs r where r.id = p_id)
    when 'proposal' then (select r.legal_entity_id from public.fin_proposals p join public.fin_rfqs r on r.id = p.rfq_id where p.id = p_id)
    when 'decision' then (select r.legal_entity_id from public.fin_decisions d join public.fin_rfqs r on r.id = d.rfq_id where d.id = p_id)
    when 'approval' then (select r.legal_entity_id from public.fin_approval_requests a join public.fin_rfqs r on r.id = a.rfq_id where a.id = p_id)
    when 'contract' then (select c.legal_entity_id from public.fin_contracts c where c.id = p_id)
    when 'task' then (select t.legal_entity_id from public.fin_tasks t where t.id = p_id)
    when 'legal_entity' then p_id
    else null end;
$$;

revoke all on function public.fin_object_legal_entity(text, uuid) from public, anon, authenticated;

insert into public.fin_settings (key, value) values ('schema_version', 'financial-contracts-v2-1')
on conflict (key) do update set value = excluded.value, updated_at = now();
