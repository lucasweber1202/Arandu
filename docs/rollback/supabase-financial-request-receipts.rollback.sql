-- Rollback de docs/supabase-financial-request-receipts.sql: a criação de RFQ
-- volta a não ser idempotente (o servidor ignora a chave quando o banco não
-- tem o recibo). Recibos são técnicos (24 h) e podem ser descartados.
begin;
drop trigger if exists fin_rfqs_request_receipt on public.fin_rfqs;
drop function if exists public.fin_rfq_request_receipt();
drop table if exists public.fin_request_receipts;
update public.fin_settings set value = 'financial-security-closure-1', updated_at = now() where key = 'schema_version';
commit;
