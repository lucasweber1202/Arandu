-- Export revision snapshots before applying in a real environment.
drop trigger if exists fin_stamp_proposal_rfq_revision on public.fin_proposal_versions;
drop function if exists public.fin_stamp_proposal_rfq_revision();
drop trigger if exists fin_seed_rfq_revision on public.fin_rfqs;
drop function if exists public.fin_seed_rfq_revision();
drop trigger if exists fin_log_rfq_revision on public.fin_rfqs;
drop trigger if exists fin_capture_rfq_revision on public.fin_rfqs;
drop function if exists public.fin_revise_rfq(uuid,integer,text,text,jsonb,date);
drop function if exists public.fin_log_rfq_revision();
drop function if exists public.fin_capture_rfq_revision();
drop table if exists public.fin_rfq_revisions;
alter table public.fin_proposal_versions drop column if exists rfq_revision;
alter table public.fin_rfqs drop column if exists revision;
grant execute on function public.fin_update_rfq_demand(uuid,text,text,jsonb,date) to authenticated;
