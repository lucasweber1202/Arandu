#!/usr/bin/env bash
set -euo pipefail

base_url="${ARANDU_DATABASE_TEST_URL:-postgresql://postgres:postgres@localhost:5432/postgres}"
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
clean_db="arandu_clean_test"
upgrade_db="arandu_upgrade_test"
fresh_db="arandu_fresh_test"

psql "$base_url" -v ON_ERROR_STOP=1 -c "drop database if exists ${clean_db};"
psql "$base_url" -v ON_ERROR_STOP=1 -c "drop database if exists ${upgrade_db};"
psql "$base_url" -v ON_ERROR_STOP=1 -c "drop database if exists ${fresh_db};"
psql "$base_url" -v ON_ERROR_STOP=1 -c "create database ${clean_db};"
psql "$base_url" -v ON_ERROR_STOP=1 -c "create database ${upgrade_db};"
psql "$base_url" -v ON_ERROR_STOP=1 -c "create database ${fresh_db};"

database_url() {
  local name="$1"
  printf '%s/%s' "${base_url%/*}" "$name"
}

apply_file() {
  local database="$1"
  local file="$2"
  psql "$(database_url "$database")" -v ON_ERROR_STOP=1 -f "$root_dir/$file"
}

# Migrations posteriores à aposentadoria da arte (o guarda de marker dela é
# imutável e só aceita o estado anterior): aplicadas depois dela, duas vezes.
after_decommission() {
  node -e "const m=require('./docs/supabase-migrations.json'); const i=m.cleanInstall.indexOf('docs/supabase-financial-legacy-art-decommission.sql'); for (const f of m.cleanInstall.slice(i+1)) console.log(f)"
}

apply_file "$clean_db" "tests/database/bootstrap.sql"
# Os testes históricos abaixo exercitam o schema antes da aposentadoria da
# vertical de arte; a aposentadoria é aplicada e verificada no fim deste banco.
while IFS= read -r file; do
  apply_file "$clean_db" "$file"
done < <(node -e "const m=require('./docs/supabase-migrations.json'); const i=m.cleanInstall.indexOf('docs/supabase-financial-legacy-art-decommission.sql'); for (const f of m.cleanInstall.slice(0,i)) console.log(f)")
# Dado fictício de arte: a aposentadoria no fim deste banco passa pelo caminho
# "há dado a aposentar" (com reconhecimento de export).
apply_file "$clean_db" "tests/database/legacy-art-fixture.sql"
apply_file "$clean_db" "tests/database/financial-procurement.sql"
apply_file "$clean_db" "tests/database/financial-procurement-hardening.sql"
apply_file "$clean_db" "tests/database/financial-pilot.sql"
apply_file "$clean_db" "tests/database/financial-enterprise-approvals.sql"
apply_file "$clean_db" "tests/database/financial-enterprise-drafts.sql"
apply_file "$clean_db" "tests/database/financial-collaboration.sql"
apply_file "$clean_db" "tests/database/financial-operational-search.sql"
apply_file "$clean_db" "tests/database/financial-renewals.sql"
apply_file "$clean_db" "tests/database/financial-rfq-editor.sql"
apply_file "$clean_db" "tests/database/financial-rfq-revisions.sql"
apply_file "$clean_db" "tests/database/financial-delivery.sql"
apply_file "$clean_db" "tests/database/financial-pilot-grade.sql"
apply_file "$clean_db" "tests/database/financial-pilot-operations.sql"
apply_file "$clean_db" "tests/database/financial-final-hardening.sql"
apply_file "$clean_db" "tests/database/financial-surface-hardening.sql"
apply_file "$clean_db" "tests/database/financial-approval-handoff.sql"
apply_file "$clean_db" "tests/database/financial-passport.sql"
apply_file "$clean_db" "tests/database/financial-multi-entity.sql"
apply_file "$clean_db" "tests/database/financial-contracts-v2.sql"
apply_file "$clean_db" "tests/database/financial-relationships-portfolio.sql"
# Reaplicação da migration financeira sobre a base já povoada: a rodada precisa
# ser idempotente antes de o rollback ser exercitado.
apply_file "$clean_db" "docs/supabase-financial-procurement.sql"
apply_file "$clean_db" "docs/supabase-financial-procurement-hardening.sql"
apply_file "$clean_db" "docs/supabase-financial-pilot.sql"
apply_file "$clean_db" "docs/supabase-financial-enterprise-approvals.sql"
apply_file "$clean_db" "docs/supabase-financial-enterprise-drafts.sql"
apply_file "$clean_db" "docs/supabase-financial-collaboration.sql"
apply_file "$clean_db" "docs/supabase-financial-operational-search.sql"
apply_file "$clean_db" "docs/supabase-financial-renewals.sql"
apply_file "$clean_db" "docs/supabase-financial-rfq-editor.sql"
apply_file "$clean_db" "docs/supabase-financial-rfq-revisions.sql"
apply_file "$clean_db" "docs/supabase-financial-delivery.sql"
apply_file "$clean_db" "docs/supabase-financial-pilot-grade.sql"
apply_file "$clean_db" "docs/supabase-financial-pilot-operations.sql"
apply_file "$clean_db" "docs/supabase-financial-final-hardening.sql"
apply_file "$clean_db" "docs/supabase-financial-pilot-surface-hardening.sql"
apply_file "$clean_db" "docs/supabase-financial-approval-handoff.sql"
apply_file "$clean_db" "docs/supabase-financial-passport.sql"
apply_file "$clean_db" "docs/supabase-financial-multi-entity.sql"
apply_file "$clean_db" "docs/supabase-financial-contracts-v2.sql"
apply_file "$clean_db" "docs/supabase-financial-relationships-portfolio.sql"
apply_file "$clean_db" "docs/supabase-financial-passport-entities.sql"
apply_file "$clean_db" "tests/database/financial-passport-entities.sql"
apply_file "$clean_db" "docs/supabase-financial-graph.sql"
apply_file "$clean_db" "docs/supabase-financial-graph.sql"
apply_file "$clean_db" "tests/database/financial-graph.sql"
apply_file "$clean_db" "docs/supabase-financial-policy-engine.sql"
apply_file "$clean_db" "docs/supabase-financial-policy-engine.sql"
apply_file "$clean_db" "tests/database/financial-policy-engine.sql"
apply_file "$clean_db" "docs/supabase-financial-public-api.sql"
apply_file "$clean_db" "docs/supabase-financial-public-api.sql"
apply_file "$clean_db" "tests/database/financial-public-api.sql"
apply_file "$clean_db" "docs/supabase-financial-sso.sql"
apply_file "$clean_db" "docs/supabase-financial-sso.sql"
apply_file "$clean_db" "tests/database/financial-sso.sql"
apply_file "$clean_db" "docs/supabase-financial-operational-resilience.sql"
apply_file "$clean_db" "docs/supabase-financial-operational-resilience.sql"
apply_file "$clean_db" "tests/database/financial-operational-resilience.sql"
apply_file "$clean_db" "docs/supabase-financial-data-governance.sql"
apply_file "$clean_db" "docs/supabase-financial-data-governance.sql"
apply_file "$clean_db" "tests/database/financial-data-governance.sql"
apply_file "$clean_db" "ops/sql/pilot-isolation-canary.sql"
bash "$root_dir/tests/database/governance-concurrency.sh" "$(database_url "$clean_db")"
bash "$root_dir/tests/database/job-lease-concurrency.sh" "$(database_url "$clean_db")"
psql "$(database_url "$clean_db")" -v ON_ERROR_STOP=1 -c "do \$\$ begin if (select count(*) from public.fin_legal_entities) < 3 or (select count(*) from public.fin_member_entity_grants) < 2 or not exists(select 1 from public.fin_rfqs where legal_entity_id is not null) or not exists(select 1 from public.fin_members where entity_scope='entities') then raise exception 'reaplicação do multi-entity perdeu escopo ou entidades'; end if; end \$\$;"
# Aposentadoria da vertical de arte sobre a base povoada pelos testes históricos.
apply_file "$clean_db" "tests/database/legacy-art-decommission-before.sql"
PGOPTIONS="-c arandu.legacy_art_decommission_ack=export-verified:CI-CLEAN" apply_file "$clean_db" "docs/supabase-financial-legacy-art-decommission.sql"
apply_file "$clean_db" "tests/database/legacy-art-decommission.sql"
apply_file "$clean_db" "docs/supabase-financial-legacy-art-decommission.sql"
apply_file "$clean_db" "tests/database/email-outbox.sql"
while IFS= read -r file; do
  apply_file "$clean_db" "$file"
  apply_file "$clean_db" "$file"
