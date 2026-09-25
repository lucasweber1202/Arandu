-- Export active editor drafts before applying in a real environment.
drop function if exists public.fin_clear_rfq_editor(uuid,integer);
drop function if exists public.fin_save_rfq_editor(uuid,jsonb,integer);
drop table if exists public.fin_rfq_editor_drafts;
