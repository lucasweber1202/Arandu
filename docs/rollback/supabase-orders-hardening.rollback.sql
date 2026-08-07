-- Arandu — rollback do hardening aditivo de pedidos
-- Uso apenas em ambiente descartável/staging após exportar histórico necessário.

drop function if exists public.transition_order_atomic(
  uuid, text, text, text, text, text, text, text, text, text, text
);

drop trigger if exists trg_orders_immutable_fields on public.orders;
drop function if exists public.protect_order_immutable_fields();

drop table if exists public.order_status_history;

alter table public.orders
  drop column if exists shipping_updated_at,
  drop column if exists shipping_provider,
  drop column if exists tracking_code;
