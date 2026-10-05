# Covenant & Obligation Monitor

M1/E1 local. Depends on the Post-Award branch for the existing leased job, owner-scope helper, export, Search and Graph definitions. Review as a stacked PR after #132; do not merge either feature until all four required CI gates and `merge:gates` pass on the exact final SHA.

## Structured source and periods

`fin_obligations` records the buyer contract, source contract version, clause, reference, entity, provider, owner, kind, frequency, initial period, delivery deadline, grace and reminder days. Supported kinds are financial/reporting covenant, information obligation, contractual deadline, operational obligation and document delivery. `fin_covenants` holds the customer metric, operator, threshold and unit; monetary metrics require an explicit currency. Thresholds have no financial default. The definition is immutable through product APIs; cancel with a justification and register a replacement when terms change.

`fin_obligation_periods` materializes independent periods/tasks. Once, monthly, quarterly and annual schedules are supported. Recurrence is anchored to the original start; each end is the day before the next anchored start. The initial end must match that rule; the original deadline lag in days is preserved, including month-end transitions. Opening supports up to five years of history. The daily job creates elapsed periods idempotently (technical bound: 1,200 recurrences), without duplicating tasks. The first period is created immediately. It does not execute any contractual performance.

## Evidence and decisions

`fin_covenant_measurements` preserves numeric measurements, date, reference, provenance/method and optional same-contract document. Values/thresholds are bounded finite decimals in PostgreSQL. Unit/currency come from the definition; reporting obligations reject invented numeric measurements. `fin_obligation_evidence` preserves evidence of delivery. Both are append-only.

`fin_obligation_reviews` preserves human review, justification and the exact period measurement/evidence. Administrator/manager reviews; recorder and final reviewer must differ. The latest data must be reviewed, with an expected previous-review ID. Financial conclusions must match the declared operator/threshold. Missing data cannot be concluded compliant or non-compliant. `not_applicable` requires an explicit human justification. New evidence makes an old conclusion under review and reopens the task. Historical records remain intact.

`fin_covenant_waivers` records request, justification, compensating controls, expiry, independent decision and version. Requester cannot approve/reject their own waiver. Approved, unexpired waiver is an exception state; it preserves the factual comparison and does not rewrite compliance. Expiry is effective on read without waiting for cron. Validity is limited to 366 days, a technical limit rather than a legal opinion.

`fin_obligation_facts` / invoker view `fin_obligation_monitor` derive `not_due`, `due_soon`, `awaiting_data`, `under_review`, `compliant`, `non_compliant`, `waived`, `not_applicable`. Before the deadline, missing data has no compliance conclusion; at/after the deadline it remains awaiting data even if someone started review. Cancelled definitions are explicitly shown with the cancellation justification. Returned facts include period, source, method, coverage, formula, due/grace dates, data/review IDs, waiver expiry and observation date. No aggregate bank score, financial recommendation or automatic commercial action exists.

## Integration and boundaries

- `/finance/covenants.html`: list by provider/entity, period detail, data/evidence, independent review, waiver request/decision, cancellation. Shared renderer exposes management forms to administrators/managers; analyst writes are available by API.
- JWT API `/api/finance/covenants`: list, `/detail`, `/summary`, `/open`, `/data`, `/review`, `/waiver`, `/decide-waiver`, `/cancel`. No service-role reads. Pagination 25 periods; overlarge histories fail explicitly and direct to the governed export.
- Buyer-only RLS uses live membership and entity grants. All children derive scope from the period/obligation. Providers, other tenants/entities and revoked members cannot read or mutate. RPCs reject offboarding and foreign evidence/owners. Direct authenticated writes and anonymous reads are revoked. Private owner helpers are not executable by authenticated clients.
- Existing contract-milestones leased job invokes `fin_run_obligations`. It materializes periods, reconciles task state, and sends one in-app reminder per period to a live authorized owner; it is not a real-time external alert.
- Financial Graph and Search contain scoped obligations/periods. Search uses the `covenant` category for all structured obligation kinds.
- Opportunity rules: `covenant_due`, `covenant_awaiting_data`, `covenant_non_compliance`, `waiver_expiry`, `contractual_obligation_overdue`. Disabled until customer configuration; each occurrence uses a contract source and period discriminator, facts, rule version and date.
- Executive portfolio adds current scoped counts by kind/state and coverage with a next-action link. It explicitly distinguishes current covenant state from the separate value-period filter.
- All seven base tables enter portable export and the Data Governance registry; monitor is derived. Legal holds/offboarding semantics are preserved. Rollback restores prior projections/job/catalog before dropping unused objects and refuses records or related rules/opportunities in use. After use, apply a forward fix.

## Evidence and gaps

Node, SQL and E2E tests are registered in the normal gates. SQL exercises missing data, arithmetic, independent review, stale review/data, entity/tenant/provider/revoked-member isolation, evidence-based reporting, immutable history, waivers and expiry, recurring periods, idempotent reminders, Opportunity facts, export and executive coverage. Full local clean/upgrade/fresh suite passed in PostgreSQL 16. E2E fixtures use the production presenters; browser execution remains blocked by missing Chromium and failed download, so no visual/hosted approval is claimed.

Remaining: customer editor for corrections/versioning of definitions, notifications beyond in-app, analyst UI forms, per-metric statutory/unit validations, richer deadline calendars, and hosted authenticated journey/recovery. These are explicit gaps, not completed capabilities.
