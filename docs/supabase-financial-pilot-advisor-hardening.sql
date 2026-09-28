-- Pilot-only follow-up to the 34-file cleanInstall at main 64a9bdc.
-- Security advisor findings on the dedicated Arandu Pilot project.
-- Do not apply to the legacy Supabase project. No historical migration is changed.
--
-- artwork_events was readable by anon/authenticated without RLS. The pilot
-- does not use the legacy art surface; deny direct client access.
alter table public.artwork_events enable row level security;
revoke all on table public.artwork_events from anon, authenticated;

-- Internal trigger functions must not be exposed as unauthenticated RPCs.
-- PostgreSQL triggers continue to run after EXECUTE is revoked from clients.
revoke all on function public.audit_privileged_mutation() from public, anon, authenticated;
revoke all on function public.enqueue_order_email_events() from public, anon, authenticated;
revoke all on function public.handle_new_user_profile() from public, anon, authenticated;
revoke all on function public.log_operational_status_change() from public, anon, authenticated;
