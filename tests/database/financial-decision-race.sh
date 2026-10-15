#!/usr/bin/env bash
# R3 (docs/QA_ADVERSARIAL_2026-10-14.md): decisão do comprador × nova versão da
# proposta, em duas sessões reais do Postgres, nas duas ordens possíveis.
#
# Sincronização determinística, sem sleep como barreira: a sessão que abre a
# transação primeiro fica parada com o lock na mão (coprocesso psql lendo de um
# pipe); a segunda roda até terminar OU até o pg_stat_activity mostrar que ela
# está esperando lock. Só então a primeira faz commit.
#
# Invariante: depois que a decisão é registrada, nenhuma proposta da RFQ ganha
# versão nova, e a versão decidida é a versão corrente da proposta escolhida.
# (A tela pós-decisão e o contrato leem a versão corrente da proposta.)
set -euo pipefail
database_url="$1"
run="$(date +%s%N | tail -c 7)"
buyer="00000000-0000-4000-8000-${run}0000a1"
provider="00000000-0000-4000-8000-${run}0000a2"
provider2="00000000-0000-4000-8000-${run}0000a3"
q() { psql "$database_url" -At -v ON_ERROR_STOP=1 -c "$1"; }

setup() {
  local label="$1" first_submit="${2:-yes}"
  psql "$database_url" -At -v ON_ERROR_STOP=1 -q <<SQL
insert into auth.users (id, email) values ('${buyer}', 'race-buyer-${run}@example.invalid'), ('${provider}', 'race-provider-${run}@example.invalid'),
  ('${provider2}', 'race-provider2-${run}@example.invalid')
  on conflict (id) do nothing;
insert into public.fin_pilot_allowlist (pattern, created_by, note) values
  ('race-buyer-${run}@example.invalid', '${buyer}', 'race'), ('race-provider-${run}@example.invalid', '${buyer}', 'race'),
  ('race-provider2-${run}@example.invalid', '${buyer}', 'race')
  on conflict (pattern) do nothing;
create table if not exists public.qa_race_ids (label text, key text, value text, primary key (label, key));
grant all on public.qa_race_ids to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub', '${buyer}', false);
insert into public.qa_race_ids select '${label}', 'buyer', public.fin_create_organization('Compradora corrida ${label} DEMO', 'BUYER');
select set_config('request.jwt.claim.sub', '${provider}', false);
insert into public.qa_race_ids select '${label}', 'prov', public.fin_create_organization('Provedor corrida ${label} DEMO', 'PROVIDER');
select set_config('request.jwt.claim.sub', '${provider2}', false);
insert into public.qa_race_ids select '${label}', 'prov2', public.fin_create_organization('Provedor dois corrida ${label} DEMO', 'PROVIDER');
select set_config('request.jwt.claim.sub', '${buyer}', false);
insert into public.fin_providers (organization_id, name, kind, created_by)
  select value::uuid, 'Banco corrida ${label} DEMO', 'bank', '${buyer}' from public.qa_race_ids where label = '${label}' and key = 'buyer';
insert into public.fin_providers (organization_id, name, kind, created_by)
  select value::uuid, 'Banco dois corrida ${label} DEMO', 'bank', '${buyer}' from public.qa_race_ids where label = '${label}' and key = 'buyer';
insert into public.qa_race_ids select '${label}', 'provider_row', id from public.fin_providers where name = 'Banco corrida ${label} DEMO';
insert into public.qa_race_ids select '${label}', 'provider_row2', id from public.fin_providers where name = 'Banco dois corrida ${label} DEMO';
insert into public.qa_race_ids select '${label}', 'rfq', public.fin_create_rfq(
  (select value::uuid from public.qa_race_ids where label = '${label}' and key = 'buyer'), 'credit', 'RFQ corrida ${label} DEMO', null,
  '{"amount":250000,"purpose":"capital_de_giro","term_months":12}'::jsonb, null);
select public.fin_transition('rfq', (select value::uuid from public.qa_race_ids where label = '${label}' and key = 'rfq'), 'open');
insert into public.qa_race_ids select '${label}', 'token', public.fin_invite_provider(
  (select value::uuid from public.qa_race_ids where label = '${label}' and key = 'rfq'),
  (select value::uuid from public.qa_race_ids where label = '${label}' and key = 'provider_row'));
insert into public.qa_race_ids select '${label}', 'token2', public.fin_invite_provider(
  (select value::uuid from public.qa_race_ids where label = '${label}' and key = 'rfq'),
  (select value::uuid from public.qa_race_ids where label = '${label}' and key = 'provider_row2'));
select set_config('request.jwt.claim.sub', '${provider2}', false);
select public.fin_accept_provider_invite((select value from public.qa_race_ids where label = '${label}' and key = 'token2'),
  (select value::uuid from public.qa_race_ids where label = '${label}' and key = 'prov2'));
insert into public.qa_race_ids select '${label}', 'proposal2', id from public.fin_proposals
  where provider_organization_id = (select value::uuid from public.qa_race_ids where label = '${label}' and key = 'prov2');
select set_config('request.jwt.claim.sub', '${provider}', false);
select public.fin_accept_provider_invite((select value from public.qa_race_ids where label = '${label}' and key = 'token'),
  (select value::uuid from public.qa_race_ids where label = '${label}' and key = 'prov'));
insert into public.qa_race_ids select '${label}', 'proposal', id from public.fin_proposals
  where provider_organization_id = (select value::uuid from public.qa_race_ids where label = '${label}' and key = 'prov');
select '${first_submit}' = 'no' or public.fin_submit_proposal((select value::uuid from public.qa_race_ids where label = '${label}' and key = 'proposal'),
  '{"institution":"Banco corrida","interest_rate_month":1.5,"term_months":12}'::jsonb) is not null;
reset role;
SQL
}
id() { q "select value from public.qa_race_ids where label = '$1' and key = '$2'"; }

