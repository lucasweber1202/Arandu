-- Arandu — rollback da outbox transacional
-- Em ambiente real, exporte somente referências operacionais necessárias antes de remover a fila.

drop trigger if exists trg_orders_transactional_email on public.orders;
drop function if exists public.enqueue_order_email_events();
drop function if exists public.fail_transactional_email(uuid,text,integer);
drop function if exists public.complete_transactional_email(uuid,text,text);
drop function if exists public.claim_transactional_email_batch(text,integer);
drop function if exists public.enqueue_transactional_email_for_user(uuid,text,text,text,text,jsonb,text,text);
drop table if exists public.transactional_email_outbox;
