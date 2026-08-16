-- Arandu — rollback da máquina de estados operacional
--
-- Remove a validação de transições e a trilha operacional. Depois deste
-- rollback o status volta a ser gravado sem histórico: exporte
-- public.operational_status_history antes de executar.

drop function if exists public.apply_operational_status_atomic(text,text,text,text,text,text,text);
drop function if exists public.operational_transition_allowed(text,text,text);
drop table if exists public.operational_status_history;