done < <(after_decommission)
# Rehearse older migrations only after removing the unused latest receipt layer.
apply_file "$clean_db" "docs/rollback/supabase-financial-crm.rollback.sql"
apply_file "$clean_db" "docs/rollback/supabase-financial-institutional-decline.rollback.sql"
apply_file "$clean_db" "docs/rollback/supabase-financial-negotiation-continuity.rollback.sql"
apply_file "$clean_db" "docs/rollback/supabase-financial-provider-intent-integrity.rollback.sql"
apply_file "$clean_db" "tests/database/financial-p0-closure.sql"
apply_file "$clean_db" "tests/database/financial-value-realization.sql"
apply_file "$clean_db" "tests/database/financial-fee-intelligence.sql"
apply_file "$clean_db" "tests/database/financial-opportunity-engine.sql"
apply_file "$clean_db" "tests/database/financial-document-intelligence.sql"
apply_file "$clean_db" "tests/database/financial-provider-qualification.sql"
apply_file "$clean_db" "tests/database/financial-implementation.sql"
apply_file "$clean_db" "tests/database/financial-covenants.sql"
apply_file "$clean_db" "tests/database/financial-provider-performance.sql"
apply_file "$clean_db" "tests/database/financial-spend-intelligence.sql"
apply_file "$clean_db" "tests/database/financial-opportunity-discriminator.sql"
apply_file "$clean_db" "tests/database/financial-demo-workspaces.sql"
bash "$root_dir/tests/database/demo-quota-concurrency.sh" "$(database_url "$clean_db")"
apply_file "$clean_db" "ops/sql/pilot-isolation-canary.sql"
apply_file "$clean_db" "ops/sql/post-migration-probes.sql"
# O probe de catálogo precisa recusar cada regressão (numa transação desfeita).
probe_rejects() {
  local setup="$1" expected="$2" rejection
  if rejection="$(psql "$(database_url "$clean_db")" -X -v ON_ERROR_STOP=1 -c "begin; ${setup}" -f "$root_dir/ops/sql/post-migration-probes.sql" 2>&1)"; then
    echo "post-migration-probes aceitou: ${expected}" >&2; exit 1
  fi
  [[ "$rejection" == *"$expected"* ]] || { echo "post-migration-probes falhou por motivo inesperado (${expected})" >&2; exit 1; }
}
probe_rejects "create function public.fin_probe_unpinned() returns int language sql security definer as 'select 1'; revoke all on function public.fin_probe_unpinned() from public, anon;" 'security definer sem search_path fixo'
probe_rejects "create function public.fin_probe_open() returns int language sql security definer set search_path = '' as 'select 1'; grant execute on function public.fin_probe_open() to anon;" 'security definer executável por anon'
probe_rejects "create table public.probe_open_surface(id int); revoke all on public.probe_open_surface from anon; grant insert on public.probe_open_surface to anon;" 'privilégio para anon'

apply_file "$upgrade_db" "tests/database/bootstrap.sql"
while IFS= read -r file; do
  apply_file "$upgrade_db" "$file"
done < <(node -e "const m=require('./docs/supabase-migrations.json'); const i=m.cleanInstall.indexOf('docs/supabase-orders.sql'); for (const f of m.cleanInstall.slice(0,i)) console.log(f)")

apply_file "$upgrade_db" "docs/supabase-orders.sql"
apply_file "$upgrade_db" "docs/supabase-order-state-machine.sql"
apply_file "$upgrade_db" "docs/supabase-orders-hardening.sql"
apply_file "$upgrade_db" "docs/supabase-transactional-email-outbox.sql"
apply_file "$upgrade_db" "docs/supabase-retention-controls.sql"
apply_file "$upgrade_db" "docs/supabase-email-outbox-fencing.sql"

apply_file "$upgrade_db" "docs/supabase-orders-hardening.sql"
apply_file "$upgrade_db" "docs/supabase-transactional-email-outbox.sql"
apply_file "$upgrade_db" "docs/supabase-retention-controls.sql"
apply_file "$upgrade_db" "docs/supabase-email-outbox-fencing.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-email-outbox-fencing.rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-retention-controls.rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-transactional-email-outbox.rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-orders-hardening.rollback.sql"

psql "$(database_url "$upgrade_db")" -v ON_ERROR_STOP=1 -c "do \$\$ begin if not has_function_privilege('service_role','public.transition_order_atomic(uuid,text,text,text,text,text,text,text)','EXECUTE') then raise exception 'rollback não restaurou state machine da PR #38'; end if; end \$\$;"

apply_file "$upgrade_db" "docs/supabase-orders-hardening.sql"
apply_file "$upgrade_db" "docs/supabase-transactional-email-outbox.sql"
apply_file "$upgrade_db" "docs/supabase-retention-controls.sql"
apply_file "$upgrade_db" "docs/supabase-email-outbox-fencing.sql"

apply_file "$upgrade_db" "tests/database/legacy-art-fixture.sql"
# Rollback do procurement financeiro e reaplicação, no banco de upgrade.
apply_file "$upgrade_db" "docs/supabase-financial-procurement.sql"
apply_file "$upgrade_db" "docs/supabase-financial-procurement-hardening.sql"
apply_file "$upgrade_db" "docs/supabase-financial-pilot.sql"
apply_file "$upgrade_db" "docs/supabase-financial-enterprise-approvals.sql"
apply_file "$upgrade_db" "docs/supabase-financial-enterprise-drafts.sql"
apply_file "$upgrade_db" "docs/supabase-financial-collaboration.sql"
apply_file "$upgrade_db" "docs/supabase-financial-operational-search.sql"
apply_file "$upgrade_db" "docs/supabase-financial-renewals.sql"
apply_file "$upgrade_db" "docs/supabase-financial-rfq-editor.sql"
apply_file "$upgrade_db" "docs/supabase-financial-rfq-revisions.sql"
apply_file "$upgrade_db" "docs/supabase-financial-delivery.sql"
apply_file "$upgrade_db" "docs/supabase-financial-pilot-grade.sql"
apply_file "$upgrade_db" "docs/supabase-financial-pilot-operations.sql"
apply_file "$upgrade_db" "docs/supabase-financial-final-hardening.sql"
apply_file "$upgrade_db" "docs/supabase-financial-pilot-surface-hardening.sql"
apply_file "$upgrade_db" "ops/sql/pilot-isolation-canary.sql"
# A wrong marker cannot skip Passport checks or turn a partial schema green.
for marker in unknown financial-passport-1 financial-multi-entity-1 financial-contracts-v2-1 financial-relationships-portfolio-1; do
  if rejection="$(psql "$(database_url "$upgrade_db")" -X -v ON_ERROR_STOP=1 -c "begin; update public.fin_settings set value='${marker}' where key='schema_version';" -f "$root_dir/ops/sql/pilot-isolation-canary.sql" 2>&1)"; then
    echo "Canary accepted an inconsistent schema marker" >&2; exit 1
  fi
  case "$marker" in
    unknown) expected='CANÁRIO: schema não suportado' ;;
    financial-multi-entity-1|financial-contracts-v2-1|financial-relationships-portfolio-1) expected='CANÁRIO: schema_version e tabelas' ;;
    *) expected='CANÁRIO: schema_version e tabelas Passport divergentes' ;;
  esac
  [[ "$rejection" == *"$expected"* ]] || { echo "Canary failed for an unexpected reason" >&2; exit 1; }
