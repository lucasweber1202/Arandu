-- Arandu — rollback do hardening aditivo de pedidos
-- Uso apenas em ambiente descartável/staging após exportar histórico necessário.

drop function if exists public.transition_order_atomic(
  uuid, text, text, text, text, text, text, text, text, text, text
);

drop trigger if exists trg_orders_immutable_fields on public.orders;
drop function if exists public.protect_order_immutable_fields();

drop trigger if exists trg_order_status_history_append_only on public.order_status_history;
drop function if exists public.protect_order_history_append_only();
drop table if exists public.order_status_history;

alter table public.orders
  drop column if exists shipping_updated_at,
  drop column if exists shipping_provider,
  drop column if exists tracking_code;

-- Retorna ao contrato da state machine da PR #38.
revoke all on function public.transition_order_atomic(uuid, text, text, text, text, text, text, text)
from public, anon, authenticated;
grant execute on function public.transition_order_atomic(uuid, text, text, text, text, text, text, text)
to service_role;
