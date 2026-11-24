-- Rollback of docs/supabase-financial-demo-pool-integrity.sql.
-- Withdraws the workspace-scoped runner. The processors keep the scope
-- predicate, which is a no-op without the transaction-local scope, so the
-- global cron behaves exactly as before. Columns and data are retained.
-- After rollback, provisioning must not call the global cron again: keep the
-- pool controller stopped until the forward migration is reapplied.
begin;
revoke all on function public.fin_demo_workspace_run_jobs(text, date) from service_role;
notify pgrst, 'reload schema';
commit;
