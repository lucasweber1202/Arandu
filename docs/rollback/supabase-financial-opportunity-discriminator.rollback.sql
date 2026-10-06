-- Rollback técnico de OD-01. Só volta à constraint antiga se nenhuma
-- oportunidade usa discriminador por período; caso contrário falha fechado
-- (apagar oportunidades seria perda de trilha — use forward-fix).
begin;
do $$ begin
  if exists(select 1 from public.fin_opportunities where discriminator !~ '^[A-Z]{0,3}$') then
    raise exception 'opportunity discriminator rollback requires no period-scoped opportunities';
  end if;
end $$;
alter table public.fin_opportunities drop constraint if exists fin_opportunities_discriminator_check;
alter table public.fin_opportunities add constraint fin_opportunities_discriminator_check check (discriminator ~ '^[A-Z]{0,3}$');
update public.fin_settings set value='financial-spend-intelligence-1',updated_at=now() where key='schema_version';
commit;