done
apply_file "$upgrade_db" "docs/supabase-financial-approval-handoff.sql"
apply_file "$upgrade_db" "docs/supabase-financial-passport.sql"
apply_file "$upgrade_db" "ops/sql/pilot-isolation-canary.sql"
apply_file "$upgrade_db" "tests/database/financial-passport.sql"
# Multi-entity sobre base povoada pelo Passport: upgrade, canário, rollback e reaplicação.
apply_file "$upgrade_db" "docs/supabase-financial-multi-entity.sql"
apply_file "$upgrade_db" "ops/sql/pilot-isolation-canary.sql"
# Contract Center v2 sobre a mesma base: upgrade, canário, rollback e reaplicação.
apply_file "$upgrade_db" "docs/supabase-financial-contracts-v2.sql"
apply_file "$upgrade_db" "ops/sql/pilot-isolation-canary.sql"
apply_file "$upgrade_db" "docs/supabase-financial-relationships-portfolio.sql"
apply_file "$upgrade_db" "ops/sql/pilot-isolation-canary.sql"
apply_file "$upgrade_db" "docs/supabase-financial-passport-entities.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-graph.rollback.sql"
apply_file "$upgrade_db" "docs/supabase-financial-graph.sql"
# Policy Engine v2 sobre a base com aprovações v1: upgrade, rollback, reaplicação.
apply_file "$upgrade_db" "docs/supabase-financial-policy-engine.sql"
apply_file "$upgrade_db" "ops/sql/pilot-isolation-canary.sql"
# Public API/Webhooks sobre o Policy Engine: upgrade, canário, rollback, reaplicação.
apply_file "$upgrade_db" "docs/supabase-financial-public-api.sql"
apply_file "$upgrade_db" "ops/sql/pilot-isolation-canary.sql"
# Enterprise SSO sobre a Public API: upgrade, canário, rollback, reaplicação.
apply_file "$upgrade_db" "docs/supabase-financial-sso.sql"
apply_file "$upgrade_db" "ops/sql/pilot-isolation-canary.sql"
apply_file "$upgrade_db" "docs/supabase-financial-operational-resilience.sql"
apply_file "$upgrade_db" "ops/sql/pilot-isolation-canary.sql"
# Data Governance sobre a resiliência: upgrade, canário, rollback (só sem uso), reaplicação.
apply_file "$upgrade_db" "docs/supabase-financial-data-governance.sql"
apply_file "$upgrade_db" "ops/sql/pilot-isolation-canary.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-data-governance.rollback.sql"
apply_file "$upgrade_db" "tests/database/financial-data-governance-rollback.sql"
apply_file "$upgrade_db" "docs/supabase-financial-data-governance.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-data-governance.rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-operational-resilience.rollback.sql"
apply_file "$upgrade_db" "tests/database/financial-operational-resilience-rollback.sql"
apply_file "$upgrade_db" "docs/supabase-financial-operational-resilience.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-operational-resilience.rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-sso.rollback.sql"
apply_file "$upgrade_db" "docs/supabase-financial-sso.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-sso.rollback.sql"
apply_file "$upgrade_db" "tests/database/financial-sso-rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-public-api.rollback.sql"
apply_file "$upgrade_db" "docs/supabase-financial-public-api.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-public-api.rollback.sql"
apply_file "$upgrade_db" "tests/database/financial-public-api-rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-policy-engine.rollback.sql"
apply_file "$upgrade_db" "docs/supabase-financial-policy-engine.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-policy-engine.rollback.sql"
apply_file "$upgrade_db" "tests/database/financial-policy-engine-rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-graph.rollback.sql"
apply_file "$upgrade_db" "tests/database/financial-graph-rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-passport-entities.rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-relationships-portfolio.rollback.sql"
psql "$(database_url "$upgrade_db")" -v ON_ERROR_STOP=1 -c "do \$\$ begin if to_regclass('public.fin_facilities') is not null or to_regclass('public.fin_provider_contacts') is not null or to_regprocedure('public.fin_group_or_entity_visible(uuid,uuid)') is not null or (select value from public.fin_settings where key='schema_version') <> 'financial-contracts-v2-1' then raise exception 'rollback de docs/supabase-financial-relationships-portfolio.sql incompleto'; end if; end \$\$;"
apply_file "$upgrade_db" "docs/supabase-financial-relationships-portfolio.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-relationships-portfolio.rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-contracts-v2.rollback.sql"
psql "$(database_url "$upgrade_db")" -v ON_ERROR_STOP=1 -c "do \$\$ begin if to_regclass('public.fin_contract_versions') is not null or to_regclass('public.fin_contract_milestones') is not null or exists(select 1 from information_schema.columns where table_name='fin_contracts' and column_name in ('origin','current_version')) or (select is_nullable from information_schema.columns where table_name='fin_contracts' and column_name='decision_id') <> 'NO' or (select value from public.fin_settings where key='schema_version') <> 'financial-multi-entity-1' then raise exception 'rollback do Contract Center v2 incompleto'; end if; end \$\$;"
apply_file "$upgrade_db" "docs/supabase-financial-contracts-v2.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-contracts-v2.rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-multi-entity.rollback.sql"
psql "$(database_url "$upgrade_db")" -v ON_ERROR_STOP=1 -c "do \$\$ begin if to_regclass('public.fin_legal_entities') is not null or exists(select 1 from information_schema.columns where table_name in ('fin_rfqs','fin_contracts','fin_tasks','fin_events') and column_name='legal_entity_id') or to_regprocedure('public.fin_entity_visible(uuid,uuid)') is not null or (select value from public.fin_settings where key='schema_version') <> 'financial-passport-1' or (select pg_get_expr(polqual, polrelid) from pg_policy where polname='fin_rfq_read') like '%entity%' then raise exception 'rollback multi-entity incompleto'; end if; end \$\$;"
apply_file "$upgrade_db" "docs/supabase-financial-multi-entity.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-multi-entity.rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-passport.rollback.sql"
psql "$(database_url "$upgrade_db")" -v ON_ERROR_STOP=1 -c "do \$\$ begin if to_regclass('public.fin_rfq_profile_snapshots') is not null or to_regclass('public.fin_company_profile_history') is not null or exists(select 1 from information_schema.columns where table_name='fin_company_profiles' and column_name='verified_at') or not has_table_privilege('authenticated','public.fin_company_profiles','INSERT') or (select value from public.fin_settings where key='schema_version') <> 'financial-approval-handoff-1' then raise exception 'rollback do Financial Passport incompleto'; end if; end \$\$;"
apply_file "$upgrade_db" "docs/supabase-financial-passport.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-passport.rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-approval-handoff.rollback.sql"
psql "$(database_url "$upgrade_db")" -v ON_ERROR_STOP=1 -c "do \$\$ begin if (select prosrc from pg_proc where oid = to_regprocedure('public.fin_notify_event()')) like '%v_next%' or (select value from public.fin_settings where key='schema_version') <> 'financial-surface-hardening-1' or has_function_privilege('authenticated','public.fin_notify_event()','EXECUTE') then raise exception 'rollback do aviso ao próximo aprovador incompleto'; end if; end \$\$;"
apply_file "$upgrade_db" "docs/supabase-financial-approval-handoff.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-approval-handoff.rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-pilot-surface-hardening.rollback.sql"
psql "$(database_url "$upgrade_db")" -v ON_ERROR_STOP=1 -c "do \$\$ begin if not has_function_privilege('authenticated','public.fin_pilot_access_allowed(text)','EXECUTE') or (select relrowsecurity from pg_class where oid='public.artwork_events'::regclass) or (select value from public.fin_settings where key='schema_version') <> 'financial-final-hardening-1' then raise exception 'rollback do hardening da superfície incompleto'; end if; end \$\$;"
apply_file "$upgrade_db" "docs/supabase-financial-pilot-surface-hardening.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-pilot-surface-hardening.rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-final-hardening.rollback.sql"
psql "$(database_url "$upgrade_db")" -v ON_ERROR_STOP=1 -c "do \$\$ begin if to_regclass('public.fin_invite_acceptance_denials') is not null or to_regprocedure('public.fin_platform_role()') is not null or exists(select 1 from information_schema.columns where table_name='fin_rfq_invites' and column_name='recipient_mode') then raise exception 'rollback do hardening final incompleto'; end if; end \$\$;"
apply_file "$upgrade_db" "docs/supabase-financial-final-hardening.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-final-hardening.rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-pilot-operations.rollback.sql"
psql "$(database_url "$upgrade_db")" -v ON_ERROR_STOP=1 -c "do \$\$ begin if (select prosrc from pg_proc where oid = to_regprocedure('public.fin_accept_provider_invite(text,uuid)')) like '%i.provider_organization_id = p_provider_org%' then raise exception 'rollback do vínculo do convite incompleto'; end if; end \$\$;"
apply_file "$upgrade_db" "docs/supabase-financial-pilot-operations.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-pilot-operations.rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-pilot-grade.rollback.sql"
psql "$(database_url "$upgrade_db")" -v ON_ERROR_STOP=1 -c "do \$\$ begin if to_regclass('public.fin_private_documents') is not null or to_regprocedure('public.fin_ops_overview()') is not null or exists(select 1 from information_schema.columns where table_name='fin_members' and column_name='display_name') then raise exception 'rollback da rodada de piloto incompleto'; end if; end \$\$;"
apply_file "$upgrade_db" "docs/supabase-financial-pilot-grade.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-pilot-grade.rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-delivery.rollback.sql"
psql "$(database_url "$upgrade_db")" -v ON_ERROR_STOP=1 -c "do \$\$ begin if exists(select 1 from information_schema.columns where table_name='fin_comments' and column_name='parent_id') or to_regprocedure('public.fin_run_renewal_schedule(date)') is not null then raise exception 'rollback da entrega operacional incompleto'; end if; end \$\$;"
apply_file "$upgrade_db" "docs/supabase-financial-delivery.sql"
apply_file "$upgrade_db" "docs/supabase-financial-pilot-grade.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-pilot-grade.rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-delivery.rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-rfq-revisions.rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-rfq-editor.rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-renewals.rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-operational-search.rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-collaboration.rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-enterprise-drafts.rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-enterprise-approvals.rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-procurement.rollback.sql"
psql "$(database_url "$upgrade_db")" -v ON_ERROR_STOP=1 -c "do \$\$ begin if to_regclass('public.fin_rfqs') is not null then raise exception 'rollback financeiro não removeu as tabelas'; end if; end \$\$;"
apply_file "$upgrade_db" "docs/supabase-financial-procurement.sql"
apply_file "$upgrade_db" "docs/supabase-financial-procurement-hardening.sql"
apply_file "$upgrade_db" "docs/supabase-financial-pilot.sql"
apply_file "$upgrade_db" "docs/supabase-financial-enterprise-approvals.sql"
apply_file "$upgrade_db" "docs/supabase-financial-enterprise-drafts.sql"
apply_file "$upgrade_db" "docs/supabase-financial-collaboration.sql"
apply_file "$upgrade_db" "docs/supabase-financial-operational-search.sql"
apply_file "$upgrade_db" "docs/supabase-financial-renewals.sql"
apply_file "$upgrade_db" "docs/supabase-financial-rfq-editor.sql"
apply_file "$upgrade_db" "docs/supabase-financial-rfq-revisions.sql"
apply_file "$upgrade_db" "docs/supabase-financial-delivery.sql"
apply_file "$upgrade_db" "docs/supabase-financial-pilot-grade.sql"
apply_file "$upgrade_db" "docs/supabase-financial-pilot-operations.sql"
apply_file "$upgrade_db" "docs/supabase-financial-final-hardening.sql"
apply_file "$upgrade_db" "docs/supabase-financial-pilot-surface-hardening.sql"
apply_file "$upgrade_db" "docs/supabase-financial-approval-handoff.sql"
apply_file "$upgrade_db" "docs/supabase-financial-passport.sql"
apply_file "$upgrade_db" "docs/supabase-financial-multi-entity.sql"
apply_file "$upgrade_db" "docs/supabase-financial-contracts-v2.sql"
apply_file "$upgrade_db" "docs/supabase-financial-relationships-portfolio.sql"
apply_file "$upgrade_db" "docs/supabase-financial-passport-entities.sql"
apply_file "$upgrade_db" "docs/supabase-financial-graph.sql"
apply_file "$upgrade_db" "docs/supabase-financial-policy-engine.sql"
apply_file "$upgrade_db" "docs/supabase-financial-public-api.sql"
apply_file "$upgrade_db" "docs/supabase-financial-sso.sql"
apply_file "$upgrade_db" "tests/database/financial-procurement.sql"
apply_file "$upgrade_db" "tests/database/financial-procurement-hardening.sql"
apply_file "$upgrade_db" "tests/database/financial-pilot.sql"
apply_file "$upgrade_db" "tests/database/financial-enterprise-approvals.sql"
apply_file "$upgrade_db" "tests/database/financial-enterprise-drafts.sql"
apply_file "$upgrade_db" "tests/database/financial-collaboration.sql"
apply_file "$upgrade_db" "tests/database/financial-operational-search.sql"
apply_file "$upgrade_db" "tests/database/financial-renewals.sql"
apply_file "$upgrade_db" "tests/database/financial-rfq-editor.sql"
apply_file "$upgrade_db" "tests/database/financial-rfq-revisions.sql"
apply_file "$upgrade_db" "tests/database/financial-delivery.sql"
apply_file "$upgrade_db" "tests/database/financial-pilot-grade.sql"
apply_file "$upgrade_db" "tests/database/financial-pilot-operations.sql"
apply_file "$upgrade_db" "tests/database/financial-final-hardening.sql"
apply_file "$upgrade_db" "tests/database/financial-surface-hardening.sql"
apply_file "$upgrade_db" "tests/database/financial-approval-handoff.sql"
apply_file "$upgrade_db" "tests/database/financial-passport.sql"
apply_file "$upgrade_db" "tests/database/financial-multi-entity.sql"
apply_file "$upgrade_db" "tests/database/financial-contracts-v2.sql"
apply_file "$upgrade_db" "tests/database/financial-relationships-portfolio.sql"
apply_file "$upgrade_db" "docs/supabase-financial-passport-entities.sql"
apply_file "$upgrade_db" "docs/supabase-financial-passport-entities.sql"
apply_file "$upgrade_db" "tests/database/financial-passport-entities.sql"
apply_file "$upgrade_db" "docs/supabase-financial-graph.sql"
apply_file "$upgrade_db" "docs/supabase-financial-graph.sql"
apply_file "$upgrade_db" "tests/database/financial-graph.sql"
apply_file "$upgrade_db" "docs/supabase-financial-policy-engine.sql"
apply_file "$upgrade_db" "docs/supabase-financial-policy-engine.sql"
apply_file "$upgrade_db" "tests/database/financial-policy-engine.sql"
apply_file "$upgrade_db" "docs/supabase-financial-public-api.sql"
apply_file "$upgrade_db" "docs/supabase-financial-public-api.sql"
apply_file "$upgrade_db" "tests/database/financial-public-api.sql"
apply_file "$upgrade_db" "docs/supabase-financial-sso.sql"
apply_file "$upgrade_db" "docs/supabase-financial-sso.sql"
apply_file "$upgrade_db" "tests/database/financial-sso.sql"
apply_file "$upgrade_db" "ops/sql/pilot-isolation-canary.sql"
# Upgrade completo sobre base povoada: resiliência + governança e o teste P0.11.
apply_file "$upgrade_db" "docs/supabase-financial-operational-resilience.sql"
apply_file "$upgrade_db" "docs/supabase-financial-data-governance.sql"
apply_file "$upgrade_db" "tests/database/financial-data-governance.sql"
apply_file "$upgrade_db" "ops/sql/pilot-isolation-canary.sql"
# Rollback com estado de governança recusa (forward-fix), sem apagar evidência.
if psql "$(database_url "$upgrade_db")" -X -q -v ON_ERROR_STOP=1 -f "$root_dir/docs/rollback/supabase-financial-data-governance.rollback.sql" >/dev/null 2>&1; then
  echo "Rollback de governança aceitou apagar estado existente" >&2; exit 1
