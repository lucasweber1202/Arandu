-- Historical suites run both before v2 exists and on the final schema. Keep
-- their authorization/state assertions, using the deployed client entry point.
-- This helper exists only in the test connection, never in a migration.
create or replace function pg_temp.test_record_decision(
  p_rfq uuid,p_proposal uuid,p_criteria jsonb default '{}'::jsonb,p_rationale text default null
) returns uuid language plpgsql security invoker as $$
declare v_version integer; v_result uuid;
begin
  if to_regprocedure('public.fin_record_decision_v2(uuid,uuid,integer,jsonb,text)') is not null then
    select current_version into v_version from public.fin_proposals where id=p_proposal;
    -- Fixed synthetic test intent, not a production reconciliation fallback.
    execute 'select public.fin_record_decision_v2($1,$2,$3,$4,$5)'
      into v_result using p_rfq,p_proposal,coalesce(v_version,1),p_criteria,p_rationale;
  else
    execute 'select public.fin_record_decision($1,$2,$3,$4)'
      into v_result using p_rfq,p_proposal,p_criteria,p_rationale;
  end if;
  return v_result;
end $$;
grant execute on function pg_temp.test_record_decision(uuid,uuid,jsonb,text) to authenticated;
