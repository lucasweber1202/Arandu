-- Arandu — rollback da trilha operacional por gatilho
--
-- Remove os gatilhos. A trilha volta a registrar apenas as transições feitas
-- pelo painel, e reserva, expiração e pedido deixam de aparecer no histórico.
-- Reaplicar docs/supabase-operational-status.sql depois deste rollback devolve
-- a versão da RPC que insere a linha diretamente.

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'artworks','artists','artist_submissions','leads','company_briefs',
    'proposals','reservations','certificates','tasks'
  ]
  loop
    if to_regclass('public.' || v_table) is not null then
      execute format('drop trigger if exists trg_arandu_operational_status on public.%I', v_table);
    end if;
  end loop;
end;
$$;

drop function if exists public.log_operational_status_change();
