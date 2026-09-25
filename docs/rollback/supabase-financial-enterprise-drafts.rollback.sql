-- Isolated rollback only; export drafts before removing them in any real environment.
drop trigger if exists fin_clear_submitted_draft on public.fin_proposal_versions;
drop function if exists public.fin_clear_submitted_draft();
drop function if exists public.fin_save_proposal_draft(uuid,jsonb,integer,integer);
drop table if exists public.fin_proposal_drafts;
