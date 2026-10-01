-- Reverte docs/supabase-financial-passport.sql.
-- Snapshots de RFQ e histórico do Passport são removidos com as tabelas; faça
-- backup antes (npm run pilot:restore:drill descreve o procedimento seguro).
-- Os campos do perfil continuam; origens reservadas viram 'outro' para caber
-- na constraint original.
drop function if exists public.fin_create_rfq_from_passport(uuid, text, text, text, jsonb, date, jsonb);
drop function if exists public.fin_passport_confirm_field(uuid, text);
drop function if exists public.fin_passport_set_field(uuid, text, text, text, uuid, date, integer);
drop function if exists public.fin_try_numeric(text);
drop function if exists public.fin_passport_freshness(date, date);
drop function if exists public.fin_passport_review_due(timestamptz, timestamptz, integer, date);

drop table if exists public.fin_rfq_profile_snapshots;
drop trigger if exists fin_company_profiles_history on public.fin_company_profiles;
drop table if exists public.fin_company_profile_history;
drop function if exists public.fin_profile_history_trigger();
drop function if exists public.fin_immutable_row();

update public.fin_company_profiles set source = 'outro'
 where source in ('importacao','integracao','informado_pelo_provedor','calculado','ia_confirmado');
alter table public.fin_company_profiles drop constraint if exists fin_company_profiles_source_check;
alter table public.fin_company_profiles add constraint fin_company_profiles_source_check
  check (source in ('declarado_pela_empresa','documento_interno','extrato','contrato_vigente','outro'));
alter table public.fin_company_profiles drop constraint if exists fin_company_profiles_review_after_days_check;
drop index if exists public.fin_company_profiles_document_idx;
alter table public.fin_company_profiles drop column if exists document_id;
alter table public.fin_company_profiles drop column if exists review_after_days;
alter table public.fin_company_profiles drop column if exists verified_by;
alter table public.fin_company_profiles drop column if exists verified_at;

-- Escrita direta volta a existir, com as políticas originais.
grant insert, update on public.fin_company_profiles to authenticated;

insert into public.fin_settings (key, value) values ('schema_version', 'financial-approval-handoff-1')
on conflict (key) do update set value = excluded.value, updated_at = now();
