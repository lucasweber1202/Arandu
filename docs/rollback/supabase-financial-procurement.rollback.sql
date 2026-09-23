-- Rollback do procurement financeiro B2B (migration base + endurecimento).
--
-- Aplicado manualmente e nunca por automação: remove exclusivamente os objetos
-- criados por docs/supabase-financial-procurement.sql. Nenhuma tabela da
-- vertical de Arte é tocada. Reaplicar a migration restaura o schema; os dados
-- das tabelas removidas não voltam, então exporte antes se houver conteúdo.

drop function if exists public.fin_record_client_event(uuid, text, uuid, text);
drop function if exists public.fin_accept_terms(uuid, text, text);
drop function if exists public.fin_pilot_access_allowed(text);
drop function if exists public.fin_record_provider_evidence(uuid, text, text, text, date);
drop function if exists public.fin_update_organization(uuid, text, text, text, text);
drop function if exists public.fin_register_contract(uuid, date, date, integer, text, text, text);
drop function if exists public.fin_record_decision(uuid, uuid, jsonb, text);
drop function if exists public.fin_transition(text, uuid, text);
drop function if exists public.fin_withdraw_proposal(uuid);
drop function if exists public.fin_submit_proposal(uuid, jsonb, text);
drop function if exists public.fin_accept_provider_invite(text, uuid);
drop function if exists public.fin_invite_provider(uuid, uuid);
drop function if exists public.fin_update_rfq_demand(uuid, text, text, jsonb, date);
drop function if exists public.fin_create_rfq(uuid, text, text, text, jsonb, date);
drop function if exists public.fin_accept_member_invitation(text);
drop function if exists public.fin_invite_member(uuid, text, text);
drop function if exists public.fin_create_organization(text, text, text);

-- As policies de leitura de RFQ e de versões referenciam outras tabelas fin_*.
-- Removê-las primeiro evita um DROP em cascata, que poderia alcançar objetos
-- fora desta migration.
do $$ declare p record; begin
  for p in select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename like 'fin\_%' loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

drop table if exists public.fin_pilot_allowlist;
drop table if exists public.fin_terms_acceptances;
drop table if exists public.fin_events;
drop table if exists public.fin_tasks;
drop table if exists public.fin_documents;
drop table if exists public.fin_contracts;
drop table if exists public.fin_decisions;
drop table if exists public.fin_proposal_versions;
drop table if exists public.fin_proposals;
drop table if exists public.fin_rfq_invites;
drop table if exists public.fin_rfqs;
drop table if exists public.fin_providers;
drop table if exists public.fin_company_profiles;
drop table if exists public.fin_member_invitations;
drop table if exists public.fin_members;
drop table if exists public.fin_organizations;

drop function if exists public.fin_has_role(uuid, text[]);
