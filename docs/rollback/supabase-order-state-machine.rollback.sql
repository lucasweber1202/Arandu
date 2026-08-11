-- Execute apenas com escritas interrompidas e backup referenciado.
revoke all on function public.transition_order_atomic(uuid, text, text, text, text, text, text, text)
from public, anon, authenticated, service_role;
drop function if exists public.transition_order_atomic(uuid, text, text, text, text, text, text, text);