as_user() { printf "set role authenticated; select set_config('request.jwt.claim.sub', '%s', false);\n" "$1"; }
# A decisão leva a versão que o comprador estava vendo (fin_record_decision_v2).
decide_sql() { printf "select public.fin_record_decision_v2('%s'::uuid, '%s'::uuid, %s, '{}'::jsonb, 'Decisão concorrente de teste.');\n" "$1" "$2" "$3"; }
submit_sql() { printf "select public.fin_submit_proposal('%s'::uuid, '{\"institution\":\"Banco corrida\",\"interest_rate_month\":0.9,\"term_months\":12}'::jsonb);\n" "$1"; }

# Espera a sessão marcada com application_name aparecer e, depois, terminar ou
# ficar parada em lock. "Sumiu" só conta depois de ter sido vista: sem isso, uma
# sessão que ainda não conectou passaria por concluída e o interleaving não seria
# o pretendido.
wait_state() {
  local app="$1" deadline=$((SECONDS + 20)) state seen=0
  while (( SECONDS < deadline )); do
    state="$(q "select coalesce(max(case when wait_event_type = 'Lock' then 'waiting' when state = 'active' then 'active' else 'idle' end), 'gone')
                from pg_stat_activity where application_name = '${app}'")"
    case "$state" in
      waiting) echo waiting; return 0 ;;
      gone) (( seen )) && { echo done; return 0; } ;;
      *) seen=1 ;;
    esac
  done
  echo timeout
}

scenario() {
  local label="$1" first="$2" expect="$3"
  setup "$label"
  local rfq proposal seen; rfq="$(id "$label" rfq)"; proposal="$(id "$label" proposal)"
  seen="$(q "select current_version from public.fin_proposals where id = '${proposal}'")"
  local first_sql second_sql first_user second_user
  if [[ "$first" == provider ]]; then
    first_sql="$(submit_sql "$proposal")"; first_user="$provider"; second_sql="$(decide_sql "$rfq" "$proposal" "$seen")"; second_user="$buyer"
  else
    first_sql="$(decide_sql "$rfq" "$proposal" "$seen")"; first_user="$buyer"; second_sql="$(submit_sql "$proposal")"; second_user="$provider"
  fi
  # 1. Primeira sessão: abre transação, executa e segura (sem commit).
  coproc FIRST { PGAPPNAME="race-first-${label}" psql "$database_url" -At -v ON_ERROR_STOP=0 -q 2>&1; }
  { echo "begin;"; as_user "$first_user"; echo "$first_sql"; echo "select 'first-ready';"; } >&"${FIRST[1]}"
  local line; while read -r -t 20 line <&"${FIRST[0]}"; do [[ "$line" == first-ready ]] && break; done
  # 2. Segunda sessão em paralelo; observa se ela termina ou fica esperando lock.
  local second_out; second_out="$(mktemp)"
  { as_user "$second_user"; echo "$second_sql"; } | PGAPPNAME="race-second-${label}" psql "$database_url" -At -v ON_ERROR_STOP=0 -q >"$second_out" 2>&1 &
  local second_pid=$!
  local observed; observed="$(wait_state "race-second-${label}")"
  # 3. Commit da primeira; espera a segunda terminar.
  echo "commit;" >&"${FIRST[1]}"; exec {FIRST[1]}>&-
  wait "$FIRST_PID" 2>/dev/null || true
  wait "$second_pid" || true
  local outcome; outcome="$(tr '\n' ' ' <"$second_out" | sed 's/  */ /g' | cut -c1-160)"
  # 4. Estado final.
  local decided current after status
  decided="$(q "select coalesce((snapshot->>'decided_version'), 'sem decisão') from public.fin_decisions where rfq_id = '${rfq}'")"
  current="$(q "select current_version from public.fin_proposals where id = '${proposal}'")"
  after="$(q "select count(*) from public.fin_proposal_versions v join public.fin_decisions d on d.rfq_id = '${rfq}'
             where v.proposal_id = '${proposal}' and v.version > (d.snapshot->>'decided_version')::int")"
  status="$(q "select status from public.fin_rfqs where id = '${rfq}'")"
  echo "[${label}] primeira=${first}, segunda ${observed} enquanto a primeira segurava; segunda: ${outcome:-ok}"
  echo "[${label}] RFQ ${status}; decisão na versão ${decided:-—}; proposta na versão ${current}; versões depois da decisão: ${after:-0}"
  if [[ "$outcome" != *"$expect"* ]]; then
    echo "VIOLAÇÃO [${label}]: a segunda sessão deveria terminar com \"${expect}\"" >&2
    return 1
  fi
  if [[ -n "$decided" && "${after:-0}" != 0 ]]; then
    echo "VIOLAÇÃO [${label}]: proposta ganhou versão nova numa RFQ já decidida (decidida v${decided}, corrente v${current})" >&2
    return 1
  fi
  if [[ -n "$decided" && "$decided" != "$current" ]]; then
    echo "VIOLAÇÃO [${label}]: versão decidida (v${decided}) diferente da corrente (v${current})" >&2
    return 1
  fi
}

