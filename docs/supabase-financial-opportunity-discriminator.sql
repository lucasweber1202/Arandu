-- OD-01: discriminador de oportunidade compatível com candidatos por período.
--
-- Os candidatos de covenants/obrigações (financial-covenants) e de performance
-- (financial-provider-performance) distinguem oportunidades do mesmo contrato
-- pelo período (`<uuid>`) ou por período e dimensão (`<uuid>:<uuid>`). A
-- constraint original só aceitava código de moeda (`^[A-Z]{0,3}$`), então o
-- primeiro covenant na janela de aviso abortava `fin_run_opportunity_engine`
-- inteiro (todas as organizações do lote) — reproduzido com a demonstração em
-- 06/10/2026. A regra continua fechada: só moeda, um UUID ou um par de UUIDs.
-- Aditiva e idempotente: nenhuma linha existente muda; fingerprints preservados.
begin;
alter table public.fin_opportunities drop constraint if exists fin_opportunities_discriminator_check;
alter table public.fin_opportunities add constraint fin_opportunities_discriminator_check check (
  discriminator ~ '^[A-Z]{0,3}$'
  or discriminator ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$'
);
insert into public.fin_settings(key,value) values('schema_version', 'financial-opportunity-discriminator-1') on conflict(key) do update set value=excluded.value,updated_at=now();
commit;
