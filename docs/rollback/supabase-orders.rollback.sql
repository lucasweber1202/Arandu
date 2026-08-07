-- Arandu — rollback operacional da camada de pedidos
-- Uso apenas em ambiente descartável/staging, depois de exportar qualquer pedido criado.
-- Não reverte automaticamente uma reserva já marcada como converted.

drop function if exists public.create_order_atomic(
  uuid, uuid, uuid, text, text, text, text, text, text, text
);

drop policy if exists "orders_select_own" on public.orders;
drop trigger if exists trg_arandu_audit on public.orders;
drop trigger if exists trg_orders_updated_at on public.orders;
drop table if exists public.orders;