fi
# Upgrade com dados fictícios de arte: sem reconhecimento de export/backup a
# aposentadoria recusa; com ele, remove só a vertical e preserva o financeiro.
if rejection="$(psql "$(database_url "$upgrade_db")" -X -q -v ON_ERROR_STOP=1 -f "$root_dir/docs/supabase-financial-legacy-art-decommission.sql" 2>&1)"; then
  echo "Aposentadoria apagou dados de arte sem reconhecimento de export" >&2; exit 1
fi
[[ "$rejection" == *"legacy art data present"* ]] || { echo "Aposentadoria falhou por motivo inesperado: $rejection" >&2; exit 1; }
if PGOPTIONS="-c arandu.legacy_art_decommission_ack=sim" psql "$(database_url "$upgrade_db")" -X -q -v ON_ERROR_STOP=1 -f "$root_dir/docs/supabase-financial-legacy-art-decommission.sql" >/dev/null 2>&1; then
  echo "Aposentadoria aceitou reconhecimento sem referência" >&2; exit 1
fi
apply_file "$upgrade_db" "tests/database/legacy-art-decommission-before.sql"
PGOPTIONS="-c arandu.legacy_art_decommission_ack=export-verified:CI-UPGRADE" apply_file "$upgrade_db" "docs/supabase-financial-legacy-art-decommission.sql"
apply_file "$upgrade_db" "tests/database/legacy-art-decommission.sql"
apply_file "$upgrade_db" "docs/supabase-financial-legacy-art-decommission.sql"
apply_file "$upgrade_db" "ops/sql/pilot-isolation-canary.sql"
apply_file "$upgrade_db" "ops/sql/post-migration-probes.sql"
apply_file "$upgrade_db" "ops/sql/post-restore-probes.sql"
if psql "$(database_url "$upgrade_db")" -X -q -v ON_ERROR_STOP=1 -f "$root_dir/docs/rollback/supabase-financial-legacy-art-decommission.rollback.sql" >/dev/null 2>&1; then
  echo "Rollback da aposentadoria fingiu restaurar dados" >&2; exit 1
