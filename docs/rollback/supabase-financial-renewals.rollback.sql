-- Isolated rollback removes generated milestone links; preserve associated task/event evidence.
drop function if exists public.fin_start_contract_rfq(uuid);
drop function if exists public.fin_process_renewals(uuid,date);
drop table if exists public.fin_renewal_milestones;
