-- Withdraw new entry points while preserving analyses and immutable history.
-- Reapply the forward migration to restore service. No financial data deleted.
begin;
revoke all on function public.fin_scenario_command(uuid,uuid,integer,text,jsonb),public.fin_scenario_context(uuid) from authenticated;
revoke all on public.fin_decision_scenarios,public.fin_renewal_operations from authenticated;
-- Source freshness guard deliberately remains: rollback never weakens approval integrity.
notify pgrst,'reload schema';
commit;