fi
# Depois da aposentadoria: P0 closure com rollback sem uso e reaplicação.
apply_file "$upgrade_db" "docs/supabase-financial-p0-closure.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-p0-closure.rollback.sql"
apply_file "$upgrade_db" "docs/supabase-financial-p0-closure.sql"
while IFS= read -r file; do
  apply_file "$upgrade_db" "$file"
done < <(after_decommission)
# Remove the later projection before rehearsing rollbacks of its source columns.
# Contract import intents sit above external decisions: they roll back first.
apply_file "$upgrade_db" "docs/rollback/supabase-financial-crm.rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-institutional-decline.rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-negotiation-continuity.rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-provider-intent-integrity.rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-contract-import-integrity.rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-external-decision.rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-relationship-continuity.rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-demo-pool.rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-demo-workspaces.rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-opportunity-discriminator.rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-spend-intelligence.rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-provider-performance.rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-covenants.rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-implementation.rollback.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-value-realization.rollback.sql"
apply_file "$upgrade_db" "docs/supabase-financial-value-realization.sql"
apply_file "$upgrade_db" "tests/database/financial-value-realization.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-fee-intelligence.rollback.sql"
apply_file "$upgrade_db" "docs/supabase-financial-fee-intelligence.sql"
apply_file "$upgrade_db" "docs/supabase-financial-fee-intelligence.sql"
apply_file "$upgrade_db" "tests/database/financial-fee-intelligence.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-opportunity-engine.rollback.sql"
apply_file "$upgrade_db" "docs/supabase-financial-opportunity-engine.sql"
apply_file "$upgrade_db" "docs/supabase-financial-opportunity-engine.sql"
apply_file "$upgrade_db" "tests/database/financial-opportunity-engine.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-document-intelligence.rollback.sql"
apply_file "$upgrade_db" "docs/supabase-financial-document-intelligence.sql"
apply_file "$upgrade_db" "docs/supabase-financial-document-intelligence.sql"
apply_file "$upgrade_db" "tests/database/financial-document-intelligence.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-provider-qualification.rollback.sql"
apply_file "$upgrade_db" "docs/supabase-financial-provider-qualification.sql"
apply_file "$upgrade_db" "docs/supabase-financial-provider-qualification.sql"
apply_file "$upgrade_db" "tests/database/financial-provider-qualification.sql"
apply_file "$upgrade_db" "docs/supabase-financial-implementation.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-implementation.rollback.sql"
apply_file "$upgrade_db" "docs/supabase-financial-implementation.sql"
apply_file "$upgrade_db" "docs/supabase-financial-implementation.sql"
apply_file "$upgrade_db" "tests/database/financial-implementation.sql"
apply_file "$upgrade_db" "docs/supabase-financial-covenants.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-covenants.rollback.sql"
apply_file "$upgrade_db" "docs/supabase-financial-covenants.sql"
apply_file "$upgrade_db" "docs/supabase-financial-covenants.sql"
apply_file "$upgrade_db" "tests/database/financial-covenants.sql"
apply_file "$upgrade_db" "docs/supabase-financial-provider-performance.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-provider-performance.rollback.sql"
apply_file "$upgrade_db" "docs/supabase-financial-provider-performance.sql"
apply_file "$upgrade_db" "docs/supabase-financial-provider-performance.sql"
apply_file "$upgrade_db" "tests/database/financial-provider-performance.sql"
apply_file "$upgrade_db" "docs/supabase-financial-spend-intelligence.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-spend-intelligence.rollback.sql"
apply_file "$upgrade_db" "docs/supabase-financial-spend-intelligence.sql"
apply_file "$upgrade_db" "docs/supabase-financial-spend-intelligence.sql"
apply_file "$upgrade_db" "tests/database/financial-spend-intelligence.sql"
apply_file "$upgrade_db" "docs/supabase-financial-opportunity-discriminator.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-opportunity-discriminator.rollback.sql"
apply_file "$upgrade_db" "docs/supabase-financial-opportunity-discriminator.sql"
apply_file "$upgrade_db" "docs/supabase-financial-opportunity-discriminator.sql"
apply_file "$upgrade_db" "tests/database/financial-opportunity-discriminator.sql"
apply_file "$upgrade_db" "docs/supabase-financial-demo-workspaces.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-demo-workspaces.rollback.sql"
apply_file "$upgrade_db" "docs/supabase-financial-demo-workspaces.sql"
apply_file "$upgrade_db" "docs/supabase-financial-demo-workspaces.sql"
apply_file "$upgrade_db" "tests/database/financial-demo-workspaces.sql"
apply_file "$upgrade_db" "docs/supabase-financial-demo-pool.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-demo-pool.rollback.sql"
apply_file "$upgrade_db" "docs/supabase-financial-demo-pool.sql"
apply_file "$upgrade_db" "docs/supabase-financial-demo-pool.sql"
apply_file "$upgrade_db" "tests/database/financial-demo-workspaces.sql"
apply_file "$upgrade_db" "docs/supabase-financial-security-closure.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-security-closure.rollback.sql"
apply_file "$upgrade_db" "docs/supabase-financial-security-closure.sql"
apply_file "$upgrade_db" "docs/supabase-financial-security-closure.sql"
apply_file "$upgrade_db" "tests/database/financial-security-closure.sql"
apply_file "$upgrade_db" "docs/supabase-financial-request-receipts.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-request-receipts.rollback.sql"
apply_file "$upgrade_db" "docs/supabase-financial-request-receipts.sql"
apply_file "$upgrade_db" "docs/supabase-financial-request-receipts.sql"
apply_file "$upgrade_db" "tests/database/financial-request-receipts.sql"
bash "$root_dir/tests/database/request-receipt-concurrency.sh" "$(database_url "$upgrade_db")"
apply_file "$upgrade_db" "docs/supabase-financial-followup-hardening.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-followup-hardening.rollback.sql"
apply_file "$upgrade_db" "docs/supabase-financial-followup-hardening.sql"
apply_file "$upgrade_db" "docs/supabase-financial-followup-hardening.sql"
apply_file "$upgrade_db" "tests/database/financial-followup-hardening.sql"
apply_file "$upgrade_db" "docs/supabase-financial-contract-onboarding.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-contract-onboarding.rollback.sql"
apply_file "$upgrade_db" "docs/supabase-financial-contract-onboarding.sql"
apply_file "$upgrade_db" "docs/supabase-financial-contract-onboarding.sql"
apply_file "$upgrade_db" "tests/database/financial-contract-onboarding.sql"
apply_file "$upgrade_db" "docs/supabase-financial-renewal-cycles.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-renewal-cycles.rollback.sql"
apply_file "$upgrade_db" "docs/supabase-financial-renewal-cycles.sql"
apply_file "$upgrade_db" "docs/supabase-financial-renewal-cycles.sql"
apply_file "$upgrade_db" "tests/database/financial-renewal-cycles.sql"
# Com marcos em dois ciclos, voltar à unicidade antiga apagaria histórico: recusado.
if apply_file "$upgrade_db" "docs/rollback/supabase-financial-renewal-cycles.rollback.sql" >/dev/null 2>&1; then
  echo "rollback de ciclos de renovação deveria ser recusado com histórico em dois ciclos"; exit 1
