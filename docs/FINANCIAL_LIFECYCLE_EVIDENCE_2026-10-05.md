# Lifecycle implementation evidence — 2026-10-05

## Baseline and maturity

Initial and unchanged `pilot`: `13dc091a15cbe12666355c955dbeb5aff079e74f` (after #131). `main`: `ed5da41c5244040d9e3b1ddb501053280d692622`. No feature merge, production promotion or hosted migration was performed. P1.4 and Provider Qualification were reused, not rebuilt.

| Capability | Before | After | PR | Maturity | Evidence | CI | Hosted | Blocker | Next gate |
|---|---|---|---|---|---|---|---|---|---|
| Post-Award Implementation & Transition | NOT_STARTED as structured workflow | Core implemented; product templates, milestones/dependencies, tasks, evidence, issues, human go-live | #132 | M1 | E1 local Node/PostgreSQL 16 | Four required jobs fail without steps on initial feature SHA; new SHA must be checked | New tables absent | Actions, browser engines, Stage 0 | Four gates on final SHA + merge:gates; hosted recovery/journey thereafter |
| Covenant & Obligation Monitor | Contract milestone text, no structured covenant metric/period review | Core implemented; 7 tables, recurrence, source/metric/threshold, evidence, review/waiver SoD, current executive coverage | Covenant draft (linked in PR metadata) | M1 | E1 local Node/PostgreSQL 16 | Requires own exact-SHA gates | New tables absent | Actions, browser engines, Stage 0 | Validate stacked dependency and four gates; rebase onto pilot after #132 is safely merged |
| Provider Performance | Existing relationship reviews; dedicated capability NOT_STARTED | NOT_STARTED in this execution | — | Unchanged | No new evidence | — | — | Implementation remains | Independent Phase 5 PR |
| Financial Spend Intelligence | Existing Fee Intelligence | NOT_STARTED as dedicated structured spend | — | Unchanged | No new evidence | — | — | Implementation remains | Phase 6 after performance |
| Complete Executive Portfolio | Existing P1.6 slice | Incrementally extended with current covenant status/coverage; full scope incomplete | Covenant draft | M1 for increment | Scoped RPC + Node/SQL tests | Required gates pending | Unvalidated increment | Remaining sourcing/debt/concentration/qualification/performance/spend coverage | Phase 7 after Phase 5/6 |
| Enterprise Intake | NOT_STARTED | NOT_STARTED | — | — | — | — | — | Implementation remains | Phase 8 |
| Scenario Builder / Allocation | Existing factual proposal comparison | NOT_STARTED as versioned scenarios | — | — | — | — | — | Implementation remains | Phase 9 |
| SCIM / JIT / Access Reviews | Existing SSO foundation | Dedicated additions NOT_STARTED | — | — | — | — | — | Implementation remains | Phase 10; retain SSO |
| Integration Platform | Existing API/webhooks/integration surfaces | Common synchronization platform NOT_STARTED | — | — | — | — | — | Implementation remains | Phase 11 foundation |
| Product Packs | Existing product fields/calculations | New packs NOT_STARTED | — | — | — | — | — | Implementation remains | Phase 12 |
| Assistive AI Analyst | Existing Document Intelligence | Analyst NOT_STARTED | — | — | — | — | — | Lifecycle prerequisites remain | Phase 13 with human control |
| Benchmarks | Not enabled | NOT_STARTED; no invented observations | — | — | — | — | — | Coverage/privacy/consent gates | Phase 14 only after prerequisites |

The remaining capabilities are not represented as completed. CI failure is not treated as a functional regression or used to claim M2. Draft PRs preserve reviewable work while the merge block remains.

## Inventory

- Branches: `codex/post-award-implementation` and `codex/covenant-obligation-monitor`; drafts only. The covenant PR is stacked because it extends the same owner-scope helper and leased job/projections/export. Both descend from the initial live pilot; the covenant branch is created from that pilot before its dependency is fast-forwarded. Rebase/retarget and rerun gates after the predecessor is merged; never merge a stale combination.
- Migrations: `docs/supabase-financial-implementation.sql` and `docs/supabase-financial-covenants.sql`, with fail-closed unused-capability rollback files. Final source marker `financial-covenants-1`.
- Post-award tables: `fin_implementation_plans`, `fin_implementation_milestones`, `fin_implementation_dependencies`, `fin_implementation_issues`, `fin_implementation_acceptances`.
- Monitor tables: `fin_obligations`, `fin_covenants`, `fin_obligation_periods`, `fin_covenant_measurements`, `fin_obligation_evidence`, `fin_obligation_reviews`, `fin_covenant_waivers`. Invoker view `fin_obligation_monitor` is derived.
- Post-award RPCs: `fin_open_implementation`, `fin_update_implementation_milestone`, `fin_implementation_issue`, `fin_accept_implementation`, `fin_cancel_implementation`; private require/owner/dependency helpers.
- Monitor RPCs: `fin_open_obligation`, `fin_record_obligation_data`, `fin_review_obligation`, `fin_covenant_waiver`, `fin_cancel_obligation`, read-only `fin_obligation_facts`, `fin_obligation_summary`; private scope/period helpers. Service-only `fin_run_obligations` is invoked by the existing leased `fin_run_contract_milestones` job.
- APIs: JWT `/api/finance/implementations` plus detail/open/milestone/issue/resolve-issue/accept/cancel; `/api/finance/covenants` plus detail/summary/open/data/review/waiver/decide-waiver/cancel. Executive gains scoped current covenant counts. No new serverless function or service-key user reads.
- Pages: `/finance/implementations.html`, `/finance/covenants.html`, lazy-loaded and excluded from demo. Shared ledger renderer; provider/entity filters and explicit coverage bounds.
- RLS/RBAC: buyer-only live membership/entity grants, children inherit scope, hidden rows return absence, no direct authenticated writes/anon access, roles checked in RPCs, owner/document references checked against source contract, offboarding guards. Recorder cannot conclude their own review; requester cannot decide their own waiver. Revoked JWT claims confer no continuing authority.
- Tasks/notifications: existing contract tasks, version-aware completion/cancellation and review reopening, one in-app reminder per milestone/period, live authorized owner, existing daily lease. No external delivery or real-time SLA claim.
- Opportunity rules added: implementation_overdue, implementation_blocked, covenant_due, covenant_awaiting_data, covenant_non_compliance, waiver_expiry, contractual_obligation_overdue. Configurable, disabled until customer configuration, contract source plus plan/period fact, rule version and timestamp; no financial action.
- Search/Graph: scoped implementation plans and structured obligations/periods; safe canonical links, invoker projections.
- Data Governance: 12 new base-table entries with source/retention/deletion/export semantics; 12 datasets; derived monitor entry; source-of-truth descriptions. Used-capability rollback refuses records and related configured rules/opportunities. Legal holds/offboarding remain governed.

## Local verification

- `npm ci --include=optional`: succeeded.
- `npm run audit:ci`: zero vulnerabilities. `npm run sbom:ci`: 21 components.
- `check:finance`, migration/security checks and `check:all` via hermetic deploy check: succeeded.
- `ARANDU_SITE_URL=https://arandu.example.invalid npm run deploy:check`: succeeded. The explicit domain is synthetic local test configuration, not hosted evidence. Includes build, size, assets, financial surface/navigation, SEO, and E2E discovery.
- `npm run build:demo` plus build-size: succeeded. No budget increased. Final combined JS: production 428,308/800,000 bytes, largest 82,324/100,000; demo 799,398/800,000, largest 89,125/100,000. Demo has 602 bytes of headroom, a material limit for future changes.
- `npm run test:database`: full clean/upgrade/fresh, reapply, rollback, canary/probes succeeded in PostgreSQL 16. Final canary: 82 identities including synthetic external user, 6,764 checks, zero leaks. Post-award isolated worktree suite also passed: final canary 6,260 checks, zero leaks. Additional focused final tests cover review-without-data and exact decimal transport/comparison.
- New Node tests: `scripts/test-finance-implementation.mjs`, `scripts/test-finance-covenants.mjs`; API tests assert caller JWT, hidden scope, forged tenant rejection, version validation, and no user-triggered scans. Decimal comparisons preserve text precision; SQL remains authoritative.
- New SQL suites: `tests/database/financial-implementation.sql`, `tests/database/financial-covenants.sql`. Negative coverage: roles, tenants/entities/providers, stale JWT, missing evidence/data, dependency ordering, version/review conflicts, independent review, factual-result mismatch, stale measurement, waiver self-decision/expiry, immutable history. Recurrence, acquiring/credit templates, reminders, opportunities, export and executive coverage tested.
- Existing concurrency harness had a race reading holder.log before the background redirection created it. Both applicable tests now initialize the log before starting the process; synchronization/invariant remain enforced.
- E2E discovery: 480 tests across 16 files and five projects. Four new scenarios cover explicit acceptance, viewer restrictions, missing-data review choices and clause/period visibility. They are registered; **browser execution not passed**. Chromium installation failed with invalid/truncated archive; attempted post-award run failed because the executable is absent. No retry/budget/gate weakened. Presentation E2E likewise remains blocked by absent engines.
- `git diff --check`: passed.
- Local PostgreSQL sandbox required a temporary identity shim because only UID 0 is mapped; this is confined to disposable test processes and is not in the repository or deployment.

## CI and merge block

Initial #132 feature SHA `be394d3bb2e93ec8644fc1f8f87292b64dff4234`: Actions run `37352317709`; database, deploy-boundaries, validate, presentation all failed, each with an empty step list. Current annotation reason could not be fetched; historical documents/user context identify billing, but this execution directly confirms only no executed steps. Vercel preview/comment success and Supabase preview skip do not substitute for required gates.

`npm run merge:gates -- 132` returned blocked (private repository HTTP 404 without a local GitHub token). Authenticated connector independently confirmed the four failures. Final heads/checks are recorded in PR metadata and the response; no old green SHA is reused. No PR was merged.

## Hosted observation and owner actions

Authenticated read-only Supabase observation at `2026-10-05T18:13:53.249821Z`, project `offgpyysgdhfemjlchod` (Arandu Pilot): schema `financial-surface-hardening-1`, deployment_environment absent, zero organizations, zero verified MFA factors, one private `fin-documents` bucket, zero document objects. New implementation/covenant tables absent. The legacy project `igacnfjeuqhxcmfyepgj` was not modified. Admin query access exists through the connector; no direct backup-capable connection was obtained.

Owner actions: restore GitHub Actions execution/billing; provide valid CI runner browser engines; require the four exact-head gates and merge:gates; review the drafts in dependency order and rebase onto current pilot after each merge. Before hosted DDL, obtain direct administrative connection and verified backup/restore evidence, environment identity, Storage recovery and MFA recovery; then apply the canonical pending bundle, doctor/canary, authenticated journey and release checks. Hosted remains NO-GO. No customer or provider was messaged.
