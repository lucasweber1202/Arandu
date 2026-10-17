# Backend lifecycle and platform — Mission F

## Scope and baseline

Exclusive worktree/branch `codex/backend-lifecycle-security-20261016` from
`47e8f425fe73161b19538052f2a93e7f0ae775d6`. Node 24.19.0. No frontend,
Claude evidence, global config or migrations changed. No hosted mutation.

## Reproductions and corrections

1. Lifecycle lists ignored `contract_id`: new transport regression failed on
baseline because the PostgREST query had no contract predicate. Both existing
list endpoints now validate and AND the optional exact UUID filter with their
existing scope. Duplicate and unsupported summary/detail filters fail explicitly.
Real PostgreSQL tests cover same-bank contracts, different entities, historical
states and foreign tenant/provider access. No new grants or service-role fallback.
2. Implementation detail displayed technical provenance and raw dates. Bounded
exact-reference reads under caller JWT now provide named provenance, including
historical contracts. Shared presentation helpers format dates and neutral
fallbacks. Raw IDs remain additive machine provenance; writes remain unchanged.
3. Task POST returned `201` with `row:null` on an empty upstream representation.
The negative test failed on baseline. Creation now requires exactly one UUID row,
otherwise `409 task_creation_unknown`. Reconciliation replay also validates its
ID. Tests cover malformed/empty/multiple rows, no automatic insert retry, network
loss after commit, same-key replay and different-intent conflicts.

API handoff: [contract lifecycle API](../FINANCIAL_CONTRACT_LIFECYCLE_API.md).
No migration or remote backfill. Rollback: revert this changeset; additive origin
fields and optional filters disappear, stored data and existing schema remain.
Task uncertainty can still mean a committed insert: clients must reconcile using
the same key. Offset paging is not a concurrent snapshot.

## Operational evidence

| Item | Status | Evidence / boundary |
| --- | --- | --- |
| Baseline four gates | VERIFIED | CI run 38987936957: database, deploy-boundaries, validate, presentation success on baseline SHA |
| Baseline merge audit | VERIFIED | Run 38987937002 success |
| GitHub deployments | VERIFIED, metadata only | Baseline Vercel status: Demo success, Pilot success, Official failure; does not establish readiness |
| Detailed Vercel configuration | ACCESS_BLOCKED | Previously denied scope lucas-projects467; no retry without credential change, no alternate scope |
| Pilot schema | VERIFIED, read-only metadata | financial-surface-hardening-1; deployment_environment absent; task assignee absent; session guard and pgrst.db_pre_request absent |
| Pilot isolation metadata | VERIFIED, limited | Financial tables without RLS: 0; document bucket private, limit 10485760; not an authorization probe |
| Canonical datasource / Demo conversion | INCONCLUSIVE | No approved permanent assignment or demonstrated hosted backend identity |
| Hosted recovery and surface revocation | NOT_RUN | No export/restore, Auth, Storage or deployment changes authorized |
| M3 | NOT_PROVEN | CI, metadata and local PostgreSQL do not establish hosted recovery/isolation |

Production failure's actual build cause remains INCONCLUSIVE without authorized
logs. Existing topology/assignment guards remain unchanged. No claim that the
metadata status proves a compiler failure. The next hosted step requires scoped
read access to the exact deployment/configuration, then specific authorization
for preservation, target identity and conversion operations. No secrets requested.

## Local validation

Targeted lifecycle API, implementation, covenant, finance API, backend and migration
checks passed. Baseline-negative logs were retained locally without secrets.
Full-suite and disposable PostgreSQL results are recorded below after completion.

The host umask 0077 made the recovery negative fixture requested as 0644 actually
0600. Running the unmodified suite with umask 022 restores the intended test;
no recovery guard or security assertion was changed. The local Docker psql adapter
needed explicit environment forwarding and stdin for `-f -`; these are lab setup
issues, not product corrections. PostgreSQL 17.6 uses synthetic data, no published
port and a mission-specific container; no shared Claude database is involved.

`check:all` passed in full with umask 022, including backend, finance, security,
migration, staging, recovery doctor/manifest/Storage negative tests and topology
checks. Recovery transport tests in this suite use mocked transports; they are
not a hosted restore or a fresh end-to-end encrypted recovery exercise.
`build` passed. `audit:ci` passed with 0 vulnerabilities. `check:evidence` executed
successfully as a diagnostic but reports only 1/13 release gates released; it is
not release authorization. `git diff --check` passed.

Full `npm run test:database` passed on PostgreSQL 17.6: clean install, upgrade,
reapplication, rollback, fresh install, RLS, decision races, upload revocation
serialization and task assignment versus membership removal/demotion. The new
contract/entity/tenant/provider SQL assertions ran on the existing integration
paths. This is disposable synthetic PostgreSQL evidence, not hosted Supabase
Auth/Storage verification. Branch CI and PR identity are recorded in the PR;
this committed evidence deliberately does not claim a future CI result.