fi
apply_file "$upgrade_db" "docs/supabase-financial-decision-integrity.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-decision-integrity.rollback.sql"
apply_file "$upgrade_db" "docs/supabase-financial-decision-integrity.sql"
apply_file "$upgrade_db" "docs/supabase-financial-decision-integrity.sql"
apply_file "$upgrade_db" "tests/database/financial-decision-integrity.sql"
bash "$root_dir/tests/database/financial-decision-race.sh" "$(database_url "$upgrade_db")"
apply_file "$upgrade_db" "docs/supabase-financial-session-revocation.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-session-revocation.rollback.sql"
apply_file "$upgrade_db" "docs/supabase-financial-session-revocation.sql"
apply_file "$upgrade_db" "docs/supabase-financial-session-revocation.sql"
apply_file "$upgrade_db" "tests/database/financial-session-revocation.sql"
apply_file "$upgrade_db" "docs/supabase-financial-document-upload-authorization.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-document-upload-authorization.rollback.sql"
apply_file "$upgrade_db" "docs/supabase-financial-document-upload-authorization.sql"
apply_file "$upgrade_db" "docs/supabase-financial-document-upload-authorization.sql"
apply_file "$upgrade_db" "tests/database/financial-document-upload-authorization.sql"
node "$root_dir/tests/database/document-upload-authorization-race.mjs" "$(database_url "$upgrade_db")"
apply_file "$upgrade_db" "docs/supabase-financial-implementation-task-labels.sql"
apply_file "$upgrade_db" "tests/database/financial-implementation-task-labels-prepare.sql"
if rejection="$(psql "$(database_url "$upgrade_db")" -X -v ON_ERROR_STOP=1 -f "$root_dir/docs/rollback/supabase-financial-implementation-task-labels.rollback.sql" 2>&1)"; then
  echo "Rollback de rótulos deveria recusar planos de implantação existentes" >&2; exit 1
fi
[[ "$rejection" == *"implementation data exists: use forward fix"* ]] || { echo "Rollback de rótulos falhou por motivo inesperado" >&2; exit 1; }
apply_file "$upgrade_db" "docs/supabase-financial-implementation-task-labels.sql"
apply_file "$upgrade_db" "tests/database/financial-implementation-task-labels.sql"
apply_file "$upgrade_db" "docs/supabase-financial-implementation-task-labels.sql"
apply_file "$upgrade_db" "tests/database/financial-implementation-task-labels.sql"
# Rehearse the add-on migration from its preceding schema marker, including a
# successful no-data rollback, a refusal after assignment data, and reapply.
apply_file "$upgrade_db" "docs/supabase-financial-task-accountability.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-task-accountability.rollback.sql"
apply_file "$upgrade_db" "tests/database/financial-task-accountability-prepare.sql"
apply_file "$upgrade_db" "docs/supabase-financial-task-accountability.sql"
apply_file "$upgrade_db" "tests/database/financial-task-accountability.sql"
if rejection="$(psql "$(database_url "$upgrade_db")" -X -v ON_ERROR_STOP=1 -f "$root_dir/docs/rollback/supabase-financial-task-accountability.rollback.sql" 2>&1)"; then
  echo "Rollback de responsabilidade deveria recusar dados de atribuição" >&2; exit 1
fi
[[ "$rejection" == *"task accountability data exists: use forward fix"* ]] || { echo "Rollback de responsabilidade falhou por motivo inesperado" >&2; exit 1; }
apply_file "$upgrade_db" "docs/supabase-financial-task-accountability.sql"
apply_file "$upgrade_db" "tests/database/financial-task-accountability-reapply.sql"
apply_file "$upgrade_db" "docs/supabase-financial-enterprise-integrity.sql"
apply_file "$upgrade_db" "docs/rollback/supabase-financial-enterprise-integrity.rollback.sql"
apply_file "$upgrade_db" "docs/supabase-financial-enterprise-integrity.sql"
apply_file "$upgrade_db" "docs/supabase-financial-enterprise-integrity.sql"
apply_file "$upgrade_db" "tests/database/financial-enterprise-integrity.sql"
node "$root_dir/tests/database/approval-membership-race.mjs" "$(database_url "$upgrade_db")"
bash "$root_dir/tests/database/task-assignee-membership-race.sh" "$(database_url "$upgrade_db")"
bash "$root_dir/tests/database/email-fairness-concurrency.sh" "$(database_url "$upgrade_db")"
apply_file "$upgrade_db" "tests/database/email-outbox.sql"
bash "$root_dir/tests/database/email-outbox-concurrency.sh" "$(database_url "$upgrade_db")"

