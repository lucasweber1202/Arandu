#!/usr/bin/env bash
set -euo pipefail

url="${1:?database URL required}"
admin=00000000-0000-4000-8000-0000000ba001
race_user=00000000-0000-4000-8000-0000000ba006
org=00000000-0000-4000-8000-0000000bb001
task=00000000-0000-4000-8000-0000000bd001

query() { psql "$url" -X -q -v ON_ERROR_STOP=1 -Atc "$1"; }
assert_empty() {
  local value
  value="$(query "$1")"
  [[ -z "$value" ]] || { echo "unexpected race result: $value" >&2; exit 1; }
}
wait_for_lock() {
  local app="$1" i
  for i in $(seq 1 100); do
    if [[ "$(query "select exists(select 1 from pg_stat_activity where application_name='$app' and wait_event_type='Lock')")" == t ]]; then return 0; fi
    sleep 0.05
  done
  echo "session $app did not block on the expected row lock" >&2
  return 1
}


# Explicit transaction barrier: do not assume a worker starts within 150 ms
# or that a fixed sleep still holds the lock when the contender is scheduled.
hold_assignment() {
  local app="$1" actor="$2" assignee="$3" line i ready=0
  coproc ASSIGNMENT { PGAPPNAME="$app" psql "$url" -X -qAt -v ON_ERROR_STOP=1; }
  assign_pid=$ASSIGNMENT_PID
  assignment_input=${ASSIGNMENT[1]}
  assignment_output=${ASSIGNMENT[0]}
  printf '%s\n' 'begin;' "select set_config('request.jwt.claim.sub','$actor',true);" 'set local role authenticated;' "update public.fin_tasks set assignee_id='$assignee',assignee_source='manual' where id='$task';" '\echo assignment-held' >&"$assignment_input"
  for i in $(seq 1 100); do
    if IFS= read -r -t 0.05 line <&"$assignment_output"; then
      if [[ "$line" == assignment-held ]]; then ready=1; break; fi
    fi
  done
  test "$ready" -eq 1
}
release_assignment() {
  printf '%s\n' 'commit;' '\q' >&"$assignment_input"
  wait "$assign_pid"
}

# Target removal serializes with assignment. If the assignment gets the row
# lock first, deletion waits and FK SET NULL clears it after commit.
query "insert into public.fin_members(organization_id,user_id,role,entity_scope) values('$org','$race_user','analyst','group') on conflict(organization_id,user_id) do update set role='analyst',entity_scope='group'; update public.fin_tasks set assignee_id=null,assignee_source=null where id='$task';"
hold_assignment task-assignee-first "$admin" "$race_user"
PGAPPNAME=task-member-delete psql "$url" -X -q -v ON_ERROR_STOP=1 -c "delete from public.fin_members where organization_id='$org' and user_id='$race_user'" > /dev/null &
delete_pid=$!
wait_for_lock task-member-delete
release_assignment
wait "$delete_pid"
assert_empty "select assignee_id from public.fin_tasks where id='$task' and assignee_id is not null"

# A role downgrade that starts after assignment's locked eligibility check
# waits, then its trigger clears the now-ineligible assignee before commit.
query "insert into public.fin_members(organization_id,user_id,role,entity_scope) values('$org','$race_user','analyst','group') on conflict(organization_id,user_id) do update set role='analyst',entity_scope='group'; update public.fin_tasks set assignee_id=null,assignee_source=null where id='$task';"
hold_assignment task-assignee-demotion "$admin" "$race_user"
PGAPPNAME=task-member-demote psql "$url" -X -q -v ON_ERROR_STOP=1 -c "update public.fin_members set role='viewer' where organization_id='$org' and user_id='$race_user'" > /dev/null &
demote_pid=$!
wait_for_lock task-member-demote
release_assignment
wait "$demote_pid"
assert_empty "select assignee_id from public.fin_tasks where id='$task' and assignee_id is not null"

# An entity-scoped actor's assignment serializes with revoking their entity
# grant. The grant deletion waits for validation, then clears self-assignment.
query "update public.fin_members set role='finance_manager' where organization_id='$org' and user_id='00000000-0000-4000-8000-0000000ba002'; update public.fin_tasks set assignee_id=null,assignee_source=null where id='$task';"
hold_assignment task-assignee-scope "00000000-0000-4000-8000-0000000ba002" "00000000-0000-4000-8000-0000000ba002"
PGAPPNAME=task-actor-scope psql "$url" -X -q -v ON_ERROR_STOP=1 <<SQL > /dev/null &
select set_config('request.jwt.claim.sub','$admin',false);
select public.fin_set_member_entity_scope('$org','00000000-0000-4000-8000-0000000ba002','entities',array['00000000-0000-4000-8000-0000000bc002'::uuid]);
SQL
scope_pid=$!
wait_for_lock task-actor-scope
release_assignment
wait "$scope_pid"
assert_empty "select assignee_id from public.fin_tasks where id='$task' and assignee_id is not null"

echo "Task assignment serializes against membership deletion and role downgrade."