# Dois provedores enviam a primeira proposta ao mesmo tempo numa RFQ "open":
# os dois envios precisam terminar (nenhum deadlock) e a RFQ passa a "collecting".
first_submits() {
  local label="$1"
  setup "$label" no
  local rfq p1 p2; rfq="$(id "$label" rfq)"; p1="$(id "$label" proposal)"; p2="$(id "$label" proposal2)"
  coproc FIRST { PGAPPNAME="race-first-${label}" psql "$database_url" -At -v ON_ERROR_STOP=0 -q 2>&1; }
  { echo "begin;"; as_user "$provider"; submit_sql "$p1"; echo "select 'first-ready';"; } >&"${FIRST[1]}"
  local line first_out=""; while read -r -t 20 line <&"${FIRST[0]}"; do [[ "$line" == first-ready ]] && break; first_out+="$line "; done
  local second_out; second_out="$(mktemp)"
  { as_user "$provider2"; submit_sql "$p2"; } | PGAPPNAME="race-second-${label}" psql "$database_url" -At -v ON_ERROR_STOP=0 -q >"$second_out" 2>&1 &
  local second_pid=$!
  local observed; observed="$(wait_state "race-second-${label}")"
  { echo "commit;"; echo "select 'first-done';"; } >&"${FIRST[1]}"
  while read -r -t 20 line <&"${FIRST[0]}"; do [[ "$line" == first-done ]] && break; first_out+="$line "; done
  exec {FIRST[1]}>&-; wait "$FIRST_PID" 2>/dev/null || true; wait "$second_pid" || true
  local versions; versions="$(q "select count(*) from public.fin_proposal_versions where proposal_id in ('${p1}','${p2}')")"
  local status; status="$(q "select status from public.fin_rfqs where id = '${rfq}'")"
  echo "[${label}] segunda ${observed} enquanto a primeira segurava; RFQ ${status}; versões gravadas ${versions}/2"
  if grep -qi "deadlock\|ERROR" "$second_out" || [[ "$first_out" == *ERROR* ]]; then
    echo "VIOLAÇÃO [${label}]: envio simultâneo falhou: $(tr '\n' ' ' <"$second_out" | cut -c1-160) ${first_out:0:160}" >&2; return 1
  fi
  [[ "$versions" == 2 && "$status" == collecting ]] || { echo "VIOLAÇÃO [${label}]: estado final inesperado" >&2; return 1; }
}

failures=0
# Provedor revisa primeiro: a decisão sobre a versão exibida (v1) é recusada.
scenario "provedor-primeiro-${run}" provider "proposal version changed" || failures=$((failures + 1))
# Decisão primeiro: o envio espera e é recusado (RFQ já decidida).
scenario "decisao-primeiro-${run}" buyer "rfq is not receiving proposals" || failures=$((failures + 1))
first_submits "envios-simultaneos-${run}" || failures=$((failures + 1))
q "drop table if exists public.qa_race_ids" >/dev/null
if (( failures )); then echo "Corrida decisão × proposta: ${failures} interleaving(s) violaram a invariante." >&2; exit 1; fi
echo "Corrida decisão × proposta: as duas ordens preservam a versão decidida, nenhuma versão entra depois da decisão e envios simultâneos não entram em deadlock."