# Instalação limpa em uma passada (o que um ambiente novo recebe): a cadeia
# canônica inteira, inclusive a aposentadoria da arte, e as suítes financeiras
# sobre o schema final.
apply_file "$fresh_db" "tests/database/bootstrap.sql"
while IFS= read -r file; do
  apply_file "$fresh_db" "$file"
done < <(node -e "const m=require('./docs/supabase-migrations.json'); const i=m.cleanInstall.indexOf('docs/supabase-financial-legacy-art-decommission.sql'); for (const f of m.cleanInstall.slice(0,i+1)) console.log(f)")
apply_file "$fresh_db" "tests/database/legacy-art-decommission-before.sql"
apply_file "$fresh_db" "docs/supabase-financial-legacy-art-decommission.sql"
apply_file "$fresh_db" "tests/database/legacy-art-decommission.sql"
while IFS= read -r file; do
  apply_file "$fresh_db" "$file"
done < <(after_decommission)
# Rehearse older migrations only after removing the unused latest receipt layer.
apply_file "$fresh_db" "docs/rollback/supabase-financial-crm.rollback.sql"
apply_file "$fresh_db" "docs/rollback/supabase-financial-institutional-decline.rollback.sql"
apply_file "$fresh_db" "docs/rollback/supabase-financial-negotiation-continuity.rollback.sql"
apply_file "$fresh_db" "docs/rollback/supabase-financial-provider-intent-integrity.rollback.sql"
for suite in financial-procurement financial-procurement-hardening financial-pilot financial-enterprise-approvals financial-enterprise-drafts \
  financial-collaboration financial-operational-search financial-renewals financial-rfq-editor financial-rfq-revisions financial-delivery \
  financial-pilot-grade financial-pilot-operations financial-final-hardening financial-approval-handoff financial-passport \
  financial-multi-entity financial-contracts-v2 financial-relationships-portfolio financial-passport-entities financial-graph \
  financial-policy-engine financial-public-api financial-sso financial-data-governance financial-p0-closure financial-value-realization financial-fee-intelligence financial-opportunity-engine financial-document-intelligence financial-provider-qualification financial-implementation financial-covenants; do
  apply_file "$fresh_db" "tests/database/${suite}.sql"
done
apply_file "$fresh_db" "tests/database/financial-provider-performance.sql"
apply_file "$fresh_db" "tests/database/financial-spend-intelligence.sql"
apply_file "$fresh_db" "tests/database/financial-opportunity-discriminator.sql"
apply_file "$fresh_db" "tests/database/financial-demo-workspaces.sql"
node "$root_dir/tests/database/demo-claim-concurrency.mjs" "$(database_url "$fresh_db")"
apply_file "$fresh_db" "tests/database/financial-security-closure.sql"
apply_file "$fresh_db" "tests/database/financial-request-receipts.sql"
apply_file "$fresh_db" "tests/database/financial-followup-hardening.sql"
apply_file "$fresh_db" "tests/database/financial-contract-onboarding.sql"
apply_file "$fresh_db" "tests/database/financial-renewal-cycles.sql"
apply_file "$fresh_db" "tests/database/financial-decision-integrity.sql"
apply_file "$fresh_db" "tests/database/financial-enterprise-integrity.sql"
node "$root_dir/tests/database/approval-membership-race.mjs" "$(database_url "$fresh_db")"
bash "$root_dir/tests/database/financial-decision-race.sh" "$(database_url "$fresh_db")"
apply_file "$fresh_db" "tests/database/financial-session-revocation.sql"
apply_file "$fresh_db" "tests/database/financial-document-upload-authorization.sql"
node "$root_dir/tests/database/document-upload-authorization-race.mjs" "$(database_url "$fresh_db")"
apply_file "$fresh_db" "tests/database/financial-implementation-task-labels-prepare.sql"
apply_file "$fresh_db" "docs/supabase-financial-implementation-task-labels.sql"
apply_file "$fresh_db" "tests/database/financial-implementation-task-labels.sql"
apply_file "$fresh_db" "docs/supabase-financial-task-accountability.sql"
apply_file "$fresh_db" "tests/database/financial-task-accountability-prepare.sql"
apply_file "$fresh_db" "tests/database/financial-task-accountability.sql"
apply_file "$fresh_db" "docs/supabase-financial-task-accountability.sql"
apply_file "$fresh_db" "tests/database/financial-task-accountability-reapply.sql"
bash "$root_dir/tests/database/task-assignee-membership-race.sh" "$(database_url "$fresh_db")"
apply_file "$fresh_db" "docs/supabase-financial-enterprise-integrity.sql"
apply_file "$fresh_db" "ops/sql/pilot-isolation-canary.sql"
apply_file "$fresh_db" "ops/sql/post-migration-probes.sql"

# Current security patch and compatible rollback/forward-fix on both paths.
for current_db in "$upgrade_db" "$fresh_db"; do
  apply_file "$current_db" "docs/supabase-financial-decision-authorization.sql"
  apply_file "$current_db" "docs/rollback/supabase-financial-decision-authorization.rollback.sql"
  apply_file "$current_db" "docs/supabase-financial-decision-authorization.sql"
  apply_file "$current_db" "docs/supabase-financial-decision-authorization.sql"
  node "$root_dir/tests/database/decision-membership-race.mjs" "$(database_url "$current_db")"
  apply_file "$current_db" "ops/sql/post-migration-probes.sql"
done
node "$root_dir/tests/database/pilot-schema-upgrade.mjs" "$base_url"

# External ingestion: additive upgrade, pre-data rollback and reapply on both paths.
for current_db in "$upgrade_db" "$fresh_db"; do
  # Newer source adapters must be rolled back before their underlying ingestion view.
  if [[ "$(psql "$(database_url "$current_db")" -X -qAt -v ON_ERROR_STOP=1 -c "select exists(select 1 from information_schema.columns where table_schema='public' and table_name='fin_contracts' and column_name='import_request_key')")" == t ]]; then
    apply_file "$current_db" "docs/rollback/supabase-financial-contract-import-integrity.rollback.sql"
  fi
  if [[ "$(psql "$(database_url "$current_db")" -X -qAt -v ON_ERROR_STOP=1 -c "select exists(select 1 from information_schema.columns where table_schema='public' and table_name='fin_decisions' and column_name='external_proposal_id')")" == t ]]; then
    apply_file "$current_db" "docs/rollback/supabase-financial-external-decision.rollback.sql"
  fi
  apply_file "$current_db" "docs/supabase-financial-external-proposals.sql"
  apply_file "$current_db" "docs/rollback/supabase-financial-external-proposals.rollback.sql"
  apply_file "$current_db" "docs/supabase-financial-external-proposals.sql"
  apply_file "$current_db" "docs/supabase-financial-external-proposals.sql"
  apply_file "$current_db" "tests/database/financial-external-proposals.sql"
  node "$root_dir/tests/database/external-proposal-concurrency.mjs" "$(database_url "$current_db")"
  apply_file "$current_db" "ops/sql/post-migration-probes.sql"
  apply_file "$current_db" "ops/sql/pilot-isolation-canary.sql"
done


# Derived projection: clean/upgrade, idempotence and compatible rollback.
for current_db in "$clean_db" "$upgrade_db" "$fresh_db"; do
  apply_file "$current_db" "docs/supabase-financial-relationship-continuity.sql"
  apply_file "$current_db" "docs/supabase-financial-relationship-continuity.sql"
  apply_file "$current_db" "docs/rollback/supabase-financial-relationship-continuity.rollback.sql"
  apply_file "$current_db" "docs/supabase-financial-relationship-continuity.sql"
  apply_file "$current_db" "tests/database/financial-relationship-continuity.sql"
  apply_file "$current_db" "ops/sql/post-migration-probes.sql"
  apply_file "$current_db" "ops/sql/pilot-isolation-canary.sql"
done

# Typed external decisions: additive upgrade, guarded rollback, reapply and full flow.
for current_db in "$clean_db" "$upgrade_db" "$fresh_db"; do
  apply_file "$current_db" "docs/supabase-financial-external-decision.sql"
  apply_file "$current_db" "docs/rollback/supabase-financial-external-decision.rollback.sql"
  apply_file "$current_db" "docs/supabase-financial-external-decision.sql"
  apply_file "$current_db" "docs/supabase-financial-external-decision.sql"
  apply_file "$current_db" "tests/database/financial-external-decision.sql"
  node "$root_dir/tests/database/external-decision-concurrency.mjs" "$(database_url "$current_db")"
done

# Contract import intents (#276) on top of external decisions: clean, upgrade and
# fresh paths, pre-use rollback restoring the decision marker, reapply twice,
# SQL contract and real concurrency (eight retries, revocation, used rollback refused).
for current_db in "$clean_db" "$upgrade_db" "$fresh_db"; do
  apply_file "$current_db" "docs/supabase-financial-contract-import-integrity.sql"
  apply_file "$current_db" "docs/rollback/supabase-financial-contract-import-integrity.rollback.sql"
  [[ "$(psql "$(database_url "$current_db")" -X -qAt -v ON_ERROR_STOP=1 -c "select value from public.fin_settings where key='schema_version'")" == financial-external-decision-1 ]] || { echo "Rollback da intenção contratual não restaurou o marker da decisão externa" >&2; exit 1; }
  apply_file "$current_db" "docs/supabase-financial-contract-import-integrity.sql"
  apply_file "$current_db" "docs/supabase-financial-contract-import-integrity.sql"
  apply_file "$current_db" "tests/database/financial-contract-import-integrity.sql"
  node "$root_dir/tests/database/contract-import-integrity-concurrency.mjs" "$(database_url "$current_db")"
  apply_file "$current_db" "ops/sql/post-migration-probes.sql"
  apply_file "$current_db" "ops/sql/pilot-isolation-canary.sql"
  [[ "$(psql "$(database_url "$current_db")" -X -qAt -v ON_ERROR_STOP=1 -c "select value from public.fin_settings where key='schema_version'")" == financial-contract-import-integrity-1 ]] || { echo "Marker final diferente de financial-contract-import-integrity-1" >&2; exit 1; }
done

# Provider receipts: every canonical installation path, rollback before use,
# reapply, adversarial SQL and independent concurrent sessions.
for current_db in "$clean_db" "$upgrade_db" "$fresh_db"; do
  apply_file "$current_db" "docs/supabase-financial-provider-intent-integrity.sql"
  apply_file "$current_db" "docs/rollback/supabase-financial-provider-intent-integrity.rollback.sql"
  [[ "$(psql "$(database_url "$current_db")" -X -qAt -v ON_ERROR_STOP=1 -c "select value from public.fin_settings where key='schema_version'")" == financial-contract-import-integrity-1 ]] || exit 1
  apply_file "$current_db" "docs/supabase-financial-provider-intent-integrity.sql"
  apply_file "$current_db" "docs/supabase-financial-provider-intent-integrity.sql"
  apply_file "$current_db" "tests/database/financial-provider-intent-integrity.sql"
  node "$root_dir/tests/database/provider-intent-concurrency.mjs" "$(database_url "$current_db")"
  apply_file "$current_db" "ops/sql/post-migration-probes.sql"
  apply_file "$current_db" "ops/sql/pilot-isolation-canary.sql"
  [[ "$(psql "$(database_url "$current_db")" -X -qAt -v ON_ERROR_STOP=1 -c "select value from public.fin_settings where key='schema_version'")" == financial-provider-intent-integrity-1 ]] || exit 1
done

echo "Arandu Database Integration Tests"
echo "Instalação limpa, upgrade, reaplicação, rollback, RLS, transações, pedidos, invariantes PR38, outbox, fencing de workers, retenção, procurement financeiro e operação real do piloto (convite, janela de envio, aviso de renovação), finance_ops, destinatário do convite superfície exposta ao PostgREST (fidelidade aos default privileges do Supabase, matriz adversarial entre tenants) aviso ao próximo aprovador da cadeia Financial Passport (proveniência, histórico, snapshot imutável na RFQ, negação a provedor e a outro tenant) multi-entity (escopo por entidade, RLS, guarda de escrita, consolidação, trilha, rollback) Contract Center v2 (importado com próxima ação, duplicado e principal incoerente recusados, prorrogação reabre o ciclo de renovação, decisão presa à versão vista e envio × decisão sem deadlock em duas sessões reais, sessão revogada recusada no PostgREST, termos versionados, aditivo imutável, marcos idempotentes) Policy & Approval Engine v2 (precedência grupo/entidade, versão imutável, snapshot, SoD, exceção, delegação, prazos, rollback) e Public API v1/Webhooks (credencial por hash, escopo+entidade, keyset, idempotência, outbox mínimo, lease/backoff/dead-letter/replay, rollback) e Enterprise SSO (domínio verificado, autorização fail-closed, revogação de sessões, enforcement, rollback) e Data Governance (retenção versionada com hold, lote e rerun, export isolado sem segredo, offboarding com revogação idempotente, rollback só sem uso) e aposentadoria da vertical de arte (recusa sem export reconhecido, estado final sem arte, financeiro intacto, reaplicação, instalação limpa em uma passada) e intenção persistente de registro contratual (recibo por chave, replay, conflito material, responsável elegível, oito retries concorrentes, rollback só antes do uso) aprovados."

# Versioned origin and confirmed opportunity outcome, after the older suites.
for current_db in "$clean_db" "$upgrade_db" "$fresh_db"; do
  apply_file "$current_db" "docs/supabase-financial-negotiation-continuity.sql"
  apply_file "$current_db" "docs/rollback/supabase-financial-negotiation-continuity.rollback.sql"
  apply_file "$current_db" "docs/supabase-financial-negotiation-continuity.sql"
  apply_file "$current_db" "docs/supabase-financial-negotiation-continuity.sql"
  apply_file "$current_db" "tests/database/financial-negotiation-continuity.sql"
done

for current_db in "$clean_db" "$upgrade_db" "$fresh_db"; do
  apply_file "$current_db" "docs/supabase-financial-institutional-decline.sql"
  apply_file "$current_db" "docs/rollback/supabase-financial-institutional-decline.rollback.sql"
  apply_file "$current_db" "docs/supabase-financial-institutional-decline.sql"
  apply_file "$current_db" "docs/supabase-financial-institutional-decline.sql"
  apply_file "$current_db" "tests/database/financial-institutional-decline.sql"
  apply_file "$current_db" "ops/sql/post-migration-probes.sql"
  apply_file "$current_db" "ops/sql/pilot-isolation-canary.sql"
done

# Three independent-session interleavings after the final schema (synthetic fixtures).
node "$root_dir/tests/database/financial-intelligence-concurrency.mjs" "$(database_url "$fresh_db")"

# CRM command surface: additive/reapply and non-destructive rollback in all flows.
for current_db in "$clean_db" "$upgrade_db" "$fresh_db"; do
  apply_file "$current_db" "docs/supabase-financial-crm.sql"
  apply_file "$current_db" "docs/rollback/supabase-financial-crm.rollback.sql"
  apply_file "$current_db" "docs/supabase-financial-crm.sql"
  apply_file "$current_db" "docs/supabase-financial-crm.sql"
  apply_file "$current_db" "tests/database/financial-crm.sql"
  apply_file "$current_db" "ops/sql/post-migration-probes.sql"
  apply_file "$current_db" "ops/sql/pilot-isolation-canary.sql"
done
node "$root_dir/tests/database/financial-crm-concurrency.mjs" "$(database_url "$fresh_db")"
